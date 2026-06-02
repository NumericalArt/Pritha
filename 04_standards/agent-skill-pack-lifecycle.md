---
id: agent-skill-pack-lifecycle
type: standard
status: draft
created: 2026-05-30
updated: 2026-06-02
last_reviewed: 2026-06-02
owner: Pritha
topics: [agent-skills, pritha, agent-factory, procedural-memory, supply-chain-security]
tools: [Pritha, Codex, Agent Skills, Hermes Agent]
sources:
  - 02_briefs/2026-05-17-skills-vs-mcp-agent-tooling-brief.md
  - 03_reviews/2026-05-17-skills-vs-mcp-agent-tooling-assessment.md
  - 02_briefs/2026-05-17-hermes-agent-architecture-brief.md
  - 04_standards/agent-tool-integration-selection.md
  - 03_reviews/2026-06-02-agent-skills-source-batch-review.md
related:
  workflows:
    - 07_workflows/agent-skill-pack-selection.md
  standards:
    - 04_standards/agent-tool-integration-selection.md
    - 04_standards/agent-untrusted-input-security.md
  reviews:
    - 03_reviews/2026-06-02-agent-skills-source-batch-review.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-30
source_updated: 2026-06-02
source_version: Pritha skill pack lifecycle v2 + Agent Skills source batch
retrieved: 2026-05-30
verified: 2026-06-02
valid_for: Pritha-created Codex-native agent scaffolds
temporal_status: current
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: pattern
  id: agent-skill-pack-lifecycle
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Standard: Agent Skill Pack Lifecycle

## Rule

Pritha may recommend and scaffold procedural skills only through a contract-aware lifecycle: discovery, recommendation, audit, explicit policy decision, vendored local pack, scaffold integration and later audit/update.

Skills are a procedural-memory layer, not a general dependency installer. They
belong in a child agent only when the contract selects them and only at the
minimum scope needed for that agent's mission.

## Defaults

- Skill needs: `auto`
- Allowed skill sources: `local-only`
- Skill install mode: `recommend`
- Skill mutation policy: `read-only`
- External skills: candidate-only until a dedicated approval workflow exists
- Generated wiki pages: discovery context only, never direct provenance

## Requirements

- Every active skill must have `SKILL.md` frontmatter with name, description, version, source, review status, trust level, required toolsets and risk level.
- A skill may include references, scripts, templates/assets and platform metadata. All bundled files are part of the review surface, not just `SKILL.md`.
- Skill descriptions are routing metadata. They must state the positive trigger and the boundary where the skill should not be used.
- Every vendored skill must be recorded in `skills/manifest.json` and `skills/lock.json` with source paths and SHA-256 hash.
- `skills/candidates.json` is advisory and must not be used as active instructions.
- External skills are supply-chain input. They require provenance, license, hash, trust review, prompt-injection review and explicit user approval before activation.
- Official catalogs, official organization repositories and CLI installers are discovery sources, not trust decisions. A skill found through them still requires inspection, pinning and approval before Pritha activates it in a child scaffold.
- External skills must be pinned to a tag, commit or tree SHA when vendored or linked. Runtime floating installs are not allowed by default.
- If a skill depends on MCP, network access, filesystem writes or secrets, those dependencies must be present in the child-agent contract and readiness report.
- Agent-created skills are disabled until Pritha has stale-skill, duplicate-skill, hash-drift and curator workflows.

## Review Surface

Before a candidate skill can become installed, review:

- source owner, repository and license;
- source version, tag, commit or tree SHA;
- `SKILL.md` frontmatter, description and body;
- referenced Markdown or data files;
- scripts and dependency manifests;
- assets/templates that may contain hidden instructions;
- network calls and remote endpoints;
- filesystem writes and destructive operations;
- required secrets and credential storage;
- compatibility with the selected runtime host;
- expected install/update mechanism.

## Evaluation

A skill is not promoted only because it reads well. For recommended or installed
skills, Pritha should define lightweight eval cases that check:

- positive trigger: the agent selects the skill for intended tasks;
- negative trigger: the agent ignores the skill for adjacent tasks;
- required procedural steps;
- expected commands, tools or MCP calls;
- output artifact format and quality;
- cleanup and side effects;
- regression score after skill updates or model/runtime changes.

If a child agent uses a local or small language model path, skill selection must
be evaluated for that model family. Do not assume that a skill helpful to a
frontier hosted model will be selected correctly by a small model.

## Promotion Criteria

A skill can move from candidate to installed only when it is reviewed,
contract-compatible, low or accepted medium risk, provenance-backed, pinned,
eval-covered for its trigger behavior and covered by a status/audit command.

## Failure Rules

Block a skill when it requires undefined secrets, violates network/filesystem
policy, includes dangerous command patterns, has unknown provenance, depends
directly on generated wiki pages, hides instructions in references/assets, uses
unreviewed network calls, cannot be pinned, fails trigger/side-effect evals, or
asks for broad runtime mutation without contract approval.
