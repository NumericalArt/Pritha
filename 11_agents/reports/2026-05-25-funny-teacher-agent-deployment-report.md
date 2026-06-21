---
id: 2026-05-25-funny-teacher-agent-deployment-report
type: agent-deployment-report
status: complete
created: 2026-05-25
updated: 2026-05-25
topics:
  - agent-engineering
  - funny-teacher
  - tailscale
  - deployment
  - voice-agents
tools:
  - Tailscale Serve
  - Next.js
  - OpenAI Realtime API
agent_platforms:
  - Codex
runtime_environment:
  - local-project
  - mac
  - tailscale
config_surfaces:
  - operations/manifest.json
  - .env.local
  - scripts/tailscale-serve.mjs
portability: adapter-needed
sources:
  - 11_agents/contracts/2026-05-25-funny-teacher-agent-contract.md
  - 11_agents/reports/2026-05-25-funny-teacher-agent-scaffold-report.md
related:
  agent_contracts:
    - 11_agents/contracts/2026-05-25-funny-teacher-agent-contract.md
  reports:
    - 11_agents/reports/2026-05-25-funny-teacher-agent-scaffold-report.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-25
source_updated: 2026-05-25
source_version: Funny Teacher Tailscale Serve setup v1
retrieved: 2026-05-25
verified: 2026-05-25
valid_for: trusted tailnet access to Funny Teacher v1
temporal_status: current
---

# Agent Deployment Report: Funny Teacher Tailscale Access

Date: 2026-05-25
Status: complete

## Summary

Funny Teacher now follows the FESPA26 access pattern: local Next.js upstream plus Tailscale HTTPS proxy for phone/MacBook access inside the trusted tailnet.

## Deployment Surface

- Local upstream: `http://127.0.0.1:3033`
- Tailscale HTTPS URL: `https://<TAILSCALE_HOST>:3034`
- Proxy command: `tailscale serve --bg --https=3034 http://127.0.0.1:3033`
- Service mode: manual
- Autostart: disabled
- Network boundary: trusted Tailscale network only

## Implemented In Funny Teacher

- Updated `operations/manifest.json` with Tailscale URL and proxy command.
- Added `scripts/tailscale-serve.mjs`.
- Added npm commands:
  - `npm run tailscale:serve`
  - `npm run tailscale:status`
- Updated `.env.local` machine-specific URL values without exposing secrets.
- Updated README and operator guide.

## Verification

| Check | Result |
| --- | --- |
| `npm run smoke` | pass |
| `npm run tailscale:serve` | pass |
| `curl -I https://<TAILSCALE_HOST>:3034` | HTTP/2 200 |
| `curl https://<TAILSCALE_HOST>:3034/api/health` | `voiceConfigured: true` |
| `npm run operations` | shows local upstream and Tailscale proxy |

## Notes

Tailscale HTTPS is the preferred phone URL because browser microphone permissions require a secure context. Authentication is not implemented in Funny Teacher v1, so the app must remain inside the trusted tailnet.
