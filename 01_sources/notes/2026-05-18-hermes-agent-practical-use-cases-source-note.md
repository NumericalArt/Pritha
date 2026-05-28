---
id: 2026-05-18-hermes-agent-practical-use-cases-source-note
type: source-note
status: processed
created: 2026-05-18
updated: 2026-05-18
topics: [hermes-agent, practical-agent-use-cases, role-agents, telegram-agents, agent-memory, skills, curator, codex-cli, llm-wiki]
tools: [Hermes Agent, Codex CLI, Telegram, Obsidian, Google Meet, Agent Skills, MCP, Google AI Studio, GitHub]
source_type: video
source_url: https://www.youtube.com/watch?v=ysQ1T3Xkub8
agent_platforms: [Hermes Agent, Codex]
model_context: [model-agnostic Hermes providers, OpenAI/Codex CLI, Google AI Studio]
runtime_environment: [telegram, cli, mac-mini, macbook, obsidian, google-meet, codex-cli]
config_surfaces: [skills, memory, wiki, daily-notes, telegram-gateway, codex-cli-bridge, curator, cron-or-scheduled-reports]
portability: adapter-needed
sources:
  - https://www.youtube.com/watch?v=ysQ1T3Xkub8
  - 00_inbox/telegram/2026-05-18-telegram-telegram-user-61-youtu-be-ysq1t3xkub8-is-8i0gythivsltgnpj.md
  - 01_sources/raw/youtube-ysQ1T3Xkub8/ysQ1T3Xkub8-whisper-small.md
  - https://hermes-agent.nousresearch.com/docs/user-guide/features/curator
  - https://hermes-agent.nousresearch.com/docs/user-guide/features/codex-app-server-runtime
  - https://github.com/NousResearch/hermes-agent/releases/tag/v2026.5.16
related:
  intakes:
    - 00_inbox/telegram/2026-05-18-telegram-telegram-user-61-youtu-be-ysq1t3xkub8-is-8i0gythivsltgnpj.md
  signals:
    - 01_sources/signals/2026-05-18-youtube-transcript-мои-примеры-использования-агентов-hermes-signal.md
  briefs:
    - 02_briefs/2026-05-18-hermes-agent-practical-use-cases-brief.md
    - 02_briefs/2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief.md
  reviews:
    - 03_reviews/2026-05-18-hermes-agent-practical-use-cases-assessment.md
    - 03_reviews/2026-05-17-openclaw-hermes-codex-cli-advanced-user-assessment.md
  standards:
    - 04_standards/agent-shell-evaluation.md
source_published: 2026-05-04
source_updated: unknown
source_version: YouTube video references Hermes Agent v0.12.0; checked against Hermes Agent v0.14.0 docs/release observed 2026-05-18
retrieved: 2026-05-18
verified: 2026-05-18
valid_for: lived-experience Hermes/Codex agent-team patterns as of 2026-05-18
temporal_status: version-bound
---

# Source Note: Hermes practical agent use cases

Date: 2026-05-18
Status: processed

## Source snapshot

- Video: "Мои ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ агентов HERMES"
- URL: https://www.youtube.com/watch?v=ysQ1T3Xkub8
- Channel: ALEKSEI ULIANOV | AI-АГЕНТЫ
- Published: 2026-05-04
- Duration: 50:02
- Telegram intake: `00_inbox/telegram/2026-05-18-telegram-telegram-user-61-youtu-be-ysq1t3xkub8-is-8i0gythivsltgnpj.md`
- Transcript: `01_sources/raw/youtube-ysQ1T3Xkub8/ysQ1T3Xkub8-whisper-small.md`

## What the source contributes

This is a lived-experience source from an advanced non-professional or semi-professional operator who is building a personal Hermes-based agent team. It is valuable for UX and workflow design, not as authoritative technical proof.

