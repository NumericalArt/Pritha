---
id: 2026-05-17-agent-environment-configuration-source-note
type: source-note
status: processed
created: 2026-05-17
updated: 2026-05-17
topics: [coding-agents, agent-configuration, agent-platforms, codex, claude-code, gemini-cli, github-copilot, cursor, windsurf]
tools: [Codex, Claude Code, Gemini CLI, GitHub Copilot, Cursor, Windsurf, AGENTS.md, CLAUDE.md, GEMINI.md, MCP, Agent Skills]
agent_platforms: [Codex, Claude Code, Gemini CLI, GitHub Copilot, Cursor, Windsurf]
model_context: [GPT-5.3-Codex, Claude Code, Gemini, Copilot]
runtime_environment: [cli, desktop-app, ide, cloud-agent, github, terminal]
config_surfaces: [AGENTS.md, CLAUDE.md, GEMINI.md, .cursor/rules, .github/copilot-instructions.md, .windsurf/rules, skills, mcp, hooks, plugins, subagents, memories]
portability: adapter-needed
sources:
  - https://developers.openai.com/codex/cli
  - https://developers.openai.com/codex/use-cases
  - https://developers.openai.com/api/docs/models/all
  - https://code.claude.com/docs/en/features-overview
  - https://code.claude.com/docs/en/sub-agents
  - https://google-gemini.github.io/gemini-cli/docs/cli/gemini-md.html
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/skills.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md
  - https://code.visualstudio.com/docs/copilot/customization/custom-instructions
  - https://code.visualstudio.com/docs/copilot/customization/custom-agents
  - https://docs.cursor.com/en/context
  - https://docs.windsurf.com/windsurf/cascade/memories
  - https://arxiv.org/abs/2602.14690
  - https://arxiv.org/abs/2602.11988
  - https://arxiv.org/abs/2602.09185
related:
  reviews:
    - 03_reviews/2026-05-17-agent-environment-configuration-portability.md
  standards:
    - 04_standards/agent-environment-compatibility.md
source_published: 2026-02-09 to 2026-05-17
source_updated: 2026-05-17
source_version: Official docs and research observed 2026-05-17; arXiv 2602.14690 v4 2026-05-08
retrieved: 2026-05-17
verified: 2026-05-17
valid_for: Agent environment comparison as of 2026-05-17
temporal_status: current
---

# Source Note: agent environment configuration portability

Date: 2026-05-17
Status: processed

## Source snapshot

This note captures the current state of major coding-agent configuration surfaces as of 2026-05-17. The purpose is not to rank agents, but to prevent Techscope from treating environment-specific practices as universal.

## Primary-source findings

- Codex CLI is OpenAI's local terminal coding agent. Official docs describe local read/change/run behavior, regular releases, approval modes, subagents, MCP, web search, cloud tasks and skills/use-case workflows.
- OpenAI model docs currently list Codex-specific and broader frontier models, with `GPT-5.3-Codex` positioned as a coding model and newer general models such as `GPT-5.5` also relevant for complex coding/professional work. Model availability and deprecations change quickly.
- Claude Code documentation explicitly separates `CLAUDE.md`, Skills, MCP, subagents, agent teams, hooks, plugins and marketplaces. Claude subagents can preload skills, scope MCP servers and enable persistent memory.
- Gemini CLI uses `GEMINI.md` as hierarchical context, supports configurable context filenames including `AGENTS.md`, exposes MCP management commands and supports Agent Skills based on the agentskills.io format.
- VS Code/GitHub Copilot supports `.github/copilot-instructions.md`, `AGENTS.md`, custom instruction files, prompt files and custom agents. VS Code docs warn that multiple instruction files can be combined with no guaranteed order.
- Cursor supports project rules in `.cursor/rules`, user rules, `AGENTS.md` and legacy `.cursorrules`.
- Windsurf distinguishes memories from durable rules; its docs recommend writing durable shared knowledge to `.windsurf/rules/` or repo `AGENTS.md` rather than relying only on UI memory.

## Research findings

- "Configuring Agentic AI Coding Tools" (submitted 2026-02-16, revised 2026-05-08) studies Claude Code, GitHub Copilot, Cursor, Gemini and Codex. It finds context files dominate current configuration practice, AGENTS.md is emerging as an interoperable starting point, advanced mechanisms like Skills/Subagents are still less common, and Claude Code users show the broadest mechanism diversity.
- "Evaluating AGENTS.md" (submitted 2026-02-12) warns that repository context files can increase cost and sometimes reduce success when they add unnecessary requirements; minimal high-signal instructions are preferable.
- "AIDev" (submitted 2026-02-09) shows agent-authored PRs across OpenAI Codex, Devin, GitHub Copilot, Cursor and Claude Code, reinforcing that multi-agent ecosystems are already observable in real repositories.

## Extracted source claims

- `AGENTS.md` is the best candidate for our common source-of-truth layer, but not every environment treats it the same way.
- Tool-specific files are still necessary when the runtime has unique features: `CLAUDE.md`, `GEMINI.md`, `.cursor/rules`, `.github/copilot-instructions.md`, `.windsurf/rules`.
- "Skill", "subagent", "memory" and "hook" are not perfectly portable concepts. Similar words can mean different loading behavior, permission behavior and context impact.
- The safest Techscope pattern is a platform profile plus adapter notes: what is Codex-native, what is portable, what needs translation, and what is environment-specific.

## Source-quality notes

- Official docs are primary evidence for each environment, but they are fast-moving.
- Academic papers are useful for broad adoption patterns, but they may lag current product behavior.
- Blog/forum claims should be used as signal only after checking official docs.
