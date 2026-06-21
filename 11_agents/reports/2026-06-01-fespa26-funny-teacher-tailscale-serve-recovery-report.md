---
id: 2026-06-01-fespa26-funny-teacher-tailscale-serve-recovery-report
type: agent-operations-report
status: complete
created: 2026-06-01
updated: 2026-06-01
topics:
  - agent-engineering
  - tailscale
  - fespa26
  - funny-teacher
  - local-agent-operations
tools:
  - Tailscale
  - Tailscale Serve
  - Next.js
  - launchd
agent_platforms:
  - Codex
runtime_environment:
  - mac-mini
  - tailnet
  - mobile-browser
  - laptop-browser
config_surfaces:
  - tailscale serve
  - launchd service
  - local Next.js upstreams
portability: environment-specific
sources:
  - 04_standards/tailscale-private-device-access-for-local-agents.md
  - 11_agents/reports/2026-05-26-funny-teacher-launchd-deployment-report.md
  - 11_agents/reports/2026-05-30-fespa26-voice-control-pattern-ingestion-report.md
related:
  standards:
    - 04_standards/tailscale-private-device-access-for-local-agents.md
    - 04_standards/realtime-voice-control-ui.md
  reports:
    - 11_agents/reports/2026-05-26-funny-teacher-launchd-deployment-report.md
    - 11_agents/reports/2026-05-30-fespa26-voice-control-pattern-ingestion-report.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-01
source_updated: 2026-06-01
source_version: FESPA26 and Funny Teacher local Tailscale Serve state on 2026-06-01
retrieved: 2026-06-01
verified: 2026-06-01
valid_for: local mac mini operator setup using Tailscale Serve for trusted tailnet devices
temporal_status: version-bound
---

# Agent Operations Report: FESPA26 and Funny Teacher Tailscale Serve Recovery

Date: 2026-06-01
Status: complete

## Summary

FESPA26 and Funny Teacher were restored to a stable shared Tailscale Serve state on the mac mini.

The recovery sequence deliberately restored the known-good FESPA26 voice service first, then added Funny Teacher as a separate HTTPS mapping. This avoided mixing application debugging with Tailscale Serve debugging.

## Final State

| Service | Tailscale URL | Tailscale upstream | Local upstream | Status |
| --- | --- | --- | --- | --- |
| FESPA26 voice | `https://<TAILSCALE_HOST>:3026/voice` | `3026` | `http://127.0.0.1:3027` | restored and user-verified |
| Funny Teacher | `https://<TAILSCALE_HOST>:3034/` | `3034` | `http://127.0.0.1:3033` | restored and user-verified |

Current `tailscale serve status` shape:

```text
https://<TAILSCALE_HOST>:3026 (tailnet only)
|-- / proxy http://127.0.0.1:3027

https://<TAILSCALE_HOST>:3034 (tailnet only)
|-- / proxy http://127.0.0.1:3033
```

## Incident Notes

- FESPA26 remained the reference service and project files were not changed.
- Funny Teacher had local Next.js/headers adjustments before the final Serve recovery, but the cross-device failure was diagnosed at the Tailscale Serve/daemon layer rather than at the application layer.
- The mac mini could open self-referential Tailscale URLs while MacBook and iPhone could not. That hairpin success was not sufficient evidence of peer access.
- `tailscale ping` to MacBook and iPhone worked, so the tailnet itself was alive.
- Resetting Serve and restarting Tailscale on the mac mini restored peer access.

## Verification

| Check | Result | Notes |
| --- | --- | --- |
| FESPA26 local health | pass | `http://127.0.0.1:3027/api/health` returned `ok: true` |
| FESPA26 Tailscale health | pass | `https://<TAILSCALE_HOST>:3026/api/health` returned `ok: true` |
| Funny Teacher local health | pass | `http://127.0.0.1:3033/api/health` returned `ok: true`, `voiceConfigured: true` |
| Funny Teacher Tailscale health | pass | `https://<TAILSCALE_HOST>:3034/api/health` returned `ok: true`, `voiceConfigured: true` |
| MacBook access | pass | User confirmed after recovery |
| iPhone access | pass | User confirmed after recovery |

## Recovery Pattern

When multiple local agents share Tailscale Serve:

1. Preserve the known-good reference service and do not edit its project files during network diagnosis.
2. Reset Tailscale Serve to the smallest needed mapping.
3. Verify local upstream health.
4. Verify tailnet URL from the host, while remembering that host self-access is not enough.
5. If peers still cannot open the service but `tailscale ping` works, restart Tailscale on the host and reapply Serve mappings.
6. Add additional services one at a time on separate HTTPS ports.
7. Record the final `tailscale serve status` shape.

## Commands

Reference command shape used for the stable state:

```sh
tailscale serve reset
tailscale serve --bg --https=3026 http://127.0.0.1:3027
tailscale serve --bg --https=3034 http://127.0.0.1:3033
tailscale serve status
```

When peer access is stuck even though local health and `tailscale ping` are good:

```sh
tailscale down
sleep 3
tailscale up
tailscale serve --bg --https=3026 http://127.0.0.1:3027
tailscale serve --bg --https=3034 http://127.0.0.1:3033
```

## Lessons

- Tailscale URL success from the host can be a misleading hairpin check; always confirm from the target device when mobile/laptop access matters.
- Restore the reference service before adding a second service.
- Keep each agent on a separate Tailscale HTTPS port to avoid path and cache ambiguity.
- Use health endpoints for each upstream before judging browser UI behavior.

