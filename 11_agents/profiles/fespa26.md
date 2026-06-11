---
id: child-agent-profile-fespa26
type: child-agent-profile
status: active
created: 2026-06-04
updated: 2026-06-04
topics:
  - child-agents
  - fespa26
  - voice-agents
  - event-reporting
  - feed-memory
tools:
  - Codex App
  - Codex CLI
  - OpenAI Realtime API
  - gpt-realtime-2
  - Next.js
  - SQLite
sources:
  - 11_agents/contracts/2026-05-25-fespa26-agent-contract.md
  - 11_agents/reports/2026-05-19-fespa26-agent-scaffold-report.md
  - 11_agents/reports/2026-05-29-fespa26-agent-test-report.md
  - 11_agents/reports/2026-05-29-fespa26-voice-control-and-feed-memory-update.md
related:
  standards:
    - 04_standards/realtime-voice-control-for-codex-agents.md
    - 04_standards/child-agent-lifecycle-metadata.md
  contracts:
    - 11_agents/contracts/2026-05-25-fespa26-agent-contract.md
  reports:
    - 11_agents/reports/2026-05-29-fespa26-agent-test-report.md
    - 11_agents/reports/2026-05-29-fespa26-voice-control-and-feed-memory-update.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-19
source_updated: 2026-05-29
source_version: Pritha lifecycle profile v1 from FESPA26 scaffold and current architecture reports
retrieved: 2026-06-04
verified: 2026-06-04
valid_for: FESPA26 current local voice/feed agent profile
temporal_status: version-bound
memory_domain: child-agents
memory_domains:
  - child-agents
  - agent-building-knowledge
subject:
  kind: child-agent
  id: fespa26
privacy: public
retention: durable
review_status: accepted
confidence: medium
agent_id: fespa26
agent_name: FESPA26
assigned_version: v1
version_basis: Pritha lifecycle version assigned from accepted scaffold/current-architecture evidence; not a package.json version
lifecycle_status: active
folder_name: FESPA26
snapshot_retention: 2
snapshot_store: .snapshots/child-agents/fespa26
restore_strategy: contract-and-reports
rollback_status: unavailable
---

# Child Agent Profile: FESPA26

Status: active

## Purpose

- Voice-first Codex-native workbench for processing FESPA 2026 booth media,
  notes, links and files into a bilingual mobile news feed.
- Current Pritha role: reference descendant for event, exhibition, media and
  reportage workflows.

## Current Capabilities

- Realtime voice interaction through a browser UI.
- Event/source intake into SQLite operational memory.
- Feed-card workflow with explicit publication gate.
- Codex deep-task boundary for heavier processing, verification and system
  tasks.
- Local queue fallback when foreground Codex transport is unavailable.

## Interfaces

- Primary: web UI.
- Secondary: CLI maintenance scripts.
- Telegram: absent.
- Tailscale: used for trusted device access in local operator setup.

## Memory Model

- SQLite operational memory for sessions, turns, L1/L2 memory, FESPA sources,
  feed cards, jobs, publications and tool events.
- Raw uploads remain runtime state inside the child project and are not copied
  into Techscope profiles.

## Tools

- OpenAI Realtime server/browser boundary.
- Realtime tool router.
- Codex App/thread transport where available.
- Codex CLI/local queue fallback.
- FESPA memory and feed APIs.

## Operations

- Deployment target: local Mac.
- Service mode: manual.
- Autostart: disabled.
- Local upstream observed by operations manifest: `http://127.0.0.1:3027`.
- Healthcheck command is defined in the child operations manifest.

## Known Issues

- Snapshot metadata store is not present, so rollback is unavailable.
- Pritha lifecycle version is `v1`; no separate child app semantic version has
  been recorded in the current curated memory.

## User Training Status

- Operator can use the web UI and voice/feed workflow.
- Publication and service/autostart remain explicit approval actions.

## Evolution History

- 2026-05-19: initial scaffold report completed.
- 2026-05-25: retrospective accepted contract.
- 2026-05-29: current voice-control and feed-memory architecture accepted as
  a Pritha reference example.

## Lessons Learned

- Event agents need a feed/source lifecycle, not generic chat memory only.
- Realtime voice should dispatch to narrow server tools and Codex deep tasks
  instead of owning durable state directly.
- Publication, service install and public exposure must stay behind explicit
  gates.

## Next Improvements

- Add snapshot metadata when a real restorable point is created.
- Record a separate child app semantic version if FESPA26 adopts one.
- Keep improving Codex App/thread transport only behind observable health and
  fallback behavior.
