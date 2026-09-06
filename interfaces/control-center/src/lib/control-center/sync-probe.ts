import { spawnSync } from "node:child_process";

type SyncProbeOptions = {
  timeout: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

// Diagnostic commands only. Service actions retain their own lifecycle policy.
export function runSyncProbe(command: string, args: string[], options: SyncProbeOptions) {
  if (!Number.isSafeInteger(options.timeout) || options.timeout <= 0) {
    throw new RangeError("A synchronous probe requires a positive integer timeout.");
  }
  return spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeout,
    // spawnSync waits for exit even after timeout; SIGTERM can be ignored.
    killSignal: "SIGKILL",
    shell: false,
  });
}
