import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { resultReadinessFixture } from "./helpers/result-readiness-fixture.mjs";
import { apiProcessManifest } from "../scripts/agents-mother/scaffold/api-process.mjs";
import { toolServerManifest } from "../scripts/agents-mother/scaffold/tool-server.mjs";
import { readTaskDelivery, performTaskDeliveryAction } from "../scripts/agents-mother/task-delivery.mjs";
import { planOperationDecision, resolveOperationDecision } from "../scripts/agents-mother/operation-decisions.mjs";

const task = { chatId: "chat_operations", nativeThreadId: "native-operations", providerId: "desktop_bundled", stateIdentityHash: "storage-v2:operations" };
test("tool-server operation decisions bind the resolved port and declared environment",async t=>{
  const f=await resultReadinessFixture(t,{project(project){mkdirSync(path.join(project,"operations"));writeFileSync(path.join(project,"operations","manifest.json"),JSON.stringify(toolServerManifest({agentId:"readiness-fixture",agentName:"link-vault",autostart:"disabled",envExampleVariables:"LINK_VAULT_PORT=3432"})));},contract:source=>source.replace("agent_kind: one-shot-cli","agent_kind: tool-server")});
  const saved=process.env.LINK_VAULT_PORT;process.env.LINK_VAULT_PORT="4567";t.after(()=>{if(saved===undefined)delete process.env.LINK_VAULT_PORT;else process.env.LINK_VAULT_PORT=saved;});
  let calls=0;const options={...f.options,runtime:{startPlan:async()=>({enabled:true,confirmation:"reviewed"}),accessPlan:async target=>({enabled:target.port===4567}),start:async()=>{calls++;return{ok:true};},serve:async()=>{calls++;return{ok:true};}}};
  const runId=path.basename(f.runRoot),run=readTaskDelivery(runId,task,f.options);
  await performTaskDeliveryAction(task,{runId,requestId:"bind-tool",action:"bind",expectedRevision:run.revision},f.options);
  const plan=await planOperationDecision(task,runId,"start",options);assert.equal(plan.enabled,true);assert.equal(plan.port,4567);assert.match(plan.runtimeBinding,/^[a-f0-9]{64}$/);
  const access=await planOperationDecision(task,runId,"tailscale-serve",options);assert.equal(access.port,4567);assert.equal(access.enabled,true);
  process.env.LINK_VAULT_PORT="4568";
  await assert.rejects(resolveOperationDecision(task,{runId,requestId:"old-port",action:"start",decision:"approve",planLock:plan.planLock},options),/plan changed/i);
  assert.equal(calls,0);
});
test("operation cards bind the canonical revision, cancellation and idempotent execution", async t => {
  const f = await resultReadinessFixture(t, {
    project(project) {
      mkdirSync(path.join(project, "operations"));
      writeFileSync(path.join(project, "operations/manifest.json"), JSON.stringify(apiProcessManifest({ agentId: "readiness-fixture", agentName: "Fixture", autostart: "disabled", primaryInterface: "web", envExampleVariables: "FIXTURE_PORT=3211" })));
    },
    contract: source => source.replace("agent_kind: one-shot-cli", "agent_kind: service"),
  });
  let calls = 0;
  const options = { ...f.options, runtime: {
    startPlan: async () => ({ enabled: true, confirmation: "start reviewed fixture" }), accessPlan: async () => ({ enabled: true }),
    start: async () => { calls++; return { ok: true }; }, serve: async () => { calls++; return { ok: true }; },
  } };
  const runId = path.basename(f.runRoot);
  await assert.rejects(planOperationDecision(task, runId, "start", options), /Bind/);
  const run = readTaskDelivery(runId, task, f.options);
  await performTaskDeliveryAction(task, { runId, requestId: "bind-operations", action: "bind", expectedRevision: run.revision }, f.options);
  const plan = await planOperationDecision(task, runId, "start", options);
  assert.equal(plan.enabled, true, JSON.stringify(f.read())); assert.equal(calls, 0);
  const request = { runId, requestId: "start-once", action: "start", planLock: plan.planLock, decision: "approve" };
  assert.equal((await resolveOperationDecision(task, { ...request, requestId: "cancel-first", decision: "cancel" }, options)).status, "cancelled");
  assert.equal(calls, 0);
  assert.equal((await resolveOperationDecision(task, request, options)).status, "completed");
  assert.equal((await resolveOperationDecision(task, request, options)).replayed, true); assert.equal(calls, 1);
  await assert.rejects(resolveOperationDecision(task, { ...request, decision: "cancel" }, options), /identifier/);
  await assert.rejects(planOperationDecision({ ...task, nativeThreadId: "foreign" }, runId, "start", options));
  const access = await planOperationDecision(task, runId, "tailscale-serve", options); assert.equal(access.enabled, true);
  // Simulate a host disappearing after its durable started receipt: neither a
  // lost-response retry nor a new request identifier may replay that operation.
  const receiptDirectory = path.join(f.options.stateRoot, "audit", "operation-decisions");
  const saved = readdirSync(receiptDirectory).filter(name => name.endsWith(".json"))
    .map(name => ({ file: path.join(receiptDirectory, name), data: JSON.parse(readFileSync(path.join(receiptDirectory, name), "utf8")) }))
    .filter(item => item.data.requestId === request.requestId);
  for (const item of saved) writeFileSync(item.file, JSON.stringify({ ...item.data, status: "started" }));
  assert.deepEqual((await planOperationDecision(task, runId, "start", options)).pendingRequest, request);
  assert.equal((await resolveOperationDecision(task, request, options)).status, "started");
  await assert.rejects(resolveOperationDecision(task, { ...request, requestId: "retry-new-id" }, options), /unconfirmed/);
  assert.equal(calls, 1);
  for (const item of saved) writeFileSync(item.file, JSON.stringify(item.data));
  writeFileSync(path.join(f.project, "changed.txt"), "changed revision");
  await assert.rejects(resolveOperationDecision(task, { ...request, requestId: "stale" }, options), /plan changed/i);
  assert.equal(calls, 1);
});
