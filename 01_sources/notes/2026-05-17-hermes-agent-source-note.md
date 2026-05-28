---
id: 2026-05-17-hermes-agent-source-note
type: source-note
status: processed
created: 2026-05-17
updated: 2026-05-17
topics: [hermes-agent, autonomous-agents, agent-architecture, memory, skills, toolsets, gateway, security, cron, mcp]
tools: [Hermes Agent, Nous Research, AGENTS.md, HERMES.md, SOUL.md, Agent Skills, MCP, SQLite, FTS5, Honcho, Atropos]
agent_platforms: [Hermes Agent]
model_context: [model-agnostic, Nous Portal, OpenRouter, OpenAI, Anthropic, Hugging Face, local endpoints]
runtime_environment: [cli, messaging-gateway, vps, docker, ssh, modal, daytona, vercel-sandbox, acp-ide, cron]
config_surfaces: [config.yaml, AGENTS.md, .hermes.md, HERMES.md, CLAUDE.md, SOUL.md, .cursorrules, skills, toolsets, mcp, plugins, memory-providers]
portability: adapter-needed
sources:
  - https://github.com/NousResearch/hermes-agent
  - https://api.github.com/repos/NousResearch/hermes-agent
  - https://github.com/NousResearch/hermes-agent/releases/tag/v2026.5.16
  - https://api.github.com/repos/NousResearch/hermes-agent/releases/latest
  - https://hermes-agent.nousresearch.com/docs/
  - https://hermes-agent.nousresearch.com/docs/developer-guide/architecture
  - https://hermes-agent.nousresearch.com/docs/user-guide/features/memory/
  - https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files/
  - https://hermes-agent.nousresearch.com/docs/user-guide/features/tools/
  - https://hermes-agent.nousresearch.com/docs/reference/toolsets-reference
  - https://hermes-agent.nousresearch.com/docs/reference/tools-reference/
  - https://hermes-agent.nousresearch.com/docs/skills
  - https://hermes-agent.nousresearch.com/docs/user-guide/security
  - https://www.clawxiv.org/abs/clawxiv.2604.00009
related:
  intakes:
    - 00_inbox/links/2026-05-17-hermes-agent-autonomous-agent-intake.md
  briefs:
    - 02_briefs/2026-05-17-hermes-agent-architecture-brief.md
  reviews:
    - 03_reviews/2026-05-17-hermes-agent-architecture-assessment.md
    - 03_reviews/2026-05-17-openclaw-agent-architecture-assessment.md
  standards:
    - 04_standards/agent-environment-compatibility.md
    - 04_standards/agent-tool-integration-selection.md
source_published: 2025-07-22
source_updated: 2026-05-17
source_version: Hermes Agent v0.14.0 v2026.5.16; docs observed 2026-05-17; GitHub API observed 2026-05-17
retrieved: 2026-05-17
verified: 2026-05-17
valid_for: Hermes Agent architecture snapshot as of 2026-05-17
temporal_status: current
---

# Source Note: Hermes Agent architecture snapshot

Date: 2026-05-17
Status: processed

## Source snapshot

- Project: NousResearch/hermes-agent
- Positioning: self-improving AI agent, long-running autonomous agent runtime.
- Repository created: 2025-07-22 via GitHub API.
- Latest release observed: Hermes Agent v0.14.0, tag `v2026.5.16`, published 2026-05-16.
- GitHub API observed 2026-05-17:
  - stars: 153,977
  - forks: 24,601
  - open issues: 11,741
  - default branch: `main`
  - license: MIT
  - primary language: Python
  - pushed_at: 2026-05-17T09:31:20Z
- GitHub README page observed 2026-05-17 showed 154k stars, 24.5k forks, 13 releases.

## Primary-source findings

- Hermes describes itself as a self-improving agent with a closed learning loop: agent-curated memory, autonomous skill creation, skills that improve during use, FTS5 session search and optional Honcho user modeling.
- It is model-agnostic: the README lists Nous Portal, OpenRouter, NovitaAI, NVIDIA NIM, Xiaomi MiMo, GLM, Kimi/Moonshot, MiniMax, Hugging Face, OpenAI and custom endpoints.
- It has multiple surfaces: CLI, messaging gateway, cron, API server, ACP/IDE integration, batch runner and Python library.
- The architecture centers on `AIAgent`, prompt builder, provider resolution, tool dispatch, session storage and tool backends.
- The docs list terminal backends such as local, Docker, SSH, Modal, Daytona, Singularity and Vercel Sandbox.
- Hermes uses SQLite + FTS5 for session storage/search and has bounded prompt memory via `MEMORY.md` and `USER.md`.
- Context files include `.hermes.md`/`HERMES.md`, `AGENTS.md`, `CLAUDE.md`, `SOUL.md`, `.cursorrules` and `.cursor/rules/*.mdc`, with a priority system and progressive subdirectory discovery.
- Toolsets are the primary mechanism for limiting tool availability per platform/session/task.
- Built-in tools cover browser, files, terminal, web, memory, session search, skills, cron, delegation, code execution, media and integrations. MCP tools can be dynamically loaded.
- The security guide describes defense-in-depth: user authorization, dangerous command approval, container isolation, MCP credential filtering, context-file scanning, cross-session isolation and input sanitization.

