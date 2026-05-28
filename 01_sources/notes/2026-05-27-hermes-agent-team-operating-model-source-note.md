---
id: 2026-05-27-hermes-agent-team-operating-model-source-note
type: source-note
status: processed
created: 2026-05-27
updated: 2026-05-27
topics:
  - hermes-agent
  - multi-agent-operations
  - agent-team-operating-model
  - cron
  - skills
  - obsidian-memory
tools:
  - Hermes Agent
  - Obsidian
  - Codex CLI
  - Google Meet
  - Telegram
sources:
  - https://www.youtube.com/watch?v=ysQ1T3Xkub8
  - 01_sources/raw/youtube-ysQ1T3Xkub8/ysQ1T3Xkub8-whisper-small.md
  - https://github.com/NousResearch/hermes-agent/blob/main/RELEASE_v0.12.0.md
  - https://hermes-agent.nousresearch.com/docs/user-guide/features/curator
  - https://hermes-agent.nousresearch.com/docs/user-guide/features/cron/
  - https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation/
related:
  intakes:
    - 00_inbox/links/2026-05-27-youtube-hermes-agent-team-operating-model-intake.md
  briefs:
    - 02_briefs/2026-05-27-hermes-agent-team-operating-model-brief.md
  reviews:
    - 03_reviews/2026-05-27-hermes-agent-team-operating-model-assessment.md
  standards:
    - 04_standards/agent-team-operating-model.md
---

# Source Note: Hermes Agent Team Operating Model

Date: 2026-05-27
Status: processed

## Source snapshot

- Video: `Мои ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ агентов HERMES`
- Channel: ALEKSEI ULIANOV | AI-АГЕНТЫ
- YouTube id: `ysQ1T3Xkub8`
- Source URL: https://www.youtube.com/watch?v=ysQ1T3Xkub8
- Published: 2026-05-04
- Duration: 50:02
- Local transcript: `01_sources/raw/youtube-ysQ1T3Xkub8/ysQ1T3Xkub8-whisper-small.md`
- ASR note: generated locally with `--language ru`.

## What is actually new for Techscope

The video is mostly a lived-use tour of a Hermes setup. We already know the
existence of Hermes, Obsidian memory, Codex CLI sidecars, cron, skills and
delegation. The new useful layer is the operator pattern:

- define a small team of named role agents instead of one universal assistant;
- make one coordinator agent responsible for user-facing intake and routing;
- keep specialist agents narrow: travel assistant, designer, marketer,
  researcher, finance assistant, document/legal assistant, copywriter,
  daily-review/kaizen agent;
- give each specialist its own skills, context and reference materials;
- move skills between agents/platforms when they are reusable;
- use scheduled jobs for status reports and reminders, not for everything;
- create daily notes in Obsidian, then let a separate reflective agent compare
  the day against goals;
- reduce notifications aggressively when scheduled agents become noisy;
- use a coding/long-task worker such as Codex CLI for work that should not be
  done inside the fast conversational layer.

## Extracted examples

- Meeting bot: joins a Google Meet-style call, records/transcribes, identifies
  speakers, creates a summary, decisions and suggestions.
- Travel assistant: stores ticket/hotel/insurance context, checks flight status
  and calculates practical departure timing.
- Designer: uses image-generation API plus user reference images to create
  YouTube covers and social media images.
- Marketer/researcher: searches YouTube channels, Telegram channels and GitHub
  repositories; distills useful posts/channels/repos for a market research task.
- Copywriter/humanizer: rewrites transcripts into YouTube titles, descriptions,
  hashtags and timecodes, using style examples.
- Finance assistant: consumes statements and reports spending/subscriptions.
- Cron reports: agents send scheduled briefs based on their specialist context.
- Daily Obsidian loop: coordinator writes daily summary; kaizen agent reviews it
  against goals and suggests morning/evening focus.

## Verification against current sources

- Hermes v0.12.0 release notes confirm the Curator release, Google Meet plugin,
  Humanizer skill, cron ticker and upgraded self-improvement loop.
- Hermes Curator docs confirm background maintenance for agent-created skills.
- Hermes Cron docs confirm scheduled tasks, skill-backed cron jobs, fresh agent
  sessions, delivery options and security checks.
- Hermes Delegation docs confirm isolated subagents with restricted toolsets and
  final-summary-only return to parent context.

## Source-quality notes

- Strong: operator patterns and examples of where agents help.
- Strong: official Hermes docs validate Curator, cron and delegation mechanics.
- Moderate: exact value of each named personal agent; this is one user's setup.
- Weak: broad claims that Hermes requires no care. Official docs still show
  configuration, toolsets, cron limitations and security considerations.

## Noise filtered out

- Long product/community commentary.
- Exact personal agent names as a template to copy.
- Non-technical lifestyle/psychological advice except the useful pattern of
  reducing notification load and using reflection loops carefully.
