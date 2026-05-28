---
id: memory-structure
type: standard
status: active
created: 2026-05-15
updated: 2026-05-15
last_reviewed: 2026-05-15
owner: Techscope/user
topics: [memory, markdown, frontmatter, indexing]
tools: [markdown, sqlite, obsidian]
sources:
  - 05_decisions/2026-05-15-memory-architecture.md
  - 07_workflows/memory-implementation-roadmap.md
related:
  decisions:
    - 05_decisions/2026-05-15-memory-architecture.md
  workflows:
    - 07_workflows/memory-indexing.md
supersedes: []
---

# Standard: memory-structure

Status: active
Owner: Techscope/user
Last reviewed: 2026-05-15

## Rule

Каждый значимый артефакт памяти должен быть Markdown-файлом с YAML frontmatter. Markdown остается source of truth, а SQLite, FTS, embeddings и graph-like relations являются производными индексами.

## Use when

- Создается intake, brief, assessment, review, decision, standard или workflow.
- Материал должен быть доступен для Obsidian, Codex и SQLite index.
- Из материала нужно извлекать темы, инструменты, источники и связи.

## Avoid when

- Файл является служебным README без самостоятельного статуса знания.
- Файл является временным черновиком, который не должен индексироваться.

## Required practices

- `id` должен быть стабильным и уникальным в проекте.
- `type` должен описывать роль артефакта: `intake`, `brief`, `assessment`, `review`, `decision`, `standard`, `workflow`, `template`.
- `status` должен отражать состояние: `new`, `processed`, `draft`, `proposed`, `accepted`, `active`, `deprecated`, `rejected`, `archived`.
- `topics` должны описывать предметную область.
- `tools` должны содержать технологии, библиотеки, модели, сервисы и CLI.
- `sources` должны ссылаться на исходные материалы или внутренние документы.
- `related` должен связывать артефакт с briefs, reviews, decisions, standards и workflows.
- Для новых файлов использовать шаблоны из `08_templates/`.
- После серии изменений запускать `node scripts/validate-memory.mjs` и `node scripts/rebuild-memory.mjs`.

## Identifier policy

- Для intake: `YYYY-MM-DD-short-topic-intake`.
- Для brief: `YYYY-MM-DD-short-topic-brief`.
- Для review: `YYYY-MM-DD-short-topic-review`.
- Для decision: `YYYY-MM-DD-short-topic`.
- Для standard: стабильное имя стандарта без даты, например `memory-structure`.
- Для workflow: стабильное имя workflow, например `memory-indexing`.
- Для template: `template-kind`.

## Examples

```yaml
---
id: 2026-05-15-local-video-to-structured-text-brief
type: brief
status: draft
created: 2026-05-15
updated: 2026-05-15
topics: [audio, stt, local-ai]
tools: [ffmpeg, kesha, parakeet]
sources:
  - 00_inbox/texts/2026-05-15-local-video-to-structured-text.md
related:
  standards:
    - 04_standards/local-video-to-structured-text.md
---
```

## Related decisions

- `05_decisions/2026-05-15-memory-architecture.md`
