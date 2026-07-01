---
id: agents-mother-registry
type: agent-registry
status: active
created: 2026-05-18
updated: 2026-07-01
topics:
  - agent-engineering
  - agent-factory
  - registry
tools:
  - Codex
  - AGENTS.md
  - Pritha
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
source_updated: 2026-07-01
source_version: generated registry 2026-07-01
retrieved: 2026-07-01
verified: 2026-07-01
valid_for: current Pritha lifecycle
temporal_status: current
---

# Pritha Registry

Date: 2026-07-01
Status: active

## Summary

- Agents tracked: 9
- Contracts: 9
- Reports: 76
- Research reports: 21

## Agents

| Agent | Mission | Runtime | Interface | Deployment | Proactivity | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| FAS | provide a local one-page theater-scene demo agent where a | codex-native scaffold plus deterministic browser app. | local web. / Telegram none. | local Mac. | none. | contracts:1 scaffold:1 test:0 handoff:0 ops:1 deploy:1 evolve:0 |
| FESPA26 | voice-first Codex-native workbench for processing FESPA 2026 booth media, notes, links and files into a bilingual mobile | hybrid, with Codex-native sidecar. | web. / Telegram none. | local Mac. | manual. | contracts:1 scaffold:0 test:4 handoff:1 ops:3 deploy:0 evolve:2 |
| Funny Teacher | help one user quickly and enjoyably improve English, mainly speaking, by turning YouTube lessons into interactive voice  | hybrid. | web voice only. / Telegram none for v1 unless user later requests it. | local Mac or Mac mini, to be confirmed. | manual in v1. | contracts:1 scaffold:1 test:1 handoff:0 ops:0 deploy:0 evolve:2 |
| PictureBoom | provide a local Pritha child agent that receives internally | codex-native | local web. / Telegram none | local Mac. | manual | contracts:1 scaffold:1 test:0 handoff:0 ops:0 deploy:0 evolve:0 |
| Pritha Claude Code Adapter | define a future adapter that can translate selected Pritha/Codex-native descendant scaffolds into Claude Code-compatible | environment-specific | CLI / Telegram none | none | none | contracts:1 scaffold:0 test:0 handoff:0 ops:0 deploy:0 evolve:0 |
| StupidJoke | provide a small, safe, low-stakes joke agent that can ingest user-provided joke fixtures, reject unsafe material, and an | codex-native | Codex project plus CLI healthcheck for v1. / Telegram none | local Mac. | manual | contracts:1 scaffold:2 test:1 handoff:0 ops:0 deploy:0 evolve:1 |
| Techscope | unknown | unknown | unknown / Telegram unknown | unknown | unknown | contracts:0 scaffold:0 test:9 handoff:0 ops:4 deploy:0 evolve:1 |
| web-design-agent | provide a standalone, operator-driven UI/UX and web-design | codex-native | Codex project/thread. / Telegram none | none for v1 beyond local project folder. | manual | contracts:1 scaffold:1 test:0 handoff:0 ops:0 deploy:0 evolve:0 |
| WebSummitCheckAgent | Analyze Web Summit-related correspondence from fixture data or explicitly gated local Apple Mail access, then produce a  | codex-native | Codex project / Telegram none | local Mac | none | contracts:1 scaffold:1 test:0 handoff:0 ops:0 deploy:0 evolve:0 |

## Recent Reports

