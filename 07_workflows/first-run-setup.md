---
id: first-run-setup
type: workflow
status: active
created: 2026-05-28
updated: 2026-05-28
topics:
  - pritha
  - setup
  - onboarding
  - codex
tools:
  - Codex
  - Node.js
  - Pritha
sources:
  - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
related:
  workflows:
    - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
  decisions:
    - 05_decisions/2026-05-28-realtime-default-mode.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: phase-12-first-run-setup
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: Pritha v0.1 first-run bootstrap
temporal_status: current
---

# First-Run Setup

Use this workflow when a user opens a fresh checkout and says `запусти проект`,
`setup`, `first run`, `bootstrap` or `start`.

## Goal

Bring the repository to a usable local state with minimal assumptions:

- Codex thread is the default interface.
- Optional connectors are explicit opt-in.
- Secrets stay in `.env.local`.
- `.techscope-setup.json` stores only non-secret setup state.
- Quality failures do not block the first run; they produce
  `completed-with-warnings` and actionable hints.

## Codex Dialog Path

1. Confirm the repository root with `pwd` and `git rev-parse --show-toplevel`.
2. Read `AGENTS.md`, this workflow and `.env.example`.
3. Ask only for choices that are needed now:
   - minimal Codex-only setup;
   - Web UI/Tailscale manual notes;
   - Telegram connector;
   - Realtime voice connector;
   - Obsidian vault/sync notes;
   - first descendant agent now or later.
4. Do not install dependencies, launch services, enable launchd, start cron,
   run background queues or publish anything without a separate explicit user
   confirmation.
5. If secrets are provided, write them only to `.env.local` using the setup
   script or equivalent atomic private write. Never put secrets in
   `.techscope-setup.json`, Markdown artifacts or Git.
6. Run the fallback CLI if useful:

```sh
node scripts/setup.mjs
```

For headless minimal setup:

```sh
node scripts/setup.mjs --non-interactive --config tests/fixtures/setup-minimal.json
```

7. Check status:

```sh
node scripts/setup-status.mjs --json
```

8. If final status is `completed-with-warnings`, tell the user what to fix and
   suggest:

```sh
node scripts/self-test.mjs
```

## Connector Rules

- `codex`: enabled by default.
- `web`: records host/port only; no server autostart.
- `telegram`: token validation is non-blocking; failed token does not fail the
  entire setup.
- `realtime`: opt-in only. Warn about microphone privacy and current pricing.
  Use `docs/realtime.md`; do not hardcode stale prices.
- `obsidian`: record manual vault/sync notes only.
- `tailscale`: manual network setup only.
- `claude-code`: out of scope for v0.1; see placeholder contract.

## Files

- `.env.local`: local secrets/config, private file mode.
- `.techscope-setup.json`: local non-secret setup state, gitignored.
- `setup/manifest.schema.json`: state contract.
- `08_templates/first-run-setup-dialog.md`: reusable descendant-agent template.

## Done

- Setup status is `completed` or `completed-with-warnings`.
- `.env.local` exists and is not committed.
- `.techscope-setup.json` exists and contains no secrets.
- `node scripts/setup-status.mjs --json` prints machine-readable state.
- The user has the next concrete step: run self-test, create a first descendant
  via Pritha, or continue with manual connector setup.
