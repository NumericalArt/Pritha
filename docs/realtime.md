# Realtime

Pritha can create descendants that use voice interfaces, but realtime voice is not required for the core scaffold.

## Pattern

- Browser or app captures microphone input.
- Realtime model handles low-latency conversation.
- Default realtime tool surface, when selected by a Seed: internet access,
  agent memory access and Codex CLI sidecar access.
- Deterministic server tools perform durable actions behind validation gates.
- Codex sidecar handles project editing and deeper implementation work.
- Risky Codex tasks can pause as `decision_required` and wait for operator
  approval in the Control Center task card.
- Lesson/session memory is saved as curated artifacts.

## FESPA26 Reference Kit

Pritha carries a source-level reference implementation extracted from FESPA26:

```sh
node scripts/voice-control-kit.mjs plan
node scripts/voice-control-kit.mjs list
node scripts/voice-control-kit.mjs copy --target ../child-agent
```

The same command is available through Pritha:

```sh
node scripts/pritha.mjs voice-kit plan
```

The pack lives at
`11_agents/reference-implementations/fespa26-voice-control/` and includes
Realtime session/call routes, browser data-channel handling, tool schemas,
instructions, Codex App/CLI/session adapters and tests. Treat it as an
adaptation source, not a blind copy.

## Setup Readiness

Realtime voice is only ready when its selected tool surface is ready. Pritha
setup records `realtime.tool.internet`, `realtime.tool.memory` and
`realtime.tool.codexCli` sections in setup state when voice is enabled. Missing
memory search or Codex CLI access must be visible as `failed` or `pending-auth`,
not hidden behind a generic "voice enabled" status.

## Cost Warning

Realtime model pricing changes over time. Before building a voice descendant, check current OpenAI pricing and model documentation. If a setup wizard displays an estimated cost, it must say when the rate was checked.

## Safety

Voice transcripts are untrusted input until curated. Realtime voice may create
Codex implementation tasks, including child-agent scaffold/evolution tasks, but
must not directly execute service install/uninstall, cron/launchd enablement,
deployment/publish, deletion, secret writes or danger-full-access. Those
actions become `decision_required` tasks and start only after the operator
presses Approve in the UI. Secrets are entered through credential UI or local
environment files, not through voice/model context.
