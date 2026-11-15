// What Pritha's own host-template verifiers expect, in words a builder can act
// on. The verifier source alone was not enough: on 2026-11-15 two builder
// models (gpt-oss-120b, then kimi-k3.1-pro) spent seven iterations requiring the
// stop token in Stop's own environment, which the managed Stop verifier never
// supplies. One text feeds both the new child's AGENTS.md and the repair
// feedback of a run whose verifier of that template failed.

export const MANAGED_STOP_PROTOCOL = [
  "Pritha's managed Stop verifier (verification/managed-stop.mjs) launches scripts/server.mjs itself with --managed-instance <UUID> on an ephemeral port and PRITHA_MANAGED_STOP_TOKEN in the server environment only.",
  "It writes the mode-0600 record .state/service.pid.json with pid, instance_id, stop_token, project_root, server_path, port and started_at, then runs `node scripts/service-control.mjs stop` with only PATH, LANG and the port variable.",
  "Stop never receives PRITHA_MANAGED_STOP_TOKEN and must not require it.",
  "Stop reads the record, rejects it unless project_root and server_path belong to this project and port matches the port variable, confirms that GET /health on that port reports the recorded instance_id, and asks the server to stop by presenting the recorded stop_token, instance_id and pid.",
  "The server compares them with its own launch token, --managed-instance value and process.pid, shuts down only when all match and otherwise refuses and keeps running.",
  "Expected results: no record exits 0; a malformed record, foreign pid, wrong instance, wrong token or wrong project exits non-zero and leaves the server, other processes and the record bytes unchanged; the owned record exits 0, stops the server, closes the listener and removes the record; a repeated Stop exits 0; a stale record that names another live process exits non-zero without signalling it.",
  "Never signal a process from a recorded PID alone, never expose the token in /health or logs, and preserve unrelated .state files.",
  "Start works the same way for a real launch: it creates a fresh token, passes it to the server as PRITHA_MANAGED_STOP_TOKEN and writes it to the record as stop_token.",
].join(" ");

const PROTOCOLS = new Map([["host-template:api-managed-stop-v1", MANAGED_STOP_PROTOCOL]]);

/**
 * Feedback entries for failing Trials whose verifier comes from a host template
 * with a documented protocol. Builder-owned Trials get none.
 */
export function hostTrialGuidance(plan, failures) {
  const failing = new Set((failures || []).map((trial) => trial?.id).filter(Boolean));
  const notes = [];
  for (const trial of plan?.trials || []) {
    if (!failing.has(trial.id)) continue;
    for (const input of trial.verifierInputs || []) {
      const message = PROTOCOLS.get(input?.provenance);
      if (message && !notes.some((note) => note.message === message)) {
        notes.push({ id: `${trial.id}-host-protocol`, status: "feedback", message });
      }
    }
  }
  return notes;
}
