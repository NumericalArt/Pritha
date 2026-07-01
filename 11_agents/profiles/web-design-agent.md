---
id: child-agent-profile-web-design-agent
type: child-agent-profile
status: active
created: 2026-07-01
updated: 2026-07-01
topics:
  - child-agents
  - web-design-agent
  - ui-ux
  - web-design
  - codex-native
tools:
  - Codex
  - Node.js
  - Pritha Control Center
sources:
  - 11_agents/contracts/2026-06-30-web-design-agent-agent-contract.md
  - 11_agents/reports/2026-06-30-web-design-agent-scaffold-report.md
  - 11_agents/research/2026-06-30-web-design-agent-agent-research.md
related:
  contracts:
    - 11_agents/contracts/2026-06-30-web-design-agent-agent-contract.md
  reports:
    - 11_agents/reports/2026-06-30-web-design-agent-scaffold-report.md
  research:
    - 11_agents/research/2026-06-30-web-design-agent-agent-research.md
    - 11_agents/research/2026-06-30-web-design-agent-agent-pattern-pack.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-30
source_updated: 2026-07-01
source_version: web-design-agent v0.1.0 scaffold plus managed local Control Center runtime
retrieved: 2026-07-01
verified: 2026-07-01
valid_for: web-design-agent v1 operator-driven UI/UX assistant profile
temporal_status: current
memory_domain: child-agents
memory_domains:
  - child-agents
  - agent-building-knowledge
subject:
  kind: child-agent
  id: web-design-agent
privacy: public
retention: durable
review_status: active
confidence: high
agent_id: web-design-agent
agent_name: web-design-agent
assigned_version: v0.1.0
version_basis: package.json v0.1.0 plus accepted scaffold and managed local healthcheck/runtime
lifecycle_status: active
folder_name: web-design-agent
folder_ref: ../web-design-agent
snapshot_retention: 2
snapshot_store: .snapshots/child-agents/web-design-agent
restore_strategy: contract-and-reports
rollback_status: unavailable
---

# Child Agent Profile: web-design-agent

Status: active

## Purpose

- Provide a standalone, operator-driven UI/UX and web-design assistant.
- Current Pritha role: minimal Codex-native child agent for web-design material
  intake, candidate-memory drafting and practical interface recommendations.

## Current Capabilities

- Accepts operator-provided web-design materials in a Codex project/thread.
- Extracts useful examples, principles, trade-offs and risks.
- Uses confirmation-gated candidate memory for reusable design lessons.
- Provides textual UI/UX recommendations for a target interface context.
- Exposes deterministic local smoke and healthcheck commands.
- Exposes a project-local Control Center managed runtime with start, stop and
  `/api/health` endpoints.

## Interfaces

- Primary: Codex project/thread.
- Secondary: local CLI/status scripts and Pritha Control Center agent card.
- Telegram: absent.
- Realtime voice: absent in the child project; Pritha Voice Control can route
  Codex tasks to this subject.

## Memory Model

- Markdown source of truth under the child project.
- Intake staging: `memory/intake/`.
- Candidate memory: `memory/candidates/`.
- Candidate template: `memory/templates/candidate-memory.md`.
- No SQLite, embeddings, graph store or external vector store in v1.
- Memory writes require explicit operator confirmation.

## Tools

- Local Node.js scripts for status, smoke checks, health checks and manifest
  inspection.
- Local Node.js runtime wrapper for Control Center start/stop/status actions.
- No external API, browser automation, Figma connector or hosted design service
  is selected for v1.

## Operations

- Deployment target: local Mac project folder.
- Service mode: manual local runtime.
- Autostart: disabled.
- Control Center mode: managed detached Node process; no launchd/cron install.
- Healthcheck command: `node scripts/healthcheck.mjs`.
- Runtime start: `node scripts/control-center-runtime.mjs start`.
- Runtime stop: `node scripts/control-center-runtime.mjs stop`.
- Health URL: `http://127.0.0.1:5759/api/health`.

## Known Issues

- Browser/Figma/media tooling is not selected.
- Autostart/deployment is not installed; runtime is started on demand by Control
  Center or the local runtime script.
- Snapshot metadata store is not present, so rollback is unavailable.

## User Training Status

- Operator can open the folder in Codex, run `node scripts/healthcheck.mjs`,
  submit design material, review proposed candidate memory and explicitly
  approve any memory write.

## Evolution History

- 2026-06-30: standalone agent contract, research, pattern-pack, external gate,
  scaffold and readiness verification completed.
- 2026-07-01: minimal local health probe and canonical Pritha profile added.
- 2026-07-01: Control Center managed local runtime added and verified with
  start/status/health/stop.

## Lessons Learned

- A manual design assistant should keep raw or private source material out of
  curated memory by default.
- Candidate-memory writes need a visible confirmation gate.
- Control Center readiness should expose executable Start Plan when a managed
  runtime contract is present.

## Next Improvements

- Use the first real operator design task to validate the intake workflow.
- Add browser, Figma, visual asset or project-specific tooling only after an
  accepted contract/profile update.
- Add snapshot metadata when a real restorable point exists.
