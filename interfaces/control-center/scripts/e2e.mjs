import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, closeSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(app, "../..");
const dist = ".next-pritha-e2e";
const lock = path.join(app, `${dist}.lock`);
const descriptor = openSync(lock, "wx");
closeSync(descriptor);
const temporary = mkdtempSync(path.join(os.tmpdir(), "pritha-e2e-"));
const root = path.join(temporary, "source");
const state = path.join(temporary, "state");
let active;
function stop(child, signal = "SIGTERM") {
  if (!child?.pid) return;
  try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== "ESRCH") throw error; }
}

async function run(args, timeoutMs) {
  const child = spawn(process.execPath, args, { cwd: app, env, stdio: "inherit", detached: true });
  active = child;
  let killTimer;
  const timer = setTimeout(() => { stop(child); killTimer = setTimeout(() => stop(child, "SIGKILL"), 10000); }, timeoutMs);
  try { return await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => resolve(code ?? 1)); }); }
  finally { clearTimeout(timer); clearTimeout(killTimer); stop(child); active = null; }
}

const server = net.createServer();
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const env = Object.fromEntries(["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "LANG", "LC_ALL", "SHELL"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
for(const key of ["PRITHA_THEME_BASELINE_DIR","PRITHA_THEME_EVIDENCE_MODE"]) if(process.env[key])env[key]=process.env[key];
Object.assign(env, {
  TECHSCOPE_ROOT: root, PRITHA_STATE_ROOT: state, PRITHA_AGENT_PARENT: path.join(temporary, "children"),
  PRITHA_INSTANCE_ID: "chat-evolution-test", PRITHA_INSTANCE_ROLE: "developer",
  PRITHA_CONTROL_CENTER_HOST: "127.0.0.1", PRITHA_CONTROL_CENTER_PORT: String(port),
  PRITHA_CONTROL_CENTER_DIST_DIR: dist, PRITHA_CONTROL_CENTER_ENV_FILE: path.join(state, "runtime.env"),
  PRITHA_E2E_ISOLATED_STATE: "1", PRITHA_E2E_REPORT: path.join(app, "test-results/e2e-report.json"),
  PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${port}`, NEXT_TELEMETRY_DISABLED: "1",
});
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => stop(active, signal));

try {
  for (const directory of [root, state, env.PRITHA_AGENT_PARENT]) mkdirSync(directory, { recursive: true });
  writeFileSync(env.PRITHA_CONTROL_CENTER_ENV_FILE, "# Disposable E2E instance\n");
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: source, encoding: "utf8" }).split("\0").filter(Boolean);
  for (const file of files) {
    if (file.startsWith("interfaces/") || file.startsWith("tests/")) continue;
    if (!lstatSync(path.join(source, file)).isFile()) throw new Error("E2E source must contain regular files only");
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(source, file), target);
  }
  // Real isolated records exercise host selection and rejected operator requests.
  // UI-only status variants below are supplied by browser fixtures, never services.
  const contract = readFileSync(path.join(source, "tests/fixtures/contracts/valid-agent-contract.md"), "utf8");
  mkdirSync(path.join(state, "agents/contracts"), { recursive: true });
  for (const [id, name] of [["picture-boom", "PictureBoom"], ["stupid-joke", "StupidJoke"], ["fixture-managed", "Fixture Managed"]]) {
    const project = path.join(env.PRITHA_AGENT_PARENT, id);
    mkdirSync(project, { recursive: true });
    writeFileSync(path.join(project, "AGENTS.md"), "# Disposable browser fixture\n");
    writeFileSync(path.join(state, "agents/contracts", `${id}.md`), contract
      .replace("id: test-snapshot-agent-contract", `id: ${id}-contract\nagent_id: ${id}`)
      .replaceAll("Snapshot Agent", name)
      .replace(/^- Target folder:.*\n/gm, "")
      .replace(`- Agent name: ${name}`, `- Agent name: ${name}\n- Target folder: ${project}`));
  }
  mkdirSync(path.join(app, "test-results"), { recursive: true });
  rmSync(env.PRITHA_E2E_REPORT, { force: true });
  const buildInputs = execFileSync("git", ["ls-files", "-cz", "--others", "--exclude-standard"], { cwd: source, encoding: "utf8" }).split("\0").filter(file => /^(scripts\/|interfaces\/control-center\/(src\/|next\.config\.mjs$|package(?:-lock)?\.json$))/.test(file)).sort();
  const hash = createHash("sha256").update(process.version);
  for (const file of buildInputs) hash.update(file).update("\0").update(readFileSync(path.join(source, file)));
  const fingerprint = hash.digest("hex");
  const receiptPath = path.join(app, dist, "pritha-e2e-build.json");
  let cached;
  try { cached = JSON.parse(readFileSync(receiptPath, "utf8")); } catch { /* first build */ }
  const buildIdPath = path.join(app, dist, "BUILD_ID");
  const reusable = cached?.fingerprint === fingerprint && existsSync(buildIdPath) && cached.buildId === readFileSync(buildIdPath, "utf8").trim();
  const metadata = ["next-env.d.ts", "tsconfig.json"].map(file => ({ file: path.join(app, file), content: readFileSync(path.join(app, file)) }));
  let build;
  try { build = reusable ? 0 : await run(["node_modules/next/dist/bin/next", "build"], 300_000); }
  finally { for (const item of metadata) writeFileSync(item.file, item.content); }
  if (!build && !reusable) writeFileSync(receiptPath, JSON.stringify({ fingerprint, buildId: readFileSync(buildIdPath, "utf8").trim() }));
  if (build) process.exitCode = build;
  else {
    process.exitCode = await run(["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], 600_000);
    if (!existsSync(env.PRITHA_E2E_REPORT)) throw new Error("E2E report was not written");
    const report = JSON.parse(readFileSync(env.PRITHA_E2E_REPORT, "utf8"));
    console.log(JSON.stringify({ e2e: report.stats, instance: env.PRITHA_INSTANCE_ID, isolated: true }));
    if (report.stats.skipped || report.stats.unexpected || report.stats.flaky || !report.stats.expected) process.exitCode = 1;
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
  rmSync(lock, { force: true });
}
