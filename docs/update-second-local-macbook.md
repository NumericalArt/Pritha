---
id: update-second-local-macbook
type: workflow
status: prepared-release-pending
created: 2026-09-05
updated: 2026-09-05
topics: [macbook, staged-release, task-chat, fleet]
tools: [Pritha, Codex, Git]
sources: [operator-approved-task-chat-roadmap-2026-09-04]
related:
  workflows: [07_workflows/task-chat-evolution-roadmap.md, 07_workflows/control-center-staged-release.md]
  standards: [04_standards/control-center-codex-chat-api-contract.md]
supersedes: []
superseded_by: []
memory_domain: pritha-self
subject:
  kind: workflow
  id: update-second-local-macbook
privacy: public
retention: durable
review_status: reviewed
confidence: high
---

# Update the local MacBook to a tested Pritha release

Run this procedure on the MacBook itself. It replaces the former raw terminal
start/build procedure. Use the MacBook's own saved runtime environment and
managed Control Center service. Private history, attachments, credentials,
memory, queues and sibling agents are never copied from another machine.

## Select the release

Obtain the full 40-character commit from the current release report. Task Chat
source anchors are A `79ee5a403f813f483768850213481f7433cc1609`,
B `a1fd2faa54817fa847307f0738d51236eaa25739`, and
C `854a4203c7241bc274e6a12ebaca7265d80faf7e` (includes the attachment
implementation, transfer documentation and typed test fixture correction).
These are implementation anchors, not claims of fleet deployment. Use the
actual published, accepted release target from the coordinator.

The current updater deliberately requires the pinned target to equal
`origin/main`. Do not bypass this check, force a reset, or substitute a newer
commit silently. The operator authorized one integrated A/B/C + memory + Settings release on
2026-09-05. Use its recorded cumulative target and perform the same local
migration/recovery checks; the feature commits remain review anchors.

## Prepare without touching the running service

Identify the running checkout and state-root from the verified manager's saved
service configuration. An old study checkout may coexist on the same MacBook;
do not update it merely because its name contains Pritha. From the running
checkout in a fresh terminal, set only the verified local paths (never paste
another machine's paths):

```sh
export TECHSCOPE_ROOT="$PWD"
export PRITHA_STATE_ROOT="<verified-instance-state-root>"
export PRITHA_CONTROL_CENTER_ENV_FILE="$PRITHA_STATE_ROOT/config/runtime.env"
```

The memory commands load the external runtime.env through PRITHA_STATE_ROOT;
setting only PRITHA_CONTROL_CENTER_ENV_FILE is insufficient for every script.
Inspect the branch, uncommitted changes and remote. Preserve any local work; do not automatically stash another task's
changes. Resolve divergence before update. Run:

```sh
git status --short --branch
git log -3 --oneline
node scripts/good-state-alignment.mjs --scope "Task Chat and Control Center" --limit 3
node scripts/control-center-runtime.mjs plan
node scripts/control-center-runtime.mjs status --json
node scripts/pritha-instance.mjs update --plan --expected-commit <full-release-commit> --json
```

Check local state-root, instance ID, agent parent, port, manager ownership and
available disk space against the MacBook's private runtime configuration.
Use placeholders in shared reports. If the service is unmanaged or missing,
follow the first-manager-adoption section of
`07_workflows/control-center-staged-release.md`; never kill a port owner blindly.

Before applying, record the old commit/build and privately back up the Task Chat
registry and migration metadata, plus the native history store according to
local backup policy. Preserve attachment originals. The updater's build rollback
does not substitute for a history backup. Do not copy live state over a newer
registry after users have resumed work.

## Managed update

Prepare the exact target and checks in an isolated worktree if needed; never
overwrite the running checkout's live build during preparation. Immediately
before the lifecycle transaction, obtain the operator's explicit approval.
Then, with the local instance environment already resolved:

```sh
node scripts/pritha-instance.mjs update --apply --yes --expected-commit <full-release-commit> --json
```

The transaction fetches and fast-forwards only, rebuilds local dependencies and
memory, verifies state isolation, builds a separate staging directory, uses the
manager to switch builds, verifies health, and restores the displaced build on
failure. Stop at the first failure. Do not launch production with
`npm run start`, use raw process kills, or modify Tailscale/Telegram services.

## Verify locally and from the trusted device

```sh
node --test tests/control-center-chat-evolution.test.mjs tests/control-center-codex-chat.test.mjs tests/control-center-settings-numbers.test.mjs
npm --prefix interfaces/control-center run typecheck
node scripts/privacy-audit.mjs --strict
node scripts/self-test.mjs
node scripts/control-center-runtime.mjs status --json
node scripts/control-center-health.mjs --strict --port <local-port> --page /codex,/task-chat,/settings --json
git status --short --branch
git rev-parse HEAD
```

Strict health checks page JavaScript chunks as well as the health endpoint.
Check the returned release identity matches the target. Open a known old chat
read-only; use Restore access only when its original is verified. Check Voice
history, Archive/Restore, full Markdown copy, original upload/download and an
attachment-only draft. Verify the selected model's capabilities. Use synthetic
files for any live model test and never replay historical prompts.

Open the instance's own private URL from a trusted phone/peer for real mobile
clipboard, file picker and network access. A desktop viewport test is not a
claim that this device check passed. Record commit, build, checks, permitted
warnings and rollback outcome privately where they reveal local identifiers.
Leave the previous service/build recovery artifacts until acceptance.
