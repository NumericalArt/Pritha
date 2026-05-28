# Getting Started

## 10-Second Start

Open the repository in Codex and say:

```text
запусти проект
```

Codex will follow `07_workflows/first-run-setup.md`. For a headless fallback:

```sh
node scripts/setup.mjs --non-interactive --config tests/fixtures/setup-minimal.json
node scripts/setup-status.mjs --json
```

## Fresh Clone

```sh
git clone <repo-url> pritha
cd pritha
cp .env.example .env
node scripts/setup.mjs --non-interactive --config tests/fixtures/setup-minimal.json
```

The setup script writes local settings to `.env.local` and non-secret state to
`.techscope-setup.json`. Both are gitignored.

## Create Your First Seed

```sh
node scripts/pritha.mjs create --name "research-agent" --mission "Track and review research links"
```

Review the generated file in `11_agents/contracts/`.

## Scaffold a Descendant

```sh
node scripts/pritha.mjs create 11_agents/contracts/YYYY-MM-DD-research-agent-agent-contract.md --output ../research-agent
node scripts/pritha.mjs test ../research-agent
```

## Add Knowledge

Place new material in `00_inbox/`, then create a brief, assessment, decision or standard. Markdown files are the source of truth.

## Verify

```sh
node scripts/quality-gate.mjs
node scripts/pritha.mjs lineage
```
