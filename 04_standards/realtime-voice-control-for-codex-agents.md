---
id: realtime-voice-control-for-codex-agents
type: standard
status: draft
created: 2026-05-25
updated: 2026-05-25
last_reviewed: 2026-05-25
owner: Techscope/user
topics:
  - agent-engineering
  - voice-agents
  - realtime
  - codex-sidecar
  - harness-engineering
tools:
  - OpenAI Realtime API
  - gpt-realtime-2
  - Codex CLI
  - WebRTC
  - SQLite
agent_platforms:
  - Codex
  - OpenAI Realtime API
model_context:
  - gpt-realtime-2
  - gpt-realtime-mini
runtime_environment:
  - web-ui
  - local-project
  - mac
config_surfaces:
  - AGENTS.md
  - realtime instructions
  - tool schemas
  - server routes
  - queue scripts
portability: adapter-needed
sources:
  - /Users/jkl/FESPA26/hooks/use-realtime-call.ts
  - /Users/jkl/FESPA26/lib/openai/realtime-config.ts
  - /Users/jkl/FESPA26/lib/openai/realtime-tools.ts
  - /Users/jkl/FESPA26/lib/realtime/instructions.ts
  - /Users/jkl/FESPA26/app/api/realtime/tool/route.ts
  - /Users/jkl/FESPA26/app/api/realtime/orchestrate/route.ts
  - /Users/jkl/FESPA26/lib/chat/process-agent-message.ts
  - /Users/jkl/FESPA26/lib/agent/codex-cli-runtime.ts
  - /Users/jkl/FESPA26/docs/current-architecture.md
  - /Users/jkl/FESPA26/docs/harness-architecture.md
  - /Users/jkl/FESPA26/docs/codex-cli-enrichment.md
  - 11_agents/contracts/2026-05-25-fespa26-agent-contract.md
  - 11_agents/reports/2026-05-25-fespa26-agent-post-creation-review.md
related:
  decisions: []
  reviews:
    - 11_agents/reports/2026-05-25-fespa26-agent-post-creation-review.md
  briefs: []
  reports:
    - 11_agents/reports/2026-05-25-fespa26-agent-test-report.md
    - 11_agents/reports/2026-05-25-fespa26-agent-operations-report.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: 2026-05-25
source_version: FESPA26 local implementation inspected 2026-05-25
retrieved: 2026-05-25
verified: 2026-05-25
valid_for: Codex-native local agents with web voice UI and explicit server-side tools
temporal_status: version-bound
---

# Standard: Realtime Voice Control For Codex Agents

Status: draft
Owner: Techscope/user
Last reviewed: 2026-05-25

## Rule

For voice-controlled Codex agents, separate the live voice model from the heavy agent brain.

Use the Realtime model as a low-latency dispatcher and conversational interface. Put durable work, verification, file/media processing, code changes and publication decisions behind deterministic server tools, a queue and a Codex CLI sidecar.

## Use When

- The agent needs fast spoken interaction.
- The agent must process files, media, links, sources or local project state.
- The operator needs quick voice commands while heavy work can run asynchronously.
- The same agent has both conversational UX and durable artifacts such as cards, reports, decisions or memory.

## Avoid When

- The task is pure transcription or simple chat with no durable actions.
- There is no trusted server boundary for secrets and tools.
- The voice model would need to perform destructive actions directly.
- The deployment cannot tolerate WebRTC/microphone browser constraints.

## Required Practices

- Keep the OpenAI API key on the server. The browser receives only ephemeral Realtime session credentials.
- Let the browser own microphone capture, remote audio playback and data-channel event handling.
- Keep Realtime instructions concise and operational.
- Define domain-specific tools with narrow arguments and server-side validation.
- Route public, destructive or long-running actions through explicit gates and queued jobs.
- Use Codex CLI as a sidecar for slow or high-context work, not as the direct realtime speaker.
- For realtime enrichment, run Codex in `read-only`, `approval_policy=never`, ephemeral mode and return a short insert.
- For durable queue jobs, use task-specific prompts and machine-readable output contracts.
- Store turns, memory, sources and job status in local durable state.
- Make tool responses human-readable, but record the real result in structured state.
- Fail closed: if Codex is unavailable or malformed output is returned, keep the voice session alive and mark the queued work failed or skipped.

## Reference Flow

1. Browser requests a Realtime session from the server.
2. Server creates an ephemeral session with selected model, voice, transcription, turn detection and tool definitions.
3. Browser opens WebRTC and an `oai-events` data channel.
4. Realtime model speaks with the user and emits tool calls when action is needed.
5. Browser forwards function calls to a server tool route and returns `function_call_output` to Realtime.
6. Server tools save sources, read state, queue Codex jobs, update drafts or enforce approval gates.
7. Finalized dialogue turns are deduplicated and chunked.
8. The chunk is sent to a conductor as `realtime_chunk`.
9. Codex sidecar optionally returns a short enrichment fragment.
10. Browser injects the fragment back into Realtime with `session.update`.
11. Queue runner processes heavier jobs sequentially and updates durable memory/feed artifacts.

## Agent Environment Compatibility

- Agent platforms: Codex-native agents with optional OpenAI Realtime voice layer.
- Model context: observed with `gpt-realtime-2` and cheap-mode `gpt-realtime-mini`.
- Runtime environment: local Next.js web UI, server API routes, local Codex CLI.
- Config surfaces: `AGENTS.md`, realtime instructions, tool schemas, server tool route, queue scripts, operations manifest.
- Portability: adapter-needed.
- Codex adaptation: keep Codex prompts separate for realtime enrichment vs durable queue jobs.
- Environment-specific caveats: browser microphone permissions, WebRTC availability, Realtime regional availability, Codex CLI auth and ephemeral support.

## Temporal Validity

- Source published: unknown.
- Source updated: 2026-05-25.
- Source version: FESPA26 local implementation inspected 2026-05-25.
- Retrieved: 2026-05-25.
- Verified: 2026-05-25.
- Valid for: local Codex agents with web voice UI.
- Freshness status: current.
- Temporal status: version-bound.
- Recheck when: OpenAI Realtime API session/call format changes, Codex CLI `exec --ephemeral` behavior changes, or a second voice agent reuses this pattern.

## Examples

- FESPA26 uses `gpt-realtime-2` for spoken operator control, server-side realtime tools for local state mutations, and Codex CLI jobs for feed synthesis, media analysis, source search and system changes.

## Related Decisions

- No formal decision record yet. This is a draft standard candidate based on the first Agents Mother implementation evidence.
