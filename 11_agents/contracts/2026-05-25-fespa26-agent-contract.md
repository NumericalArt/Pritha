---
id: 2026-05-25-fespa26-agent-contract
type: agent-contract
status: accepted
created: 2026-05-25
updated: 2026-05-25
topics:
  - agent-engineering
  - voice-agents
  - realtime
  - codex-sidecar
  - fespa26
tools:
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
  - .env.example
  - interfaces/manifest.json
  - memory/manifest.json
  - tools/manifest.json
  - operations/manifest.json
  - scripts
portability: adapter-needed
sources:
  - <SIBLING_AGENT_ROOT>/FESPA26
  - <SIBLING_AGENT_ROOT>/FESPA26/README.md
  - <SIBLING_AGENT_ROOT>/FESPA26/AGENTS.md
  - <SIBLING_AGENT_ROOT>/FESPA26/docs/current-architecture.md
  - <SIBLING_AGENT_ROOT>/FESPA26/docs/codex-cli-enrichment.md
  - <SIBLING_AGENT_ROOT>/FESPA26/docs/harness-architecture.md
related:
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/agents-mother-roadmap.md
  standards:
    - 04_standards/agent-creation-harness.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: 2026-05-25
source_version: observed local project state 2026-05-25
retrieved: 2026-05-25
verified: 2026-05-25
valid_for: FESPA26 local project state inspected on 2026-05-25
temporal_status: current
---

# Agent Project Contract: FESPA26

Date: 2026-05-25
Status: accepted, retrospective

## Purpose

- Agent name: FESPA26
- Primary mission: voice-first Codex-native workbench for processing FESPA 2026 booth media, notes, links and files into a bilingual mobile news feed
- Target user: one operator working with exhibition materials.
- Success criteria: the operator can talk to the agent, upload or paste media/materials, queue heavier Codex processing, review bilingual feed cards and publish only after explicit approval.
- Out of scope: multi-user tenancy, public publishing without confirmation, Telegram adapter in v1, autonomous background heartbeat, automatic launchd service install.

## Functional Scope

### V1 Core Functions

- Web UI with Voice, Feed and Settings tabs.
- Voice interaction through OpenAI Realtime.
- Codex CLI sidecar for heavier reasoning, media/feed synthesis, source search and system-change tasks.
- SQLite operational memory for sources, feed items, jobs, sessions, turns and L1/L2 memory.
- Local upload handling for text, URLs, images, PDFs, video/audio and files.
- Sequential job queue with stale-lock-aware local lock.
- Bilingual RU/EN feed card fields.
- Public feed publication path with explicit confirmation.

### Deferred Functions

- Telegram adapter.
- Multi-user auth.
- Embeddings/vector search.
- Production-grade observability backend.
- launchd autostart after explicit approval.

### Critical User Workflows

- Speak a booth/media note, save it as a source, and let Codex refine it into a reviewed feed card.
- Upload/paste a media source through the Feed UI and queue analysis.
- Ask by voice to update an existing card by stable number or title.
- Ask for source verification through official or web search.
- Publish only after explicit confirmation.

## Runtime And Interface

- Runtime family: hybrid, with Codex-native sidecar.
- Primary interface: web.
- Secondary interfaces: CLI maintenance scripts.
- Telegram mode: none.
- Expected hosting: local Mac, accessible from MacBook or phone through Tailscale.

## Operations And Service

- Deployment target: local Mac.
- Deployment profile: local-development.
- Service mode: manual.
- Autostart: disabled.
- Start command: `npm run dev`.
- Stop command: stop the owning dev-server process.
- Healthcheck command: `npm run smoke && npm run lint && npm test && npm run build`.
- Log path: `logs/`.
- Restart policy: manual.

## Proactivity

- Proactive mode: manual.
- Trigger sources: voice command, UI ingest form, local CLI command.
- Schedule: none.
- Heartbeat interval: none.
- Idle behavior: wait for operator action.
- User interruption policy: do not interrupt unless configured later.

## Harness Inventory

