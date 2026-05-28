---
id: 2026-05-17-cli-vs-mcp-tool-selection-source-note
type: source-note
status: processed
created: 2026-05-17
updated: 2026-05-17
topics: [mcp, cli, coding-agents, tool-use, context-engineering, authentication, governance]
tools: [MCP, CLI, Git, GitHub MCP Server, curl, grep, cat, Fetcher MCP]
sources:
  - https://www.youtube.com/watch?v=g9JIUM0MHgQ
  - 01_sources/raw/youtube-g9JIUM0MHgQ/g9JIUM0MHgQ-whisper-small.md
  - https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
  - https://modelcontextprotocol.io/specification/draft/basic/authorization
  - https://github.com/github/github-mcp-server
  - https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/configure-toolsets
  - https://www.ibm.com/think/topics/model-context-protocol
related:
  intakes:
    - 00_inbox/links/2026-05-17-youtube-cli-vs-mcp-tool-selection-intake.md
  briefs:
    - 02_briefs/2026-05-17-cli-vs-mcp-tool-selection-brief.md
  reviews:
    - 03_reviews/2026-05-17-cli-vs-mcp-tool-selection-assessment.md
  standards:
    - 04_standards/agent-tool-integration-selection.md
source_published: 2026-05-04
source_updated: unknown
source_version: video-g9JIUM0MHgQ; MCP spec 2025-06-18; MCP draft observed 2026-05-17; GitHub MCP docs observed 2026-05-17
retrieved: 2026-05-17
verified: 2026-05-17
valid_for: Agent tool selection guidance as of 2026-05-17
temporal_status: current
---

# Source Note: CLI vs MCP tool selection

Date: 2026-05-17
Status: processed

## Source snapshot

- Video: "CLI vs MCP: How AI Agents Choose the Right Tool for the Job"
- Channel: IBM Technology
- URL: https://www.youtube.com/watch?v=g9JIUM0MHgQ
- Upload date observed via `yt-dlp`: 2026-05-04
- Duration: 14:06
- Local transcript produced with `mlx-community/whisper-small-mlx`.

## Primary-source checks

- MCP authorization spec 2025-06-18 confirms MCP has an HTTP authorization flow based on OAuth concepts, while STDIO transports should retrieve credentials from environment rather than using that HTTP authorization flow.
- Current MCP draft authorization docs observed on 2026-05-17 show this area is still evolving, including updated OAuth client metadata/discovery details.
- GitHub's official MCP server docs support configuring toolsets and individual tools, including allow-lists and dynamic toolset discovery, explicitly to reduce context size and improve tool choice.
- GitHub Docs describe remote and local MCP toolset configuration, including default toolsets, individual tool selection and remote-only toolsets.
- IBM's MCP explainer aligns with the video's frame: MCP is a standardized integration layer, not an agent framework, and does not decide when a tool is called.

## Extracted source claims

- CLI and MCP are both ways for agents to interact with the outside world.
- CLI works best when mature shell commands map directly to the job: file reads/searches, Git operations, text processing and running scripts.
- CLI has strong context-efficiency because models already know common command syntax and because shell commands compose with pipes.
- MCP introduces schema/tool-definition overhead; this is real when many tools are loaded but only one or two are needed.
- MCP works better when raw CLI output is not the desired artifact, for example rendering a JavaScript-heavy web page through a headless browser fetcher.
- MCP is a better boundary for service authentication, token refresh, per-user access control, shared governance and auditability.
- The practical answer is hybrid routing: CLI when commands map directly to jobs; MCP when abstraction or governance justifies it.

## Useful extraction for agent design

- Agent harnesses should include a pre-flight tool routing step: local CLI/script, skill, MCP or browser.
- For local developer work, do not expose broad MCP servers by default if a narrow shell command or script is enough.
- For third-party SaaS, OAuth, team access, audit trails or rendered web content, MCP can be the cleaner operational boundary.
- MCP configuration should be narrow: enable only needed toolsets/tools where the server supports it.

## Source-quality notes

- The video is secondary but from a high-reputation technical channel and includes concrete experiments.
- Numeric token examples in the video should be treated as directional unless reproduced locally.
- The strongest claims are consistent with official MCP/GitHub documentation.
- This source confirms and refines the existing Techscope Skills/MCP assessment; it does not supersede it.
