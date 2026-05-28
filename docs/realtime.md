# Realtime

Pritha can create descendants that use voice interfaces, but realtime voice is not required for the core scaffold.

## Pattern

- Browser or app captures microphone input.
- Realtime model handles low-latency conversation.
- Default realtime tool surface, when selected by a Seed: internet access,
  agent memory access and Codex CLI sidecar access.
- Deterministic server tools perform durable actions behind validation gates.
- Codex sidecar handles project editing and deeper implementation work.
- Lesson/session memory is saved as curated artifacts.

## Setup Readiness

Realtime voice is only ready when its selected tool surface is ready. Pritha
setup records `realtime.tool.internet`, `realtime.tool.memory` and
`realtime.tool.codexCli` sections in setup state when voice is enabled. Missing
memory search or Codex CLI access must be visible as `failed` or `pending-auth`,
not hidden behind a generic "voice enabled" status.

## Cost Warning

Realtime model pricing changes over time. Before building a voice descendant, check current OpenAI pricing and model documentation. If a setup wizard displays an estimated cost, it must say when the rate was checked.

## Safety

Voice transcripts are untrusted input until curated. Do not allow realtime text to directly trigger filesystem, deployment or credential actions without validation.