- Information boundaries: Realtime model receives concise operational instructions and tool schemas; raw secrets stay server-side; Codex sidecar receives clamped context and task-specific prompts.
- Tool system: Realtime tools route intent into local repository methods and queued Codex jobs.
- Execution orchestration: realtime path is low-latency; queue path is sequential and lock-protected; realtime chunks can be enriched by a read-only Codex sidecar.
- Memory and state: SQLite source of truth for operational state, with raw uploads under `data/uploads`.
- Evaluation and observability: smoke/status scripts, in-process metrics, debug endpoints, tool-event audit table.
- Constraints, validation and recovery: origin checks, rate limits, ephemeral Realtime sessions, queue locks, JSON output contracts, publication confirmation gate.
- Human approval gates: feed publication, service install/autostart, public deployment.
- Completion criteria: smoke/test/operations checks pass and the operator can process materials through voice or Feed UI.

## Data, Memory And Sources

- Input data types: speech, text, URLs, YouTube links, images, PDFs, audio, video, files.
- Stored data: sources, feed cards, jobs, sessions, turns, L1/L2 memory, uploads.
- Sensitive data: OpenAI API key, Codex auth, private exhibition media.
- Memory model: SQLite operational memory plus project docs.
- Indexing/search needs: keyword/SQLite in v1; embeddings deferred.
- External verification needs: official exhibitor/FESPA sources first, broader web second.
- Source freshness requirements: preserve source URL, verification status, source links, open questions.

## Tools And Integrations

| Capability | Default Boundary | Notes |
| --- | --- | --- |
| OpenAI Realtime | server API + browser WebRTC | Voice session, transcript events and tool-call dispatch. |
| Codex CLI | local sidecar | Heavy analysis, feed synthesis, verification and system tasks through `codex exec --ephemeral`. |
| SQLite | local persistence | Operational source of truth. |
| Next.js API | app boundary | Session minting, SDP proxying, tool execution, ingest and feed APIs. |
| Tailscale | network boundary | Remote access to local web UI. |

## Security And Permissions

- Secrets required: OpenAI API key, Codex account auth outside repo.
- `.env.example` variables: defined in FESPA26; real secrets are not copied into Techscope.
- Allowed network access: OpenAI Realtime; source verification from Codex queue jobs.
- Allowed filesystem access: FESPA26 project and its `data/` folder.
- User authorization model: single trusted local operator.
- Risk notes: no multi-user auth, manual service mode, private media should not be published automatically.

## Scaffold Requirements

- Target folder: `<SIBLING_AGENT_ROOT>/FESPA26`.
- Files generated/observed: `AGENTS.md`, `README.md`, `.env.example`, `interfaces/`, `memory/`, `tools/`, `operations/`, `scripts/`, Next.js app files.
- Dependencies: Next.js 16, React 19, OpenAI Realtime API through fetch/WebRTC, SQLite, Codex CLI.
- Setup commands: install dependencies, configure `.env.local`, run local dev server.
- Run commands: `npm run dev`, `npm run smoke`, `npm run jobs:run`.
- Tests/healthchecks: smoke, lint, unit tests, build.
- User training guide: use Voice for fast commands, Feed for review/upload, Settings for runtime state.

## Research Basis

- Related Techscope artifacts:
  - `04_standards/agent-creation-harness.md`
  - `07_workflows/agents-mother.md`
  - `07_workflows/agents-mother-roadmap.md`
- Current primary sources checked: local FESPA26 code and docs.
- Trusted secondary sources checked: none for this retrospective contract.
- Alternatives considered: Telegram interface deferred; launchd service deferred; embeddings deferred.
- Decision rationale: keep v1 local, inspectable, fast for voice, and use Codex only when heavier reasoning or code/file work is needed.

## Acceptance Checklist

- [x] Contract reconstructed from actual project.
- [x] Runtime family selected.
- [x] Interface mode selected.
- [x] Telegram need explicitly decided.
- [x] Harness inventory complete.
- [x] Security model documented.
- [x] Tests/healthchecks defined.
- [x] Handoff/training plan partially defined in project docs.
