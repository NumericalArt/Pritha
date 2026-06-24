---
id: 2026-06-23-fas-tailscale-serve-deployment-report
type: agent-deployment-report
status: complete
created: 2026-06-23
updated: 2026-06-23
topics:
  - child-agent
  - fas
  - tailscale
  - private-access
  - deployment
tools:
  - Tailscale
  - Tailscale Serve
  - Pritha Control Center
  - Playwright
sources:
  - user approval: 2026-06-23 tailscale serve command
  - 11_agents/reports/2026-06-23-fas-tailscale-control-center-routing-report.md
  - /Users/jkl/FAS/operations/manifest.json
related:
  agent_contracts:
    - 11_agents/contracts/2026-06-22-fas-agent-contract.md
  profiles:
    - 11_agents/profiles/fas.md
  reports:
    - 11_agents/reports/2026-06-23-fas-tailscale-control-center-routing-report.md
  standards:
    - 04_standards/tailscale-private-device-access-for-local-agents.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-23
source_updated: 2026-06-23
source_version: FAS Tailscale Serve deployment 2026-06-23
retrieved: 2026-06-23
verified: 2026-06-23
valid_for: FAS private Tailscale Serve access on the current host until Serve config changes
temporal_status: current
memory_domain: child-agents
memory_domains:
  - child-agents
  - pritha-self
subject:
  kind: child-agent
  id: FAS
privacy: internal
retention: durable
review_status: complete
confidence: high
---

# FAS Tailscale Serve Deployment Report

Date: 2026-06-23
Status: complete

## Summary

- Project path: `/Users/jkl/FAS`
- Deployment target: local Mac private tailnet access.
- Deployment action: Tailscale Serve HTTPS proxy for FAS.
- Local upstream: `http://127.0.0.1:8787`
- Tailscale endpoint: `https://<TAILSCALE_HOST>:8787`
- Autostart: unchanged, FAS autostart remains disabled.
- Public exposure: none; Tailscale Funnel was not enabled.
- Result: FAS is now published through Tailscale Serve and Pritha Control Center reports a served FAS Tailscale URL.

## Approved Action

The operator explicitly approved and Codex executed:

```sh
tailscale serve --yes --bg --https=8787 http://127.0.0.1:8787
```

Disable command:

```sh
tailscale serve --https=8787 off
```

## Verification

| Check | Result | Notes |
| --- | --- | --- |
| Serve command | passed | Tailscale reported proxy `https://<TAILSCALE_HOST>:8787/ -> http://127.0.0.1:8787`. |
| Serve status | passed | `tailscale serve status --json` includes HTTPS `8787` and proxy target `http://127.0.0.1:8787`. |
| FAS local health | passed | `GET http://127.0.0.1:8787/api/health` returned HTTP 200. |
| FAS healthcheck | passed | `npm --prefix /Users/jkl/FAS run healthcheck --silent`. |
| Control Center status | passed | FAS reports local URL and Tailscale URL, state `alive`, activity `active`. |
| Tailscale HTTPS hairpin | passed | `GET https://<TAILSCALE_HOST>:8787/api/health` returned HTTP 200 from the host. |
| Control Center health | passed | `npm run control-center:health`. |
| Control Center e2e | passed | Served child-agent Tailscale URL regression passed. |
| iPhone peer access | pending user verification | Must be opened from the iPhone or another trusted peer device. |

## Notes

This report intentionally uses `<TAILSCALE_HOST>` instead of the real Tailscale hostname. Real tailnet hostnames, device names and auth keys must not be stored in tracked reports or memory.

The deployment did not modify FAS source files, install launchd, enable cron, write secrets or expose the service publicly.