## Latest release findings: v0.14.0

Important v0.14.0 signals from the official release notes:

- Hermes is now installable with `pip install hermes-agent`.
- It added an OpenAI-compatible local proxy for OAuth-backed providers so tools such as Codex CLI, Aider, Cline and Continue can use an OpenAI-style endpoint.
- It added xAI/SuperGrok OAuth, X search, Microsoft Teams, LINE and SimpleX support.
- It introduced lighter installs through lazy dependencies and a supply-chain advisory checker.
- It improved browser CDP performance, cold-start performance, file-mutation verification and LSP semantic diagnostics after writes.
- It expanded plugin surfaces, MCP behavior and skills ecosystem.
- Security hardening includes sudo brute-force blocking, SSRF fetch path fixes, dashboard auth for plugin API routes, env/output redaction, less `shell=True`, supply-chain advisory checks and a rewritten security policy around OS-level isolation.

## Memory model

The official memory docs describe:

- `MEMORY.md`: agent personal notes, environment facts, conventions and things learned.
- `USER.md`: user preferences, communication style and expectations.
- Both are stored under `~/.hermes/memories/`.
- Memory is injected as a frozen system-prompt snapshot at session start to preserve prompt cache stability.
- Live updates persist to disk immediately but do not appear in the active system prompt until the next session.
- Session search uses SQLite/FTS5 and LLM summarization for past conversations.
- External memory providers include Honcho, OpenViking, Mem0, Hindsight, Holographic, RetainDB, ByteRover and Supermemory.

## Skills model

- Hermes supports agentskills.io-compatible skills.
- The Skills Hub page observed 2026-05-17 lists 689 skills across 4 registries: 87 built-in, 81 optional, 521 community.
- Built-in skills include `claude-code`, `codex`, `hermes-agent`, `opencode`, `kanban-orchestrator`, `kanban-worker`, GitHub workflow skills, browser/design/media skills and many others.
- Hermes positions skills as procedural memory: reusable task procedures loaded on demand instead of always-loaded prompt memory.
- The clawxiv paper "Skill Documents as Procedural Memory" argues for structured Markdown skills as compiled procedural memory and reports advantages over retrieving raw chat history. Treat it as useful supporting evidence, but not as independent production validation.

## Security model

Key official security points:

- Dangerous command approval defaults to manual and can be configured as manual, smart or off.
- YOLO mode disables approval prompts except for an always-on hardline blocklist.
- Gateway authorization defaults to deny unless allowlists or pairing are configured.
- DM pairing uses one-time pairing codes, TTL, rate limits and locked-down files.
- Context files are scanned for prompt injection, secret access, hidden HTML and invisible Unicode before being loaded.
- Production guidance says: explicit allowlists, container backend, resource limits, non-root gateway, controlled working directory, logs and regular updates.

## Comparison hooks for Techscope

- Hermes and OpenClaw both matter for long-running personal/autonomous agents, but Hermes puts unusually strong emphasis on self-improving skills, broad messaging gateway support, toolsets and memory providers.
- Hermes explicitly supports `AGENTS.md`, which makes it relevant to our Codex-first knowledge structure.
- Hermes' progressive subdirectory context discovery is a useful pattern for Techscope and future Codex projects.
- Hermes' bounded prompt memory + on-demand session search mirrors our own Markdown source-of-truth + SQLite/embedding derivative architecture.
- Hermes' autonomous skill creation is a strong research target, but must be evaluated carefully before adopting; self-modifying procedural memory can encode mistakes if review gates are weak.

## Source-quality notes

- Official GitHub/docs/release notes are strong primary evidence.
- Stars/forks/open issues should be treated as current snapshot metrics only; the project is moving extremely fast.
- Secondary posts claim unusually rapid growth and adoption. Use them as signal, not as ground truth.
- The repo has very high open issue/PR counts and massive release churn, which may indicate high adoption, automation-heavy development, or instability. This needs local evaluation before production reliance.
