# GitHub Publish And Push

This is the operational checklist for publishing Pritha to GitHub and for later
pushes. It is intentionally explicit because GitHub publication is the one
remaining external step that local Pritha checks cannot complete by themselves.

## One-Time GitHub Setup

Current target:

- Owner: `NumericalArt`
- Repository: `pritha`
- Visibility: create as private first, make public only after verification.
- Default branch: `main`
- Initial tag: `v0.1.0`

On GitHub:

1. Open [github.com/new](https://github.com/new).
2. Owner: `NumericalArt`.
3. Repository name: `pritha`.
4. Visibility: `Private`.
5. Do not initialize with README, `.gitignore` or license. The local repository
   already has those files.
6. Create repository.

## Authentication

Preferred route for this Mac mini is SSH.

Current operational policy:

- Use direct SSH `git push origin main` as the primary update path.
- Do not spend time trying GitHub CLI / PR / release commands while `gh` is not
  authenticated.
- Do not run `gh auth status` as a blocking prerequisite for ordinary pushes.
- Revisit this policy after the operator explicitly authenticates `gh`; at that
  point PR/release automation can be re-enabled through a separate update to
  this document.

Add the public SSH key to GitHub:

1. Open GitHub Settings.
2. Open `SSH and GPG keys`.
3. Click `New SSH key`.
4. Title: `mac-mini-pritha`.
5. Key type: `Authentication Key`.
6. Paste the public key from the secure handoff location, not the private key.
7. Save.

Never paste or upload the private key.

After the key is added, verify locally:

```sh
ssh -T git@github.com
git ls-remote --heads origin main
```

Deferred alternative route:

```sh
gh auth login
gh auth status
```

Either SSH or `gh` auth is acceptable for push, but `gh` auth is useful for
creating releases and checking repository state from the CLI. Until `gh` is
authenticated, ordinary updates should not attempt the CLI route.

## First Push

Run the full local gate:

```sh
node scripts/validate-memory.mjs
npm test --silent
node scripts/quality-gate.mjs
node scripts/golden-checks.mjs --with-embeddings
node scripts/pre-push-audit.mjs
node scripts/github-release-status.mjs
```

Confirm the remote:

```sh
git remote -v
git branch --show-current
git tag --points-at HEAD
```

Expected:

- remote `origin` points to `git@github.com:NumericalArt/Pritha.git`;
- branch is `main`;
- `v0.1.0` points at the current release commit.

Push:

```sh
git push -u origin main
git push origin v0.1.0
```

Then check the remote:

```sh
node scripts/github-release-status.mjs --online --strict
```

This verifies that remote `main` matches local `HEAD` and remote `v0.1.0`
matches the local tag. It may still fail until GitHub Actions, branch
protection and release objects exist. That is expected during the first
publication.

## GitHub Actions

After the first push, open the repository Actions tab and verify:

- `Quality Gate` passes on `main`;
- `Memory Validate` passes when memory paths change;
- `Setup Wizard Smoke` passes when setup paths change.

For branch protection, make `Quality Gate` the required status check. The other
two workflows are path-filtered and may be skipped when unrelated files change.

## Branch Protection Or Ruleset

After `main` exists remotely, configure protection for `main`:

- require pull request before merge;
- require at least one approval if collaborators are added;
- require status checks before merge;
- require `Quality Gate`;
- require branch to be up to date before merge;
- block force pushes;
- block branch deletion.

Use GitHub branch protection or repository rulesets. If GitHub UI labels change,
keep the intent: no direct unverified mutation of `main` after the initial
publication.

## Create The GitHub Release

After the tag is pushed and CI is green:

1. Open the repository on GitHub.
2. Open `Releases`.
3. Click `Draft a new release`.
4. Choose existing tag `v0.1.0`.
5. Title: `Pritha v0.1.0`.
6. Copy the relevant notes from `CHANGELOG.md`.
7. Publish release.

If `gh` is authenticated, the equivalent CLI command is:

```sh
gh release create v0.1.0 --title "Pritha v0.1.0" --notes-file CHANGELOG.md
```

For future releases, do not reuse `v0.1.0`; create the next semantic version.

## Make Public

Only make the repository public after:

- clean local gates pass;
- remote `main` exists;
- `v0.1.0` exists remotely;
- CI is green;
- GitHub Release exists;
- a fresh clone passes the 10-minute start.

Fresh clone check:

```sh
tmp="$(mktemp -d)"
git clone git@github.com:NumericalArt/Pritha.git "$tmp/pritha"
cd "$tmp/pritha"
node scripts/setup.mjs --non-interactive --config tests/fixtures/setup-minimal.json
node scripts/quality-gate.mjs
```

Then GitHub Settings -> General -> Danger Zone -> Change repository visibility
to public.

## Normal Future Push

For ordinary work after publication:

```sh
git status --short --ignored
node scripts/validate-memory.mjs
npm test --silent
node scripts/quality-gate.mjs
node scripts/golden-checks.mjs --with-embeddings
node scripts/pre-push-audit.mjs
git add <changed files>
git commit -m "<short clear message>"
git push origin main
```

When memory changed, include the portable snapshot files in the commit:

```sh
git add .memory/techscope.sqlite .memory/schema.sql .memory/last-rebuild.sql .memory/last-self-test.json .memory/README.md
```

This direct push is the default update workflow until `gh` is authenticated and
this document is revised. Do not create a branch or PR only to work around
missing `gh` auth.

For release work, additionally run:

```sh
node scripts/github-release-status.mjs --online --strict
```

GitHub is the portable Pritha memory snapshot. Push curated Markdown,
`.memory/` and portable raw artifacts, including `techscope.sqlite`, SQLite
FTS/relations, embeddings, schema, rebuild SQL, the self-test baseline, raw
JSON, transcripts, text, PDFs and small supporting images. Do not push secrets,
`.env.local`, `.queue/`, `.logs/`, `.tools/` or secure handoff folders. Heavy
raw audio/video media (`mp4`, `wav`, `mov`, `mkv`, `webm`, `mp3`, `m4a`,
`avi`, `flac`) stays outside the default Git snapshot until a Git LFS/archive
policy is selected.

## Current GitHub CLI State

As of 2026-05-29, SSH push works and direct `main` updates are the normal path:

- `origin` is configured as `git@github.com:NumericalArt/Pritha.git`;
- local `main` pushes to `origin/main`;
- `gh` is installed but not authenticated yet;
- PR/release automation through GitHub CLI is deferred until the operator runs
  `gh auth login`.

When `gh` is authenticated, update this document before changing the default
workflow.
