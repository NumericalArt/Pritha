# Pritha

<p align="center">
  <img src="docs/assets/pritha-logo.png" alt="Pritha logo" width="220">
</p>

**A local-first, voice-first Control Center for creating, evolving, and operating AI child agents.**

Pritha is a Codex-native agent factory and operator console. It helps an
operator turn a task, project, dataset, or workflow into a dedicated child-agent
harness with clear instructions, memory boundaries, tool policies, tests,
credentials, operations metadata, and lifecycle reports.

Pritha has two core jobs: create and improve child agents, and improve its own
agent-building knowledge through reviewed memory updates, standards, workflows,
tests, and harness changes.

The goal is not to build one large general-purpose assistant that does
everything. Pritha creates smaller, project-specific agents with their own
harnesses, interfaces, memory rules, tools, safety gates, and operating
procedures. This makes each agent easier to inspect, test, evolve, and trust.

## What Pritha Is

Pritha is a local-first, Codex-native platform for building and operating AI
child agents.

It combines three layers:

1. **Agent Factory** - a contract-driven workflow for designing, researching,
   scaffolding, testing, handing off, and evolving child agents.
2. **Control Center** - a local operator UI for monitoring agents, checking
   readiness, managing credentials, reviewing lifecycle state, and preparing
   operator-approved actions.
3. **Voice Control** - a hands-free realtime interface that can search Pritha
   memory, inspect project files, check Codex task status, process links and
   files, and route deeper work to Codex App or Codex CLI.

Pritha is designed for people who want more transparent and controllable agent
systems than a single monolithic assistant can usually provide. Instead of
giving one general agent unlimited context and broad tool access, Pritha helps
create focused child agents with explicit contracts, minimal required modules,
visible readiness checks, and narrow operational boundaries.

Each child agent can be attached to a real project, data folder, workflow, or
interface. Pritha tracks those agents through a registry and lifecycle reports,
so the operator can understand what exists, what changed, what is ready, what
is missing, and what requires approval.

## Core Principles

### 1. Child agents should be specific

Pritha treats a child agent as a dedicated working system, not just a prompt. A
child agent may include its own instructions, memory profile, interface
adapters, tool manifests, skills policy, operations manifest, smoke tests, and
handoff notes.

Specialized agents are easier to evaluate because their mission, tools, inputs,
outputs, and failure modes are narrower.

### 2. Every serious agent starts with a contract

Before a child agent is scaffolded, Pritha captures the mission, target user,
core functions, runtime family, interface, deployment target, memory model, tool
boundaries, secrets, readiness criteria, and operating rules in an
`agent-contract`.

The contract acts as a seed. The generated child agent becomes a descendant: it
inherits base safety rules and harness patterns, then mutates only where the
project needs it.

### 3. Knowledge is curated, not dumped

Pritha can accept links, text, files, transcripts, screenshots, and other input,
but raw material should not directly become trusted memory.

Useful material is reviewed, compared with existing knowledge, connected to
standards or decisions, and promoted only when it improves future
agent-building work. This keeps Pritha trainable without filling the memory
base with duplicated or low-value information.

### 4. Voice is an operator interface, not an unsafe shortcut

Voice Control is designed for hands-free operation, but durable actions still
pass through tool boundaries, task state, and approval gates.

Voice can ask questions, search memory, inspect files, prepare Codex tasks,
continue a task that is waiting for the operator, and send files or links into
a gated intake flow. It should not silently install services, write secrets,
deploy, delete, publish, or enable background processes.

### 5. Local-first by default

Pritha is designed to run locally. Long-running services, Tailscale access,
launchd jobs, credentials, hosted model calls, and other external capabilities
are optional and explicit.

## Current Capabilities

### Child-agent creation and evolution

Pritha can create a child-agent contract, research relevant Pritha memory,
scaffold a Git-ready project, run tests, generate lifecycle reports, and
rebuild the lineage registry.

Generated agents can include:

- `AGENTS.md` or runtime-native instructions.
- `README.md` and `.env.example`.
- Interface, memory, tool, skills, and operations manifests.
- Smoke and status scripts.
- Optional adapter placeholders or generated adapters selected by the contract.
- Handoff, operations, deployment, and post-creation reports.

### Control Center

Pritha Control Center is a local Next.js interface for operating Pritha and its
child agents.

It provides agent cards, version and lifecycle status, local or Tailscale URLs,
credentials readiness, restore and rollback planning surfaces, runtime status,
access settings, voice settings, music settings, maintenance actions, and
capability diagnostics.

### Voice Control

The Voice Control surface uses a realtime model for low-latency conversation
and a narrow set of server tools for real work.

It can:

- Search and read Pritha's curated memory.
- Inspect safe project files.
- Check Codex task status and progress.
- Recall a summary-only rolling handoff from previous voice work.
- Answer Codex clarification questions by voice.
- Process pasted text, links, screenshots, PDFs, audio, and other files through
  a confirmation gate.
- Search the public web through a local SearXNG backend.
- Route deeper research, review, implementation, and agent-creation work to
  Codex.

### Codex App and Codex CLI transport

Pritha can route deeper tasks through Codex App or Codex CLI. The Control
Center settings allow the operator to choose the primary transport, model,
reasoning level, service tier, sandbox policy, network access, task timeout,
prompt budget, planning mode, execution mode, and voice progress verbosity.

### Private device access

Pritha can expose the local Control Center to trusted devices through Tailscale
Serve. The local app remains bound to localhost, while Tailscale provides a
private HTTPS URL inside the tailnet. Public Funnel exposure is not enabled by
default.

