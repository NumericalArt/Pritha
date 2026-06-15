---
id: child-agent-profile-stupidjoke
type: child-agent-profile
status: active
created: 2026-06-14
updated: 2026-06-14
topics:
  - child-agents
  - stupidjoke
  - humor-agent
  - realtime-voice
  - scheduled-agents
tools:
  - Codex
  - Node.js
  - OpenAI Realtime API
sources:
  - 11_agents/contracts/2026-06-12-stupidjoke-agent-contract.md
  - 11_agents/reports/2026-06-12-stupidjoke-agent-scaffold-completion-report.md
  - 11_agents/reports/2026-06-12-stupidjoke-agent-test-report.md
related:
  standards:
    - 04_standards/realtime-voice-control-for-codex-agents.md
    - 04_standards/realtime-voice-control-ui.md
    - 04_standards/agent-proactivity-scheduling.md
  contracts:
    - 11_agents/contracts/2026-06-12-stupidjoke-agent-contract.md
  reports:
    - 11_agents/reports/2026-06-12-stupidjoke-agent-scaffold-completion-report.md
    - 11_agents/reports/2026-06-12-stupidjoke-agent-test-report.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-12
source_updated: 2026-06-14
source_version: StupidJoke Phase 1 local server and scheduler metadata
retrieved: 2026-06-14
verified: 2026-06-14
valid_for: StupidJoke current local safe joke agent profile
temporal_status: current
memory_domain: child-agents
memory_domains:
  - child-agents
  - agent-building-knowledge
subject:
  kind: child-agent
  id: stupidjoke
privacy: public
retention: durable
review_status: draft
confidence: medium
agent_id: stupidjoke
agent_name: StupidJoke
assigned_version: v0.1.0
version_basis: package.json v0.1.0 plus Phase 1 local server and scheduler implementation
lifecycle_status: active
folder_name: StupidJoke
snapshot_retention: 2
snapshot_store: .snapshots/child-agents/stupidjoke
restore_strategy: contract-and-reports
rollback_status: unavailable
---

# Child Agent Profile: StupidJoke

Status: active

## Purpose

- Provide a small, safe joke agent for short family-safe humor.
- Current Pritha role: local child-agent example for safe external joke intake, runtime JSONL memory, scheduler metadata, and optional browser Realtime voice announcement.

## Current Capabilities

- Validates manually curated user-import fixtures.
- Filters every candidate joke through the mandatory deterministic safety scanner.
- Runs a manual local HTTP server at `http://127.0.0.1:3039`.
- Runs an in-process 10 minute scheduler while the manual server is active.
- Supports a one-shot collection command through `npm run collect:once`.
- Stores runtime candidate, run, and announcement state under ignored `.state/stupidjoke`.
- Exposes a local web console for scheduler state, run-now, pending announcements, and optional Realtime voice start/stop.

## Interfaces

- Primary: local web console.
- Secondary: Codex project plus CLI healthcheck/smoke/test scripts.
- Realtime voice: optional browser session; requires server-side `OPENAI_API_KEY`.
- Telegram: absent.

## Memory Model

- Tracked fixture memory under `fixtures/user_import`.
- Runtime JSONL memory under `.state/stupidjoke`.
- Accepted candidates may store joke text.
- Rejected or review candidates store metadata, safety reasons, and text length without repeating unsafe raw text.
- No SQLite, embeddings, vector store, or private user model yet.

## Tools

- Local fixture validator and safety filter.
- HTTPS allowlisted source adapter through `STUPIDJOKE_SOURCE_URLS`.
- In-process scheduler with overlap prevention.
- Optional OpenAI Realtime browser bridge using server-side ephemeral credentials.

## Operations

- Deployment target: local Mac.
- Service mode: none.
- Autostart: disabled.
- Local upstream: `http://127.0.0.1:3039`.
- Health URL: `http://127.0.0.1:3039/api/status`.
- Start command: `npm run server`.
- Stop behavior: operator stops the manual server process.
- Cron, launchd, heartbeat, queue watcher, and service install remain disabled.

## Known Issues

- Control Center can probe the local URL only while `npm run server` is running.
- No source URLs are configured by default, so scheduler runs are skipped until the operator sets `STUPIDJOKE_SOURCE_URLS`.
- Realtime voice cannot speak without an active browser/WebRTC session.
- Snapshot metadata store is not present, so rollback is unavailable.

## Next Improvements

- Add curated safe source allowlist and source-quality tests.
- Add explicit pause/resume scheduler controls in the local web UI.
- Add source dedupe and selection scoring beyond first accepted candidate.
- Add operations/deployment report before any cron, launchd, or service installation.
