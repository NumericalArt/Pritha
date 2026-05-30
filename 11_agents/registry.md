---
id: agents-mother-registry
type: agent-registry
status: active
created: 2026-05-18
updated: 2026-05-30
topics:
  - agent-engineering
  - agent-factory
  - registry
tools:
  - Codex
  - AGENTS.md
  - Agents Mother
agent_platforms:
  - Codex
model_context:
  - unknown
runtime_environment:
  - local-project
config_surfaces:
  - AGENTS.md
  - scripts
portability: codex-native
sources:
  - 11_agents/contracts/
  - 11_agents/research/
  - 11_agents/reports/
  - 07_workflows/agents-mother.md
  - 07_workflows/agents-mother-roadmap.md
related:
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/agents-mother-roadmap.md
  agent_contracts: []
  scaffold_reports: []
  agent_test_reports: []
  agent_handoff_reports: []
  agent_operations_reports: []
  agent_deployment_reports: []
  agent_post_creation_reviews: []
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: 2026-05-30
source_version: generated registry 2026-05-30
retrieved: 2026-05-30
verified: 2026-05-30
valid_for: current TechScope Agents Mother lifecycle
temporal_status: current
---

# Agents Mother Registry

Date: 2026-05-30
Status: active

## Summary

- Agents tracked: 4
- Contracts: 4
- Reports: 54
- Research reports: 1

## Agents

| Agent | Mission | Runtime | Interface | Deployment | Proactivity | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| FESPA26 | voice-first Codex-native workbench for processing FESPA 2026 booth media, notes, links and files into a bilingual mobile | hybrid, with Codex-native sidecar. | web. / Telegram none. | local Mac. | manual. | contracts:1 scaffold:0 test:4 handoff:1 ops:3 deploy:0 evolve:3 |
| Funny Teacher | help one user quickly and enjoyably improve English, mainly speaking, by turning YouTube lessons into interactive voice  | hybrid. | web voice only. / Telegram none for v1 unless user later requests it. | local Mac or Mac mini, to be confirmed. | manual in v1. | contracts:1 scaffold:1 test:1 handoff:0 ops:1 deploy:2 evolve:3 |
| Pritha Claude Code Adapter | define a future adapter that can translate selected Pritha/Codex-native descendant scaffolds into Claude Code-compatible | environment-specific | CLI / Telegram none | none | none | contracts:1 scaffold:0 test:0 handoff:0 ops:0 deploy:0 evolve:0 |
| Techscope | unknown | unknown | unknown / Telegram unknown | unknown | unknown | contracts:0 scaffold:0 test:9 handoff:0 ops:24 deploy:0 evolve:1 |

## Recent Reports

- 2026-05-30 agent-post-creation-review/complete: 11_agents/reports/2026-05-30-fespa26-voice-control-pattern-ingestion-report.md
- 2026-05-29 agent-post-creation-review/accepted: 11_agents/reports/2026-05-29-funny-teacher-pritha-reference-example.md
- 2026-05-29 agent-test-report/complete: 11_agents/reports/2026-05-29-funny-teacher-agent-test-report.md
- 2026-05-29 agent-post-creation-review/accepted: 11_agents/reports/2026-05-29-fespa26-voice-control-and-feed-memory-update.md
- 2026-05-29 agent-test-report/complete: 11_agents/reports/2026-05-29-fespa26-agent-test-report.md
- 2026-05-28 agent-operations-report/partial: 11_agents/reports/2026-05-28-techscope-quality-roadmap-completion-audit.md
- 2026-05-28 agent-operations-report/complete: 11_agents/reports/2026-05-28-techscope-quality-phase-9d-agents-mother-command-modules-report.md
- 2026-05-28 agent-operations-report/partial: 11_agents/reports/2026-05-28-techscope-quality-phase-9c-agents-mother-scaffold-module-report.md
- 2026-05-28 agent-operations-report/partial: 11_agents/reports/2026-05-28-techscope-quality-phase-9b-agents-mother-test-module-report.md
- 2026-05-28 agent-operations-report/partial: 11_agents/reports/2026-05-28-techscope-quality-phase-9a-agents-mother-entry-contract-report.md
- 2026-05-28 agent-operations-report/complete: 11_agents/reports/2026-05-28-techscope-quality-phase-8-self-test-report.md
- 2026-05-28 agent-operations-report/complete: 11_agents/reports/2026-05-28-techscope-quality-phase-7-quality-gate-report.md
- 2026-05-28 agent-operations-report/complete: 11_agents/reports/2026-05-28-techscope-quality-phase-6-env-doctor-report.md
- 2026-05-28 agent-operations-report/complete: 11_agents/reports/2026-05-28-techscope-quality-phase-5-test-layer-report.md
- 2026-05-28 agent-operations-report/complete: 11_agents/reports/2026-05-28-techscope-quality-phase-4-dogfooding-report.md
- 2026-05-28 agent-operations-report/complete: 11_agents/reports/2026-05-28-techscope-quality-phase-3-shared-lib-report.md
- 2026-05-28 agent-operations-report/complete: 11_agents/reports/2026-05-28-techscope-quality-phase-2-operations-report.md
- 2026-05-28 agent-operations-report/complete: 11_agents/reports/2026-05-28-techscope-quality-phase-13-github-ci-release-prep-report.md
- 2026-05-28 agent-operations-report/complete: 11_agents/reports/2026-05-28-techscope-quality-phase-12-first-run-setup-report.md
- 2026-05-28 agent-operations-report/complete: 11_agents/reports/2026-05-28-techscope-quality-phase-11-oss-doc-pack-report.md
- 2026-05-28 agent-operations-report/complete: 11_agents/reports/2026-05-28-techscope-quality-phase-10-pritha-rebrand-report.md
- 2026-05-28 agent-operations-report/complete: 11_agents/reports/2026-05-28-techscope-quality-phase-1-report.md
- 2026-05-28 agent-operations-report/complete: 11_agents/reports/2026-05-28-techscope-quality-phase-0-baseline-report.md
- 2026-05-28 agent-operations-report/complete: 11_agents/reports/2026-05-28-techscope-pre-phase-0-reconciliation-report.md
- 2026-05-28 agent-operations-report/partial: 11_agents/reports/2026-05-28-techscope-github-release-status-gate-report.md
- 2026-05-28 agent-test-report/complete: 11_agents/reports/2026-05-28-techscope-agent-test-report.md
- 2026-05-28 agent-test-report/complete: 11_agents/reports/2026-05-28-techscope-agent-test-report-6.md
- 2026-05-28 agent-test-report/complete: 11_agents/reports/2026-05-28-techscope-agent-test-report-5.md
- 2026-05-28 agent-test-report/complete: 11_agents/reports/2026-05-28-techscope-agent-test-report-4.md
- 2026-05-28 agent-test-report/complete: 11_agents/reports/2026-05-28-techscope-agent-test-report-3.md

## Evolution Rules

- Registry is generated from contracts and reports; do not use it as the sole source for standards.
- Promote a pattern to `04_standards/` only after a post-creation review shows repeated successful evidence.
- Failed or superseded patterns remain visible in reports and reviews.
