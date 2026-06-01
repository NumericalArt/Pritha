---
id: README.ru
type: artifact
status: processed
created: 2026-06-01
updated: 2026-06-01
topics:
  - privacy-preserving-intake
tools:[]
sources:
  - source-1fb8f396-750f-4ca6-99c8-80249ed52fb8
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
source_type: video
source_class: video
ingested_at: 2026-06-01
processed_at: 2026-06-01T21:03:38.467Z
retention_status: source-purged
usefulness: medium
evidence_quality: medium
anonymous_source_id: source-1fb8f396-750f-4ca6-99c8-80249ed52fb8
---

# Artifact: source-1fb8f396-750f-4ca6-99c8-80249ed52fb8

Date: 2026-06-01
Status: processed
Source class: video
Retention: source-purged

Рабочая среда для сбора, анализа и превращения интересных технологических материалов в практические стандарты для будущих проектов.

## Как пользоваться

1. Кладите новый текст в `00_inbox/texts/` или ссылку в `00_inbox/links/`.
2. Используйте шаблон из `08_templates/intake.md`.
3. Попросите Codex разобрать материал.
4. По итогам разбора Codex создаст brief, review, decision record или обновит стандарт.

## Pritha: создание агентов

Pritha — публичное имя слоя Agents Mother: spec-to-agent compiler, который создает новых специализированных агентов из описания задачи.

```sh
node scripts/pritha.mjs questions
node scripts/pritha.mjs create --name "agent-name" --mission "mission"
node scripts/pritha.mjs test ../agent-folder
node scripts/pritha.mjs lineage
```

Старый путь `node scripts/agents-mother.mjs ...` сохранен как compatibility alias на один релиз.

## Структура

- `00_inbox/`: новые тексты и ссылки до разбора.
- `01_sources/`: сырой материал и заметки по источникам.
- `02_briefs/`: короткие выжимки и первичные выводы.
- `03_reviews/`: сравнительные обзоры технологий, подходов и инструментов.
- `04_standards/`: утвержденные технологические правила.
- `05_decisions/`: журнал решений с причинами и последствиями.
- `06_subagents/`: экспертные роли для анализа.
- `07_workflows/`: повторяемые процессы работы.
- `08_templates/`: шаблоны файлов.
- `09_archive/`: отклоненные, устаревшие или отложенные материалы.

## Базовый запрос к агенту

```text
Разбери материал из 00_inbox/..., проверь актуальность, обсуди его через роли из 06_subagents, сравни с текущими стандартами и предложи: brief, review, decision или обновление стандарта.
```

## Память

Markdown-файлы являются главным источником истины. Локальный индекс хранится в `.memory/techscope.sqlite` и пересоздается из Markdown.

Пересобрать индекс:

```sh
node scripts/rebuild-memory.mjs
```

Посмотреть статистику:

```sh
node scripts/query-memory.mjs stats
```

Поиск по памяти:

```sh
node scripts/query-memory.mjs search STT
```

Проверить корректность frontmatter:

```sh
node scripts/validate-memory.mjs
```

Фильтры:

```sh
node scripts/query-memory.mjs by-topic memory
node scripts/query-memory.mjs by-tool sqlite
node scripts/query-memory.mjs by-status draft
node scripts/query-memory.mjs by-type standard
node scripts/query-memory.mjs open
```

Локальная транскрибация media:

```sh
```

Результат смотреть в:

```text
```

Локальные embeddings:

```sh
node scripts/rebuild-memory.mjs
python3 scripts/embed-memory.py
python3 scripts/semantic-search.py "локальная транскрибация media"
node scripts/query-memory.mjs semantic "локальная транскрибация media"
```
