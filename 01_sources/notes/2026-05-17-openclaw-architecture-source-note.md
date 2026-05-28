---
id: 2026-05-17-openclaw-architecture-source-note
type: source-note
status: processed
created: 2026-05-17
updated: 2026-05-17
topics: [openclaw, autonomous-agents, gateway, agent-runtime, multi-agent-routing, sandboxing, memory]
tools: [OpenClaw, Node.js, WebSocket, Docker, Tailscale, grammY, Playwright, SQLite, MCP, ACP]
sources:
  - https://github.com/openclaw/openclaw
  - https://raw.githubusercontent.com/openclaw/openclaw/main/README.md
  - https://raw.githubusercontent.com/openclaw/openclaw/main/docs/concepts/architecture.md
  - https://raw.githubusercontent.com/openclaw/openclaw/main/docs/concepts/agent.md
  - https://raw.githubusercontent.com/openclaw/openclaw/main/docs/concepts/agent-loop.md
  - https://raw.githubusercontent.com/openclaw/openclaw/main/docs/concepts/multi-agent.md
  - https://raw.githubusercontent.com/openclaw/openclaw/main/docs/concepts/active-memory.md
  - https://raw.githubusercontent.com/openclaw/openclaw/main/docs/gateway/sandboxing.md
  - https://raw.githubusercontent.com/openclaw/openclaw/main/SECURITY.md
  - https://registry.npmjs.org/openclaw/latest
  - https://api.npmjs.org/downloads/point/last-month/openclaw
related:
  intakes:
    - 00_inbox/links/2026-05-17-openclaw-autonomous-agent-architecture-intake.md
  briefs:
    - 02_briefs/2026-05-17-openclaw-personal-agent-architecture-brief.md
  reviews:
    - 03_reviews/2026-05-17-openclaw-agent-architecture-assessment.md
---

# Source Note: OpenClaw architecture primary-source snapshot

Date: 2026-05-17
Status: processed

## Identity

The user asked for "OpenClow". Primary-source search points to **OpenClaw** as the likely intended project.

OpenClaw describes itself as a personal AI assistant that runs on the user's own devices and answers through existing channels. Its public README frames the Gateway as a control plane, while the assistant is the user-facing product.

## Freshness snapshot

- GitHub repository: `openclaw/openclaw`
- GitHub API observed on 2026-05-17:
  - created: 2025-11-24
  - pushed: 2026-05-17
  - language: TypeScript
  - license: MIT
  - stars: 372511
  - forks: 77202
  - open issues: 6916
- npm package from repository `package.json` on main:
  - version: 2026.5.17
  - Node engine: `>=22.16.0`
  - package manager: `pnpm@11.1.0`
- npm downloads API:
  - 4226707 downloads from 2026-04-17 through 2026-05-16

These popularity numbers are useful adoption signals, but they are not evidence of correctness, safety or architectural fit.

## Primary documents checked

- README: product scope, install path, supported channels, security defaults.
- Gateway architecture: single long-lived Gateway, WebSocket protocol, pairing, remote access.
- Agent runtime: workspace contract, bootstrap files, session store, skills and tools.
- Agent loop: intake, context assembly, model inference, tool execution, streaming, persistence, queues and hooks.
- Multi-agent routing: isolated agents, per-agent workspace/state/session/auth and deterministic channel bindings.
- Active memory: optional blocking memory sub-agent that runs before the main reply.
- Sandboxing: optional Docker/SSH/OpenShell backends for tool execution and browser isolation.
- SECURITY.md: explicit trusted-operator model and out-of-scope assumptions.

## Extracted architectural facts

- OpenClaw uses a **single Gateway daemon** as the long-lived control plane for messaging surfaces, clients, nodes, events and agent runs.
- Control clients and device nodes connect to the Gateway over WebSocket; the default bind target is local loopback on port `18789`.
- The first WebSocket frame must be a connect handshake. Later frames are typed requests, responses and events.
- Side-effecting methods require idempotency keys so clients can retry without duplicate sends or duplicate agent runs.
- Device pairing is part of the trust path. Local loopback can be smoother, while non-local connects require explicit approval.
- The embedded agent runtime uses a workspace as cwd and injects workspace files such as `AGENTS.md`, `SOUL.md`, `TOOLS.md`, `IDENTITY.md` and `USER.md` into prompt context.
- Sessions are persisted as JSONL under per-agent directories.
- The agent loop is serialized per session and optionally globally, which prevents concurrent tool/session races.
- Hooks and plugins can intercept model selection, prompt assembly, replies, tool calls, compaction, install, message receive/send and gateway/session lifecycle.
- Multi-agent routing treats each agent as a scoped brain with its own workspace, state directory, auth profiles and session store.
- Routing bindings map channel/account/peer/guild/team identifiers to agents, with most-specific match winning.
- Active memory is a bounded pre-reply recall pass, implemented as a plugin-owned memory sub-agent.
- Sandboxing is optional. If disabled, tools run on the host. If enabled, Docker is the default backend, with SSH and OpenShell also supported.
- Security docs explicitly say OpenClaw is local-first infrastructure for trusted operators, not a multi-tenant adversarial boundary.

## Source-quality notes

- Strong evidence: official README, repository metadata, docs and security policy.
- Moderate evidence: npm registry and npm downloads API.
- Weak/ignored evidence for this pass: SEO articles, news articles, mirrors and secondary explainers. These may be useful later only for ecosystem perception or security controversy review.

