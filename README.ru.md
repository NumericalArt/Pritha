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

## ⚠️ Предупреждение о безопасности (экспериментальное ПО)

Pritha находится в **активной бете** и **не рассчитана на недоверенные среды**.
Control Center — это **привилегированный локальный сервис**: он может выполнять
код через Codex, читать файлы проектов и управлять учетными данными. Относитесь
к нему как к root-доступу на вашей машине.

Используйте безопасно:

- **Запускайте только на localhost** или за **Tailscale с доверенными
  устройствами**, которыми владеете.
- **Не** открывайте доступ через `0.0.0.0`, LAN, публичный reverse proxy или
  Tailscale Funnel.
- Держите Pritha на **доверенной машине одного пользователя**. Любой человек
  или любая веб-страница в вашем браузере через CSRF/DNS-rebinding, способные
  достучаться до порта Control Center, могут получить возможность запускать
  привилегированные действия.
- Секреты хранятся **локально в открытом виде** (`.env*`). Защищайте, шифруйте
  и резервируйте машину соответствующим образом; никогда не коммитьте реальные
  секреты.
- Считайте все ссылки, файлы, транскрипты и голосовой ввод **недоверенными**:
  сырой ввод не должен напрямую управлять инструментами, памятью или
  развертыванием.

Усиление защиты локального доступа (request guard, жесткая привязка host) ведется
в рамках работ по безопасности Control Center; проверьте его перед тем, как
открывать Pritha за пределами localhost. Об уязвимостях сообщайте приватно по
правилам `SECURITY.md`.

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

Markdown-файлы являются главным источником истины. Локальный индекс хранится в `.memory/techscope.sqlite`, пересоздается из Markdown и не обязан храниться в Git как бинарная история.

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
