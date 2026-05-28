---
id: 2026-05-17-2026-05-17-telegram-telegram-user-12-харнесы-умирают-часть-2-signal
type: signal
status: refined
created: 2026-05-17
updated: 2026-05-17
topics:
  - telegram
  - inbox
  - signal-extraction
tools:
  - telegram-bot
  - agent
  - agents
  - llm
  - mcp
  - rag
  - codex
  - claude
  - workflow
  - test
  - ci
  - context
  - review
  - source
sources:
  - 00_inbox/telegram/2026-05-17-telegram-telegram-user-12-харнесы-умирают-часть-2.md
  - https://t.me/neuraldeep/2130
  - 01_sources/raw/telegram/2026-05-17-telegram-telegram-user-12-харнесы-умирают-часть-2.json
related:
  sources:
    - 00_inbox/telegram/2026-05-17-telegram-telegram-user-12-харнесы-умирают-часть-2.md
generated_from:
  - 00_inbox/telegram/2026-05-17-telegram-telegram-user-12-харнесы-умирают-часть-2.md
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
---

# Signal: 2026-05-17-telegram-telegram-user-12-харнесы-умирают-часть-2

Date: 2026-05-17
Status: refined
Signal quality: high
Extraction mode: codex-assisted
Refinement status: codex-refined

## Core signal

- Harnesses are not "dying"; overbuilt harnesses decay when the model/tooling can handle the job with simpler structure.
- The durable parts are packaged process, memory between sessions, tool access and cross-model/cross-session review for large tasks.
- The weak parts are huge `AGENTS.md`, rigid graph orchestrators, excessive subagents and harness layers that cost more time than they save.
- A useful harness starts as a manual process with one Codex/Claude session and a few prompts; only promote it to tooling when repeated copy/paste or tracking overhead appears.
- Review and verification remain bottlenecks. Coding may be cheap, but checking, refactoring, tests and responsibility are still expensive.
- Cross-model review and mutation/testing ideas are useful directions, but need local experiments and primary sources.

## Technical details

- Source is a Telegram discussion digest, not a primary technical source.
- It names several candidate tools/ideas: LLMorpheus, Meta ACH, cross-model review Claude + Codex, Get Shit Done/convergency planning across multiple CLIs.
- Claims about specific tools require separate source capture before use in standards.

## Agent design implications

- Add a pruning rule to agent harness standards: every harness component should justify its cost.
- Keep `AGENTS.md` concise and push deep details into focused workflows/templates.
- Prefer manual rehearsal before automation: prove the process in Codex first, then script it.
- Preserve cross-review for high-blast-radius work, but avoid turning every small task into a multi-agent ceremony.

## Candidate rules

- Build harnesses from repeated pain, not from architectural enthusiasm.
- A harness should save time on planning, debugging, tracking or verification; otherwise remove it.
- Keep memory/process/tool access; prune ceremony.
- For large codebase changes, cross-model or second-session review can be worth the cost.

## Noise removed

- Вступления, повторы, рекламные блоки, stage banter and generic motivation are intentionally excluded.
- Full source text/transcript is not copied into this signal.

## Verification required

- Проверить первоисточники и даты публикации внешних ссылок.
- Сверить claims с official MCP specification and client docs.
- Сверить claims с official OpenAI docs/source materials.
- Find primary sources for named tools before adding them to standards.

## Codex refinement

- Done on 2026-05-17 during Telegram backlog cleanup.

## Source links

- 00_inbox/telegram/2026-05-17-telegram-telegram-user-12-харнесы-умирают-часть-2.md
- https://t.me/neuraldeep/2130
- 01_sources/raw/telegram/2026-05-17-telegram-telegram-user-12-харнесы-умирают-часть-2.json
