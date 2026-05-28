---
id: 2026-05-16-2026-05-15-habr-mcp-server-pitfalls-intake-signal
type: signal
status: extracted
created: 2026-05-16
updated: 2026-05-16
topics:
  - habr
  - mcp
  - tool-design
  - agent-tools
  - security
  - evals
  - context-management
  - signal-extraction
tools:
  - mcp
  - oauth
  - claude-desktop
  - cursor
  - continue
  - vscode
  - agent
  - tool
  - workflow
  - auth
  - review
  - source
  - standard
sources:
  - 00_inbox/links/2026-05-15-habr-mcp-server-pitfalls-intake.md
  - https://habr.com/ru/companies/bitrix/articles/1009150/
related:
  sources:
    - 00_inbox/links/2026-05-15-habr-mcp-server-pitfalls-intake.md
generated_from:
  - 00_inbox/links/2026-05-15-habr-mcp-server-pitfalls-intake.md
signal_quality: high
extraction_mode: heuristic-draft
refinement_status: needs-codex-refinement
harness: 07_workflows/prompts/signal-extraction-harness.md
---

# Signal: habr-mcp-server-pitfalls

Date: 2026-05-16
Status: extracted
Signal quality: high
Extraction mode: heuristic-draft
Refinement status: needs-codex-refinement

## Core signal

- MCP напрямую относится к agent tooling и будущим агентам Techscope.
- Материал содержит набор concrete pitfalls, которые можно превратить в checklist или standard для MCP tool design.
- Какие правила MCP tool design стоит зафиксировать как стандарт?
- Какие риски особенно важны для наших будущих агентов?
- Source: https://habr.com/ru/companies/bitrix/articles/1009150/
- Статья описывает практические проблемы разработки MCP-серверов.
- Title: Что может пойти и обязательно пойдет не так при написании MCP-сервера
- Author: vasilyev / команда AI Битрикс24
- Как соотнести рекомендации с OpenAI harness engineering и нашими текущими workflows?
- Habr: https://habr.com/ru/companies/bitrix/articles/1009150/

## Technical details

- Published: 2026-03-16 inferred from Habr current-year display

## Agent design implications

- Проверить, можно ли превратить signal в правила для `AGENTS.md`, skills, MCP tools, reviewer agents, evals или workflows.
- Использовать этот signal как сжатый вход для assessment/review, но возвращаться к sources для финальных решений.

## Candidate rules

- Candidate rules require manual review.

## Noise removed

- Вступления, повторы, рекламные блоки, stage banter and generic motivation are intentionally excluded.
- Full source text/transcript is not copied into this signal.

## Verification required

- Проверить первоисточники и даты публикации внешних ссылок.
- Сверить claims с official MCP specification and client docs.
- Сверить claims с official OpenAI docs/source materials.
- Проверить security implications отдельно перед стандартом.

## Codex refinement required

- Пройти harness `07_workflows/prompts/signal-extraction-harness.md` в этом Techscope thread.
- Раскрыть practical MCP rules через связанный brief/source note, потому что intake-level signal содержит мало technical detail.
- После refinement обновить `status: refined`, `extraction_mode: codex-assisted`, `refinement_status: codex-refined`.

## Source links

- 00_inbox/links/2026-05-15-habr-mcp-server-pitfalls-intake.md
- https://habr.com/ru/companies/bitrix/articles/1009150/
