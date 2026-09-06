import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { resultReadinessFixture, git } from "./helpers/result-readiness-fixture.mjs";
import { prepareAuthoredHandoff, firstScenarioForHandoff } from "../scripts/agents-mother/authored-handoff.mjs";
import { planAgentCommandProbe, runAgentCommandProbe } from "../scripts/agents-mother/command-probe.mjs";
import { LocalExecBackend } from "../scripts/agents-mother/execution-backends.mjs";

test("handoff preserves authored project and profile, replays its guide and separates acceptance", async t => {
  const f = await resultReadinessFixture(t), before = git(f.project, ["status", "--porcelain"]);
  const first = prepareAuthoredHandoff(f.project, f.options);
  assert.equal(first.status, "guide-prepared"); assert.equal(first.profileCreated, true);
  const text = readFileSync(first.reportPath, "utf8"), profile = readFileSync(first.profilePath, "utf8");
  assert.match(text, /Приёмка: not_accepted/); assert.match(text, /CLI запускается по запросу/);
  assert.match(text, /Approved Outcome:/); assert.match(profile, /agent_id: readiness-fixture/);
  const mtime = statSync(first.reportPath).mtimeMs;
  const second = prepareAuthoredHandoff(f.project, f.options);
  assert.equal(second.unchanged, true); assert.equal(second.reportPath, first.reportPath); assert.equal(statSync(first.reportPath).mtimeMs, mtime);
  assert.equal(readFileSync(first.profilePath, "utf8"), profile); assert.equal(git(f.project, ["status", "--porcelain"]), before);
  assert.equal(existsSync(path.join(f.project, "operations/manifest.json")), false);
  writeFileSync(path.join(f.project, "changed.txt"), "changed product\n");
  const changed = prepareAuthoredHandoff(f.project, f.options);
  assert.equal(changed.unchanged, false); assert.notEqual(changed.reportPath, first.reportPath);
  assert.notEqual(changed.readiness.verification.status, "verified");
});

test("handoff uses type-specific instructions and the authored first scenario", () => {
  for (const [kind, expected] of [["one-shot-cli", /CLI/], ["service", /manager: launchd/], ["job-runner", /вручную/], ["tool-server", /consumer/], ["library", /импорта/], ["interactive-agent", /диалоговый/]]) {
    const text = firstScenarioForHandoff(kind, { data: { primaryInterface: "Codex CLI" }, plan: { demo: ["Run the authored exact first scenario"] }, manifest: { control_center_runtime: { manager: "launchd" } }, parsed: { headless: { trigger: "node scripts/main.mjs run examples/input.json", inputContract: "one JSON file", outputArtifacts: "result.json", failureVisibility: "0 success; 64 invalid input", observability: "stdout" } } });
    assert.match(text, expected); assert.match(text, /authored exact first scenario/); assert.match(text, /64 invalid input/);
  }
});

test("command probe requires an exact approved plan and leaves outcome evidence unchanged", async t => {
  const f = await resultReadinessFixture(t);
  mkdirSync(path.join(f.project, "interfaces"));
  const manifest = path.join(f.project, "interfaces/manifest.json");
  writeFileSync(manifest, JSON.stringify({ schema: "pritha-cli-interface-v1", healthcheck_argv: [process.execPath, "scripts/smoke-test.mjs"] }));
  const ledgerBefore = readFileSync(path.join(f.runRoot, "build-state.json"), "utf8");
  const plan = planAgentCommandProbe(f.project, f.options);
  assert.equal(plan.executesCommands, false); assert.equal(plan.scope, "command-runnability-only");
  await assert.rejects(runAgentCommandProbe(f.project, f.options), /approval_required/);
  const result = await runAgentCommandProbe(f.project, { ...f.options, approvedBy: "user", planLock: plan.planLock });
  assert.equal(result.status, "runnable"); assert.equal(readFileSync(path.join(f.runRoot, "build-state.json"), "utf8"), ledgerBefore);
  writeFileSync(manifest, JSON.stringify({ schema: "pritha-cli-interface-v1", healthcheck_argv: [process.execPath, "--version"] }));
  await assert.rejects(runAgentCommandProbe(f.project, { ...f.options, approvedBy: "user", planLock: plan.planLock }), /plan_changed/);
  assert.throws(() => planAgentCommandProbe(f.project, { ...f.options, timeoutMs: -1 }), /integer between/);
  symlinkSync(path.join(f.project, "scripts/smoke-test.mjs"), path.join(f.project, "linked.mjs"));
  writeFileSync(manifest, JSON.stringify({ schema: "pritha-cli-interface-v1", healthcheck_argv: [process.execPath, "linked.mjs"] }));
  assert.throws(() => planAgentCommandProbe(f.project, f.options), /symlink/);
  writeFileSync(manifest, JSON.stringify({ schema: "pritha-cli-interface-v1", healthcheck_argv: ["sh", "-c", "echo unsafe"] }));
  assert.throws(() => planAgentCommandProbe(f.project, f.options), /Shell/);
});

test("bounded local execution terminates only its own stubborn process descendants", async t => {
  if (process.platform === "win32") return t.skip("POSIX process-group lifecycle");
  const f = await resultReadinessFixture(t), pidFile = path.join(f.project, "descendant-pid.txt");
  const source = `const {spawn}=require('node:child_process');const {writeFileSync}=require('node:fs');const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'inherit'});writeFileSync(${JSON.stringify(pidFile)},String(child.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`;
  const started = Date.now();
  const result = await new LocalExecBackend({ killGraceMs: 100 }).execute({ argv: [process.execPath, "-e", source], cwd: f.project, timeoutMs: 300 });
  assert.equal(result.timedOut, true); assert.ok(Date.now() - started < 3000);
  const descendant = Number(readFileSync(pidFile, "utf8"));
  const listing = (() => { try { return execFileSync("ps", ["-o", "stat=", "-p", String(descendant)], { encoding: "utf8" }).trim(); } catch { return ""; } })();
  assert.ok(!listing || listing.startsWith("Z"), listing);
});
