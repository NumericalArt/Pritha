---
id: 2026-06-23-fas-tailscale-control-center-routing-report
type: agent-operations-report
status: complete
created: 2026-06-23
updated: 2026-06-23
topics:
  - child-agent
  - fas
  - control-center
  - tailscale
  - routing
  - nextjs
tools:
  - Codex
  - Pritha Control Center
  - Tailscale
  - Tailscale Serve
  - Next.js
  - Playwright
agent_platforms:
  - Pritha Control Center
  - Codex
model_context:
  - Codex thread investigation
runtime_environment:
  - local macOS workspace
  - Pritha repository
  - sibling FAS runtime
config_surfaces:
  - interfaces/control-center/src/lib/access-mode.ts
  - interfaces/control-center/src/lib/control-center/server.ts
  - /Users/jkl/FAS/operations/manifest.json
  - tailscale serve status
  - interfaces/control-center/.next
portability: environment-specific
sources:
  - user report and screenshot: 2026-06-23
  - 11_agents/contracts/2026-06-22-fas-agent-contract.md
  - 11_agents/profiles/fas.md
  - 11_agents/reports/2026-06-22-fas-control-center-url-source-of-truth-report.md
  - 03_reviews/2026-06-23-fas-tailscale.md
  - 04_standards/tailscale-private-device-access-for-local-agents.md
related:
  agent_contracts:
    - 11_agents/contracts/2026-06-22-fas-agent-contract.md
  profiles:
    - 11_agents/profiles/fas.md
  reports:
    - 11_agents/reports/2026-06-22-fas-control-center-url-source-of-truth-report.md
    - 11_agents/reports/2026-06-23-fas-tailscale-serve-deployment-report.md
  reviews:
    - 03_reviews/2026-06-23-fas-tailscale.md
  standards:
    - 04_standards/tailscale-private-device-access-for-local-agents.md
supersedes:
  - 03_reviews/2026-06-23-fas-tailscale.md
superseded_by: []
freshness_status: current
source_published: 2026-06-23
source_updated: 2026-06-23
source_version: Pritha Control Center 0.1.0, Next.js 16.2.7, Tailscale 1.98.1
retrieved: 2026-06-23
verified: 2026-06-23
valid_for: Pritha Control Center child-agent URL routing as of 2026-06-23
temporal_status: current
memory_domain: child-agents
memory_domains:
  - child-agents
  - pritha-self
  - agent-building-knowledge
subject:
  kind: child-agent
  id: FAS
privacy: internal
retention: durable
review_status: complete
confidence: high
---

# FAS Tailscale And Control Center Routing Report

Date: 2026-06-23
Status: complete investigation and code fixes; FAS Tailscale Serve was approved and applied in the follow-up deployment report.

## Summary

- Project path: `/Users/jkl/Pritha`, sibling runtime `/Users/jkl/FAS`.
- Classification: Control Center child-agent routing and private-device access.
- Deployment target: local Mac with optional trusted Tailscale access.
- Service mode: manual Control Center managed local web service.
- Autostart: unchanged, disabled for FAS.
- Proactive mode: unchanged, none/manual.
- Result: Control Center no longer invents child-agent Tailscale URLs. It derives child-agent Tailscale URLs from actual `tailscale serve status --json` state, and the active Control Center server was rebuilt and restarted so HTML and chunks match.
- Follow-up UI result: active managed web-service agents keep the management action as the primary button. `Stop Plan` remains primary for active agents; opening the served URL stays in the secondary URL row.

## Findings

FAS local runtime was healthy. `http://127.0.0.1:8787/api/health` returned HTTP 200, and `npm --prefix /Users/jkl/FAS run healthcheck --silent` passed.

FAS was not published through Tailscale Serve. The host Serve state had handlers for Control Center and neighboring agents, but no handler proxying `http://127.0.0.1:8787`. FAS also had a placeholder `tailscale_public_url` in its operations manifest, so Control Center could not safely treat that as a real peer URL.

Neighboring agents worked because their local upstreams were present in actual Tailscale Serve state. After the fix, Control Center reports served URLs for FESPA26 and Funny Teacher from the real Serve proxy map, not from a hard-coded tailnet hostname.

