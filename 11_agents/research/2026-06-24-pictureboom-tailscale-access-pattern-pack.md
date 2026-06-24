---
id: 2026-06-24-pictureboom-tailscale-access-pattern-pack
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
  - Pritha
sources:
  - 04_standards/tailscale-private-device-access-for-local-agents.md
  - docs/tailscale-private-access.md
  - scripts/tailscale-setup.mjs
  - 11_agents/reports/2026-06-23-fas-tailscale-control-center-routing-report.md
  - 11_agents/reports/2026-06-23-fas-tailscale-serve-deployment-report.md
  - /Users/jkl/FAS/operations/manifest.json
  - /Users/jkl/FESPA26/operations/manifest.json
  - /Users/jkl/FunnyTeacher/operations/manifest.json
  - /Users/jkl/StupidJoke/operations/manifest.json
  - /Users/jkl/PictureBoom/operations/manifest.json
related:
  standards:
    - 04_standards/tailscale-private-device-access-for-local-agents.md
  workflows:
    - docs/tailscale-private-access.md
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
pattern_pack_status: complete
semantic_memory_status: complete
semantic_failure_log: none
external_research_seed_count: 1
redaction_status: real-tailscale-identifiers-omitted
verified: pending
---

# Agent Pattern Pack: PictureBoom Tailscale Access

Date: 2026-06-24
Status: draft

## Task Basis

Enable PictureBoom private Tailscale access by analogy with sibling local
agents. Keep the local app bound to `127.0.0.1:3724`, avoid deployment,
autostart, launchd, cron, Funnel, auth-key and unrelated infrastructure
changes, and verify local readiness before any approved Serve action.

## Memory Coverage

- FTS search: `node scripts/query-memory.mjs search "Tailscale Serve local agent operations manifest"`.
- Tool/domain retrieval: `node scripts/query-memory.mjs by-tool Tailscale` and
  `node scripts/query-memory.mjs by-domain child-agents`.
- Semantic search: `node scripts/query-memory.mjs semantic "Tailscale Serve local agent PictureBoom FAS operations manifest"`.
- Semantic status: complete; top matches included FAS Tailscale reviews,
  PictureBoom research, FAS contract/profile, and FAS Tailscale routing report.
- Semantic failure log: none.

## Selected Patterns

### pattern-01: Tailscale private access standard

- Source: `04_standards/tailscale-private-device-access-for-local-agents.md`
- Kind: normative standard.
- Applicability: high.
- Pattern: keep the upstream app on `127.0.0.1:<local-port>` and use
  Tailscale Serve for private HTTPS access inside the trusted tailnet.
- Constraints: no Funnel by default, no auth keys in v1 scaffolds, no service
  install/autostart without explicit approval, and peer-device access is the
  acceptance check.

### pattern-02: Pritha Tailscale workflow

- Source: `docs/tailscale-private-access.md`
- Kind: operator workflow.
- Applicability: high.
- Pattern: read-only commands first; `install`, `serve`, `off`, `tailscale up`,
  auth-key work, Funnel, launchd and cron need explicit operator approval.
- Implementation implication: PictureBoom should use the generic helper with
  `--app pictureboom --port 3724 --health-path /api/health`.

### pattern-03: FAS optional trusted-tailnet metadata

- Source: `/Users/jkl/FAS/operations/manifest.json`
- Kind: sibling operations pattern.
- Applicability: high.
- Pattern: manual local runtime, autostart disabled, local upstream URL,
  placeholder Tailscale URL metadata, and a non-secret proxy command shape.
- Fit for PictureBoom: strong. PictureBoom is also a local manual web agent and
  should mirror this lightweight metadata shape instead of adding a new service.

### pattern-04: FESPA26 Tailscale Serve shape

- Source: `/Users/jkl/FESPA26/operations/manifest.json`
- Kind: sibling operations pattern.
- Applicability: medium.
- Pattern: a local app behind Tailscale Serve with a trusted-device HTTPS URL.
- Fit for PictureBoom: confirms the proxy architecture, but voice/microphone
  and production-preview details are not needed.

### pattern-05: FunnyTeacher persistent service is not the default fit

- Source: `/Users/jkl/FunnyTeacher/operations/manifest.json`
- Kind: sibling operations counter-pattern.
- Applicability: medium as a boundary.
- Pattern: launchd service plus Tailscale Serve helper scripts.
- Fit for PictureBoom: do not copy launchd, autostart, recovery scripts or
  persistent service behavior because the operator requested minimal changes
  and no deployment/infrastructure expansion.

### pattern-06: StupidJoke no-Tailscale baseline

- Source: `/Users/jkl/StupidJoke/operations/manifest.json`
- Kind: sibling negative example.
- Applicability: medium.
- Pattern: a local Control Center agent can remain local-only unless Tailscale
  access is explicitly selected.
- Fit for PictureBoom: the new metadata should be intentional and scoped, not
  treated as a default for all descendants.

## External Research Seeds

- Tailscale Serve CLI syntax and status behavior.

Current-source browsing is not required before the next local implementation
step because Pritha already has an active standard and workflow verified on
2026-06-23, and the implementation should still validate the host CLI through
read-only status commands before any Serve action. Recheck official docs only
if host CLI output contradicts the stored standard.

## Recommended Minimal PictureBoom Delta

- Add FAS-style non-secret Tailscale metadata to
  `/Users/jkl/PictureBoom/operations/manifest.json`:
  - optional trusted Tailscale access in `deployment_target`;
  - placeholder `tailscale_public_url`, for example
    `https://tailscale-host.invalid:3724`;
  - `tailscale_proxy_command`:
    `tailscale serve --bg --https=3724 http://127.0.0.1:3724`;
  - `network_policy` explaining local-first behavior and explicit operator
    approval for Serve.
- Optionally add a short README/operations note if needed by the local
  convention.
- Do not change `service_mode`, `autostart`, launchd, cron, deploy scripts,
  credentials, secrets, Funnel, auth keys, or unrelated sibling projects.

## Verification Pattern

1. Run PictureBoom local checks.
2. Run Pritha read-only Tailscale helper checks for PictureBoom.
3. If Serve is required and the exact command matches the operator-approved
   shape, run only that private Serve command.
4. Confirm local Tailscale status with real identifiers redacted.
5. Treat peer-device opening of the private URL as the final acceptance check.
