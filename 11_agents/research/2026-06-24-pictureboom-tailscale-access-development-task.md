---
id: 2026-06-24-pictureboom-tailscale-access-development-task
type: review
status: draft
created: 2026-06-24
updated: 2026-06-24
topics:
  - agent-engineering
  - agent-improvement
  - tailscale
  - private-access
  - pictureboom
tools:
  - Tailscale
  - Tailscale Serve
  - Pritha Voice Control
sources:
  - 11_agents/research/2026-06-24-pictureboom-tailscale-access-pattern-pack.md
  - 04_standards/tailscale-private-device-access-for-local-agents.md
  - docs/tailscale-private-access.md
  - scripts/tailscale-setup.mjs
  - /Users/jkl/PictureBoom/operations/manifest.json
related:
  pattern_packs:
    - 11_agents/research/2026-06-24-pictureboom-tailscale-access-pattern-pack.md
supersedes: []
superseded_by: []
memory_domain: child-agents
memory_domains:
  - agent-building-knowledge
  - pritha-self
  - child-agents
subject:
  kind: agent
  id: pictureboom
privacy: internal
retention: durable
review_status: draft
confidence: high
development_task_type: improve
target_project: /Users/jkl/PictureBoom
pattern_pack: 11_agents/research/2026-06-24-pictureboom-tailscale-access-pattern-pack.md
pattern_research_status: complete
semantic_memory_status: complete
semantic_failure_log: none
memory_research_status: complete
external_research_status: not-required-for-next-step
synthesis_status: complete
redaction_status: real-tailscale-identifiers-omitted
verified: pending
---

# Agent Development Task: PictureBoom Tailscale Access

Date: 2026-06-24
Status: draft

## Operator Task

Check how Tailscale access is implemented in sibling agents and enable
PictureBoom access through Tailscale by analogy. Keep changes minimal, do not
touch deployment or extra infrastructure, and verify local Tailscale readiness.

## Research Gate

This is an existing PictureBoom child-agent improvement that touches operations
and network boundary metadata. The required research gate is satisfied for the
next implementation step by:

- Pattern pack:
  `11_agents/research/2026-06-24-pictureboom-tailscale-access-pattern-pack.md`.
- FTS/domain memory retrieval: complete.
- Semantic/embedding search: complete.
- Semantic failure log: none.
- External research: not required before the next local implementation step
  because Pritha's Tailscale standard/workflow were verified on 2026-06-23 and
  the implementation will validate the host CLI through read-only status
  commands before any approved Serve action.

The helper command was attempted:

```sh
node scripts/pritha.mjs improve /Users/jkl/PictureBoom --task "<task>"
```

It failed before creating artifacts with a local CLI path argument error. This
manual brief and pattern pack provide the equivalent Codex-readable gate for
the scoped change.

## Current PictureBoom State

- Project: `/Users/jkl/PictureBoom`.
- Runtime: local manual web feed.
- Local upstream: `http://127.0.0.1:3724`.
- Health endpoint: `http://127.0.0.1:3724/api/health`.
- Runtime manager: screen through `scripts/control-center-runtime.mjs`.
- Service mode: manual.
- Autostart: disabled.
- Current Tailscale metadata: not declared.

## Implementation Scope

Allowed PictureBoom-only changes:

- `/Users/jkl/PictureBoom/operations/manifest.json`
  - Add non-secret optional Tailscale metadata and network policy.
  - Preserve `service_mode: manual` and `autostart: disabled`.
- `/Users/jkl/PictureBoom/README.md` or a small operations note
  - Only if needed to document the existing local-first/private-tailnet access
    command shape.
- Focused tests/status checks
  - Only if needed to guard placeholder URL/proxy command and no public/Funnel
    configuration.

Forbidden changes:

- Do not enable launchd, cron, autostart, deployment or long-running services.
- Do not run `tailscale up`, auth-key commands, Funnel, install, or off.
- Do not commit real Tailscale hostnames, tailnet names, device names, auth
  keys or private URLs.
- Do not modify sibling agents.
- Do not change PictureBoom web feed storage or image inbox behavior.

## Intended Serve Shape

Use a placeholder in tracked files:

```text
https://tailscale-host.invalid:3724 -> http://127.0.0.1:3724
```

Approved command shape if read-only checks prove Serve is needed:

```sh
tailscale serve --bg --https=3724 http://127.0.0.1:3724
```

Pritha helper shape for read-only checks and gated Serve:

```sh
node scripts/tailscale-setup.mjs plan --app pictureboom --port 3724 --health-path /api/health
node scripts/tailscale-setup.mjs status --app pictureboom --port 3724 --health-path /api/health --json
node scripts/tailscale-setup.mjs auth-status --app pictureboom --port 3724 --health-path /api/health
node scripts/tailscale-setup.mjs serve --app pictureboom --port 3724 --health-path /api/health --yes
```

The `serve --yes` command is allowed only when it is the exact command needed
for this PictureBoom task and after read-only checks confirm local health,
Tailscale installation and authentication.

## Verification Plan

1. Inspect local PictureBoom operations status.
2. Run PictureBoom tests or health checks after file edits.
3. Run read-only Pritha Tailscale status commands with real identifiers
   redacted from reports.
4. If needed, run only the approved private Serve command.
5. Verify `serve_configured` and local upstream health.
6. Ask the operator to open the private URL from a trusted peer device; host
   self-access alone is not full acceptance.

## Next Step

Proceed to read-only Tailscale status checks before editing PictureBoom
operations metadata.
