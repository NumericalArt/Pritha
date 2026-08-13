# Getting Started

## Core: Start In Codex

The simplest path is to use Codex as the Pritha workbench and installer:

1. Download or clone the repository.
2. Open the project folder in Codex.
3. Say:

```text
Set up and start Pritha.
```

Codex reads `AGENTS.md` and the setup workflow, checks the environment, installs
the selected local dependencies, rebuilds local memory, and verifies that
Pritha is ready. You can then continue working with Pritha in the same Codex
task.

This core path does not require Control Center, Voice, Tailscale, Telegram, or
hosted-model credentials. It does not silently start a server or install a
background service.

Core is ready when bootstrap completes and local memory validation and semantic
search pass. Ask Codex to resolve any reported prerequisite rather than running
unrelated setup commands manually.

## Manual Core Setup

If you prefer the shell, clone Pritha and run the canonical bootstrap command:

```sh
git clone https://github.com/NumericalArt/Pritha.git pritha
cd pritha
node scripts/bootstrap.mjs prepare --profile local
```

The command installs the local profile dependencies, writes non-secret setup
state, rebuilds SQLite and embeddings from tracked Markdown, and verifies the
result. See [Prerequisites](prerequisites.md) for the supported Node.js, Python,
Git, and SQLite versions.

By default, local configuration is written to `.env.local` and non-secret setup
state to `.techscope-setup.json`; both are ignored by Git. When
`PRITHA_STATE_ROOT` is configured, generated and private runtime state belongs
under that external state root instead of the checkout.

Do not copy `.env.example` as a mandatory fresh-clone step. Real credentials are
optional and must remain local and untracked.

## Use Pritha

You can now work in natural language. For example:

```text
Create an agent that reviews research links and reports meaningful changes.
```

This starts the agent-contract interview. The CLI fallback is:

```sh
node scripts/pritha.mjs interview
```

Pritha records the mission, runtime, interfaces, memory, tools, permissions,
research requirements, tests, and operating boundaries before scaffolding a
production agent. Generated descendants are sibling projects resolved through
`PRITHA_AGENT_PARENT` or, for legacy compatibility, the checkout parent.

To add knowledge, put new material in `00_inbox/` or give it to Codex directly,
then ask Pritha to verify and turn it into a brief, assessment, review, decision,
or standard. Markdown remains the authored source of truth.

## Optional Functional UI And Voice

Control Center and its integrated Voice interface are active, functional
operator surfaces. They are optional because the full core workflow works in
Codex without them.

Prepare and start Control Center with:

```sh
node scripts/bootstrap.mjs --profile local --start control-center
```

This installs the locked UI dependencies when needed, verifies the selected
profile, and runs Control Center in the foreground on localhost. It does not
install launchd, cron, Tailscale, credentials, or another durable service.

The active routes include:

- `/agents` for child-agent state and actions;
- `/voice` for realtime Voice operation;
- `/settings` for local operator configuration;
- `/dev` for read-only diagnostics.

Some Voice capabilities use hosted realtime models and therefore require
explicit credentials and may incur provider costs. See [Realtime and
Voice](realtime.md) for readiness and privacy boundaries.

Verify a running UI from another terminal:

```sh
npm run control-center:health
```

## Optional Private-Device And External Access

`localhost` and `127.0.0.1` work only on the machine running Pritha. A localhost
URL or QR code will not open the service from a phone.

Use the separate [Tailscale Private Access](tailscale-private-access.md) workflow
for a trusted phone or laptop. Tailscale installation, authentication, Serve,
and every other mutating network action require explicit operator approval.
Public Funnel exposure and LAN binding are not supported defaults.

Telegram, hosted model calls, web integrations, deployment, and long-running
services are also opt-in surfaces. They are not part of core onboarding and
must follow their own credential, privacy, and approval policies.

## Bootstrap Profiles

- `minimal`: check prerequisites and authored/local memory without installing
  the full semantic profile.
- `local`: install portable local dependencies, rebuild SQLite and embeddings,
  and verify semantic memory and configured local tools.
- `control-center`: add locked Control Center dependencies, typecheck, and build.
- `control-center-tailscale`: detect Tailscale readiness only; it does not
  install Tailscale, authenticate, or configure Serve.

Useful read-only plans:

```sh
node scripts/bootstrap.mjs plan --profile minimal
node scripts/bootstrap.mjs plan --profile local
node scripts/bootstrap.mjs plan --profile control-center
```

## Verification And Help

```sh
node scripts/bootstrap.mjs verify --profile minimal
node scripts/pritha.mjs registry
node scripts/quality-gate.mjs
```

For setup failures, see [Troubleshooting](troubleshooting.md). For operational
status, private access, or service installation, follow [Operations](operations.md)
instead of enabling background processes ad hoc.
