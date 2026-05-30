---
id: 2026-05-30-fespa26-voice-control-pattern-ingestion-report
type: agent-post-creation-review
status: complete
created: 2026-05-30
updated: 2026-05-30
topics: [fespa26, voice-control, realtime, pritha, reference-implementation]
tools: [OpenAI Realtime API, Codex App, Codex CLI, Next.js, WebRTC]
sources:
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/openai/realtime-tools.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/realtime/instructions.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/hooks/use-realtime-call.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/app/api/realtime/tool/route.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/codex-task/service.ts
  - 11_agents/reference-implementations/fespa26-voice-control/README.md
related:
  standards:
    - 04_standards/realtime-voice-control-for-codex-agents.md
  workflows:
    - 07_workflows/realtime-voice-control-kit.md
  reference_implementations:
    - 11_agents/reference-implementations/fespa26-voice-control/manifest.json
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-30
source_updated: 2026-05-30
source_version: FESPA26 local implementation inspected 2026-05-30
retrieved: 2026-05-30
verified: 2026-05-30
valid_for: Pritha voice-control descendant planning and fresh-clone discovery
temporal_status: current
---

# Report: FESPA26 Voice Control Pattern Ingestion

## Request

Preserve the complete FESPA26 voice-control implementation pattern in Pritha so
it is quickly discoverable after cloning the GitHub repository and transferable
to descendant agents when the contract requires voice control.

## Captured

- Reference implementation pack:
  `11_agents/reference-implementations/fespa26-voice-control/`.
- Source snapshot for Realtime session/call/tool routes, browser hook,
  instructions, tool schemas, Codex task service, Codex App/CLI/session
  adapters and relevant tests.
- Workflow:
  `07_workflows/realtime-voice-control-kit.md`.
- CLI surface:
  `node scripts/voice-control-kit.mjs`.
- Pritha alias:
  `node scripts/pritha.mjs voice-kit ...`.

## Transferable Pattern

FESPA26 confirms a five-lane architecture:

- browser voice lane: microphone, WebRTC, data channel, transcript and remote
  audio;
- Realtime dispatcher lane: concise instructions and narrow tool schemas;
- deterministic server-tool lane: validation, durable writes, read-only status
  and explicit confirmation gates;
- Codex deep-task lane: Codex App, CLI, session contract or HTTP thread
  transport;
- artifact lane: memory, feed/card updates, task logs and operator-visible
  status.

## What Must Be Adapted

- Replace FESPA-specific repositories and feed/card concepts.
- Replace `FESPA_*` env names and domain prompts.
- Define descendant-specific tool schemas and confirmation gates.
- Decide whether Codex App, Codex CLI, session-contract or HTTP thread
  transport is selected.
- Add readiness checks for Realtime credentials, memory, Codex transport and
  external connectors.

## Safety Decision

The code is kept as a reference pack, not automatically copied into every
scaffold. Pritha should include the `realtime-voice` interface placeholder when
the contract mentions voice/realtime, and copy the full pack only when the
contract needs browser Realtime UI plus Codex deep-task transport.

## Verification

- Source snapshot scanned for local absolute paths and obvious real secrets.
- Reference source size is small enough for the portable Git snapshot.
- No FESPA runtime state, `.env`, queue, logs or large media were copied.

## Next Use

For a new descendant:

```sh
node scripts/pritha.mjs voice-kit plan
node scripts/pritha.mjs voice-kit copy --target ../child-agent
```

Then adapt the copied reference under
`interfaces/realtime-voice/fespa26-reference/` into the child agent's native app
structure.
