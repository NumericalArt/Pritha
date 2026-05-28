---
id: 2026-05-15-openai-harness-engineering-source-note
type: source-note
status: processed
created: 2026-05-15
updated: 2026-05-15
topics: [harness-engineering, codex, coding-agents, agent-first-development, repository-knowledge, agent-legibility]
tools: [codex, agents-md, ci, lint, chrome-devtools, observability, openai]
source_type: article
source_url: https://openai.com/index/harness-engineering/
sources:
  - https://openai.com/index/harness-engineering/
related:
  briefs:
    - 02_briefs/2026-05-15-harness-engineering-codex-agents-brief.md
  intakes:
    - 00_inbox/links/2026-05-15-youtube-harness-engineering-ryan-lopopolo-openai-intake.md
  assessments:
    - 03_reviews/2026-05-15-2026-05-15-youtube-harness-engineering-ryan-lopopolo-openai-intake-auto-assessment.md
  workflows:
    - 07_workflows/media-intake-processing.md
---

# Source Note: OpenAI harness engineering

Date added: 2026-05-15
Source: https://openai.com/index/harness-engineering/
Author: Ryan Lopopolo, OpenAI
Published: 2026-02-11
Status: processed

## Why this source matters

Это официальный первоисточник OpenAI по теме harness engineering. Он важнее YouTube-видео как evidence base, потому что фиксирует практику команды OpenAI: agent-first development with Codex, repository-local knowledge, mechanical guardrails, review agents, CI feedback loops and agent-legible architecture.

## Source summary

Статья описывает эксперимент OpenAI: команда строила и выпускала внутренний продукт, где весь код, тесты, CI, документация, observability and tooling создавались Codex agents. Роль инженера смещалась от ручного написания кода к проектированию среды, спецификации intent, созданию feedback loops и поддержанию repository knowledge как system of record.

## Key ideas for Techscope

- `AGENTS.md` должен быть картой, а не огромной энциклопедией.
- Глубокое знание проекта должно жить в repository-local Markdown/docs, доступных агенту.
- Agent legibility является архитектурной целью: если знание не доступно агенту в репозитории, для агента оно фактически не существует.
- Guardrails должны быть механическими: linters, CI jobs, structural tests, review agents.
- Ошибки и review feedback нужно превращать в durable docs или executable checks.
- Local dev environment должен быть driveable by agents: app boot per worktree, browser/devtools access, logs, metrics, traces.
- Human judgment остается важным, но должен применяться на уровне приоритетов, acceptance criteria, архитектурных ограничений и проверки результата.

## Verification notes

- Primary source доступен на официальном домене OpenAI.
- Дата публикации: 2026-02-11.
- YouTube-видео `am_oeAoUhew` согласуется с тезисами статьи, но должно рассматриваться как выступление/дополнительный контекст, а не единственное основание.

## Open questions

- Какие части harness engineering мы можем внедрить в Techscope немедленно?
- Нужно ли создать отдельный стандарт `agent-harness-engineering.md`?
- Какие checks можно добавить первыми: AGENTS.md lint, source-code structural tests, QA plan requirement, reviewer-agent workflow?
