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

For a new autonomous contract, the interview displays the default build-token
budget of `1,000,000` and asks the user to confirm it or enter another positive
JavaScript-safe integer. A non-interactive contract remains `pending` unless
both `--build-token-budget` and `--token-budget-confirmed-by user` are supplied.
An accepted autonomous contract cannot enter delivery while that confirmation
is pending; legacy accepted contracts without these fields use `1,000,000`.

## Approve And Deliver An Outcome

The agent contract describes architecture and operating boundaries. The Outcome
Spec separately describes the result the user must receive, its non-goals,
examples, demonstration, and Trials. Each document has its own review and
approval; accepting one never accepts the other.

Use the canonical sequence:

```sh
node scripts/pritha.mjs outcome init <accepted-contract-path>
node scripts/pritha.mjs outcome approve <outcome-spec-path> --approved-by user
node scripts/pritha.mjs deliver <outcome-spec-path> --project <clean-git-project>
node scripts/pritha.mjs delivery status <run-id>
node scripts/pritha.mjs delivery accept <run-id> --accepted-by user
```

`deliver` requires a clean Git project. It creates a disposable worktree on an
exact `pritha/build-*` branch and leaves the active checkout unchanged. The
approved Trials and their verifier inputs are host-owned; the implementation
executor cannot rewrite them. Trial evidence is bound to the live Outcome Spec,
contract fingerprint, Git revisions, workspace state, and execution result.
Changing the approved outcome makes earlier evidence stale.

`verified` means automated Trials passed. `awaiting_acceptance` means an
operator-judged Trial or demonstration remains. Only
`delivery accept --accepted-by user` records `accepted`; none of these states
implicitly merge, push, or deploy the worktree.

If Pritha cannot safely continue, it records a typed blocker with bounded answer
options. For example, when the installed Codex runtime lacks Goal support, the
user may choose to upgrade and retry, authorize one turn with
`--answer continue-without-goal --answered-by user`, or abandon the run. The
model cannot grant that waiver. A completed turn whose Goal usage cannot be read
blocks all further iterations until the run is inspected or abandoned.

Plan worktree cleanup before applying it:

```sh
node scripts/pritha.mjs delivery cleanup <run-id>
node scripts/pritha.mjs delivery cleanup <run-id> --apply --yes
```

Clean terminal worktrees can be removed without force. Dirty worktrees stay in
place with `cleanup_required`; verified and awaiting-acceptance worktrees are
preserved. Branches and verified checkpoints are never deleted by cleanup.

A local Trial backend runs on the trusted host and does not prove sandbox
isolation. If the accepted contract requires isolation, delivery blocks before
command execution unless the selected backend probe confirms it.

## Instance-Local Child Agents

Every Pritha instance owns its own child-agent contracts, Outcome Specs,
research, reports, profiles, registry, and sibling-agent directory. With
`PRITHA_STATE_ROOT`, authored live artifacts are stored only in
`<PRITHA_STATE_ROOT>/agents/`; the compatibility fallback is the ignored
`.private/agents/`. `PRITHA_AGENT_PARENT` limits discovery and creation to that
instance's sibling-agent directory.

Live child-agent state is not committed to GitHub, promoted directly into
tracked `11_agents/`, migrated from tracked history, or copied between Pritha
instances. Reusable learning must be rewritten as an anonymized assessment,
standard, decision, or workflow and reviewed separately.

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
