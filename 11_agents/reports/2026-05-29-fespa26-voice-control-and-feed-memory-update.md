---
id: 2026-05-29-fespa26-voice-control-and-feed-memory-update
type: agent-post-creation-review
status: accepted
created: 2026-05-29
updated: 2026-05-29
topics:
  - agent-engineering
  - fespa26
  - voice-agents
  - realtime
  - codex-app
  - codex-cli
  - event-reporting
  - feed-memory
tools:
  - Codex
  - Codex App
  - Codex CLI
  - OpenAI Realtime API
  - gpt-realtime-2
  - Next.js
  - SQLite
agent_platforms:
  - Codex
  - OpenAI Realtime API
model_context:
  - gpt-realtime-2
  - gpt-realtime-mini
runtime_environment:
  - local-project
  - web-ui
  - mac
config_surfaces:
  - AGENTS.md
  - README.md
  - docs/
  - interfaces/manifest.json
  - memory/manifest.json
  - tools/manifest.json
  - operations/manifest.json
  - lib/codex-task/
  - app/api/realtime/tool/route.ts
portability: adapter-needed
sources:
  - 11_agents/contracts/2026-05-25-fespa26-agent-contract.md
  - 11_agents/reports/2026-05-25-fespa26-agent-post-creation-review.md
  - 11_agents/reports/2026-05-29-fespa26-agent-test-report.md
  - <SIBLING_AGENT_ROOT>/FESPA26/docs/current-architecture.md
  - <SIBLING_AGENT_ROOT>/FESPA26/docs/codex-in-the-loop.md
  - <SIBLING_AGENT_ROOT>/FESPA26/docs/codex-cli-enrichment.md
  - <SIBLING_AGENT_ROOT>/FESPA26/docs/harness-architecture.md
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/openai/realtime-tools.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/realtime/instructions.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/app/api/realtime/tool/route.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/codex-task/service.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/codex-task/factory.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/codex-task/adapters/codex-app-server-client.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/codex-task/adapters/codex-session-contract-client.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/codex-task/adapters/codex-auto-client.ts
related:
  agent_contracts:
    - 11_agents/contracts/2026-05-25-fespa26-agent-contract.md
  scaffold_reports: []
  agent_test_reports:
    - 11_agents/reports/2026-05-29-fespa26-agent-test-report.md
  agent_handoff_reports: []
  agent_operations_reports:
    - 11_agents/reports/2026-05-25-fespa26-agent-operations-report.md
  agent_deployment_reports: []
  workflows:
    - 07_workflows/agents-mother.md
  standards:
    - 04_standards/realtime-voice-control-for-codex-agents.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: 2026-05-29
source_version: FESPA26 Codex-in-the-loop local architecture inspected 2026-05-29
retrieved: 2026-05-29
verified: 2026-05-29
valid_for: FESPA26 current local architecture and future Pritha event/reportage agent references
temporal_status: version-bound
---

# Agent Post-Creation Review: FESPA26 Voice Control And Feed Memory Update

Date: 2026-05-29
Status: accepted

## Summary

- Project path: `<SIBLING_AGENT_ROOT>/FESPA26`
- Classification: Pritha/Agents Mother reference descendant for event, exhibition, media and reportage workflows.
- Current role in Pritha: example of an agent that receives field material, updates operational memory, processes media/sources and forms a reviewed reporting feed.
- Architecture update: voice-triggered complex work now routes through a Codex task boundary. Codex App/thread is the preferred deep-work transport when available; Codex CLI and the local queue remain fallback/worker transports.

FESPA26 should be remembered as an event-agent pattern, not only as a voice-agent experiment. The reusable domain shape is:

```text
event material -> intake/source memory -> Codex processing -> reviewed feed card -> explicit publication
```

The reusable voice shape is:

```text
Realtime voice -> narrow server tool -> Codex deep-task transport -> durable memory/job/feed state
```

## Evidence

- `node scripts/pritha.mjs test <SIBLING_AGENT_ROOT>/FESPA26`: complete; report saved as `11_agents/reports/2026-05-29-fespa26-agent-test-report.md`.
- `npm run smoke --silent`: pass.
- `npm run tools --silent`: pass.
- `npm run operations --silent`: pass.
- `npm test --silent`: pass, 22 test files and 79 tests.
- The failed `npm test -- --runInBand` attempt is not a project failure; Vitest does not support the Jest `--runInBand` flag.

