---
id: techscope-prerequisites
type: workflow
status: active
created: 2026-05-28
updated: 2026-05-28
topics:
  - techscope
  - prerequisites
  - dependencies
tools:
  - Node.js
  - sqlite3
  - Python
  - sentence-transformers
  - mlx-whisper
  - imageio-ffmpeg
sources:
  - requirements.txt
  - scripts/env-doctor.mjs
related:
  workflows:
    - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: phase-6-prerequisites
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: Techscope local development and operations
temporal_status: current
---

# Techscope Prerequisites

This file records the external runtime dependencies needed to run Techscope
locally. Markdown remains the canonical authored knowledge; `.memory/` is a
committed portable snapshot of SQLite, FTS, relations and embeddings that can
also be rebuilt when these dependencies are present.

## Required

- Node.js 20 or newer.
- `sqlite3` CLI.
- Python 3.10 or newer is the preferred baseline for new installs.
- Python packages from `requirements.txt`.

Current compatibility note: the existing Mac mini environment still runs the
Python scripts successfully on Apple Command Line Tools Python 3.9.6. `env-doctor`
therefore treats Python 3.9 as a temporary compatibility floor and emits a
warning below 3.10. New setups should use Python 3.10+.

## Python Packages

Install the pinned Python packages:

```sh
python3 -m pip install --user -r requirements.txt
```

The pinned packages cover:

- `sentence-transformers` for local embeddings and semantic search.
- `imageio-ffmpeg` for a managed ffmpeg binary used by YouTube transcription.
- `mlx-whisper` as the current local Whisper alternative for Apple Silicon.
- `yt-dlp` for YouTube metadata and media download.

## Optional

- Codex.app / Codex CLI for interactive agent work.
- `rg` for fast source search.
- System `ffmpeg`, if a workflow needs it outside `imageio-ffmpeg`.

## Health Check

Run:

```sh
node scripts/env-doctor.mjs
```

Use strict mode when preparing a new machine or release:

```sh
node scripts/env-doctor.mjs --strict
```

`env-doctor` exits with code `1` only when a critical dependency is missing.
Warnings are actionable but non-blocking until a later roadmap phase explicitly
promotes them to release gates.
