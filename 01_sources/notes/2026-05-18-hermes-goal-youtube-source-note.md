---
id: 2026-05-18-hermes-goal-youtube-source-note
type: source-note
status: processed
created: 2026-05-18
updated: 2026-05-18
topics: [hermes-agent, persistent-goals, slash-goal, autonomous-agents, ralph-loop, codex-cli, agent-orchestration, harness-engineering]
tools: [Hermes Agent, Codex CLI, Claude Code, OpenRouter, VPS, SSH, Agent Skills, MCP]
agent_platforms: [Hermes Agent, Codex, Claude Code]
model_context: [GPT-5.5, OpenAI models, OpenRouter models, model-agnostic Hermes providers]
runtime_environment: [cli, vps, ssh, messaging-gateway, codex-cli, cloud-agent]
config_surfaces: [config.yaml, slash-commands, skills, mcp, toolsets, gateway, OpenAI-compatible local proxy, provider-auth]
portability: adapter-needed
sources:
  - https://www.youtube.com/watch?v=9oOZ3PB6n4Y
  - https://hermes-agent.nousresearch.com/docs/user-guide/features/goals
  - https://github.com/NousResearch/hermes-agent/releases/tag/v2026.5.16
  - https://github.com/openai/codex/releases/tag/rust-v0.128.0
  - https://developers.openai.com/codex/cli
related:
  intakes:
    - 00_inbox/links/2026-05-18-youtube-hermes-goal-insane-intake.md
  briefs:
    - 02_briefs/2026-05-18-hermes-goal-autonomous-workflow-brief.md
    - 02_briefs/2026-05-17-hermes-agent-architecture-brief.md
  reviews:
    - 03_reviews/2026-05-18-hermes-goal-agent-architecture-assessment.md
    - 03_reviews/2026-05-17-hermes-agent-architecture-assessment.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-environment-compatibility.md
source_published: 2026-05-16
source_updated: unknown
source_version: YouTube video by David Ondrej; checked against Hermes Agent v0.14.0 / v2026.5.16 and Codex CLI 0.128.0 release notes
retrieved: 2026-05-18
verified: 2026-05-18
valid_for: Hermes Agent /goal and Codex CLI /goal snapshot as of 2026-05-18
temporal_status: version-bound
---

# Source Note: Hermes /goal YouTube walkthrough

Date: 2026-05-18
Status: processed

## Source snapshot

- Video: "Hermes /goal is insane... just watch"
- Source URL: https://www.youtube.com/watch?v=9oOZ3PB6n4Y
- Channel: David Ondrej
- Published: 2026-05-16
- Duration: 26:04
- Transcript raw path: `01_sources/raw/youtube-9oOZ3PB6n4Y/9oOZ3PB6n4Y-whisper-small.md`
- Transcript model: `mlx-community/whisper-small-mlx`
- Transcript language: English. A first Russian-language transcription attempt produced bad output and was replaced with an English run.

## What the video claims

- Hermes added a persistent `/goal` feature for long-running autonomous work.
- The pattern evolved from simple "Ralph loop" style agent repetition, but adds an explicit goal, stop criteria, judge/evaluator and turn budget.
- Hermes `/goal` is presented as stronger than a basic loop because it uses a judge, supports `/subgoal`, persists across sessions, survives restarts and lives inside Hermes' broader harness: skills, MCP tools, checkpoints, rollback, LSP diagnostics and tool execution.
- The walkthrough shows a VPS setup, Hermes configuration, provider/auth setup, skill creation, presentation generation and a Hermes-as-CEO / Codex-as-CTO example.
- The recommended prompt pattern is to specify measurable end state and acceptance criteria rather than a vague goal.
- The video claims Hermes can use Codex CLI as a runtime and can delegate work to Codex CLI subagents.
- The video also includes strong marketing and sponsored hosting content; these sections are not technical evidence.

## Verified against current sources

- Hermes official `/goal` docs describe persistent goals, continuation loop, turn budget, user message preemption, persistence and judge configuration.
- Hermes official docs attribute the user-facing `/goal` design to Codex CLI 0.128.0 while saying Hermes implementation is independent: central command registry, session DB state metadata, auxiliary-client judge and gateway-side FIFO continuation.
- Hermes v0.14.0 / v2026.5.16 release notes list `/subgoal` for appending user-added criteria to an active `/goal`, and mention goal-loop changes in the core agent section.
- OpenAI Codex CLI 0.128.0 release notes list persisted `/goal` workflows with app-server APIs, model tools, runtime continuation and TUI controls for create, pause, resume and clear.
- OpenAI's current Codex CLI docs confirm Codex CLI as the local terminal coding agent and describe installation/auth/runtime, but the public docs page observed here does not surface `/goal` in the visible CLI overview text.

## Technical signal extracted

- Persistent goals are a harness pattern, not merely a prompt pattern.
- A useful long-running goal needs:
  - explicit objective;
  - measurable acceptance criteria;
  - evaluator/judge independent from the executing loop;
  - turn/time/token budget;
  - pause/resume/clear controls;
  - progress status;
  - user preemption and mid-run steering;
  - persistence and restart recovery;
  - logs and artifacts for auditability.
- `/subgoal` is important because it avoids restarting the loop when the user learns new information mid-run.
- The Hermes-as-CEO / Codex-as-CTO metaphor maps to an orchestrator/worker split, but should be implemented as contracts, work queues, isolated workspaces and verification gates, not as unconstrained nested agents.
- For Techscope, the useful concept is not "run Hermes as-is" but "add explicit goal contracts to Agents Mother and future long-running agent operations."

## Weak or unverified parts

- Adoption/popularity claims such as "number one globally" were not treated as evidence.
- Business-growth claims and social-media examples were treated as anecdotes.
- The exact behavior of Hermes controlling Codex CLI needs local testing before becoming a standard.
- The video's setup path includes sponsored VPS recommendations and should not be copied directly.
- The transcript contains minor ASR errors: for example "Codex" is sometimes rendered as "Konex" and "OpenAI" as "opening".

## Relationship to existing knowledge

- Refines `2026-05-17-hermes-agent-architecture-assessment` by adding a concrete long-running goal-loop mechanism.
- Confirms the existing Hermes evaluation: high-priority experiment candidate, not a replacement for Techscope/Codex.
- Refines `agent-creation-harness` with a stronger proactivity/operations pattern: long-running goals need bounded execution, independent evaluation and explicit stop conditions.

## Temporal notes

- Source published: 2026-05-16.
- Hermes release checked: v0.14.0 / v2026.5.16.
- Codex release checked: 0.128.0, released 2026-04-30.
- Verified: 2026-05-18.
- Temporal status: version-bound. Recheck before using exact commands or availability assumptions.
