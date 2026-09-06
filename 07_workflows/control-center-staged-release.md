---
id: control-center-staged-release
type: workflow
status: active
created: 2026-08-27
updated: 2026-09-06
topics:
  - control-center
  - staged-release
  - rollback
  - launchd
  - fleet
tools:
  - Git
  - Node.js
  - Next.js
  - launchd
sources:
  - source-operator-approved-control-center-reliability-plan-2026-08-27
related:
  standards:
    - 04_standards/control-center-runtime-reliability.md
    - 04_standards/pritha-good-state-alignment.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-08-27
source_updated: 2026-09-06
source_version: control-center-staged-release-v2; required page/chunk and build-identity gate
retrieved: 2026-08-27
verified: 2026-09-06
valid_for: Pritha Control Center production and fleet releases
temporal_status: current
memory_domain: pritha-self
memory_domains:
  - pritha-self
  - governance
subject:
  kind: workflow
  id: control-center-staged-release
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Workflow: Control Center Staged Release

## Read-only preparation

1. Run Good State Alignment for the affected Control Center surfaces.
2. Preserve unrelated or unfinished work; do not reset the working tree.
3. Verify the target commit, checkout/state isolation and private fleet
   manifest.
4. Inspect each service without mutation:

```sh
node scripts/control-center-runtime.mjs plan
node scripts/control-center-runtime.mjs status --json
node scripts/pritha-fleet.mjs rollout --target-sha <full-commit> --json
```

The fleet command loads the primary `runtime.env`, pins one full commit and
orders instances as `main`, `dasha`, `sasha`, `marina`.

## Per-instance release transaction

`scripts/pritha-instance.mjs update --apply --yes` performs one bounded
transaction after the separate lifecycle approval exists:

1. fetch and fast-forward only to the pinned commit;
2. rebuild instance-local dependencies and memory and compare isolation
   fingerprints;
3. build `.next-pritha-staging` without touching the live `.next`;
4. verify type/build artifacts and the post-build Git invariant;
5. boot out only the manager-verified instance service;
6. atomically swap staged and live builds;
7. start the launchd service;
8. validate health-v2 identity, exact target commit and staged `BUILD_ID`, then
   `/voice`, `/agents`, `/task-chat`, `/codex`, `/settings` and every referenced
   same-origin JavaScript chunk; HTML without chunks is a failure;
9. re-check Git and instance isolation;
10. remove the displaced build only after all checks pass.

If any check fails, boot out the current service, restore the displaced build
and previous private service state, restart that instance, verify rollback
health, and stop fleet progression. Instances later in the order remain
untouched.

The private release receipt records candidate and previous build IDs plus the
complete strict health result. Rollback health checks the previous build ID,
instance, pages and chunks. It does not confuse the checkout's current Git HEAD
with the identity of the restored compiled build. A missing build ID is detected
before stopping the service. An unconfirmed managed stop still prevents swapping
or restoring files under a live process.

### Bounded release timeouts

The single policy source is `scripts/lib/timeout-policy.mjs`. Both the updater
and `control-center-health.mjs` use its request policy. All overrides are whole
milliseconds; invalid, fractional, negative, empty or out-of-range values fail
before update mutations. Overrides are invocation-scoped unless the operator
explicitly saves an environment change.

| Environment override | Default | Allowed range | Scope |
| --- | ---: | ---: | --- |
| `PRITHA_UPDATE_HEALTH_TIMEOUT_MS` | 45000 | 100–300000 | Readiness polling after start |
| `PRITHA_UPDATE_ROLLBACK_HEALTH_TIMEOUT_MS` | 30000 | 100–300000 | Readiness polling after rollback |
| `PRITHA_UPDATE_HEALTH_REQUEST_TIMEOUT_MS` | 8000 | 50–60000 | Each HTTP request, including strict pages/chunks |
| `PRITHA_UPDATE_STRICT_HEALTH_TIMEOUT_MS` | 180000 | 100–600000 | Whole strict checker process per build |

Readiness requests and poll delays are capped by the remaining readiness
deadline. Once ready, strict verification has its separate total deadline and
is terminated with SIGKILL on expiry. A failed strict check causes rollback;
there is no continuous watchdog, automatic restart loop or unlimited retry.

Before strict page checks, the updater makes one bounded `/api/status` warmup
request and records its timing. Warmup does not replace exact identity, page or
chunk checks. API and SSR share pending status reads and a short instance-scoped
cache; mutation flows still request fresh identity. A slower host may select a
larger bounded invocation profile, which must be recorded in its release receipt
and followed by a warm-page latency check. Do not change global defaults merely
to make one cold release pass.

## Apply approval boundary

Generating code, tests, plans and status reports does not authorize launchd
mutation. Immediately before the first real service action, obtain explicit
operator approval. Only then may these commands be used:

```sh
node scripts/control-center-runtime.mjs install --yes
node scripts/control-center-runtime.mjs start --yes
node scripts/control-center-runtime.mjs stop --yes
node scripts/control-center-runtime.mjs restart --yes
node scripts/control-center-runtime.mjs uninstall --yes
```

If launchd exits the wrapper before a stubborn child stops, the runtime
manager rechecks the unchanged instance record, exact child process group and
working directory before forcing that owned group to exit. A foreign listener
or changed ownership still prevents both termination and a build swap. The
private lifecycle log records `manager-forced-stop`.

Do not modify legacy `com.techscope.web` or Telegram jobs as part of this
workflow. Do not add cron, heartbeat, a network health watchdog, Funnel or
public exposure.

## First manager adoption

`install --yes` fails closed with `owner_mismatch` when the configured port is
already held by a process that has no valid manager state. It must not install
or load a competing launchd job.

For a one-time transition from an old terminal-launched Control Center, collect
read-only evidence for the exact listener PID, process group, Control Center
working directory, configured port and the checkout root reported by the old
`/api/status`. Stopping that exact verified legacy process group requires a
separate immediate operator approval. A port number by itself is never enough.
After it exits, confirm that the port is free, install the new instance service,
and continue the staged transaction. This migration exception does not become
a supported production lifecycle path.

## Release gates

Before apply and again after a successful instance/fleet release, require:

```text
typecheck
production build
unit tests
targeted Playwright desktop/mobile
privacy audit
strict Control Center health including /codex
self-test
fleet status
git diff --check
```

Peer access remains unverified until the updated private URL is opened from a
trusted Tailscale peer. Do not write that real URL or device identity into a
tracked report.
