---
id: 2026-05-29-pritha-portable-memory-snapshot
type: decision
status: accepted
created: 2026-05-29
updated: 2026-05-29
topics: [memory, github, portability, sqlite, embeddings]
tools: [git, github, sqlite, sentence-transformers]
sources:
  - AGENTS.md
  - docs/github-publish-and-push.md
  - memory/manifest.json
related:
  standards:
    - 04_standards/memory-structure.md
  decisions:
    - 05_decisions/2026-05-15-memory-architecture.md
    - 05_decisions/2026-05-15-local-embeddings.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-29
source_updated: 2026-05-29
source_version: pritha-portable-memory-snapshot-v1
retrieved: 2026-05-29
verified: 2026-05-29
valid_for: Pritha GitHub publication and normal push workflow
temporal_status: current
---

# Decision: Pritha portable memory snapshot

## Context

The previous publication model treated Markdown as the only GitHub-carried
knowledge state and kept `.memory/*.sqlite`, rebuild SQL and self-test state
local. That made a fresh checkout reproducible, but not state-preserving: it
lost the exact SQLite index, FTS state, relations and local embeddings that
Pritha had already built.

The desired behavior is a portable Pritha knowledge snapshot on GitHub:
authored Markdown plus the working memory database, embeddings and relations.

## Decision

Commit `.memory/` as part of Pritha's GitHub state:

- `.memory/techscope.sqlite`;
- SQLite FTS tables and graph-like relations inside that database;
- local sentence-transformer embeddings stored in SQLite;
- `.memory/schema.sql`;
- `.memory/last-rebuild.sql`;
- `.memory/last-self-test.json`;
- `.memory/README.md`.

Markdown remains the canonical authored knowledge and `.memory` must remain
rebuildable from Markdown, but `.memory` is no longer treated as disposable
local-only state for Pritha publication.

Before normal push, run `node scripts/golden-checks.mjs --with-embeddings`
after `node scripts/quality-gate.mjs`, because quality-gate rebuilds memory and
can leave embeddings empty until the embedding step runs again.

## Boundaries

Do not commit secrets, `.env.local`, `.queue/`, `.logs/`, `.tools/` or
`secure-handoffs/`.

`01_sources/raw/` is included for text, JSON, transcripts, PDFs and small
supporting images. Heavy audio/video files (`mp4`, `wav`, `mov`, `mkv`,
`webm`, `mp3`, `m4a`, `avi`, `flac`) are local-only because they quickly exceed
reasonable Git/GitHub limits. Raw media needs a separate Git LFS/archive
decision before it is published.

## Consequences

Benefits:

- a GitHub checkout can preserve Pritha's current search, relations and
  embeddings state;
- fresh machines do not need to recompute embeddings before using semantic
  search;
- release artifacts better match the actual local working memory.

Costs and risks:

- repository size grows by the SQLite database size;
- every memory-changing push should refresh embeddings before commit;
- SQLite can contain copied text from curated artifacts, so secret scanning and
  intake discipline remain important;
- heavy raw audio/video still needs a separate portability path.

## Review date

2026-06-29
