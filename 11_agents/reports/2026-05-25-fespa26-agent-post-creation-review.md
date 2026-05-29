---
id: 2026-05-25-fespa26-agent-post-creation-review
type: agent-post-creation-review
status: draft
created: 2026-05-25
updated: 2026-05-29
topics:
  - agent-engineering
  - agent-factory
  - lessons-learned
  - fespa26
tools:
  - Codex
  - AGENTS.md
  - Agents Mother
  - operations
agent_platforms:
  - Codex
model_context:
  - gpt-realtime-2
  - gpt-realtime-mini
runtime_environment:
  - local-project
  - web-ui
config_surfaces:
  - AGENTS.md
  - scripts
  - interfaces/manifest.json
  - memory/manifest.json
  - tools/manifest.json
  - operations/manifest.json
portability: codex-native
sources:
  - <SIBLING_AGENT_ROOT>/FESPA26
  - <SIBLING_AGENT_ROOT>/FESPA26/hooks/use-realtime-call.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/openai/realtime-config.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/openai/realtime-tools.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/realtime/instructions.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/app/api/realtime/tool/route.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/docs/codex-in-the-loop.md
  - <SIBLING_AGENT_ROOT>/FESPA26/app/api/realtime/orchestrate/route.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/chat/process-agent-message.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/conductor/index.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/agent/codex-cli-runtime.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/scripts/lib/fespa-jobs-core.mjs
  - 11_agents/reports/2026-05-25-fespa26-agent-operations-report.md
  - 11_agents/reports/2026-05-25-fespa26-agent-test-report.md
  - 07_workflows/agents-mother.md
  - 07_workflows/agents-mother-roadmap.md
related:
  agent_contracts:
    - 11_agents/contracts/2026-05-25-fespa26-agent-contract.md
  scaffold_reports: []
  agent_test_reports:
    - 11_agents/reports/2026-05-25-fespa26-agent-test-report.md
  agent_handoff_reports: []
  agent_operations_reports:
    - 11_agents/reports/2026-05-25-fespa26-agent-operations-report.md
  agent_deployment_reports: []
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/agents-mother-roadmap.md
supersedes: []
superseded_by:
  - 11_agents/reports/2026-05-29-fespa26-voice-control-and-feed-memory-update.md
freshness_status: changed
source_published: unknown
source_updated: 2026-05-29
source_version: post-creation review 2026-05-25; voice-control architecture updated 2026-05-29
retrieved: 2026-05-25
verified: 2026-05-29
valid_for: historical 2026-05-25 FESPA26 state; superseded for voice-control transport details
temporal_status: version-bound
---

# Agent Post-Creation Review: FESPA26

Date: 2026-05-25
Status: draft, documentation refreshed 2026-05-25

## Summary

- Project path: <SIBLING_AGENT_ROOT>/FESPA26
- Classification: agent-project
- Related lifecycle reports: 2
- User notes: Первый агент Agents Mother. Нужно зафиксировать текущую архитектуру FESPA26 и reusable voice-control pattern на GPT-realtime-2 + Codex CLI sidecar.

## Evidence

- agent-operations-report/complete: 11_agents/reports/2026-05-25-fespa26-agent-operations-report.md
- agent-test-report/complete: 11_agents/reports/2026-05-25-fespa26-agent-test-report.md

## Current Architecture Snapshot

- FESPA26 is a local Next.js web app with a three-tab operator UI: Voice, Feed and Settings.
- Voice uses OpenAI Realtime through browser WebRTC. The default model is `gpt-realtime-2`; cheap mode uses `gpt-realtime-mini`.
- The browser owns microphone capture, remote audio playback, transcript rendering and the `oai-events` data channel.
- Server routes mint ephemeral Realtime sessions, proxy SDP, execute tool calls and keep the OpenAI API key out of the browser.
- SQLite is the operational source of truth for sources, feed items, jobs, sessions, turns and memory.
- Codex CLI is used as a sidecar, not as the direct low-latency speaker.
- Heavy work runs through a sequential local queue with `data/locks/fespa-jobs-run.lock/`.
- Public feed publishing is gated; draft/reviewed cards can be edited and only explicitly published.

## Voice Control Pattern

The reusable pattern is `Realtime dispatcher + deterministic tools + Codex sidecar`.