The strongest signal is the shift from "which agent is best" to "what routine pain does each specialized agent remove." The speaker shows a practical stack of named role agents: coordinator, designer, marketer/copywriter, researcher, economist, business analyst, document/legal helper, kaizen/planner and Codex CLI bridge.

## Extracted practical patterns

- Build agents around recurring work pains, not abstract automation curiosity.
- Keep role-specific agents with their own context instead of routing everything through one giant orchestrator.
- Let agents delegate narrow subtasks to other specialists only when they need missing context or expert checks.
- Maintain a shared wiki/Obsidian layer where agents know each other's roles, responsibilities and handoff rules.
- Use daily notes as an operational memory layer: what happened, which agent did what, result, next focus and retrospective.
- Turn repetitive reports into scheduled outputs, but avoid noisy Telegram messages for every internal step.
- Use Telegram as a human-friendly control surface while hiding terminal/tool complexity.
- Use Codex CLI as a long-running terminal/coding worker behind a higher-level agent bridge when tasks are too long or technical for a chat surface.
- Treat skills as portable procedural memory, but migrate them carefully between platforms and roles.
- For user-facing text quality, combine personality, examples, copywriter/humanizer skills and language-specific style rules.

## Use cases mentioned

- Meeting bot: join a meeting link, record/transcribe, identify speakers, summarize decisions and provide follow-up advice.
- Travel assistant: store tickets, hotel documents and flight numbers; later check flight status and suggest timing.
- Designer: generate YouTube cover images or other visual assets from personal references and style examples.
- Marketing agent: research channels, extract audience signals, summarize videos/posts, prepare YouTube descriptions, hashtags and timestamps.
- Research agent: search less obvious GitHub projects or insider channels by explicit criteria, not only by popularity.
- Economist/finance helper: analyze bank statements and recurring expenses from a folder of exported documents.
- Business analyst: compare current business context with target models and propose weak points.
- Document/legal helper: prepare or check documents in PDF/Word/Excel-style formats.
- Kaizen/planner agent: read daily notes and goals, then produce morning focus and evening retrospective.
- Codex bridge agent: pass long research/coding work to Codex CLI, ping for progress and return a concise result to Telegram/Hermes.

## Verified or corrected against current docs

- Hermes Curator exists as a skill-maintenance feature. Current docs describe it as background maintenance for agent-created skills, tracking views/usage/patches and moving unused skills through states; it never auto-deletes and does not touch bundled or hub-installed skills.
- The source's "weekly cron" description is close to the v0.12 release framing, but current official Curator docs say it is triggered by an inactivity check rather than a plain cron daemon.
- Hermes Codex App-Server Runtime exists as an opt-in mode: Hermes can hand OpenAI/Codex turns to Codex CLI app-server so terminal commands, file edits, sandboxing and MCP tool calls execute in Codex's runtime while Hermes remains the shell around sessions, slash commands, gateway, memory and skill review.
- Exact UI and skill names shown in the video are environment-specific and should be retested before copying.

## Evidence quality

- Strong for: user needs, ergonomic patterns, role taxonomy, practical agent-team design.
- Medium for: what Hermes can do in this operator's setup.
- Weak for: general performance claims, safety, scalability and exact current commands.

## Risks

- Many examples involve sensitive personal or business data: travel documents, bank statements, CRM-like data, Telegram channels, meeting recordings and personal images.
- Role agents can silently accumulate stale skills and bad memory if skill creation is not reviewed.
- Telegram control can become noisy or unsafe without allowlists, concise responses, permission gates and audit logs.
- Codex CLI bridge work needs workspace isolation, sandboxing and clear completion criteria.

## Relationship to Techscope

This source refines the previous advanced-user Hermes/OpenClaw/Codex material. It gives concrete examples of how a non-coder operator actually uses a multi-agent setup and reinforces our direction for Agents Mother: generate practical role agents with explicit interfaces, memory, skills, logs, handoffs and safety boundaries.
