import { spawn } from "node:child_process";
import path from "node:path";

if (process.env.PRITHA_E2E_ISOLATED_STATE !== "1" || process.env.PRITHA_INSTANCE_ID !== "chat-evolution-test"
  || !process.env.PRITHA_STATE_ROOT || !process.env.PRITHA_AGENT_PARENT || process.env.PRITHA_CONTROL_CENTER_DIST_DIR !== ".next-pritha-e2e") {
  throw new Error("Use npm run test:e2e to create a disposable test instance");
}
const child = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", process.env.PRITHA_CONTROL_CENTER_PORT], { stdio: "inherit", env: process.env });
let stopTimer;
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
  child.kill(signal);
  stopTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
});
child.once("error", error => { console.error(error.message); process.exitCode = 1; });
child.once("exit", code => { clearTimeout(stopTimer); process.exitCode = code ?? 1; });