- 2026-06-30 scaffold-report/complete: 11_agents/reports/2026-06-30-web-design-agent-scaffold-report.md
- 2026-06-26 agent-operations-report/completed: 11_agents/reports/2026-06-26-pritha-web-search-searxng-runtime-report.md
- 2026-06-23 scaffold-report/complete: 11_agents/reports/2026-06-23-pictureboom-scaffold-report.md
- 2026-06-23 agent-deployment-report/complete: 11_agents/reports/2026-06-23-fas-tailscale-serve-deployment-report.md
- 2026-06-23 agent-operations-report/complete: 11_agents/reports/2026-06-23-fas-tailscale-control-center-routing-report.md
- 2026-06-22 scaffold-report/complete: 11_agents/reports/2026-06-22-web-summit-check-agent-scaffold-report.md
- 2026-06-22 scaffold-report/complete: 11_agents/reports/2026-06-22-fas-scaffold-report.md
- 2026-06-22 agent-operations-report/complete: 11_agents/reports/2026-06-22-fas-local-runtime-integration-report.md
- 2026-06-22 agent-operations-report/complete: 11_agents/reports/2026-06-22-fas-control-center-url-source-of-truth-report.md
- 2026-06-22 agent-operations-report/complete: 11_agents/reports/2026-06-22-fas-control-center-integration-report.md
- 2026-06-21 agent-operations-report/complete: 11_agents/reports/2026-06-21-pritha-github-install-reproducibility-phase-5-report.md
- 2026-06-21 agent-operations-report/complete: 11_agents/reports/2026-06-21-pritha-github-install-reproducibility-phase-4-report.md
- 2026-06-21 agent-operations-report/complete: 11_agents/reports/2026-06-21-pritha-github-install-reproducibility-phase-3-report.md
- 2026-06-21 agent-operations-report/complete: 11_agents/reports/2026-06-21-pritha-github-install-reproducibility-phase-2-report.md
- 2026-06-21 agent-operations-report/complete: 11_agents/reports/2026-06-21-pritha-github-install-reproducibility-phase-1-report.md
- 2026-06-21 agent-operations-report/complete: 11_agents/reports/2026-06-21-pritha-github-install-reproducibility-baseline-report.md
- 2026-06-12 agent-operations-report/blocked: 11_agents/reports/2026-06-12-stupidjoke-scheduler-sidecar-result.md
- 2026-06-12 agent-test-report/complete: 11_agents/reports/2026-06-12-stupidjoke-agent-test-report.md
- 2026-06-12 scaffold-report/failed: 11_agents/reports/2026-06-12-stupidjoke-agent-scaffold-report.md
- 2026-06-12 scaffold-report/complete: 11_agents/reports/2026-06-12-stupidjoke-agent-scaffold-completion-report.md
- 2026-06-12 agent-post-creation-review/accepted: 11_agents/reports/2026-06-12-stupidjoke-agent-post-creation-review.md
- 2026-06-01 agent-operations-report/complete: 11_agents/reports/2026-06-01-fespa26-funny-teacher-tailscale-serve-recovery-report.md
- 2026-05-30 agent-post-creation-review/complete: 11_agents/reports/2026-05-30-fespa26-voice-control-pattern-ingestion-report.md
- 2026-05-29 agent-post-creation-review/accepted: 11_agents/reports/2026-05-29-funny-teacher-pritha-reference-example.md
- 2026-05-29 agent-test-report/complete: 11_agents/reports/2026-05-29-funny-teacher-agent-test-report.md
- 2026-05-29 agent-post-creation-review/accepted: 11_agents/reports/2026-05-29-fespa26-voice-control-and-feed-memory-update.md
- 2026-05-29 agent-test-report/complete: 11_agents/reports/2026-05-29-fespa26-agent-test-report.md
- 2026-05-28 agent-operations-report/partial: 11_agents/reports/2026-05-28-techscope-quality-roadmap-completion-audit.md
- 2026-05-28 agent-operations-report/complete: 11_agents/reports/2026-05-28-techscope-quality-phase-9d-agents-mother-command-modules-report.md
- 2026-05-28 agent-operations-report/partial: 11_agents/reports/2026-05-28-techscope-quality-phase-9c-agents-mother-scaffold-module-report.md

## Evolution Rules

- Registry is generated from contracts and reports; do not use it as the sole source for standards.
- Promote a pattern to `04_standards/` only after a post-creation review shows repeated successful evidence.
- Failed or superseded patterns remain visible in reports and reviews.
