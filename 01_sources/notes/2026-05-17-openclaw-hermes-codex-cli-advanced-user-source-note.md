---
id: 2026-05-17-openclaw-hermes-codex-cli-advanced-user-source-note
type: source-note
status: draft
created: 2026-05-17
updated: 2026-05-17
topics: [openclaw, hermes, codex-cli, ai-agents, user-experience, non-professional-users, agent-memory, llm-wiki]
tools: [youtube, yt-dlp, mlx-whisper, openclaw, hermes, codex, obsidian, telegram]
source_type: video
source_url: https://www.youtube.com/watch?v=L-HAzfFWSto
source_published: 2026-04-28
source_author: ALEKSEI ULIANOV | AI-АГЕНТЫ
evidence_class: lived-experience
expertise_class: advanced-user-not-professional-developer
sources:
  - https://www.youtube.com/watch?v=L-HAzfFWSto
  - 01_sources/raw/youtube-L-HAzfFWSto/L-HAzfFWSto-whisper-small.md
  - 01_sources/signals/2026-05-17-youtube-transcript-openclaw-hermes-и-codex-cli-какой-ai-агент-выбрать-сейчас-signal.md
related:
  intakes:
    - 00_inbox/links/2026-05-17-youtube-openclaw-hermes-codex-cli-user-experience-intake.md
  signals:
    - 01_sources/signals/2026-05-17-youtube-transcript-openclaw-hermes-и-codex-cli-какой-ai-агент-выбрать-сейчас-signal.md
  workflows:
    - 07_workflows/media-intake-processing.md
    - 07_workflows/codex-assisted-signal-extraction.md
---

# Source Note: OpenClaw, Hermes and Codex CLI advanced-user comparison

Date added: 2026-05-17
Source date: 2026-04-28
Source: https://www.youtube.com/watch?v=L-HAzfFWSto
Status: draft

## What this source is

Long YouTube live by an advanced AI-agent user comparing OpenClaw/Crab-like setup, Hermes and Codex CLI-based agents from lived experience. This is not a professional engineering benchmark and not official documentation.

Use it as evidence for:

- non-coder/advanced-user adoption friction;
- emotional and practical trust boundaries;
- workflow ergonomics for Telegram, business assistants, CRM/API tasks and Obsidian/wiki memory;
- which failure modes users actually notice: context bloat, token cost, restarts, unstable memory, unclear setup.

Do not use it as evidence for:

- exact platform architecture;
- security guarantees;
- performance claims;
- project popularity or installation counts.

## Useful source anchors

- 03:47-07:20: author frames agent choice as shell/context/harness trade-off, not only model choice.
- 07:45-13:30: OpenClaw/Crab perceived as pleasant but prone to context growth under heavy customization; Hermes and Codex CLI perceived as more execution-oriented.
- 35:56-40:47: comparative test prompt for unstable memory/context/token usage and non-programmer repair constraints.
- 44:13-50:16: suggested task fit: OpenClaw for personal/lighter use, Codex CLI for long/heavy coding tasks, Hermes for business-oriented adaptive workflows.
- 53:00-56:51: folder-based data access is preferred over feeding many individual messages/files.
- 56:51-63:09: Obsidian/Markdown wiki memory discussed as an agent-readable source layer with index/log/rules.
- 70:07-71:32: disk size is not the main problem; token budget and what the agent reads are the real constraints.
- 72:20-77:25: small-business assistant scenario compared across n8n, Make, SaaS, coding agent and multi-agent system.
- 77:52-80:17: CRM/AMO CRM discussion: agents can complement managers, but business replacement claims need caution.

## Immediate interpretation

The source reinforces Techscope's current direction: durable Markdown memory, generated wiki as synthesis layer, Telegram as convenient intake/control surface, and Codex-assisted refinement before standards.

The strongest reusable idea is an evaluation rubric for agent shells aimed at non-professional operators: stable default workflow, visible actions, low context overhead, memory that survives restarts, and recovery paths that do not require the user to become a developer.

## Verification needs

- Identify which exact OpenClaw/OpenClow/Crab implementation the speaker uses.
- Check Hermes claims against NousResearch Hermes docs/repo.
- Check Codex CLI/runtime claims against official OpenAI docs/repo.
- Compare with a few community reports from non-professional or semi-professional users.
- Security-review Telegram/CRM/business-agent recommendations before any standard.

