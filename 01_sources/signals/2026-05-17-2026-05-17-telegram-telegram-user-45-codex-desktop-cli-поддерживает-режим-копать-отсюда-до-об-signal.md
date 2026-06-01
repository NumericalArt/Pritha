---
id: 2026-05-17-2026-05-17-telegram-telegram-user-45-codex-desktop-cli-поддерживает-режим-копать-отсюда-до-об-signal
type: signal
status: refined
created: 2026-05-17
updated: 2026-06-01
topics:
  - telegram
  - inbox
  - signal-extraction
tools:
  - telegram-bot
  - agent
  - agents
  - llm
  - codex
  - workflow
  - review
  - source
sources:
  - source-16b3dd2d-7f6b-49fc-af64-54574c10ecd4
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
source_type: telegram
source_class: telegram
ingested_at: 2026-05-17
processed_at: 2026-06-01T21:03:38.429Z
retention_status: source-purged
usefulness: medium
evidence_quality: uncertain
anonymous_source_id: source-16b3dd2d-7f6b-49fc-af64-54574c10ecd4
generated_from:
  - source-16b3dd2d-7f6b-49fc-af64-54574c10ecd4
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
---

# Signal: source-16b3dd2d-7f6b-49fc-af64-54574c10ecd4

Date: 2026-05-17
Status: refined
Source class: telegram
Retention: source-purged

Date: 2026-05-17
Status: refined
Signal quality: high
Extraction mode: codex-assisted
Refinement status: codex-refined

## Core signal

- Claimed Codex Desktop/CLI feature: `[features] goals = true` enables a `/goal` mode for long-running autonomous exploration.
- The useful agent-design signal is "long-horizon goal mode": define a goal, allow repeated local agent runs/tool calls, then return a concise result.
- This could be valuable for adversarial/eval work: ask Codex to mutate tasks so agents fail while preserving task fairness.
- Treat the exact feature flag as unverified until tested locally or confirmed by official Codex documentation/release notes.
- The pattern belongs in Techscope as an experiment candidate, not a standard.

## Technical details

- Local Codex CLI help shows a `features` command and supports `--enable <FEATURE>`, equivalent to `-c features.<name>=true`.
- Current local config does not include this flag.

## Agent design implications

- Long-horizon modes need stronger completion contracts, budgets, stop conditions and reporting requirements.
- Useful for eval generation, adversarial task design, repo exploration and "dig until blocked" research.
- Risk: unattended autonomy can waste tokens/time or make broad edits; it needs sandboxing, explicit write scope and final diff/report checks.

## Candidate rules

- Do not enable long-horizon goal mode globally until verified.
- Long-running agent tasks must have a budget, write scope, stop condition and final summary contract.
- For adversarial benchmark generation, require a fairness check: the task may be harder for agents, but must remain solvable and honest.

## Noise removed

- Вступления, повторы, рекламные блоки, stage banter and generic motivation are intentionally excluded.

## Verification required

- Test `codex --enable goals` or `[features] goals = true` in a disposable workspace.
- Confirm `/goal` behavior through official docs, release notes or local CLI feature inspection before standardizing.

## Codex refinement

- Done on 2026-05-17.
