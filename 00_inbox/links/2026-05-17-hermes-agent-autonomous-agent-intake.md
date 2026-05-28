---
id: 2026-05-17-hermes-agent-autonomous-agent-intake
type: intake
status: processed
created: 2026-05-17
updated: 2026-05-17
topics: [hermes-agent, autonomous-agents, agent-architecture, memory, skills, mcp, gateway, automation]
tools: [Hermes Agent, Nous Research, AGENTS.md, HERMES.md, SOUL.md, Agent Skills, MCP, SQLite, FTS5, Honcho]
agent_platforms: [Hermes Agent]
model_context: [model-agnostic, Nous Portal, OpenRouter, OpenAI, Anthropic, Hugging Face, local endpoints]
runtime_environment: [cli, messaging-gateway, vps, docker, ssh, modal, daytona, vercel-sandbox, acp-ide, cron]
config_surfaces: [config.yaml, AGENTS.md, .hermes.md, HERMES.md, CLAUDE.md, SOUL.md, .cursorrules, skills, toolsets, mcp, plugins, memory-providers]
portability: adapter-needed
source_type: link
source_url: https://github.com/NousResearch/hermes-agent
source_published: 2025-07-22
source_updated: 2026-05-17
source_version: Hermes Agent v0.14.0 v2026.5.16; docs observed 2026-05-17; GitHub API observed 2026-05-17
retrieved: 2026-05-17
verified: 2026-05-17
temporal_status: current
sources:
  - https://github.com/NousResearch/hermes-agent
  - https://hermes-agent.nousresearch.com/docs/
related:
  notes:
    - 01_sources/notes/2026-05-17-hermes-agent-source-note.md
  briefs:
    - 02_briefs/2026-05-17-hermes-agent-architecture-brief.md
  reviews:
    - 03_reviews/2026-05-17-hermes-agent-architecture-assessment.md
  standards:
    - 04_standards/agent-environment-compatibility.md
    - 04_standards/agent-tool-integration-selection.md
---

# Intake: hermes-agent-autonomous-agent

Date added: 2026-05-17
Type: link
Source: https://github.com/NousResearch/hermes-agent
Source published: 2025-07-22
Source updated: 2026-05-17
Source version: Hermes Agent v0.14.0 v2026.5.16; docs observed 2026-05-17; GitHub API observed 2026-05-17
Retrieved: 2026-05-17
Verified: 2026-05-17
Temporal status: current
Status: processed

## Why this may matter

Hermes Agent appears to be one of the important open-source autonomous agent runtimes in 2026. It is architecturally relevant for Techscope because it combines long-running gateway operation, persistent memory, procedural skills, toolsets, scheduling, MCP, subagents, multiple terminal backends and messaging surfaces.

## Raw material or link

- GitHub: https://github.com/NousResearch/hermes-agent
- Docs: https://hermes-agent.nousresearch.com/docs/
- Latest release: https://github.com/NousResearch/hermes-agent/releases/tag/v2026.5.16

## Initial questions

- What architectural patterns should Techscope extract from Hermes?
- How does Hermes differ from OpenClaw, Codex and Claude Code?
- Which Hermes ideas are portable to our Codex-first setup?
- Which claims are marketing and need local verification?
- Is Hermes worth a local experiment on Mac mini/VPS?

## Expected output

brief | assessment | experiment
