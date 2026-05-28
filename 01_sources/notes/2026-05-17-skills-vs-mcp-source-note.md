---
id: 2026-05-17-skills-vs-mcp-source-note
type: source-note
status: processed
created: 2026-05-17
updated: 2026-05-17
topics: [agent-skills, mcp, coding-agents, context-engineering, tool-use, security]
tools: [Agent Skills, MCP, Codex, Claude Code, Playwright, GitHub CLI, OpenAI Docs MCP, Shell tool]
sources:
  - https://www.youtube.com/watch?v=6PA0lcAQgYI
  - 01_sources/raw/youtube-6PA0lcAQgYI/6PA0lcAQgYI-whisper-small.md
  - https://agentskills.io/home
  - https://github.com/openai/skills
  - https://developers.openai.com/learn/docs-mcp
  - https://developers.openai.com/api/docs/guides/tools-shell
  - https://modelcontextprotocol.io/specification/2025-06-18
related:
  intakes:
    - 00_inbox/links/2026-05-17-youtube-skills-vs-mcp-agent-tooling-intake.md
  briefs:
    - 02_briefs/2026-05-17-skills-vs-mcp-agent-tooling-brief.md
  reviews:
    - 03_reviews/2026-05-17-skills-vs-mcp-agent-tooling-assessment.md
---

# Source Note: Skills vs MCP for agent tooling

Date: 2026-05-17
Status: processed

## Source snapshot

- Video: "Skills убили MCP - правда или миф?"
- Channel: Alexey Andreevsky
- URL: https://www.youtube.com/watch?v=6PA0lcAQgYI
- Upload date observed via `yt-dlp`: 2026-05-12
- Duration: 24:22
- Local transcript produced with `mlx-community/whisper-small-mlx`, language `ru`.

## Primary-source checks

- Agent Skills docs describe skills as folders with `SKILL.md`, optional scripts/references/assets, and progressive disclosure: discovery, activation, execution.
- OpenAI's skills repository is an official Codex skills catalog; system skills are automatically installed in latest Codex, while curated/experimental skills can be installed with `$skill-installer`.
- OpenAI Docs MCP page shows OpenAI itself offering a documentation MCP server and recommending pairing it with an OpenAI Docs skill.
- OpenAI Shell tool docs confirm the broader pattern: local or hosted shell can be a first-class agent capability, but arbitrary command execution requires sandboxing, allowlists/denylists and logging.
- MCP 2025-06-18 specification defines MCP as a JSON-RPC based protocol for sharing context, exposing tools and building composable integrations; server features include resources, prompts and tools, while security guidance emphasizes consent, data privacy and tool safety.

## Extracted source claims

- MCP and Skills are not the same abstraction layer.
- MCP is primarily useful for connecting agents to external services, resources and tools through a standardized protocol.
- Skills are primarily useful for describing how an agent should perform a task, including how to use bundled scripts, local CLIs or existing tools.
- Skills reduce context pressure through progressive disclosure: minimal metadata first, full instructions only when relevant, extra files only as needed.
- MCP context overhead was a serious pain point, but modern clients increasingly mitigate it through lazy/tool search patterns.
- Some MCP use cases can be replaced by skills: browser automation, document/file workflows, local CLI operations, public APIs without auth, team workflows and internal scripts.
- MCP remains appropriate for OAuth/refresh-token flows, centralized team integrations, caching/rate-limit management, governance/logging layers and API-mode agents that cannot rely on local skill execution.
- Skills and MCP can be combined: MCP provides access, skills define the process for using that access.

## Source-quality notes

- The video is a secondary explanatory source, but highly relevant as a practical decision frame.
- The core conceptual claims are consistent with primary docs for Agent Skills, OpenAI Codex skills, OpenAI Docs MCP and the MCP specification.
- Numerical token estimates from the video should be treated as directional examples, not stable facts.
- The source is strong enough for a brief and assessment. A standard should additionally test several real integrations in Techscope/Codex.

