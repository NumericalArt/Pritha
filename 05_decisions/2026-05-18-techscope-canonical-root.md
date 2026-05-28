---
id: 2026-05-18-techscope-canonical-root
type: decision
status: active
created: 2026-05-18
updated: 2026-05-18
topics: [techscope, project-architecture, agents-mother, launchd, migration]
tools: [Codex, launchd, Techscope Web, Telegram Bot, Agents Mother]
agent_platforms: [Codex]
model_context: [unknown]
runtime_environment: [mac-mini, local-project, launchd]
config_surfaces: [AGENTS.md, launchd, 11_agents, operations/manifest.json, interfaces/manifest.json, memory/manifest.json, tools/manifest.json]
portability: codex-native
sources:
  - /Users/jkl/Techscope
  - /Users/jkl/Documents/New project
  - /Users/jkl/Techscope-migration-backups/20260518-052947
related:
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/agents-mother-roadmap.md
  standards:
    - 04_standards/agent-creation-harness.md
  reports:
    - 11_agents/reports/2026-05-18-techscope-agent-test-report-3.md
    - 11_agents/reports/2026-05-18-techscope-agent-operations-report.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: 2026-05-18
source_version: canonical root migration 2026-05-18
retrieved: 2026-05-18
verified: 2026-05-18
valid_for: Techscope local project layout as of 2026-05-18
temporal_status: current
---

# Decision: Techscope canonical root

Date: 2026-05-18
Status: active

## Decision

Use `/Users/jkl/Techscope` as the canonical Techscope workspace.

All future agents created by Agents Mother should live as sibling folders under `/Users/jkl/<agent-name>` unless the user explicitly chooses another target path.

## Context

Techscope had live services and recent Telegram intake state under `/Users/jkl/Techscope`, while `/Users/jkl/Documents/New project` contained newer Agents Mother research, scripts, templates and reports. Running from both folders caused ambiguity.

## Outcome

- `/Users/jkl/Techscope` remains the service root for Techscope Web and Telegram bot.
- Missing Agents Mother files and recent research artifacts were merged into `/Users/jkl/Techscope`.
- `AGENTS.md` now records the canonical root and sibling-agent rule.
- `interfaces/`, `memory/`, `tools/` and `operations/` manifests document the root Techscope harness.
- `/Users/jkl/Documents/New project` is kept as an archive/source for comparison and contains a `MIGRATED_TO_TECHSCOPE.md` marker.
- Backups were created at `/Users/jkl/Techscope-migration-backups/20260518-052947`.

## Verification

- `node scripts/validate-memory.mjs`
- `node scripts/rebuild-memory.mjs`
- `python3 scripts/embed-memory.py`
- `node scripts/agents-mother.mjs test /Users/jkl/Techscope`
- `node scripts/telegram-bot.mjs poll-once --dry-run`
- `curl -fsS http://127.0.0.1:3000/`

## Consequences

- Open `/Users/jkl/Techscope` in Codex for future Techscope work.
- Do not start services from `/Users/jkl/Documents/New project`.
- Do not copy `.env`, `.queue`, `.memory`, `.logs`, raw personal data or secrets into generated agents.
