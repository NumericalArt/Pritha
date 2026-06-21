# Getting Started

## Fresh Clone

Clone Pritha and run the bootstrap plan first:

```sh
git clone https://github.com/NumericalArt/Pritha.git pritha
cd pritha
node scripts/bootstrap.mjs plan --profile minimal
```

Then verify the minimal local environment:

```sh
node scripts/bootstrap.mjs verify --profile minimal
```

For the local Control Center:

```sh
node scripts/bootstrap.mjs --profile local --start control-center
```

Bootstrap writes local settings to `.env.local` and non-secret setup state to
`.techscope-setup.json`. Both are gitignored. The start command runs the
Control Center in the foreground and does not install a service.

## Bootstrap Profiles

- `minimal`: check Node.js, Git, Python, sqlite3 and authored memory.
- `local`: install portable Python dependencies and local setup state.
- `control-center`: install Control Center dependencies from lockfile, then
  typecheck and build the UI.
- `control-center-tailscale`: detect Tailscale readiness only. It does not
  install Tailscale, authenticate the device or configure Serve.

## Ready After Clone

Without secrets, Pritha can plan and verify setup, validate memory, create and
review agent contracts, inspect generated projects and run local tests. Control
Center works locally after the Control Center profile installs dependencies.

Optional credentials are still needed for hosted model calls, Realtime voice,
Telegram, GitHub publishing and any external service. Tailscale private access
and all durable services require separate explicit operator approval.

For private phone or laptop access through Tailscale, use the guided flow in
[Tailscale Private Access](tailscale-private-access.md).

## Create Your First Seed

Start with the interview outline:

```sh
node scripts/pritha.mjs questions
```

Then create a draft Seed:

```sh
node scripts/pritha.mjs create --name "research-agent" --mission "Track and review research links"
```

Review the generated file in `11_agents/contracts/`. Scaffold only from an
accepted contract after Pritha memory research has been performed.

## Scaffold a Descendant

```sh
node scripts/pritha.mjs create 11_agents/contracts/YYYY-MM-DD-research-agent-agent-contract.md --output ../research-agent
node scripts/pritha.mjs test ../research-agent
```

## Add Knowledge

Place new material in `00_inbox/`, then create a brief, assessment, decision or standard. Markdown carries the authored knowledge; `.memory/` carries the portable SQLite/embeddings snapshot.

## Verify

```sh
node scripts/bootstrap.mjs verify --profile minimal
node scripts/quality-gate.mjs
node scripts/pritha.mjs lineage
```
