# Techscope Memory

This directory contains the portable working memory snapshot for Pritha.

The Markdown files in the repository are the canonical authored knowledge.
Files in `.memory/` are generated and rebuildable, but they are also committed
so another checkout can keep the same SQLite, FTS, relations, embeddings and
baseline state without recomputing everything first.

Tracked artifacts:

- `techscope.sqlite`: SQLite sidecar index.
- `schema.sql`: database schema.
- `last-rebuild.sql`: SQL snapshot used for debugging rebuild output.
- `last-self-test.json`: latest operational self-test baseline.
- `exports/`: optional generated exports for other projects or agents.

## Current commands

Rebuild the index from Markdown:

```sh
node scripts/rebuild-memory.mjs
```

Show index stats:

```sh
node scripts/query-memory.mjs stats
```

Search with SQLite FTS:

```sh
node scripts/query-memory.mjs search STT
```

List indexed documents:

```sh
node scripts/query-memory.mjs documents
```

List entities:

```sh
node scripts/query-memory.mjs entities
```

Show relations for a document:

```sh
node scripts/query-memory.mjs relations 2026-05-15-local-video-to-structured-text-brief
```

Validate Markdown memory metadata:

```sh
node scripts/validate-memory.mjs
```

Filter by topic, tool, status or type:

```sh
node scripts/query-memory.mjs by-topic memory
node scripts/query-memory.mjs by-tool sqlite
node scripts/query-memory.mjs by-status draft
node scripts/query-memory.mjs by-type standard
node scripts/query-memory.mjs recent
node scripts/query-memory.mjs open
```

Transcribe media locally:

```sh
node scripts/transcribe-media.mjs <media-source> --json
```

Media transcription uses an untracked temporary workspace and retains only
neutral status metadata plus processed knowledge.

## Notes

The current implementation supports:

- frontmatter metadata indexing;
- Markdown chunking by headings;
- SQLite FTS5 full-text search;
- topic/tool/source entities;
- typed relations from frontmatter.
- local chunk embeddings stored in `techscope.sqlite`.

## Local Embeddings

Build local chunk embeddings:

```sh
python3 scripts/embed-memory.py
```

Semantic search:

```sh
python3 scripts/semantic-search.py "локальная транскрибация youtube"
```

or:

```sh
node scripts/query-memory.mjs semantic "локальная транскрибация youtube"
```

Current model:

```text
sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
```

Notes:

- Embeddings are generated artifacts stored in `.memory/techscope.sqlite`.
- Run `node scripts/rebuild-memory.mjs` before `python3 scripts/embed-memory.py` after Markdown changes.
- Before pushing, run `node scripts/golden-checks.mjs --with-embeddings` so the committed SQLite snapshot contains fresh embeddings.
- The current search computes cosine similarity locally over SQLite-stored vectors.
