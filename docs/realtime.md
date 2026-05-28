# Realtime

Pritha can create descendants that use voice interfaces, but realtime voice is not required for the core scaffold.

## Pattern

- Browser or app captures microphone input.
- Realtime model handles low-latency conversation.
- Deterministic server tools perform durable actions.
- Codex sidecar handles project editing and deeper implementation work.
- Lesson/session memory is saved as curated artifacts.

## Cost Warning

Realtime model pricing changes over time. Before building a voice descendant, check current OpenAI pricing and model documentation. If a setup wizard displays an estimated cost, it must say when the rate was checked.

## Safety

Voice transcripts are untrusted input until curated. Do not allow realtime text to directly trigger filesystem, deployment or credential actions without validation.
