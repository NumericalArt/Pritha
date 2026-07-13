---
id: child-agent-profile-funny-teacher
type: child-agent-profile
status: active
created: 2026-06-04
updated: 2026-06-04
topics:
  - child-agents
  - funny-teacher
  - voice-agents
  - language-learning
  - semantic-search
tools:
  - Codex
  - OpenAI Realtime API
  - gpt-realtime-2
  - Next.js
  - SQLite
  - semantic-search
  - Tailscale
  - launchd
sources:
  - 11_agents/contracts/2026-05-25-funny-teacher-agent-contract.md
  - 11_agents/reports/2026-05-25-funny-teacher-agent-scaffold-report.md
  - 11_agents/reports/2026-05-26-funny-teacher-v1-agent-post-creation-review.md
  - 11_agents/reports/2026-05-29-funny-teacher-agent-test-report.md
  - 11_agents/reports/2026-05-29-funny-teacher-pritha-reference-example.md
related:
  standards:
    - 04_standards/realtime-voice-control-for-codex-agents.md
    - 04_standards/child-agent-lifecycle-metadata.md
  contracts:
    - 11_agents/contracts/2026-05-25-funny-teacher-agent-contract.md
  reports:
    - 11_agents/reports/2026-05-26-funny-teacher-v1-agent-post-creation-review.md
    - 11_agents/reports/2026-05-29-funny-teacher-agent-test-report.md
    - 11_agents/reports/2026-05-29-funny-teacher-pritha-reference-example.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-25
source_updated: 2026-05-29
source_version: Pritha lifecycle profile v1 from Funny Teacher accepted reference reports
retrieved: 2026-06-04
verified: 2026-06-04
valid_for: Funny Teacher current local voice learning agent profile
temporal_status: current
memory_domain: child-agents
memory_domains:
  - child-agents
  - agent-building-knowledge
subject:
  kind: child-agent
  id: funny-teacher
privacy: public
retention: durable
review_status: accepted
confidence: high
agent_id: funny-teacher
agent_name: Funny Teacher
assigned_version: v1
version_basis: Pritha lifecycle version fixed by accepted v1 post-creation review and current local v1 reference report
lifecycle_status: active
folder_name: FunnyTeacher
snapshot_retention: 2
snapshot_store: .snapshots/child-agents/funny-teacher
restore_strategy: contract-and-reports
rollback_status: unavailable
---

# Child Agent Profile: Funny Teacher

Status: active

## Purpose

- Help one user improve spoken English through YouTube lesson intake,
  realtime voice practice, correction and spaced review.
- Current Pritha role: accepted reference example for feedback-driven voice
  learning agents.

## Current Capabilities

- Web voice learning flow.
- YouTube lesson intake with idempotent source behavior.
- Realtime teacher session.
- Learner attempts and outcomes stored in durable memory.
- Semantic search with lexical fallback.
- User-visible memory search and selected practice focus.

## Interfaces

- Primary: web voice UI.
- Secondary: local CLI maintenance scripts.
- Telegram: absent.
- Tailscale: used for trusted device access.

## Memory Model

- SQLite lesson memory.
- Semantic index for lesson chunks.
- Fallback lexical scoring when embeddings or API key are unavailable.
- Media/video cache is runtime state, not canonical Techscope profile content.

## Tools

- OpenAI Realtime session boundary.
- Server-side tools for semantic search, learner attempts and lesson outcomes.
- YouTube/source intake tooling inside the child project.

## Operations

- Deployment target: local Mac or Mac mini.
- Service mode: launchd, enabled only after explicit user approval.
- Autostart policy: `launchd-on-approval`.
- Local upstream observed by operations manifest: `http://127.0.0.1:4033`.
- Tailscale URL recorded in reports and operations manifest.

## Known Issues

- Snapshot metadata store is not present, so rollback is unavailable.
- Learner-specific runtime state must remain outside public Techscope profiles.

## User Training Status

- User has tested the voice learning flow and Tailscale access.
- Important controls: memory search, selected practice focus and clear/reset
  behavior.

## Evolution History

- 2026-05-25: initial scaffold.
- 2026-05-26: first successful v1 fixed as reusable reference.
- 2026-05-29: accepted as a Pritha reference example after test/report review.

## Lessons Learned

- Product truth emerged through real use, not only the initial contract.
- Voice agents need deterministic server tools for durable memory.
- Retrieval needs visible user controls and an obvious reset path.
- Media intake should be idempotent from the first working version.

## Next Improvements

- Add snapshot metadata when a real restorable point is created.
- Keep learner-private memory out of tracked Techscope artifacts.
- Use this profile as evidence, not as a template to copy blindly into every
  future voice agent.
