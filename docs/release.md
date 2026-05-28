# Release Process

This document describes the safe publication path for Pritha.

## Current Release Target

- Repository name: `pritha`
- Default branch: `main`
- Initial tag: `v0.1.0`
- Visibility flow: create private, verify, then flip public manually.

Repository owner, machine notes and private publication details belong in the
sibling `secure-handoffs/` directory, outside this repository.

## Before First Push

Run:

```sh
node scripts/pre-push-audit.mjs
node scripts/quality-gate.mjs
npm test --silent
node scripts/golden-checks.mjs --with-embeddings
```

Then perform a manual review of:

- `.env.example` contains no real secrets.
- `.env`, `.env.local`, `.memory/*.sqlite`, `.queue/`, `.logs/`, `.tools/`,
  `01_sources/raw/` and `secure-handoffs/` are not tracked.
- No local absolute paths or private identifiers remain in the public snapshot.
- `LICENSE`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md` and `CHANGELOG.md`
  are present.

Optional one-time local scanners:

```sh
gitleaks detect --source . --no-git
trufflehog filesystem .
```

If these tools are not installed, do not add them as project dependencies just
for CI. Run them locally or through a separate security workstation.

## Release Status Gate

Use the release status script before and after configuring the GitHub remote:

```sh
npm run release-status
node scripts/github-release-status.mjs --json
node scripts/github-release-status.mjs --online --strict
```

The default mode is safe and non-mutating. It reports local readiness plus the
remaining external proof: origin remote, remote `main`, tag `v0.1.0`, live CI,
branch protection, GitHub Release and fresh public clone. `--strict` exits
non-zero until every required external proof is present.

## GitHub Repository Setup

1. Create the repo as private.
2. Add the remote:
   ```sh
   git remote add origin git@github.com:<owner>/pritha.git
   ```
3. Push `main`.
4. Confirm GitHub Actions are green.
5. Configure branch protection or ruleset for `main`:
   - require pull request before merge;
   - require at least one approval;
   - require status checks from `Quality Gate`;
   - require branches to be up to date before merge;
   - block force pushes and deletions.
6. Keep path-filtered workflows such as `Memory Validate` and
   `Setup Wizard Smoke` as useful checks, but do not make them the only required
   status check unless GitHub rules are configured to avoid pending skipped
   checks.
7. Flip public only after a clean clone from GitHub passes the getting-started
   flow.

## CI

The repository ships:

- `.github/workflows/quality-gate.yml`
- `.github/workflows/memory-validate.yml`
- `.github/workflows/setup-wizard-smoke.yml`
- `.github/dependabot.yml`

Action versions were checked against upstream GitHub repositories on
2026-05-28. The workflows use `actions/checkout@v6`, `actions/setup-node@v6`
and `actions/setup-python@v6`. Recheck action versions before major release
work because GitHub Actions evolves quickly.

Primary references checked on 2026-05-28:

- [actions/checkout](https://github.com/actions/checkout)
- [actions/setup-node releases](https://github.com/actions/setup-node/releases)
- [actions/setup-python](https://github.com/actions/setup-python)
- [GitHub Dependabot options reference](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file)
- [GitHub protected branches docs](https://docs.github.com/articles/about-branch-restrictions)

Linux CI installs portable Python dependencies only. `mlx-whisper` is treated
as a macOS local transcription helper and is not required for Ubuntu CI.

## Versioning

Use semantic versioning:

- Patch: docs, tests, small compatibility fixes.
- Minor: new Pritha workflow/module that remains backward compatible.
- Major: breaking scaffold/runtime contract changes.

## Tagging

After the release candidate is green:

```sh
git tag -a v0.1.0 -m "Pritha v0.1.0"
git push origin main
git push origin v0.1.0
```

Create a GitHub Release from the tag and copy the relevant entries from
`CHANGELOG.md`.

## Rollback

If the first public release exposes an issue:

1. Make the repository private again if privacy/security is affected.
2. Revoke any exposed token immediately.
3. Delete or replace the GitHub release if the artifact is unsafe.
4. Create a fix branch and document the incident in `SECURITY.md`/`CHANGELOG.md`
   if applicable.
