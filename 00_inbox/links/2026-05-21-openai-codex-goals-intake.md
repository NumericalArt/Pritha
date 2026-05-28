---
id: 2026-05-21-openai-codex-goals-intake
type: intake
status: new
created: 2026-05-21
updated: 2026-05-21
topics:
  - codex
  - goals
  - agent-harness
  - long-running-work
  - evidence-based-completion
tools:
  - Codex
  - Codex Goals
  - AGENTS.md
source_type: documentation
source_url: https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex
source_published: 2026-05-09
source_updated: 2026-05-09
source_version: OpenAI Cookbook page, observed 2026-05-21
retrieved: 2026-05-21
verified: 2026-05-21
temporal_status: current
sources:
  - https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex
related: {}
supersedes: []
superseded_by: []
---

# Intake: OpenAI Codex Goals

Date added: 2026-05-21
Type: documentation
Source: https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex
Source published: 2026-05-09
Source updated: 2026-05-09
Source version: OpenAI Cookbook page, observed 2026-05-21
Retrieved: 2026-05-21
Verified: 2026-05-21
Temporal status: current
Status: new

## Why this may matter

- Official OpenAI guidance introduces Codex Goals as persistent, thread-scoped objectives with completion criteria.
- This directly matches Techscope's need for long-running agent work: queue cleanup, benchmarks, research audits, project creation, media processing and multi-step repair loops.
- It can strengthen Agents Mother by making long tasks evidence-bound instead of relying on repeated user prompts like "continue".

## Raw material or link

- https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex

## Initial questions

- Should Techscope require Goals for complex implementation runs and research audits?
- How should Goals relate to AGENTS.md rules, workflows and standards?
- What should be the default Goal template for Agents Mother project creation?

## Expected output

assessment | standard
