---
id: agent-skill-pack-selection
type: workflow
status: draft
created: 2026-05-30
updated: 2026-05-30
topics: [agent-skills, pritha, scaffold, procedural-memory]
tools: [Pritha, Codex, Agent Skills]
sources:
  - 04_standards/agent-skill-pack-lifecycle.md
  - 04_standards/agent-tool-integration-selection.md
related:
  standards:
    - 04_standards/agent-skill-pack-lifecycle.md
    - 04_standards/agent-tool-integration-selection.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-30
source_updated: 2026-05-30
source_version: workflow v1
retrieved: 2026-05-30
verified: 2026-05-30
valid_for: Pritha contract, research and scaffold flow
temporal_status: current
---

# Workflow: Agent Skill Pack Selection

## Steps

1. Capture skill policy in the agent contract: needs, allowed sources, install mode and mutation policy.
2. During research, search local Techscope memory and the local Pritha skill catalog.
3. Score candidates for task, interface, memory, tool, security, evidence and maintenance fit.
4. Block generated-only, unknown, dangerous, secret-dependent or policy-incompatible skills.
5. Show recommended, optional, candidate and blocked skills in the research report.
6. During scaffold, create `skills/manifest.json`, `skills/candidates.json`, `skills/lock.json`, `skills/README.md` and `scripts/skills-status.mjs`.
7. Vendor only reviewed local skills when the contract explicitly selects `Skill install mode: vendor`.
8. Keep external skills candidate-only until an approval and audit workflow is implemented.

## Verification

- `node scripts/pritha.mjs skills status`
- `node scripts/pritha.mjs skills select <contract-path>`
- In a child scaffold: `node scripts/skills-status.mjs`
- Full Pritha regression: `npm test --silent`
