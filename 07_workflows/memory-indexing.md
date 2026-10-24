---
id: memory-indexing
type: workflow
status: active
created: 2026-05-15
updated: 2026-10-21
topics:
  - memory
  - indexing
  - sqlite
  - semantic-search
tools:
  - markdown
  - sqlite
sources:
  - source-48dce53c-51a9-404f-83ca-3fdc124a67ab
  - 05_decisions/2026-10-21-curated-retrieval-promotion.md
  - 03_reviews/2026-10-21-pritha-retrieval-and-runtime-verification.md
related:
  decisions:
    - 05_decisions/2026-10-21-curated-retrieval-promotion.md
  workflows:
    - 07_workflows/privacy-preserving-intake.md
    - 07_workflows/agents-mother.md
source_type: telegram
source_class: telegram
ingested_at: 2026-05-15
processed_at: 2026-06-01T21:03:38.450Z
retention_status: source-purged
usefulness: medium
evidence_quality: medium
anonymous_source_id: source-48dce53c-51a9-404f-83ca-3fdc124a67ab
---

# Artifact: source-48dce53c-51a9-404f-83ca-3fdc124a67ab

Date: 2026-05-15
Status: active
Source class: telegram
Retention: source-purged

## Goal

Пересобрать машинную память проекта из Markdown-файлов.

Markdown-файлы в проекте являются главным источником истины. SQLite, vector index и graph-like relations являются производными индексами.

## Inputs

- Markdown files from:
  - `00_inbox/` with neutral/anonymized metadata only;
  - `01_sources/notes/`
  - `02_briefs/`
  - `03_reviews/`
  - `04_standards/`
  - `05_decisions/`
  - `06_subagents/`
  - `07_workflows/`
  - `10_wiki/`
- YAML frontmatter.
- Markdown links.
- Explicit `related` fields.

Generated wiki pages in `10_wiki/` are indexed as derivative, searchable synthesis. They are useful for navigation, Obsidian graph view and semantic lookup, but they are not canonical evidence for standards or decisions. Any conclusion that depends on a wiki page must follow its `sources` back to curated artifacts or primary sources.

## Indexing steps

Current v1:

1. Scan Markdown files.
2. Parse YAML frontmatter.
3. Compute file hash.
4. Upsert document metadata into `documents`.
5. Split document body into chunks.
6. Upsert chunks into `chunks`.
7. Extract entities from frontmatter:
   - topics;
   - tools;
   - sources;
   - related artifacts.
8. Upsert entities into `entities`.
9. Upsert typed edges into `relations`.
10. Update full-text index.
11. Record run in `index_runs`.
12. Run `node scripts/privacy-audit.mjs --strict` after rebuild so `.memory/techscope.sqlite` and `.memory/last-rebuild.sql` do not retain raw/provenance strings.

Current local semantic layer:

1. Run `python3 scripts/embed-memory.py`.
2. Store chunk embeddings in `embeddings`.
3. Run semantic queries with `python3 scripts/semantic-search.py "<query>"`.
4. Or use `node scripts/query-memory.mjs semantic "<query>"`.

Current model:

```text
sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
```

## Current commands

### Curated research and retrieval evaluation

Для поиска curated agent-building knowledge используется проверенный FTS v2: русские окончания, симметричный словарь инженерных терминов, BM25 только на разрешённом корпусе, ограниченный контекст разделов и явные status/source IDs. Factory research использует этот путь для `agent-building-knowledge` согласно [действующему решению](../05_decisions/2026-10-21-curated-retrieval-promotion.md). Другие factory domain branches этим решением не мигрируются. Команды для ручного поиска:

```sh
node scripts/query-memory.mjs curated "OpenAI Agents SDK Responses API"
python3 scripts/memory-retrieve.py "возможности Pritha" --domain pritha-self --json
python3 scripts/memory-retrieve.py "Codex App Server" --mode semantic --limit 5
python3 scripts/memory-retrieve.py "Codex MCP" --include-history --json
```

