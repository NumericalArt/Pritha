---
id: pritha-prerequisites
type: workflow
status: active
created: 2026-05-28
updated: 2026-06-21
topics:
  - pritha
  - prerequisites
  - dependencies
  - bootstrap
tools:
  - Node.js
  - npm
  - Git
  - sqlite3
  - Python
  - sentence-transformers
  - mlx-whisper
  - imageio-ffmpeg
sources:
  - requirements.txt
  - requirements-core.txt
  - requirements-macos.txt
  - scripts/env-doctor.mjs
  - scripts/bootstrap.mjs
related:
  workflows:
    - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
    - 07_workflows/2026-06-21-pritha-github-install-reproducibility-roadmap.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-06-21
source_version: phase-4-bootstrap-prerequisites
retrieved: 2026-05-28
verified: 2026-06-21
valid_for: Pritha local GitHub clone bootstrap and operations
temporal_status: current
---

# Pritha Prerequisites

This file records the external runtime dependencies needed to bootstrap Pritha
from a GitHub clone. Markdown remains the canonical authored knowledge;
`.memory/` is a committed portable snapshot of SQLite, FTS, relations and
embeddings that can also be rebuilt when these dependencies are present.

## Required

- Node.js 20 or newer.
- `npm`, installed with Node.js.
- Git CLI.
- `sqlite3` CLI.
- Python 3.10 or newer is the preferred baseline for new installs.

Current compatibility note: the existing Mac mini environment still runs the
Python scripts successfully on Apple Command Line Tools Python 3.9.6. `env-doctor`
therefore treats Python 3.9 as a temporary compatibility floor and emits a
warning below 3.10. New setups should use Python 3.10+.

## Bootstrap Profiles

Use bootstrap instead of discovering dependency commands manually:

```sh
node scripts/bootstrap.mjs plan --profile minimal
node scripts/bootstrap.mjs verify --profile minimal
node scripts/bootstrap.mjs install --profile local
node scripts/bootstrap.mjs verify --profile control-center
```

Profiles:

- `minimal`: prerequisite and memory validation checks only.
- `local`: local setup state plus portable Python packages.
- `control-center`: Control Center lockfile install, typecheck and build.
- `control-center-tailscale`: Tailscale readiness detection only.

## Python Packages

Portable packages:

```sh
python3 -m pip install --user -r requirements-core.txt
```

The core package set covers:

- `sentence-transformers` for local embeddings and semantic search.
- `imageio-ffmpeg` for a managed ffmpeg binary used by media transcription.

macOS local transcription helper:

```sh
python3 -m pip install --user -r requirements-macos.txt
```

`requirements.txt` remains a compatibility wrapper that includes the core and
macOS requirement files. Platform-specific adapter dependencies stay in their
adapter folders.

## Control Center

Install from the committed lockfile:

```sh
npm --prefix interfaces/control-center ci --ignore-scripts
```

Bootstrap performs this step for the `control-center` and
`control-center-tailscale` profiles.

## Optional

- Codex.app / Codex CLI for interactive agent work.
- `rg` for fast source search.
- System `ffmpeg`, if a workflow needs it outside `imageio-ffmpeg`.
- Tailscale client for private device access. Bootstrap may detect it, but does
  not install, authenticate or configure it.

See [Tailscale Private Access](tailscale-private-access.md) for the approved
operator flow.

## Health Check

Run:

```sh
node scripts/env-doctor.mjs
```

Profile-specific check:

```sh
node scripts/env-doctor.mjs --profile control-center
```

Use strict mode when preparing a new machine or release:

```sh
node scripts/env-doctor.mjs --strict
```

`env-doctor` exits with code `1` only when a critical dependency is missing.
Warnings are actionable but non-blocking until a later roadmap phase explicitly
promotes them to release gates.
