# Pritha

<p align="center">
  <img src="docs/assets/pritha-logo.png" alt="Pritha logo" width="220">
</p>

**A local-first, Codex-native agent foundry and knowledge OS.**

Pritha turns an idea, project, dataset, or workflow into a reviewed, testable
specialist-agent project. It combines a contract-driven agent lifecycle with a
curated Markdown knowledge base, so agent-building decisions remain inspectable
and reusable.

The primary workbench is a Codex task opened on this repository. The local
Control Center and its Voice interface are active, functional operator surfaces,
but they are optional: you do not need either one to start using Pritha.

Pritha is local-first and currently in active beta.

## Start In Codex

1. Download or clone this repository.
2. Open the Pritha folder in Codex.
3. Say:

```text
Set up and start Pritha.
```

Codex reads the repository instructions and performs the safe local bootstrap
for you. “Start” means Pritha is ready to use in the current Codex task; it does
not silently start a web server or install a background service.

The manual equivalent is:

```sh
node scripts/bootstrap.mjs prepare --profile local
```

That command prepares local dependencies, rebuilds the generated memory index
and embeddings from tracked Markdown, and verifies semantic memory. It does not
install credentials, Tailscale, launchd, cron, or another durable service.

## What Pritha Is

Pritha has two connected jobs:

- **Agent foundry:** design, research, scaffold, test, hand off, and evolve
  focused child agents with explicit contracts and operating boundaries.
- **Knowledge OS:** turn source material and implementation evidence into
  reviewed briefs, assessments, decisions, standards, workflows, and reusable
  agent-building knowledge.

Pritha is not a hosted SaaS, a public multi-user service, or one monolithic
assistant with unrestricted access. It does not trust raw input or repository
candidates automatically, install discovered code during research, or enable
external access and long-running services without an explicit operator action.

The current release is Codex-native. Other coding-agent runtimes may be explored
through future adapters, but are not presented as implemented compatibility.

## What You Can Do

In the Codex task, ask Pritha to:

- create a specialist agent for a project or workflow;
- review a link, file, idea, or technical approach;
- turn useful evidence into a brief, review, decision, or standard;
- inspect, test, or improve an existing child-agent project;
- compare a proposed change with Pritha's accepted baselines and knowledge.

For example:

```text
Create an agent that reviews research links and reports only meaningful changes.
```

Pritha will guide the contract and research steps before creating a production
scaffold. The CLI fallback for the same interview is:

```sh
node scripts/pritha.mjs interview
```

## Core And Optional Surfaces

| Layer | Includes | Required to start? |
| --- | --- | --- |
| Core | Codex workbench, repository instructions, contracts, curated Markdown, local generated memory, scaffold/tests/reports | Yes |
| Functional operator layer | Control Center with Agents, Voice, Settings, and diagnostics | No |
| Additional opt-in surfaces | Tailscale private access, Telegram, hosted model calls, web integrations, deployment and services | No |

Optional means that a surface is not required for the core Codex workflow. It
does not mean that Control Center or Voice is experimental or unfinished.

## How It Works

```text
user intent or material
→ Codex + Pritha repository rules
→ reviewed knowledge or an accepted agent contract
→ gated memory, external-source, and repository research
→ a focused sibling-agent scaffold
→ tests, handoff, lifecycle reports, and registry updates
```

Tracked Markdown is the authored source of truth. SQLite, FTS, relations, and
embeddings are generated local indexes that can be rebuilt from that knowledge.
See [Architecture](docs/architecture.md) for the system boundaries.

## Optional Control Center And Voice

To prepare and start the local Control Center:

```sh
node scripts/bootstrap.mjs --profile local --start control-center
```

The active Control Center provides `/agents`, `/voice`, `/settings`, and
read-only diagnostics. Its integrated Voice surface supports realtime operator
work and can route deeper tasks to Codex. Some Voice and hosted-model features
require explicit credentials and can incur provider costs.

The start command runs the UI in the foreground on localhost. It does not
install launchd, cron, Tailscale, credentials, or a durable service. Private
access from another trusted device is a separate, operator-approved
[Tailscale workflow](docs/tailscale-private-access.md).

## Security

Pritha is active-beta software for a trusted, single-user machine. The Control
Center is a privileged local service: it can route work to Codex, read project
files, and manage local credentials. Treat access to it as privileged access to
your machine.

- Run it on localhost, or behind Tailscale with devices you own and trust.
- Do not expose it through `0.0.0.0`, LAN binding, a public reverse proxy, or
  Tailscale Funnel.
- Never commit real secrets from `.env*` or private runtime state.
- Treat links, files, transcripts, and voice input as untrusted. Raw input must
  not directly control tools, memory promotion, deployment, or publishing.
- Report vulnerabilities privately according to [SECURITY.md](SECURITY.md),
  not in a public GitHub Discussion.

## Documentation

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Using Pritha](docs/pritha.md)
- [Memory](docs/memory.md)
- [Control Center](interfaces/control-center/README.md)
- [Realtime and Voice](docs/realtime.md)
- [Operations](docs/operations.md)
- [Prerequisites](docs/prerequisites.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Contributing](docs/contributing-workflow.md)

## Quality

For implementation changes, run:

```sh
node scripts/quality-gate.mjs
```

## License

MIT. See [LICENSE](LICENSE).