Команда читает только curated platform knowledge текущего instance DB; исключает live child artifacts, user-model, private/sibling paths и historical statuses по умолчанию. Default FTS не загружает ML. Semantic/hybrid доступны явно с кешированной MiniLM и не скачивают модель. Они не выбраны основным comparator: в content eval FTS лучше. EmbeddingGemma не установлена.

Content evaluator `scripts/memory-retrieval-acceptance.py` использует отдельный frozen 60-case corpus: 48 positive и 12 negative, 30 новых holdout cases. Проверяются source identity и существенные утверждения в том же выданном разделе, а не имя файла. Старые 30-case fixture и measurements сохранены; `memory-retrieval-eval.py` — исторический filename proxy и больше не является promotion gate. Новый holdout после раскрытия результатов не используют для настройки; для следующего существенного ranker change нужна новая независимая validation часть.

Воспроизводимый diagnostic run требует явного private output path:

```sh
python3 scripts/memory-retrieval-acceptance.py --split diagnostic --modes fts --output "${PRITHA_STATE_ROOT}/memory/evals/retrieval-diagnostic.json"
```

Первое content acceptance: FTS 45/48 @5 и 46/48 @10; новый positive holdout 23/24 @5; synthetic private leaks 0, прежних успешных @10 не потеряно. Полный результат, устойчивость, answer audit и ограничения: `03_reviews/2026-10-21-pritha-retrieval-and-runtime-verification.md`. Rebuild/embeddings/self-test не запускаются одновременно. Retrieval не подтверждает истинность или authorization: необходимы чтение source/status/version и, для действий, соответствующий gate.

Legacy commands ниже сохраняют поведение; их unscoped semantic выдача может содержать instance-local agent memory и historical knowledge. Для нового child сначала искать agent-building-knowledge, затем pritha-self; child evidence подключать отдельно по fit.

Rebuild:

```sh
node scripts/rebuild-memory.mjs
```

Stats:

```sh
node scripts/query-memory.mjs stats
```

Full-text search:

```sh
node scripts/query-memory.mjs search STT
```

Validate:

```sh
node scripts/validate-memory.mjs
```

Documents:

```sh
node scripts/query-memory.mjs documents
```

Relations:

```sh
node scripts/query-memory.mjs relations 2026-05-15-local-video-to-structured-text-brief
```

Filters:

```sh
node scripts/query-memory.mjs by-topic memory
node scripts/query-memory.mjs by-tool sqlite
node scripts/query-memory.mjs by-domain pritha-self
node scripts/query-memory.mjs by-subject system pritha
node scripts/query-memory.mjs by-status draft
node scripts/query-memory.mjs by-type standard
node scripts/query-memory.mjs recent
node scripts/query-memory.mjs open
```

Embeddings:

```sh
python3 scripts/embed-memory.py
python3 scripts/semantic-search.py "локальная транскрибация media"
node scripts/query-memory.mjs semantic "локальная транскрибация media"
```

## Relation policy

Use stable relation types:

- `MENTIONS`
- `SUPPORTS`
- `RELATES_TO`
- `COMPARES`
- `ACCEPTS`
- `REJECTS`
- `SUPERSEDES`
- `APPLIES_TO`
- `DERIVED_FROM`

## Query workflow

1. User asks a question.
2. Agent uses structured filters if available.
3. Agent runs full-text search.
4. Agent follows relations for neighboring context.
5. Agent answers with links to Markdown sources.
6. If result changes standards or decisions, agent writes back to Markdown.

## Acceptance criteria

- `node scripts/validate-memory.mjs` passes.
- `node scripts/rebuild-memory.mjs` rebuilds `.memory/techscope.sqlite`.
- `node scripts/privacy-audit.mjs --strict` passes after rebuild.
- `node scripts/query-memory.mjs stats` shows indexed documents, chunks, entities, relations and embeddings.
- `node scripts/query-memory.mjs by-topic <topic>`, `by-tool <tool>`, `by-domain <domain>` and `by-subject <kind> <id>` return filtered documents.
- `node scripts/query-memory.mjs open` returns unresolved non-template artifacts.
- SQLite integrity check returns `ok`.

## Non-goals

- Do not manually edit SQLite as canonical knowledge.
- Do not store unique knowledge only inside vector payloads.
