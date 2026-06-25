# Pritha

**A universal, trainable agent for creating and evolving AI agents.**

Pritha is an open-source, Codex-native agent factory. It helps you turn a task
description into a working child-agent project with instructions, memory
boundaries, tool policy, tests, handoff notes and lifecycle reports.

Pritha has two primary functions:

1. Improve its own knowledge base, tools and agent-creation capabilities through
   reviewed memory updates, standards, workflows, tests and harness changes.
2. Create new child agents and improve existing child agents through contracts,
   Pritha memory research, scaffold generation, git-based version control,
   tests, reports and handoff.

`Trainable` means curated, versioned, reviewable learning through Pritha memory
and repository-local harness artifacts. It does not mean hidden autonomous
self-modification, unreviewed skill installation, secret collection or
background service activation.

In other words: Pritha is a harness for an agent that builds the harness of a
new agent. Its lineage model is intentionally genetic: Seeds become Descendants
through inheritance, mutation and trial. A Claude Code version is coming as a
future adapter; v0.1 remains Codex-native.

> Existing `agents-mother` commands still work as compatibility aliases. New
> public-facing commands should use `pritha`.

## Quick Start

```sh
node scripts/bootstrap.mjs prepare --profile local
node scripts/pritha.mjs questions
node scripts/pritha.mjs test . --no-report
```

## Fresh Clone Bootstrap

```sh
git clone https://github.com/NumericalArt/Pritha.git pritha
cd pritha
node scripts/bootstrap.mjs prepare --profile local
node scripts/bootstrap.mjs --profile local --start control-center
```

The prepare command installs deterministic local dependencies for the chosen
profile, writes local non-secret setup state, rebuilds `.memory/techscope.sqlite`
and semantic embeddings from tracked Markdown, and verifies semantic memory
search. The optional Control Center start command runs in the foreground. It
does not install launchd, cron, Tailscale, durable services or credentials.

Useful profile-specific commands:

```sh
node scripts/bootstrap.mjs plan --profile minimal
node scripts/bootstrap.mjs prepare --profile local
node scripts/bootstrap.mjs install --profile local
node scripts/bootstrap.mjs verify --profile control-center
node scripts/bootstrap.mjs start --profile control-center
npm run control-center:health
```

`control-center:health` is read-only. When Control Center is running, it checks
that the live `/voice`, `/agents` and `/settings` pages reference JavaScript
chunks that are actually being served by the current Next.js process.

## Create Your First Child Agent

Start with the interview outline:

```sh
node scripts/pritha.mjs questions
```

Create a draft Seed:

```sh
node scripts/pritha.mjs create --name "research-agent" --mission "Track and review research links"
```

Review the generated contract in `11_agents/contracts/`. After it is accepted,
scaffold and test the descendant:

```sh
node scripts/pritha.mjs create 11_agents/contracts/YYYY-MM-DD-research-agent-agent-contract.md --output ../research-agent
node scripts/pritha.mjs test ../research-agent
```

## What Pritha Generates

- `AGENTS.md` or runtime-native instructions.
- `README.md` and `.env.example`.
- Git-ready child-agent project structure.
- Interface, memory, tools and operations manifests.
- Smoke/status scripts.
- Optional Telegram adapter when selected by the seed.
- Handoff and lifecycle reports.

## What Works After Clone

Ready without secrets:

- Bootstrap planning and minimal verification.
- Markdown memory validation and portable memory snapshot checks.
- Local contract creation, research, scaffold planning and project inspection.
- Control Center local build/start after `npm ci` through bootstrap.

Optional credentials or operator approval are still required for:

- Hosted model API calls and Realtime voice.
- Telegram or other messaging adapters.
- GitHub publishing operations.
- Tailscale private device access and Tailscale Serve.
- Any launchd/service install or durable background process.

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
- [GitHub Publish And Push](docs/github-publish-and-push.md)
- [Contributing Workflow](docs/contributing-workflow.md)
- [Realtime](docs/realtime.md)
- [Tailscale Private Access](docs/tailscale-private-access.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Prerequisites](docs/prerequisites.md)

## Quality Gate

Run the normal local gate after implementation changes:

```sh
node scripts/quality-gate.mjs
```

Run the extended gate with embeddings:

```sh
node scripts/bootstrap.mjs prepare --profile local
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
- `.logs/`
- `.memory-private/`
- `.private/`
- local machine paths
- Telegram tokens or user identifiers

Markdown artifacts are the source of truth. Generated memory indexes such as
`.memory/techscope.sqlite`, SQL rebuild dumps and embeddings are local artifacts
rebuilt by `node scripts/bootstrap.mjs prepare --profile local`; they should not
accumulate binary history in Git. Private user memory belongs outside the
tracked snapshot.

## License

MIT. See [LICENSE](LICENSE).
