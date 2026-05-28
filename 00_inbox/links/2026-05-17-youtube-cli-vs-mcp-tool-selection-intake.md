---
id: 2026-05-17-youtube-cli-vs-mcp-tool-selection-intake
type: intake
status: processed
created: 2026-05-17
updated: 2026-05-17
topics: [mcp, cli, coding-agents, tool-use, agent-architecture, context-engineering]
tools: [MCP, CLI, Git, GitHub MCP Server, curl, grep, cat, Fetcher MCP]
source_type: video
source_url: https://www.youtube.com/watch?v=g9JIUM0MHgQ
source_published: 2026-05-04
source_updated: unknown
source_version: video-g9JIUM0MHgQ; MCP spec 2025-06-18; GitHub MCP docs observed 2026-05-17
retrieved: 2026-05-17
verified: 2026-05-17
temporal_status: current
sources:
  - https://www.youtube.com/watch?v=g9JIUM0MHgQ
  - 01_sources/raw/youtube-g9JIUM0MHgQ/g9JIUM0MHgQ-whisper-small.md
related:
  notes:
    - 01_sources/notes/2026-05-17-cli-vs-mcp-tool-selection-source-note.md
  briefs:
    - 02_briefs/2026-05-17-cli-vs-mcp-tool-selection-brief.md
  reviews:
    - 03_reviews/2026-05-17-cli-vs-mcp-tool-selection-assessment.md
  standards:
    - 04_standards/agent-tool-integration-selection.md
---

# Intake: youtube-cli-vs-mcp-tool-selection

Date added: 2026-05-17
Type: video
Source: https://www.youtube.com/watch?v=g9JIUM0MHgQ
Source published: 2026-05-04
Source updated: unknown
Source version: video-g9JIUM0MHgQ; MCP spec 2025-06-18; GitHub MCP docs observed 2026-05-17
Retrieved: 2026-05-17
Verified: 2026-05-17
Temporal status: current
Status: processed

## Why this may matter

The video gives a concrete decision frame for agent tooling: use CLI when the command maps directly to the task, and use MCP when a server abstraction, rendered output, authentication or governance justifies the overhead.

## Raw material or link

- YouTube: https://www.youtube.com/watch?v=g9JIUM0MHgQ
- Local transcript: `01_sources/raw/youtube-g9JIUM0MHgQ/g9JIUM0MHgQ-whisper-small.md`

## Initial questions

- When should a coding agent prefer shell/CLI over MCP tools?
- Which MCP use cases justify schema/context overhead?
- Does this update or confirm our existing Skills/MCP decision frame?
- Should this become a reusable standard for future agent setup?

## Expected output

brief | assessment | standard
