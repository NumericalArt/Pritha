# Contributing

Pritha uses a Markdown-first, evidence-first workflow.

## Ways to Contribute

- Add an intake item in `00_inbox/`.
- Propose a new agent Seed through `node scripts/pritha.mjs create`.
- Propose or update a standard in `04_standards/`.
- Add a decision record in `05_decisions/` when architecture changes.
- Improve tests, docs or scaffold behavior.

## Required Checks

Before opening a pull request:

```sh
node scripts/quality-gate.mjs
npm test --silent
```

For release-sensitive changes:

```sh
node scripts/golden-checks.mjs --with-embeddings
```

## Rules

- One phase or coherent change per PR.
- Use Conventional Commit subjects, such as `fix(scaffold): preserve selected modules`.
  The quality gate warns about new subjects since the merge base with origin/main;
  it does not reject delivery or require rewriting historical commits.
- Include a phase/report artifact for roadmap work.
- Mark reusable patterns as `AM-CANDIDATE`; do not promote them to standards without evidence.
- Do not commit `.env*`, `.queue/`, `.memory/*.sqlite`, `.logs/`, local paths, tokens or credentials.
- Keep generated databases and embeddings rebuildable from Markdown.
- Add declarations where Control Center TypeScript imports a JavaScript module;
  broad declaration coverage belongs in a separate change.

## Pull Requests

Use `.github/PULL_REQUEST_TEMPLATE.md`. Include what changed, what was verified and what remains open.