1. The browser starts a WebRTC call and opens a Realtime data channel.
2. The server creates an ephemeral Realtime session with concise instructions, `semantic_vad`, input transcription and a domain-specific tool list.
3. The Realtime model handles natural voice, chooses tools by operator intent, and gives short spoken status updates.
4. Tool calls go to `/api/realtime/tool`, where deterministic server code saves sources, reads state, queues Codex jobs, updates drafts or gates publication.
5. Finalized dialogue turns are deduplicated and chunked. FESPA26 currently waits for a multi-turn chunk with both user and assistant turns before asking Codex for enrichment.
6. `/api/realtime/orchestrate` sends the chunk through the same conductor path as text chat, but marks it as `source: realtime_chunk`.
7. For realtime chunks, Codex runs in read-only, approval-never, ephemeral mode and returns a short enrichment fragment, not a full user-facing answer.
8. The browser injects that fragment into the live Realtime session via `session.update`; the voice model can use it naturally in a later answer.
9. Separately, longer queue jobs run Codex with task-specific JSON contracts to refine cards, analyze media, verify sources or implement system changes.

This pattern is portable to future agents if the domain tools are replaced. The stable part is the boundary: Realtime is the low-latency conversational dispatcher; Codex is the slower verifier, synthesizer and implementation sidecar.

## Realtime Tool Surface Observed

- `save_fespa_source`: save source material and trigger Codex processing.
- `get_fespa_feed_context`: read recent feed and counts.
- `queue_codex_feed_task`: queue feed/media/source work.
- `queue_codex_card_update`: update existing feed cards by id, number or title.
- `queue_codex_system_task`: queue real app/system changes.
- `queue_codex_cli_task`: explicit operator-requested Codex queue task.
- `search_sources`: queue official or broader web verification.
- `analyze_uploaded_media`: queue analysis for uploaded media.
- `get_source_details`: read source, card or job details.
- `update_feed_draft`: precise draft edits without publication.
- `publish_feed_item`: publication with explicit confirmation text.
- `mark_claim_verified`: record claim verification status.
- `queue_translation_pass`: synchronize RU/EN fields.
- `get_runner_status`: inspect queue/lock/job status.
- `create_followup_checklist`: create verification or booth follow-up tasks.

## Useful Scaffold Patterns

- Interface choices are explicit and inspectable through `interfaces/manifest.json`.
- Memory profile is separated from agent instructions and can evolve without rewriting `AGENTS.md`.
- Tool boundaries are documented before adding external capabilities.
- Deployment, proactivity and service behavior are represented as an operations manifest.
- Smoke test gives a cheap acceptance gate for scaffold changes.
- Deployment automation is separated from scaffold and mutation requires explicit confirmation.
- Realtime voice is kept separate from heavy reasoning; this keeps the call responsive even when Codex is slow or unavailable.
- Tool-call responses are short and human-readable, while durable work is represented as jobs, feed cards and source records.
- Queue processing is sequential and lock-protected, which is enough for a single-operator local agent.
- System-change requests are routed away from publication/feed sources and into a separate Codex system-task lane.

## Failed Assumptions

- Some inherited documentation still mentions `fast_talk` or older three-tool realtime surfaces; future reports should trust current code over stale docs.
- FESPA26 was not registered with a pre-creation contract in Techscope, so this review adds a retrospective accepted contract.
- The project is a working local agent, not yet evidence for promoting every pattern to active standards.

## Reusable Standard Candidates

- Consider promoting generated manifest triad plus smoke test as a reusable minimum scaffold pattern after one more successful agent.
- Promote `Realtime dispatcher + Codex sidecar` as a draft standard now, and mark it active only after a second agent reuses it successfully.
- Consider a future standard for explicit lanes: realtime voice, deterministic tools, queue jobs, system-change tasks and publication gates.

## Outdated Or Risky Patterns

- Documentation drift risk: local docs should be updated when realtime tools or queue semantics change.
- Single-operator/no-auth assumption is acceptable for local Tailscale use, but not for multi-user or public deployment.
- Realtime tool selection depends on prompt discipline; destructive or public actions must remain server-gated.
- Codex sidecar output parsing depends on JSON contracts for queue jobs and plain-text contracts for realtime enrichment; malformed output must fail closed.

## Promotion Path

- Keep this review as evidence for the first Agents Mother experiment.
- Create a draft standard for realtime voice control in Codex agents.
- After the next voice agent, compare whether the same dispatcher/sidecar boundary still holds.
- Promote to active standard only after repeated evidence and clean operations/test reports.

## Next Steps

- Keep FESPA26 docs synchronized when realtime tools, queue semantics, ports or memory tables change. The first cleanup was completed on 2026-05-25.
- Build the next agent using the voice-control standard candidate when voice is requested.
- Run `node scripts/agents-mother.mjs registry` after future lifecycle reports.

## Update 2026-05-29

This review is superseded for voice-control transport details by `11_agents/reports/2026-05-29-fespa26-voice-control-and-feed-memory-update.md`.

The current architecture uses Realtime as the live dispatcher, deterministic server tools for durable state changes, Codex App/thread as the preferred complex-task transport, and Codex CLI/local queue as fallback or worker transport. FESPA26 should now be treated as the Pritha event/reportage example: source intake, operational memory update, Codex processing, reviewed feed cards and explicit publication.
