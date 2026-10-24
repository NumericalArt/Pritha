// Explicit paid API probe. Credentials stay in this host process and are never
// serialized. Run only for an authorized live comparison, using a fresh run dir.
import { createRequire } from "node:module";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { loadPrithaRuntimeEnv } from "../lib/env.mjs";
const args = process.argv.slice(2);
if (!args.includes("--workspace") || !args.includes("--run-dir")) throw new Error("Specify --workspace and --run-dir");
const workspace = path.resolve(args[args.indexOf("--workspace") + 1]);
const runDir = path.resolve(args[args.indexOf("--run-dir") + 1]);
loadPrithaRuntimeEnv();
const req = createRequire(path.join(workspace, "package.json"));
const OpenAI = req("openai").default;
const { Agent, Runner, RunState, OpenAIProvider, tool, setTracingDisabled } = req("@openai/agents");
const { z } = req("zod");
setTracingDisabled(true);
await mkdir(runDir, { recursive: true, mode: 0o700 });
const save = (name, value) => writeFile(path.join(runDir, name), JSON.stringify(value, null, 2), { mode: 0o600 });
const report = { sdk: "@openai/agents@0.21.0", mode: "live-API-controlled-task", status: "running", attempts: [], model: "gpt-5.6-terra", providerQualityBenchmark: false };
const prompt = "Call lookup_fixture with key alpha, then return a JSON object with value and source exactly as returned by that tool. Do not infer the value without calling the tool.";
const instructions = "Use the single read-only fixture tool, no other actions. Return only the requested JSON.";
const outputSchema = { type: "object", properties: { value: { type: "integer" }, source: { type: "string" } }, required: ["value", "source"], additionalProperties: false };
const toolSchema = { type: "object", properties: { key: { type: "string", enum: ["alpha"] } }, required: ["key"], additionalProperties: false };
const inputSchema = z.object({ key: z.literal("alpha") }).strict();
const expected = { value: 7, source: "fixture-alpha" };
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30000, maxRetries: 0 });
try {
  const started = performance.now();
  let input = prompt, baselineCalls = 0, baselineOutput;
  const usage = [];
  for (let turn = 0; turn < 3; turn++) {
    const response = await client.responses.create({ model: report.model, instructions, input, store: false,
      reasoning: { effort: "none" }, max_output_tokens: 128, parallel_tool_calls: false,
      tools: [{ type: "function", name: "lookup_fixture", description: "Return a fixed synthetic public value", parameters: toolSchema, strict: true }],
      text: { format: { type: "json_schema", name: "fixture_answer", schema: outputSchema, strict: true } } });
    usage.push(response.usage);
    const calls = response.output.filter(i => i.type === "function_call");
    if (!calls.length) { baselineOutput = JSON.parse(response.output_text); break; }
    input = [...(Array.isArray(input) ? input : [{ role: "user", content: input }]), ...response.output];
    // Persist/restore before the approved read-only tool call for the same
    // pause boundary used by the SDK. Host code validates the arguments.
    input = JSON.parse(JSON.stringify(input));
    for (const call of calls) {
      assert.equal(call.name, "lookup_fixture");
      inputSchema.parse(JSON.parse(call.arguments)); baselineCalls++;
      input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(expected) });
    }
  }
  assert.deepEqual(baselineOutput, expected); assert.equal(baselineCalls, 1);
  report.baseline = { status: "pass", calls: baselineCalls, output: baselineOutput, usage, elapsedMs: Math.round(performance.now() - started) };
  const sdkStarted = performance.now();
  let sdkCalls = 0;
  const fixtureTool = tool({ name: "lookup_fixture", description: "Return a fixed synthetic public value", parameters: inputSchema, needsApproval: true,
    execute: async () => { sdkCalls++; return JSON.stringify(expected); } });
  const agent = new Agent({ name: "Pritha controlled SDK probe", instructions, model: report.model,
    modelSettings: { reasoning: { effort: "none" }, maxTokens: 128, parallelToolCalls: false },
    outputType: z.object({ value: z.number().int(), source: z.string() }), tools: [fixtureTool] });
  const runner = new Runner({ modelProvider: new OpenAIProvider({ openAIClient: client }), tracingDisabled: true });
  const paused = await runner.run(agent, prompt, { maxTurns: 3 });
  assert.equal(paused.interruptions.length, 1); assert.equal(sdkCalls, 0);
  const serialized = paused.state.toString();
  assert.ok(!serialized.includes(process.env.OPENAI_API_KEY), "Credential must not enter state");
  await writeFile(path.join(runDir, "sdk-pending-state.json"), serialized, { mode: 0o600 });
  const restored = await RunState.fromString(agent, serialized);
  restored.approve(restored.getInterruptions()[0]);
  const completed = await runner.run(agent, restored, { maxTurns: 3 });
  assert.deepEqual(completed.finalOutput, expected); assert.equal(sdkCalls, 1);
  const calls = completed.history.filter(i => i.type === "function_call").map(i => i.callId);
  const results = completed.history.filter(i => i.type === "function_call_result").map(i => i.callId);
  assert.deepEqual(calls, results);
  report.agentsSdk = { status: "pass", calls: sdkCalls, output: completed.finalOutput, usage: completed.state.usage,
    pauseBeforeCall: true, stateRestored: true, callResultPairsComplete: true, elapsedMs: Math.round(performance.now() - sdkStarted) };
  report.status = "pass";
} catch (error) {
  report.status = "fail";
  report.error = { name: error.name, code: error.code, status: error.status };
} finally {
  report.credentialSerialized = false;
  report.costScope = "Measured tokens and one latency sample per implementation, no general quality or pricing claim";
  await save("openai-sdk-live-result.json", report);
  console.log(JSON.stringify(report));
}