### Visual and mobile-first interface work

The Control Center includes a mobile-oriented Voice screen, 2D voice-wave UI,
and a Three.js visual scene for realtime voice states. The interface is
designed to pair well with Codex App while keeping the operator in control.

## Knowledge and Self-Improvement

Pritha maintains a local, reviewable knowledge base for agent-building work.

Markdown artifacts are the source of truth. Rebuildable indexes provide search,
relations, and semantic lookup. New information can enter Pritha through links,
notes, files, voice intake, research reports, reviews, standards, decisions,
and lifecycle evidence from child agents.

The important rule is that Pritha improves through reviewable artifacts, not
through hidden self-modification. It can learn from new agent-engineering
patterns, open-source repositories, project reports, failed experiments, and
successful child-agent implementations, but those lessons must be curated
before they become reusable knowledge.

## Example Use Cases

- Build a project-specific research agent that watches a domain, reviews
  sources, and reports only useful changes.
- Attach a child agent to an existing codebase, dataset, or local workflow.
- Create a voice-first workbench for media, links, screenshots, PDFs, notes,
  and implementation tasks.
- Give a team a shared agent architecture where each role or workflow has its
  own constrained agent.
- Create educational agents, such as an interactive homework agent that teaches
  a student while testing understanding.
- Use Pritha as an operator console for several local child agents, each with
  its own readiness, credentials, memory, and lifecycle state.

## Status

Pritha is in active beta and user testing.

The current implementation is local-first and Codex-native. It has been
exercised on local Mac environments, with Tailscale-based access from trusted
peer devices such as phones and laptops. Hosted model calls, Realtime voice,
Tailscale Serve, Telegram adapters, GitHub publishing, launchd or service
installation, and other mutating operations require credentials or explicit
operator approval.

The repository also includes several small generated child agents. They are
useful as examples, test fixtures, and starting points for future development,
but they should not be treated as polished production agents.

## ⚠️ Security Notice (Experimental Software)

Pritha is in **active beta** and is **not hardened for untrusted environments**.
The Control Center is a **privileged local service**: it can execute code via
Codex, read project files, and manage credentials. Treat it like root on your
machine.

Use it safely:

- **Run on localhost only**, or behind **Tailscale with trusted devices** you
  own.
- **Do not** expose it via `0.0.0.0`, LAN, a public reverse proxy, or Tailscale
  Funnel.
- Keep it on a **single-user, trusted machine**. Anyone (or any web page in
  your browser, via CSRF/DNS-rebinding) that can reach the Control Center port
  may be able to trigger privileged actions.
- Secrets are stored **in plaintext locally** (`.env*`). Protect, encrypt, and
  back up your machine accordingly; never commit real secrets.
- Treat all links, files, transcripts, and voice input as **untrusted**: raw
  input must not directly drive tools, memory, or deployment.

Local-access hardening (request guard, host-binding lockdown) is tracked in the
Control Center security work; review it before exposing Pritha beyond
localhost. Report vulnerabilities privately per `SECURITY.md`.

## Roadmap

Near-term development focuses on:

- Simplifying the Pritha graphical UI.
- Improving the knowledge base around 2D and 3D UI patterns for agent
  interfaces.
- Expanding the voice-first Control Center workflow.
- Supporting additional coding-agent backends beyond Codex.
- Exploring local-model and hybrid runtime placement for selected task classes.
- Improving multi-user and team-oriented child-agent architectures.

## Quick Start

```sh
node scripts/bootstrap.mjs prepare --profile local
node scripts/pritha.mjs questions
node scripts/pritha.mjs test . --no-report
```

## Fresh Clone Bootstrap

Codex can run the setup for you. Download or clone this repository, open the
folder in Codex, and ask: `install this project`, `set up Pritha`, or
`deploy/run this project locally`. Codex should read the repository
instructions and run the needed bootstrap commands itself. The shell commands
below are the manual equivalent if you want to run setup directly.

```sh
git clone https://github.com/NumericalArt/Pritha.git pritha
cd pritha
node scripts/bootstrap.mjs prepare --profile local
node scripts/bootstrap.mjs --profile local --start control-center
```

The prepare command installs deterministic local dependencies for the chosen
profile, writes local non-secret setup state, rebuilds the generated SQLite index
and semantic embeddings from tracked Markdown, and verifies semantic memory
search. The optional Control Center start command runs in the foreground. It
does not install launchd, cron, Tailscale, durable services, or credentials.

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
that the live `/voice`, `/agents`, and `/settings` pages reference JavaScript
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

## Documentation

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Using Pritha](docs/pritha.md)
- [Memory](docs/memory.md)
- [Operations](docs/operations.md)
- [Instance Isolation And Fleet Rollout](docs/instance-isolation.md)
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
- Local machine paths.
- Telegram tokens or user identifiers.

For normal multi-instance operation, set an external `PRITHA_STATE_ROOT` and
keep instance paths, ports and secrets in `<state-root>/config/runtime.env`.
Use `node scripts/pritha-instance.mjs status --json` for one instance and
`node scripts/pritha-fleet.mjs status` for a local fleet.

Markdown artifacts are the source of truth. Generated memory indexes such as
`<state-root>/memory/techscope.sqlite`, SQL rebuild dumps, and embeddings are local
artifacts rebuilt by `node scripts/bootstrap.mjs prepare --profile local`; they
should not accumulate binary history in Git. Private user memory belongs
outside the tracked snapshot.

## License

MIT. See [LICENSE](LICENSE).
