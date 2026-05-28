---
id: 2026-05-26-funny-teacher-v1-agent-post-creation-review
type: agent-post-creation-review
status: accepted
created: 2026-05-26
updated: 2026-05-26
topics:
  - agent-engineering
  - funny-teacher
  - voice-agents
  - language-learning
  - agents-mother
tools:
  - Codex
  - OpenAI Realtime API
  - gpt-realtime-2
  - SQLite
  - Next.js
  - Tailscale
  - launchd
  - semantic-search
agent_platforms:
  - Codex
  - OpenAI Realtime API
model_context:
  - gpt-realtime-2
  - text-embedding-3-small
runtime_environment:
  - local-project
  - web-ui
  - mac-mini
config_surfaces:
  - AGENTS.md
  - README.md
  - docs/
  - operations/manifest.json
  - memory/manifest.json
  - app/api/realtime/session/route.ts
  - app/api/realtime/tool/route.ts
portability: adapter-needed
sources:
  - 11_agents/contracts/2026-05-25-funny-teacher-agent-contract.md
  - 11_agents/reports/2026-05-25-funny-teacher-agent-scaffold-report.md
  - 11_agents/reports/2026-05-26-funny-teacher-launchd-deployment-report.md
  - 11_agents/reports/2026-05-26-funny-teacher-learning-memory-operations-report.md
  - <SIBLING_AGENT_ROOT>/FunnyTeacher/docs/v1-successful-version.md
  - <SIBLING_AGENT_ROOT>/FunnyTeacher/docs/architecture.md
  - <SIBLING_AGENT_ROOT>/FunnyTeacher/docs/operator-guide.md
related:
  agent_contracts:
    - 11_agents/contracts/2026-05-25-funny-teacher-agent-contract.md
  scaffold_reports:
    - 11_agents/reports/2026-05-25-funny-teacher-agent-scaffold-report.md
  agent_operations_reports:
    - 11_agents/reports/2026-05-26-funny-teacher-learning-memory-operations-report.md
  agent_deployment_reports:
    - 11_agents/reports/2026-05-26-funny-teacher-launchd-deployment-report.md
  workflows:
    - 07_workflows/agents-mother.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/realtime-voice-control-for-codex-agents.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-26
source_updated: 2026-05-26
source_version: Funny Teacher first successful v1
retrieved: 2026-05-26
verified: 2026-05-26
valid_for: Funny Teacher v1 and future Agents Mother voice-learning agent references
temporal_status: current
---

# Agent Post-Creation Review: Funny Teacher V1

Date: 2026-05-26
Status: accepted

## Summary

- Project path: `<SIBLING_AGENT_ROOT>/FunnyTeacher`
- Classification: first successful Agents Mother language-learning voice agent
- Access: `https://ivans-mac-mini.tail691439.ts.net:3034`
- Service: launchd label `com.local.funny-teacher`
- Result: working v1 fixed as a reusable reference, not a temporary prototype

Funny Teacher proves a second successful voice-agent architecture after FESPA26, but in a different domain. FESPA26 is a media/event operations agent; Funny Teacher is a personal learning agent. The shared reusable pattern is `browser voice UI + Realtime session + deterministic server tools + durable local memory + Tailscale deployment`.

## Evidence

- The project has independent docs: `README.md`, `AGENTS.md`, `docs/architecture.md`, `docs/operator-guide.md`, `docs/v1-successful-version.md`, `docs/creation-review.md`.
- `npm test` passes.
- `npm run build` passes.
- Local health endpoint passes.
- Tailscale health endpoint passes.
- Launchd service is installed and running.
- Repeated YouTube URL submit returns `reused: true`.
- Memory search is user-visible and model-usable.
- Realtime tools can persist learner attempts and final outcomes.

## Useful Scaffold Patterns

- Keep Realtime as the low-latency teacher interface, not the whole agent.
- Use ephemeral Realtime client secrets from the server; never expose the API key to the browser.
- Keep durable actions in server tools:
  - semantic search;
  - record attempt;
  - save lesson outcome.
- Store lesson progress in SQLite when the domain has repeat attempts and evolving learner state.
- Treat YouTube video/audio as cache; keep URL, derivative, attempts, grades and progress as durable memory.
- Give the user manual retrieval controls:
  - search memory;
  - select a result as practice focus;
  - clear focus when it should not affect the next lesson.
- Make repeated source intake idempotent by stable source id.

## Failed Assumptions

- A YouTube embed alone is not reliable enough for mobile learning flow; anti-bot prompts can block viewing.
- A passive search-result list is not enough; search results need actions.
- A selected memory result can confuse the next voice session unless the UI has a clear reset.
- Avoiding duplicate DB rows is not the same as idempotent intake; derivative rebuild and reindex must also be skipped.
- "English teacher" was too narrow; the UI and teacher should support language learning generally.

## Reusable Standard Candidates

- `selected-memory-focus`: semantic search results become useful when one result can be explicitly injected into the next Realtime session.
- `memory-focus-reset`: any user-selected retrieval context must have an obvious reset.
- `source-idempotent-intake`: every media/source ingestion flow should use a stable source id before creating new artifacts.
- `local-cache-not-memory`: large media files should be cache unless the contract explicitly requires archival storage.
- `voice-tool-boundary`: Realtime should call narrow server tools rather than directly touching raw files or broad memory.

## Outdated Or Risky Patterns

- Treating a web voice agent as a pure chat UI misses important product controls around context, memory and reset.
- Letting model retrieval happen only invisibly makes user steering harder.
- Launchd service setup should remain explicit and documented; do not silently install long-running services.

## Promotion Path

Funny Teacher strengthens the draft standard `04_standards/realtime-voice-control-for-codex-agents.md`. The standard can move closer to active after one more voice agent confirms the same boundary in a third domain, or after Funny Teacher receives sustained real-use evidence.

The idempotent source-intake pattern is strong enough to be considered for a future source-ingestion standard because both Techscope and Funny Teacher need it.

## Next Steps

- Keep using Funny Teacher as a reference implementation for small Realtime voice agents.
- Add a future handoff/training report after more real learner sessions.
- Consider phoneme-level pronunciation scoring only if conversational correction proves insufficient.
- Consider spaced repetition reminders only after explicit proactivity approval.
