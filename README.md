# Pritha

**The AI agent that creates AI agents. From spec to specialist.**

Pritha is an open-source, Codex-native spec-to-agent compiler. It helps you turn a task description into a working agent project with instructions, memory boundaries, tool policy, tests, handoff notes and lifecycle reports.

Techscope is the internal knowledge base around Pritha: it collects technology signals, reviews agent-engineering patterns, and promotes only proven ideas into reusable standards.

> Existing `agents-mother` commands still work as compatibility aliases. New public-facing commands should use `pritha`.

## 10-Second Start

```sh
node scripts/pritha.mjs questions
node scripts/pritha.mjs test . --no-report
```

## 10-Minute Start

```sh
git clone <repo-url> pritha
cd pritha
cp .env.example .env
node scripts/env-doctor.mjs
node scripts/quality-gate.mjs
node scripts/pritha.mjs create --name "research-agent" --mission "Track and review research links"
node scripts/pritha.mjs lineage
```

Then open the created seed in `11_agents/contracts/`, review it, and scaffold a descendant:

```sh
node scripts/pritha.mjs create 11_agents/contracts/YYYY-MM-DD-research-agent-agent-contract.md --output ../research-agent
node scripts/pritha.mjs test ../research-agent
```

## What Pritha Generates

- `AGENTS.md` or runtime-native instructions.
- `README.md` and `.env.example`.
- Interface, memory, tools and operations manifests.
- Smoke/status scripts.
- Optional Telegram adapter when selected by the seed.
- Handoff and lifecycle reports.

## Core Concepts

- **Seed**: the agent specification, technically an `agent-contract`.
- **Descendant**: a generated child agent project.
- **Lineage**: the lifecycle chain of contract, scaffold, tests, handoff, operations and reviews.
- **Traits**: reusable capabilities and behavior patterns.
- **Inheritance**: base safety, memory and tool policy.
- **Mutation**: task-specific adaptation.
- **Trial**: evaluation before handoff or release.

## Documentation

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Using Pritha](docs/pritha.md)
- [Memory](docs/memory.md)
- [Operations](docs/operations.md)
- [Contributing Workflow](docs/contributing-workflow.md)
- [Realtime](docs/realtime.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Prerequisites](docs/prerequisites.md)

## Quality Gate

Run the normal local gate:

```sh
node scripts/quality-gate.mjs
```

Run the extended gate with embeddings:

```sh
node scripts/golden-checks.mjs --with-embeddings
```

## Compatibility

Preferred:

```sh
node scripts/pritha.mjs <command>
```

Compatibility alias:

```sh
node scripts/agents-mother.mjs <command>
```

The compatibility alias prints a deprecation notice but remains functional.

## Safety

Do not commit secrets or runtime state:

- `.env*`
- `.queue/`
- `.memory/*.sqlite`
- `.logs/`
- local machine paths
- Telegram tokens or user identifiers

Markdown artifacts are the source of truth. SQLite, embeddings and graph/search indexes must be rebuildable from Markdown.

## License

MIT. See [LICENSE](LICENSE).
