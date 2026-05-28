---
id: 2026-05-26-funny-teacher-launchd-deployment-report
type: agent-deployment-report
status: complete
created: 2026-05-26
updated: 2026-05-26
topics:
  - agent-engineering
  - funny-teacher
  - launchd
  - tailscale
  - deployment
tools:
  - launchd
  - Tailscale Serve
  - Next.js
agent_platforms:
  - Codex
runtime_environment:
  - local-project
  - mac
  - launchd
  - tailscale
config_surfaces:
  - operations/manifest.json
  - scripts/deploy-service.mjs
  - ~/Library/LaunchAgents/com.local.funny-teacher.plist
portability: adapter-needed
sources:
  - 11_agents/contracts/2026-05-25-funny-teacher-agent-contract.md
  - 11_agents/reports/2026-05-25-funny-teacher-agent-scaffold-report.md
  - 11_agents/reports/2026-05-25-funny-teacher-agent-deployment-report.md
related:
  agent_contracts:
    - 11_agents/contracts/2026-05-25-funny-teacher-agent-contract.md
  reports:
    - 11_agents/reports/2026-05-25-funny-teacher-agent-scaffold-report.md
    - 11_agents/reports/2026-05-25-funny-teacher-agent-deployment-report.md
supersedes:
  - 11_agents/reports/2026-05-25-funny-teacher-agent-deployment-report.md
superseded_by: []
freshness_status: current
source_published: 2026-05-26
source_updated: 2026-05-26
source_version: Funny Teacher launchd service v1
retrieved: 2026-05-26
verified: 2026-05-26
valid_for: persistent local service for Funny Teacher v1
temporal_status: current
---

# Agent Deployment Report: Funny Teacher Launchd Service

Date: 2026-05-26
Status: complete

## Summary

Funny Teacher was moved from a manually held `npm run dev` process to a normal launchd-backed production service.

This avoids the repeated failure mode where Tailscale Serve remains configured but returns `502` because nothing is listening on local upstream port `3033`.

## Service

- LaunchAgent label: `com.local.funny-teacher`
- Plist path: `~/Library/LaunchAgents/com.local.funny-teacher.plist`
- Working directory: `<SIBLING_AGENT_ROOT>/FunnyTeacher`
- Program: `<USER_HOME>/.local/bin/npm run start`
- Port: `3033`
- Local URL: `http://127.0.0.1:3033`
- Tailscale URL: `https://ivans-mac-mini.tail691439.ts.net:3034`
- Logs:
  - `<SIBLING_AGENT_ROOT>/FunnyTeacher/logs/launchd.out.log`
  - `<SIBLING_AGENT_ROOT>/FunnyTeacher/logs/launchd.err.log`
- Restart policy: launchd `KeepAlive=true`

## Commands

In `<SIBLING_AGENT_ROOT>/FunnyTeacher`:

```sh
npm run deploy:plan
npm run deploy:status
npm run deploy:install
npm run deploy:uninstall
```

## Verification

| Check | Result |
| --- | --- |
| `npm test` | pass |
| `npm run build` | pass |
| `npm run deploy:install` | pass |
| `npm run deploy:status` | service loaded and running |
| `curl http://127.0.0.1:3033/api/health` | `voiceConfigured: true` |
| `curl https://ivans-mac-mini.tail691439.ts.net:3034/api/health` | `voiceConfigured: true` |
| Tailscale URL page | HTTP 200 |

## Notes

Tailscale Serve was already configured and remains the HTTPS access layer. Launchd now owns the upstream app process, so the user should no longer need to ask Codex to restart the dev server after a session ends.
