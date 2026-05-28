---
id: 2026-05-17-cli-vs-mcp-tool-selection-assessment
type: assessment
status: draft
created: 2026-05-17
updated: 2026-05-17
topics: [mcp, cli, coding-agents, tool-use, context-engineering, agent-architecture, security]
tools: [MCP, CLI, Git, GitHub MCP Server, curl, grep, cat, Fetcher MCP]
sources:
  - 00_inbox/links/2026-05-17-youtube-cli-vs-mcp-tool-selection-intake.md
  - 01_sources/notes/2026-05-17-cli-vs-mcp-tool-selection-source-note.md
  - 02_briefs/2026-05-17-cli-vs-mcp-tool-selection-brief.md
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
    - 02_briefs/2026-05-17-skills-vs-mcp-agent-tooling-brief.md
  reviews:
    - 03_reviews/2026-05-17-skills-vs-mcp-agent-tooling-assessment.md
  decisions: []
  standards:
    - 04_standards/agent-tool-integration-selection.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-04
source_updated: unknown
source_version: video-g9JIUM0MHgQ; MCP spec 2025-06-18; MCP draft observed 2026-05-17; GitHub MCP docs observed 2026-05-17
retrieved: 2026-05-17
verified: 2026-05-17
valid_for: Agent tool selection guidance as of 2026-05-17
temporal_status: current
recommendation: standard
---

# Assessment: CLI vs MCP tool selection

Date: 2026-05-17
Status: draft
Recommendation: standard

## One-paragraph read

This is a strong practical source for Techscope. It gives a clean routing rule for coding agents: use CLI when the task is a local, deterministic developer operation already well served by mature commands; use MCP when the agent needs a managed abstraction, rendered content, authentication, governance or auditability. It confirms our previous Skills/MCP conclusions and adds CLI as the third explicit option in the decision matrix.

## Why it matters

Techscope is building agent harnesses that will repeatedly choose between shell scripts, skills, MCP servers, browser tools and service APIs. A wrong default creates either context bloat and integration sprawl, or unsafe shell-heavy agents. This source helps us encode the choice as a reusable architecture rule.

## Technical claims

- Shell commands are often more compact than MCP calls for local developer tasks.
- MCP tool schemas can create meaningful context overhead when broad servers are loaded eagerly.
- CLI tools compose naturally with pipes; MCP tool calls are more isolated.
- MCP can compress complex interactions into useful output, especially when raw CLI output is not enough.
- MCP is a better fit for service-managed auth, token refresh, per-user permissions and audit trails.
- The right answer is not CLI or MCP; it is task-dependent routing.

## Existing knowledge check

- Related existing artifacts:
  - `02_briefs/2026-05-17-skills-vs-mcp-agent-tooling-brief.md`
  - `03_reviews/2026-05-17-skills-vs-mcp-agent-tooling-assessment.md`
- Relationship to existing knowledge: refines
- Artifacts to mark outdated or superseded: none

## Freshness check

- Official/current sources checked:
  - MCP authorization spec 2025-06-18
  - current MCP draft authorization page observed 2026-05-17
  - GitHub MCP Server repository/docs
  - GitHub Docs for configuring MCP toolsets
  - IBM MCP explainer
- Freshness status: current
- Source published: 2026-05-04
- Source updated: unknown
- Source version: video-g9JIUM0MHgQ; MCP spec 2025-06-18; MCP draft observed 2026-05-17; GitHub MCP docs observed 2026-05-17
- Retrieved: 2026-05-17
- Verified: 2026-05-17
- Valid for: Agent tool selection guidance as of 2026-05-17
- Temporal status: current
- Temporal compatibility with existing artifacts: compatible; this video refines the 2026-05-17 Skills/MCP assessment by adding explicit CLI routing.
- Notes: MCP authorization and tool discovery behavior is changing; recheck before promoting this from draft standard to active standard.

## Programming relevance

Score: 5/5

Directly relevant to coding-agent setup, repo work, shell access, GitHub integration and tool routing.

## Agent engineering relevance

Score: 5/5

This is central agent architecture: tool choice, context budget, auth boundary, execution boundary and operational governance.

## DX impact

Score: 5/5

Good routing keeps agents fast and predictable. Developers should not pay MCP setup/context cost for a simple `git status`, and should not hand-roll OAuth/token refresh in shell when an MCP server can own that boundary.

## Evidence quality

Score: 4/5

The video is secondary, but it is concrete and aligns with primary docs. Some numbers, especially token counts, should be measured locally before being treated as standards.

## Practicality

Score: 5/5

Immediately usable. We can apply it to Techscope's own YouTube, Telegram, Obsidian, GitHub and documentation workflows.

## Leverage

Score: 5/5

High. The decision matrix can be reused in every future agent project.

## Risk

Score: 4/5

Risk is high if misapplied. Shell access is powerful and can be destructive. MCP access can be broad and data-sensitive. The standard must include least privilege, sandboxing, logging and tool narrowing.

## Expert lenses

### Programming

Prefer the interface closest to the real work. Local repo/file/Git/text jobs should start with CLI/script. Web rendering, SaaS, auth and cross-user access should start with MCP or browser-backed tools.

### Agent Engineering

Add a routing decision before tool execution: CLI/script, skill, MCP, browser or human review. Avoid exposing broad tools before the agent has a concrete need.

### DX

The best setup is boring for common tasks and structured for risky ones: fast shell for deterministic local work, controlled MCP for external services.

### Security

Do not treat CLI as automatically safer because it is simpler. Shell tools need sandboxing, allow/deny rules and review. MCP servers need least privilege, toolset limiting, credential isolation and auditability.

### Evidence

Primary sources support the main direction. The exact economics should be validated with Techscope's own tool logs and token measurements.

### Product Pragmatism

This should become a draft standard now. Waiting for perfect benchmarks would delay a rule we already need in daily agent setup.

## Decision

Create a draft standard for agent tool integration selection: CLI/script vs skill vs MCP vs browser/manual review.

## Next artifact

standard
