---
id: agent-skill-pack-lifecycle
type: standard
status: draft
created: 2026-05-30
updated: 2026-05-30
last_reviewed: 2026-05-30
owner: Pritha
topics: [agent-skills, pritha, agent-factory, procedural-memory, supply-chain-security]
tools: [Pritha, Codex, Agent Skills, Hermes Agent]
sources:
  - 02_briefs/2026-05-17-skills-vs-mcp-agent-tooling-brief.md
  - 03_reviews/2026-05-17-skills-vs-mcp-agent-tooling-assessment.md
  - 02_briefs/2026-05-17-hermes-agent-architecture-brief.md
  - 04_standards/agent-tool-integration-selection.md
related:
  workflows:
    - 07_workflows/agent-skill-pack-selection.md
  standards:
    - 04_standards/agent-tool-integration-selection.md
    - 04_standards/agent-untrusted-input-security.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-30
source_updated: 2026-05-30
source_version: Pritha skill pack lifecycle v1
retrieved: 2026-05-30
verified: 2026-05-30
valid_for: Pritha-created Codex-native agent scaffolds
temporal_status: current
---

# Standard: Agent Skill Pack Lifecycle

## Rule

Pritha may recommend and scaffold procedural skills only through a contract-aware lifecycle: discovery, recommendation, audit, explicit policy decision, vendored local pack, scaffold integration and later audit/update.

## Defaults

- Skill needs: `auto`
- Allowed skill sources: `local-only`
- Skill install mode: `recommend`
- Skill mutation policy: `read-only`
- External skills: candidate-only until a dedicated approval workflow exists
- Generated wiki pages: discovery context only, never direct provenance

## Requirements

- Every active skill must have `SKILL.md` frontmatter with name, description, version, source, review status, trust level, required toolsets and risk level.
- Every vendored skill must be recorded in `skills/manifest.json` and `skills/lock.json` with source paths and SHA-256 hash.
- `skills/candidates.json` is advisory and must not be used as active instructions.
- External skills are supply-chain input. They require provenance, license, hash, trust review, prompt-injection review and explicit user approval before activation.
- Agent-created skills are disabled until Pritha has stale-skill, duplicate-skill, hash-drift and curator workflows.

## Promotion Criteria

A skill can move from candidate to installed only when it is reviewed, contract-compatible, low or accepted medium risk, provenance-backed and covered by a status/audit command.

## Failure Rules

Block a skill when it requires undefined secrets, violates network/filesystem policy, includes dangerous command patterns, has unknown provenance, depends directly on generated wiki pages, or asks for broad runtime mutation without contract approval.
