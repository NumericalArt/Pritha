// Offline conformance of the actual published SDK. Scripted model responses
// test orchestration, never provider quality, live cost or model accuracy.
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const args = process.argv.slice(2);
if (!args.includes("--workspace") || !args.includes("--run-dir")) throw new Error("Specify --workspace and --run-dir");
const workspace = resolve(args[args.indexOf("--workspace") + 1]);
const runDir = resolve(args[args.indexOf("--run-dir") + 1]);
const req = createRequire(join(workspace, "package.json"));
const { Agent, Runner, tool, RunState, Usage, setTracingDisabled } = req("@openai/agents");
const { z } = req("zod");
setTracingDisabled(true);
const historyChecks = [];
let executions = 0;
const receipt = tool({ name: "synthetic_receipt", description: "Fixed, host-owned synthetic receipt", parameters: z.object({ key: z.literal("sdk-pilot-01"), value: z.literal(7) }).strict(), needsApproval: true,
  execute: async () => { executions++; return JSON.stringify({ key: "sdk-pilot-01", value: 7, effect_count: 1 }); } });
const lookup = tool({ name: "synthetic_lookup", description: "Read a fixed public number", parameters: z.object({}).strict(), execute: async () => "7" });
function scriptedModel() {
  return {
    async getResponse(request) {
      const input = Array.isArray(request.input) ? request.input : [];
      const results = input.filter(i => i.type === "function_call_result");
      if (!input.some(i => i.type === "function_call")) {
        return { usage: new Usage({ requests: 1, inputTokens: 11, outputTokens: 3, totalTokens: 14 }), output: [
          { type: "function_call", callId: "lookup-01", name: "synthetic_lookup", arguments: "{}", status: "completed" },
          { type: "function_call", callId: "receipt-01", name: "synthetic_receipt", arguments: '{"key":"sdk-pilot-01","value":7}', status: "completed" }
        ] };
      }
      historyChecks.push({ calls: input.filter(i => i.type === "function_call").map(i => i.callId), results: results.map(i => i.callId) });
      assert.deepEqual(new Set(results.map(i => i.callId)), new Set(["lookup-01", "receipt-01"]));
      return { usage: new Usage({ requests: 1, inputTokens: 19, outputTokens: 2, totalTokens: 21 }), output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "7; receipt sdk-pilot-01" }] }] };
    },
    async *getStreamedResponse() { throw new Error("This fixture is nonstreaming"); }
  };
}
const agent = new Agent({ name: "SDK state fixture", instructions: "Use fixed fixture tools only", model: scriptedModel(), tools: [lookup, receipt] });
const runner = new Runner({ tracingDisabled: true });
const paused = await runner.run(agent, "Read 7 and record a synthetic receipt", { maxTurns: 3 });
assert.equal(paused.interruptions.length, 1);
assert.equal(executions, 0, "No effect before host approval");
const snapshot = paused.state.toString();
assert.ok(!/sk-[A-Za-z0-9]/.test(snapshot), "No keys persisted");
const restored = await RunState.fromString(agent, snapshot);
restored.approve(restored.getInterruptions()[0]);
const completed = await runner.run(agent, restored, { maxTurns: 3 });
assert.equal(executions, 1);
assert.equal(completed.finalOutput, "7; receipt sdk-pilot-01");
const calls = completed.history.filter(i => i.type === "function_call").map(i => i.callId);
const results = completed.history.filter(i => i.type === "function_call_result").map(i => i.callId);
assert.deepEqual(new Set(calls), new Set(results));
assert.equal(results.length, new Set(results).size, "No duplicate results after resume");
const rejected = await runner.run(agent, "Run a second synthetic case", { maxTurns: 3 });
const rejectedState = await RunState.fromString(agent, rejected.state.toString());
rejectedState.reject(rejectedState.getInterruptions()[0], { message: "Synthetic host policy denial" });
await runner.run(agent, rejectedState, { maxTurns: 3 });
assert.equal(executions, 1, "Rejection cannot execute tool");
// Baseline has the same small task, explicit approval gate, and pair checks.
// This does not benchmark providers or pretend that hand-written code is an SDK.
async function runMinimalBaseline() {
  const model = scriptedModel();
  const first = await model.getResponse({ input: "Read 7 and record a synthetic receipt" });
  const state = { input: [...first.output], effects: 0, pending: null };
  for (const call of first.output) {
    if (call.name === "synthetic_lookup") {
      z.object({}).strict().parse(JSON.parse(call.arguments));
      state.input.push({ type: "function_call_result", callId: call.callId, name: call.name, output: "7" });
    } else {
      z.object({ key: z.literal("sdk-pilot-01"), value: z.literal(7) }).strict().parse(JSON.parse(call.arguments));
      state.pending = call;
    }
  }
  assert.equal(state.effects, 0);
  const restored = JSON.parse(JSON.stringify(state));
  assert.equal(restored.pending.name, "synthetic_receipt");
  restored.effects++;
  restored.input.push({ type: "function_call_result", callId: restored.pending.callId, name: restored.pending.name, output: JSON.stringify({ key: "sdk-pilot-01", value: 7, effect_count: 1 }) });
  const final = await model.getResponse({ input: restored.input });
  return { pausedBeforeEffect: true, effect_count: restored.effects, calls: first.output.map(i => i.callId),
    results: restored.input.filter(i => i.type === "function_call_result").map(i => i.callId),
    output: final.output[0].content[0].text,
    syntheticUsage: { input: first.usage.inputTokens + final.usage.inputTokens, output: first.usage.outputTokens + final.usage.outputTokens, total: first.usage.totalTokens + final.usage.totalTokens } };
}
const baseline = await runMinimalBaseline();
assert.equal(completed.finalOutput, baseline.output);
assert.equal(completed.state.usage.totalTokens, baseline.syntheticUsage.total);
const report = { status: "pass", sdk: "@openai/agents@0.21.0", mode: "offline-scripted-model", checks: ["parallel call/result pairs", "pause before effect", "serialize and restore", "narrow approval", "rejection prevents effect", "no duplicate results", "usage totals", "no tracing export"], historyChecks, executions, usage: completed.state.usage, baseline, providerBenchmark: "not run: no OpenAI API credential available", recommendation: "Keep current Codex backend; use SDK for an API loop with sessions and approval state when contract needs it" };
await mkdir(runDir, { recursive: true, mode: 0o700 });
await writeFile(join(runDir, "openai-sdk-result.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ status: report.status, checks: report.checks, executions, usage: report.usage }));
