---
id: 2026-05-28-pritha-claude-code-adapter-agent-contract
type: agent-contract
status: draft
created: 2026-05-28
updated: 2026-05-28
topics:
  - pritha
  - claude-code
  - adapter
  - agent-engineering
tools:
  - Claude Code
  - Codex
  - Pritha
sources:
  - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
related:
  workflows:
    - 07_workflows/first-run-setup.md
    - 07_workflows/agents-mother.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: phase-12-placeholder
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: future Phase 15 adapter planning
temporal_status: current
---

# Agent Project Contract: Pritha Claude Code Adapter

Date: 2026-05-28
Status: draft

## Purpose

- Agent name: Pritha Claude Code Adapter
- Primary mission: define a future adapter that can translate selected Pritha/Codex-native descendant scaffolds into Claude Code-compatible project instructions and optional Claude-specific surfaces.
- Target user: Pritha maintainer evaluating cross-platform agent portability.
- Success criteria: a future implementation can generate reviewed `CLAUDE.md` guidance and Claude-specific optional folders without weakening Pritha's Codex-native source of truth.
- Out of scope: building the adapter in Phase 12, voice interfaces, copying secrets, automatic Claude Code installation, or replacing `AGENTS.md` as Techscope's source of truth.

## Functional scope

### V1 core functions

- Analyze a Pritha descendant contract for portability.
- Identify which instructions map to `CLAUDE.md`.
- Identify which parts remain Codex-specific.
- Produce a dry-run adapter report.

### Deferred functions

- Generate `.claude/skills` or `.claude/agents`.
- Round-trip synchronization between `AGENTS.md` and `CLAUDE.md`.
- Claude-specific test harnesses.

### Critical user workflows

- User asks whether a Pritha descendant can run well in Claude Code.
- Adapter reads the contract and scaffold.
- Adapter reports portable, adapter-needed and environment-specific parts.

## Runtime and interface

- Runtime family: environment-specific
- Primary interface: CLI
- Secondary interfaces: Codex project
- Telegram mode: none
- Expected hosting: local Mac

## Runtime placement

- Runtime placement profile: deterministic-first
- Multi-model routing requested: no
- Local inference required: no

## Operations and service

- Deployment target: none
- Deployment profile: local-development
- Service mode: none
- Autostart: disabled
- Start command: node scripts/pritha-claude-adapter.mjs plan
- Stop command: not applicable
- Healthcheck command: node scripts/pritha-claude-adapter.mjs status
- Log path: none
- Restart policy: none

## Proactivity

- Proactive mode: none
- Trigger sources: manual CLI only
- Schedule: none
- Heartbeat interval: none
- Idle behavior: exit after report
- User interruption policy: not applicable

## Harness inventory

- Information boundaries: read contracts and generated project instructions only; do not read secrets or runtime state.
- Runtime placement: deterministic analysis first; LLM review only after a future explicit implementation decision.
- Tool system: filesystem reads and Markdown generation.
- Execution orchestration: plan, inspect, report, no write unless explicitly requested.
- Memory and state: generated adapter reports only.
- Evaluation and observability: contract validation and snapshot tests.
- Constraints, validation and recovery: never overwrite source instructions automatically.
- Human approval gates: any generated Claude Code files require review before use.
- Completion criteria: adapter report clearly separates portable and environment-specific instructions.

## Data, memory and sources

- Input data types: agent contracts, `AGENTS.md`, scaffold manifests.
- Stored data: adapter reports.
- Sensitive data: none expected; skip `.env`, `.queue`, `.memory`, `.logs`.
- Memory model: Markdown-first.
- Indexing/search needs: none for v1.
- External verification needs: check current Claude Code documentation before implementation.
- Source freshness requirements: recheck docs before Phase 15.

## Tools and integrations

| Capability | Default boundary | Notes |
| --- | --- | --- |
| Contract inspection | CLI/script | Read-only |
| Markdown adapter report | CLI/script | Generated report |
| Claude Code docs check | browser/manual | Future phase |

## Security and permissions

- Secrets required: none
- `.env.example` variables: none
- Allowed network access: none in v1; future docs check only with explicit research step.
- Allowed filesystem access: project Markdown and manifest files.
- User authorization model: local operator only.
- Runtime isolation profile: project-folder
- Network policy tier: deny-by-default
- Credential storage boundary: host-only
- Risk notes: avoid creating misleading Claude-specific instructions that diverge from the Pritha source of truth.

## Scaffold requirements

- Target folder: same Pritha repository, future scripts only.
- Files to generate: none in Phase 12.
- Dependencies: none.
- Setup commands: none.
- Run commands: future `node scripts/pritha-claude-adapter.mjs plan`.
- Tests/healthchecks: contract validation and snapshot tests.
- User training guide: future docs page explaining portability limits.

## Research basis

- Related TechScope artifacts: `07_workflows/first-run-setup.md`, `07_workflows/agents-mother.md`.
- Current primary sources checked: none in Phase 12; implementation postponed.
- Trusted secondary sources checked: none.
- Alternatives considered: keep Codex-only; generate Claude files directly during scaffold.
- Decision rationale: placeholder contract preserves the idea without expanding Phase 12 scope.

## Acceptance checklist

- [ ] Contract reviewed with user.
- [x] Runtime family selected.
- [x] Runtime placement selected per task class.
- [x] Interface mode selected.
- [x] Telegram need explicitly decided.
- [x] Harness inventory complete.
- [x] Security model documented.
- [x] Tests/healthchecks defined.
- [x] Handoff/training plan defined.
