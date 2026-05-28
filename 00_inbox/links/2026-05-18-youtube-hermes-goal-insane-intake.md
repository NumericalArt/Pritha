---
id: 2026-05-18-youtube-hermes-goal-insane-intake
type: intake
status: processed
created: 2026-05-18
updated: 2026-05-18
topics: [hermes-agent, persistent-goals, autonomous-agents, codex-cli, agent-orchestration, harness-engineering]
tools: [Hermes Agent, Codex CLI, Claude Code, OpenRouter, VPS, SSH, Agent Skills, MCP]
source_type: video
source_url: https://www.youtube.com/watch?v=9oOZ3PB6n4Y
source_published: 2026-05-16
source_updated: unknown
source_version: YouTube video by David Ondrej; Hermes Agent v0.14.0 / v2026.5.16 context; Codex CLI 0.128.0 context
retrieved: 2026-05-18
verified: 2026-05-18
temporal_status: version-bound
sources:
  - https://www.youtube.com/watch?v=9oOZ3PB6n4Y
  - https://hermes-agent.nousresearch.com/docs/user-guide/features/goals
  - https://github.com/NousResearch/hermes-agent/releases/tag/v2026.5.16
  - https://github.com/openai/codex/releases/tag/rust-v0.128.0
  - https://developers.openai.com/codex/cli
related:
  notes:
    - 01_sources/notes/2026-05-18-hermes-goal-youtube-source-note.md
  briefs:
    - 02_briefs/2026-05-18-hermes-goal-autonomous-workflow-brief.md
  reviews:
    - 03_reviews/2026-05-18-hermes-goal-agent-architecture-assessment.md
  previous:
    - 01_sources/notes/2026-05-17-hermes-agent-source-note.md
    - 02_briefs/2026-05-17-hermes-agent-architecture-brief.md
    - 03_reviews/2026-05-17-hermes-agent-architecture-assessment.md
---

# Intake: YouTube Hermes /goal persistent goals

Date added: 2026-05-18
Type: video
Source: https://www.youtube.com/watch?v=9oOZ3PB6n4Y
Source published: 2026-05-16
Source updated: unknown
Source version: YouTube video by David Ondrej; Hermes Agent v0.14.0 / v2026.5.16 context; Codex CLI 0.128.0 context
Retrieved: 2026-05-18
Verified: 2026-05-18
Temporal status: version-bound
Status: processed

## Why this may matter

- The video focuses on persistent goal loops: long-running autonomous execution with explicit objective, judge/evaluator, continuation budget and pause/resume controls.
- This maps directly to Techscope's Agents Mother roadmap: deployment, operations, proactivity, post-creation review and long-running agent work.
- The video proposes a Hermes-as-CEO / Codex-as-CTO orchestration pattern, which is interesting but must be treated as experimental and environment-specific.

## Raw material or link

- Video: https://www.youtube.com/watch?v=9oOZ3PB6n4Y
- Transcript: `01_sources/raw/youtube-9oOZ3PB6n4Y/9oOZ3PB6n4Y-whisper-small.md`
- Audio/video raw files: `01_sources/raw/youtube-9oOZ3PB6n4Y/`

## Initial questions

- Is Hermes `/goal` materially different from Codex CLI `/goal`, or mainly a Hermes-specific wrapper around a similar persistent objective loop?
- Which parts are mature enough to influence Techscope standards: judge model, subgoals, turn budget, persistence, crash recovery, or multi-agent delegation?
- How should Agents Mother represent long-running goals without giving unsafe autonomy by default?

## Expected output

brief | assessment
