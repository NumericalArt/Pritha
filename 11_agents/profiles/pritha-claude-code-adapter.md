---
id: child-agent-profile-pritha-claude-code-adapter
type: child-agent-profile
status: draft
created: 2026-06-04
updated: 2026-06-04
topics:
  - child-agents
  - pritha
  - claude-code
  - adapter
  - portability
tools:
  - Claude Code
  - Codex
  - Pritha
sources:
  - 11_agents/contracts/2026-05-28-pritha-claude-code-adapter-agent-contract.md
related:
  standards:
    - 04_standards/child-agent-lifecycle-metadata.md
  contracts:
    - 11_agents/contracts/2026-05-28-pritha-claude-code-adapter-agent-contract.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: draft placeholder profile from Phase 12 adapter contract
retrieved: 2026-06-04
verified: 2026-06-04
valid_for: future Phase 15 Claude Code adapter planning
temporal_status: current
memory_domain: child-agents
memory_domains:
  - child-agents
  - agent-building-knowledge
subject:
  kind: child-agent
  id: pritha-claude-code-adapter
privacy: public
retention: durable
review_status: draft
confidence: medium
agent_id: pritha-claude-code-adapter
agent_name: Pritha Claude Code Adapter
assigned_version_status: unassigned
lifecycle_status: draft
folder_name: PrithaClaudeCodeAdapter
snapshot_retention: 2
snapshot_store: .snapshots/child-agents/pritha-claude-code-adapter
restore_strategy: contract-and-reports
rollback_status: unavailable
---

# Child Agent Profile: Pritha Claude Code Adapter

Status: draft

## Purpose

- Future adapter for translating selected Pritha/Codex-native descendant
  scaffolds into Claude Code-compatible project instructions and optional
  Claude-specific surfaces.
- Current Pritha role: planned portability experiment, not a built runtime
  child agent.

## Current Capabilities

- Contract exists.
- Runtime implementation is not created.
- No assigned lifecycle version yet.

## Interfaces

- Planned primary interface: CLI.
- Telegram: absent.
- Voice: out of scope.

## Memory Model

- Markdown-first adapter reports only.
- No runtime memory store selected.

## Tools

- Planned deterministic contract inspection and Markdown report generation.
- Future Claude Code documentation check before implementation.

## Operations

- Deployment target: none.
- Service mode: none.
- Autostart: disabled.
- Folder is expected to be missing until implementation is explicitly started.

## Known Issues

- No scaffold, tests, operations manifest or runtime folder exist yet.
- Restore plan is really a guided scaffold/rebuild plan, not a recovery from a
  lost deployed agent.

## User Training Status

- Not applicable until implementation.

## Evolution History

- 2026-05-28: placeholder contract created for future Phase 15 adapter work.

## Lessons Learned

- Keep platform adapters subordinate to Pritha's Codex-native source of truth.
- Do not generate Claude-specific instructions that diverge from `AGENTS.md`
  without explicit review.

## Next Improvements

- Implement only when the user explicitly chooses the adapter work.
- Check current Claude Code documentation before implementation.
- Add tests/snapshot checks for generated adapter reports.
