# Getting Started

## Fresh Clone

```sh
git clone <repo-url> pritha
cd pritha
cp .env.example .env
node scripts/env-doctor.mjs
node scripts/quality-gate.mjs
```

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