## Current Architecture

- Browser owns microphone capture, Realtime WebRTC lifecycle, local transcript display, remote audio playback and the data channel.
- Server owns OpenAI API key, ephemeral Realtime credentials, SDP forwarding, origin/rate limits, tool execution, persistence and Codex orchestration.
- Realtime tools are declared in `lib/openai/realtime-tools.ts` and executed through `app/api/realtime/tool/route.ts`.
- SQLite is the operational source of truth for sessions, turns, L1/L2 memory, FESPA sources, feed cards, jobs, publications, tool events and job targets.
- Feed/publication memory is separate from generic conversation memory. This is the event/reportage lesson Pritha should reuse.

## Updated Voice-Control Boundary

The current boundary is no longer "Realtime plus Codex CLI only". It is:

- Realtime: live dispatcher and spoken UX.
- Server tool router: deterministic validation, memory writes, feed edits, gates and job creation.
- CodexTaskService: normalized deep-task boundary with request id, task type, user intent, safe metadata, constraints and expected schema.
- Codex App/server transport: preferred foreground deep-work path.
- Contract-file transport: foreground Codex App thread can write `codex_solve_decision.json` when human/Codex handoff is required.
- Codex auto/CLI transport: automated local execution when selected.
- Local queue fallback: captures tasks when Codex App is unavailable or CLI fallback is explicitly enabled.

Default deep-task tool:

- `run_codex_app_task`

Specific tools that try Codex App first and fall back when needed:

- `queue_codex_system_task`
- `queue_codex_card_update`
- `queue_codex_feed_task`
- `search_sources`
- `analyze_uploaded_media`
- `queue_translation_pass`
- `create_followup_checklist`

Legacy explicit CLI tool:

- `queue_codex_cli_task`, hidden unless `FESPA_ENABLE_CODEX_CLI_TOOL=true`.

## Event/Reportage Agent Pattern

FESPA26 is the reference example for future event agents where the goal is not generic chat but building a curated public or internal feed.

Reusable modules:

- source intake from voice, text, links, files, media and drop inbox;
- operational memory for sources and feed items;
- stable feed card ids/numbers;
- queue jobs for media analysis, source verification, translation and card updates;
- reviewed/draft/publication states;
- explicit publication gate;
- public-site projection as a separate deploy step;
- runner status visible to the operator.

Do not reuse FESPA26 blindly for agents that do not need a feed, publication lifecycle, event source memory or media processing.

## Useful Scaffold Patterns

- Separate live voice from durable event memory.
- Treat voice commands about product/content as feed/source tasks.
- Treat voice commands about the app itself as system-change tasks.
- Use Codex App/thread for complex operator-facing work that benefits from the current Codex context.
- Keep Codex CLI available as fallback/worker, not as the only deep-work route.
- Make fallback state explicit so the operator can see whether work is completed, pending, captured or failed.
- Preserve tool-event audit records for voice-triggered work.

## Failed Or Outdated Assumptions

- "Codex CLI sidecar" is no longer sufficient as the whole deep-work description. The accurate pattern is Codex task transport with Codex App primary and CLI/queue fallback.
- Older docs that present Realtime enrichment and queue jobs as the only Codex paths are incomplete unless read together with `docs/codex-in-the-loop.md`.
- FESPA26 is not a generic dashboard template. It is an event/reportage agent with a feed-memory lifecycle.

## Reusable Standard Candidates

- `realtime-voice-control`: promote to active for Pritha descendants with voice plus complex tool workflows.
- `codex-task-transport`: define a standard task payload, status set, validation rule and fallback behavior for Codex App/CLI transports.
- `event-reportage-agent`: source intake, operational memory, reviewed feed cards and explicit publication gate.

## Promotion Path

- Update `04_standards/realtime-voice-control-for-codex-agents.md` from draft to active with version-bound caveats.
- Consider a future separate standard for event/reportage agents after one more event-like descendant reuses FESPA26's feed-memory lifecycle.
- Consider a future separate standard for `CodexTaskService` once another agent needs Codex App/thread transport from voice.

## Next Steps

- Keep FESPA26 in Pritha memory as the canonical event/reportage example.
- Use Funny Teacher as the contrasting non-event voice example.
- For the next voice agent contract, explicitly choose deep-task transports: Codex App/thread, contract-file handoff, Codex CLI, queue worker or none.