The white `This page couldn't load` screen was caused by a stale Next.js production runtime/build mismatch. The running `next start` process referenced a JavaScript chunk that no longer existed on disk, so the chunk request returned HTTP 500. Rebuilding and restarting Control Center aligned the server bundle with `.next/static/chunks`.

The follow-up green `Open` primary button was a UI regression from the routing fix. The card had been changed to promote active `web_service` agents to a primary open link. That made Tailscale access more visible, but it violated the operator model: active managed agents need `Stop Plan` as the primary control, with URL opening as a secondary action.

## Changes

- Updated `interfaces/control-center/src/lib/access-mode.ts` so Tailscale mode returns a child agent URL only when the agent has a provided Tailscale URL. It no longer rewrites `127.0.0.1:<agent-port>` to `<tailscale-host>:<agent-port>`.
- Updated `interfaces/control-center/src/lib/control-center/server.ts` to read `tailscale serve status --json` and derive child-agent Tailscale URLs only when actual Serve state proxies the agent local upstream.
- Updated Control Center access-mode and Playwright regressions so tests reject invented Tailscale child-agent URLs.
- Updated `interfaces/control-center/src/components/agents/AgentCard.tsx` so active managed web services no longer replace `Stop Plan` with a primary `Open` link.
- Updated `tests/control-center-access-mode.test.mjs` to lock the primary management action and keep URL opening in the URL row.
- Rebuilt `interfaces/control-center` and restarted the existing local `next start` on `127.0.0.1:3420`.

## Checks

| Check | Result | Notes |
| --- | --- | --- |
| FAS local health | passed | `GET http://127.0.0.1:8787/api/health` returned HTTP 200. |
| FAS healthcheck | passed | `npm --prefix /Users/jkl/FAS run healthcheck --silent`. |
| Tailscale status | passed | Installed, authenticated, Control Center Serve configured; peer phone access still requires user-side check. |
| FAS Serve mapping | passed after approval | Follow-up deployment configured `8787 -> http://127.0.0.1:8787`; real host recorded only as `<TAILSCALE_HOST>`. |
| FESPA26/Funny Teacher Serve mapping | passed | Control Center derives served URLs from actual Serve state. |
| Control Center build | passed | `npm --prefix interfaces/control-center run build`. |
| Control Center restart | passed | New `next start` PID written to private runtime state; `/api/health` returned HTTP 200. |
| Control Center chunk health | passed | `npm run control-center:health`, 3 pages and 14 chunks checked. |
| Browser smoke | passed | Playwright opened `/agents`, `/voice`, `/agents`; visible error page was absent. |
| Targeted e2e | passed | Served child-agent Tailscale URL and mobile `Stop Plan` primary-action tests passed. |
| Mobile AgentCard UI | passed | FAS mobile primary action is `Stop Plan`, no primary `Open` link is present, URL open remains in the URL row. |
| Full explicit unit sweep | passed | `node --test --test-concurrency=1 tests/*.test.mjs tests/**/*.test.mjs`, 123/123 passed. |
| Self-test | passed | `node scripts/self-test.mjs`; live UI passed, queue failed jobs 0, stale items 2. |

## Current Operator State

Control Center is running locally at:

```text
http://127.0.0.1:3420
```

FAS is running locally at:

```text
http://127.0.0.1:8787
```

FAS is served through Tailscale on the same private host placeholder used by Control Center:

```text
https://<TAILSCALE_HOST>:8787
```

## Peer Verification Step

The mutating Tailscale Serve command was run only after explicit user approval and is recorded in `11_agents/reports/2026-06-23-fas-tailscale-serve-deployment-report.md`. Host-local checks passed. Final peer access remains unverified until the iPhone or another trusted Tailscale peer opens:

```text
https://<TAILSCALE_HOST>:8787
```

Host-local status is not enough to mark peer access verified.

## Decision

Do not use synthetic Tailscale URL rewriting for local child agents. A child-agent Tailscale link is ready only when Control Center can derive it from actual Serve state or, as a fallback when Serve state is unavailable, from a validated `https://*.ts.net` declaration. This keeps Control Center from showing broken links and makes the FAS issue a visible operations state instead of a hidden routing bug.
