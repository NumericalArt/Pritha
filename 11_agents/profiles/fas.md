---
id: fas-profile
type: child-agent-profile
status: active
created: 2026-06-22
updated: 2026-06-22
topics:
  - child-agent
  - realtime-voice
  - theater-demo
tools:
  - Codex
  - OpenAI Realtime API
  - Three.js
sources:
  - 11_agents/contracts/2026-06-22-fas-agent-contract.md
  - 11_agents/reports/2026-06-22-fas-scaffold-report.md
related:
  agent_contracts:
    - 11_agents/contracts/2026-06-22-fas-agent-contract.md
  scaffold_reports:
    - 11_agents/reports/2026-06-22-fas-scaffold-report.md
memory_domain: child-agents
memory_domains:
  - child-agents
subject:
  kind: child-agent
  id: FAS
privacy: public
retention: durable
review_status: active
confidence: high
---

# Child Agent Profile: FAS

- Name: FAS
- Folder: `/Users/jkl/FAS`
- Mission: local one-page theater scene demo with Three.js avatar and Realtime
  voice command dispatch.
- Runtime: local browser app plus Node API for Realtime ephemeral sessions.
- Interface: realtime-voice-ui with manual command fallback.
- Deployment: manual Control Center managed local web service; developer Vite
  mode remains separate.
- Proactivity: none.
- Secrets: `OPENAI_API_KEY` only through local environment or credential UI.
- Current readiness: scaffold and Control Center registration complete;
  Realtime pending operator credentials.
- Control Center URL: `http://127.0.0.1:4877`.
- Control mode: managed manual local web service; no autostart.
