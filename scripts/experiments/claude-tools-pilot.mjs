// Actual Claude SDK custom-tool surface, without a model or account access.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const args = process.argv.slice(2);
if (!args.includes("--workspace") || !args.includes("--run-dir")) throw new Error("Specify --workspace and --run-dir");
const workspace = path.resolve(args[args.indexOf("--workspace") + 1]);
const runDir = path.resolve(args[args.indexOf("--run-dir") + 1]);
const req = createRequire(path.join(workspace, "package.json"));
const { createSdkMcpServer, tool } = await import(pathToFileURL(req.resolve("@anthropic-ai/claude-agent-sdk")).href);
const { Client } = req("@modelcontextprotocol/client");
const { z } = req("zod");
let calls = 0;
const server = createSdkMcpServer({ name: "pritha-public-tools-pilot", version: "0.1", tools: [tool("public_source", "Fixed public source selection only", { domain: z.enum(["agent-building-knowledge"]), source: z.literal("backend-selection") }, async () => {
  calls++; return { content: [{ type: "text", text: "Read the reviewed backend selection brief; API client, agent loop SDK and coding runtime have distinct responsibilities." }] };
}, { annotations: { readOnlyHint: true, destructiveHint: false } })] });
const a = { async start() {}, async close() { a.onclose?.(); }, async send(m) { queueMicrotask(() => b.onmessage?.(structuredClone(m))); } };
const b = { async start() {}, async close() { b.onclose?.(); }, async send(m) { queueMicrotask(() => a.onmessage?.(structuredClone(m))); } };
await server.instance.connect(a);
const client = new Client({ name: "pritha-pilot-verifier", version: "0.1" });
await client.connect(b);
const listed = await client.listTools();
assert.deepEqual(listed.tools.map(t => t.name), ["public_source"]);
const result = await client.callTool({ name: "public_source", arguments: { domain: "agent-building-knowledge", source: "backend-selection" } });
assert.equal(result.isError, undefined);
const bad = await client.callTool({ name: "public_source", arguments: { domain: "user-model", source: "backend-selection" } });
assert.equal(bad.isError, true);
assert.equal(calls, 1, "Invalid domain rejected before handler");
await client.close();
const report = { status: "pass", sdk: "@anthropic-ai/claude-agent-sdk@0.3.306", mode: "offline-custom-tool-conformance", checks: ["SDK tool registration", "MCP initialize and tools/list", "typed public-domain call", "invalid private domain rejected before execution"], calls,
  agentLoop: "pending-auth", apiKeyAvailable: false, providerQualityAndCost: "not measured", terms: "Commercial Terms; no third-party claude.ai login offered" };
await mkdir(runDir, { recursive: true, mode: 0o700 });
await writeFile(path.join(runDir, "claude-sdk-result.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(JSON.stringify(report));
