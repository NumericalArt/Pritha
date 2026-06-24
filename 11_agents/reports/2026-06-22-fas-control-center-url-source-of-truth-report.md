---
id: fas-control-center-url-source-of-truth-report
type: agent-operations-report
status: complete
created: 2026-06-22
updated: 2026-06-22
topics:
  - child-agent
  - control-center
  - local-runtime
tools:
  - Codex
  - Node.js
  - Pritha Control Center
sources:
  - 11_agents/contracts/2026-06-22-fas-agent-contract.md
  - 11_agents/profiles/fas.md
  - /Users/jkl/FAS/operations/manifest.json
  - /Users/jkl/FAS/README.md
  - /Users/jkl/FAS/docs/handoff.md
  - /Users/jkl/FAS/docs/test-plan.md
related:
  agent_contracts:
    - 11_agents/contracts/2026-06-22-fas-agent-contract.md
  profiles:
    - 11_agents/profiles/fas.md
  reports:
    - 11_agents/reports/2026-06-22-fas-control-center-integration-report.md
supersedes: []
superseded_by: []
memory_domain: child-agents
memory_domains:
  - child-agents
subject:
  kind: child-agent
  id: FAS
privacy: public
retention: durable
review_status: complete
confidence: high
---

# FAS Control Center URL Source Of Truth Report

## Summary

FAS now treats `/Users/jkl/FAS/operations/manifest.json` as the source of truth
for its Control Center managed URL.

- Managed URL: `http://127.0.0.1:8787`.
- Health URL: `http://127.0.0.1:8787/api/health`.
- Service mode remains `manual`.
- Autostart remains `disabled`.
- No launchd, cron, durable service install or deployment action was added.

## Changes

- Updated FAS runtime startup to derive the managed origin, host, port and
  health endpoint from `operations/manifest.json`.
- Updated FAS healthcheck to validate that `local_upstream_url`,
  `health_url`, runtime health URL and start readiness URL are consistent.
- Updated README, handoff, test plan and acceptance criteria so the operator
  path opens the managed URL from the manifest.
- Updated the active Pritha FAS profile so deployment language matches the
  managed manual Control Center mode.

## Verification

| Check | Result | Detail |
| --- | --- | --- |
| FAS syntax | passed | `npm run syntax --silent` |
| FAS healthcheck | passed | URL consistency and docs check passed |
| FAS smoke | passed | assets, syntax and healthcheck passed |
| Control Center stop | passed | `STOP fas` stopped the managed runtime |
| Control Center start | passed | `START fas` returned running with HTTP 200 readiness |
| Health endpoint | passed | `GET http://127.0.0.1:8787/api/health` returned HTTP 200 |
| App shell | passed | `HEAD http://127.0.0.1:8787/` returned HTTP 200 |
| Control Center status | passed | FAS reported `web_service`, active, manual, autostart disabled |

## Operator State

The managed FAS runtime was left running after verification so the operator can
open `http://127.0.0.1:8787`. Stop it through Pritha Control Center or with:

```sh
cd /Users/jkl/FAS
npm run control-center:stop
```
