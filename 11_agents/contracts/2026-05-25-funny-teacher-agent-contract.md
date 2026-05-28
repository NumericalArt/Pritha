---
id: 2026-05-25-funny-teacher-agent-contract
type: agent-contract
status: accepted
created: 2026-05-25
updated: 2026-05-25
topics:
  - agent-engineering
  - voice-agents
  - language-learning
  - english-speaking
  - youtube-lessons
tools:
  - Codex CLI
  - OpenAI Realtime API
  - YouTube transcription
  - SQLite
  - embeddings
agent_platforms:
  - Codex
  - OpenAI Realtime API
model_context:
  - gpt-realtime-2
  - speech-to-text
runtime_environment:
  - local-project
  - web-ui
  - mac
config_surfaces:
  - AGENTS.md
  - .env.example
  - interfaces/manifest.json
  - memory/manifest.json
  - tools/manifest.json
  - operations/manifest.json
  - scripts
portability: adapter-needed
sources:
  - user specification in Techscope thread 2026-05-25
  - 04_standards/realtime-voice-control-for-codex-agents.md
  - 07_workflows/agents-mother.md
  - 07_workflows/agents-mother-roadmap.md
related:
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/agents-mother-roadmap.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/realtime-voice-control-for-codex-agents.md
  agent_contracts: []
  reports:
    - 11_agents/reports/2026-05-25-funny-teacher-agent-scaffold-report.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: 2026-05-25
source_version: initial user specification
retrieved: 2026-05-25
verified: 2026-05-25
valid_for: Funny Teacher v1 scaffold and first voice testing
temporal_status: current
---

# Agent Project Contract: Funny Teacher

Date: 2026-05-25
Status: accepted

## Purpose

- Agent name: Funny Teacher
- Primary mission: help one user quickly and enjoyably improve English, mainly speaking, by turning YouTube lessons into interactive voice practice, comprehension checks, correction and spaced review.
- Target user: one learner who watches English-learning YouTube videos and then practices the lesson with a voice agent.
- Success criteria: after a lesson, the agent can judge whether the learner understood the video material, can speak the target patterns, can correct mistakes, and can decide whether to repeat, drill or move to another lesson.
- Out of scope for v1: multi-user classroom, public course marketplace, paid licensing, formal exam certification, automatic social publishing.

## Functional Scope

### V1 Core Functions

- Provide a visible YouTube URL input directly in the web interface.
- Accept a YouTube URL as lesson input from the lesson screen.
- Download or transcribe the video with local project tools where possible.
- Extract lesson content:
  - topic;
  - target vocabulary;
  - grammar/speaking patterns;
  - teacher instructions;
  - example dialogues;
  - exercises;
  - likely assessment criteria.
- Create a structured lesson artifact from the video.
- Let the learner watch the video or keep a link/reference to it.
- Provide a comfortable embedded YouTube lesson viewing surface.
- Show a bottom lesson-control area with a simple voice-practice start action.
- Run extraction after URL submit and make the lesson available for practice when ready.
- Start a realtime voice lesson after video intake.
- Ask comprehension questions about the video.
- Ask the learner to answer, repeat, paraphrase, role-play and produce short spoken texts.
- Evaluate whether the spoken answer matches the video lesson content and target patterns.
- Correct pronunciation/wording/grammar at a useful level without breaking conversation flow.
- Offer repeated attempts and alternative situations using the same language pattern.
- Decide lesson outcome:
  - mastered for now;
  - needs repeat;
  - needs focused drill;
  - should rewatch video segment;
  - ready for next lesson.
- Save lesson progress and learner weaknesses for future review.
- Reuse prior lesson topics naturally inside later lessons as spaced repetition.
- Keep visible assessment lightweight: useful status, not a heavy grading panel.

### Deferred Functions

- Multi-student profiles.
- Teacher dashboard.
- Formal CEFR scoring.
- Full phoneme-level pronunciation scoring if Realtime/STT output is insufficient.
- Calendar/scheduled reminders.
- Telegram adapter.
- Mobile app wrapper.
- Cloud sync.

### Critical User Workflows

- User pastes a YouTube lesson URL.
- Agent processes the video into a compact lesson derivative.
- Interface shows the embedded video and extraction/lesson readiness status.
- User watches the video in the app.
- User starts voice practice.
- Agent asks tasks based on the video.
- User speaks answers.
- Agent gives concise correction, asks for retry or increases difficulty.
- Agent marks lesson status and stores learning memory.
- In later lessons, agent brings back older weak topics in natural exercises.

## Runtime And Interface

- Runtime family: hybrid.
- Primary interface: web voice only.
- Secondary interfaces: local CLI maintenance scripts; Codex project for development.
- Telegram mode: none for v1 unless user later requests it.
- Expected hosting: local Mac or Mac mini, with optional Tailscale access.

## UI And Lesson Experience

- V1 interface mode: Web Voice Only.
- The main lesson screen should prioritize watching the YouTube video comfortably.
- The lesson screen must include a simple place to paste a YouTube URL.
- After URL submit, the app should show extraction status and then a ready-to-practice state.
- The voice agent start/control UI should sit below the video as a lightweight lesson action area.
- The UI may show simple progress/success indicators, but the real feedback should come through the teacher's spoken response.
- Avoid dashboard-heavy grading during live practice. The user should feel like they are in a real conversation.
- Keep the learner in flow:
  - short prompts;
  - one task at a time;
  - immediate conversational correction;
  - retry when useful;
  - increase difficulty naturally when answers are good.
- The agent should avoid long analytical lectures unless the user asks for a detailed explanation.

## YouTube Intake Flow

V1 user flow:

1. User opens Funny Teacher.
2. User pastes a YouTube URL into the lesson input.
3. App validates that the URL is supported.
4. App creates a lesson record with status `captured` or `extracting`.
5. App embeds or links the YouTube player for immediate viewing.
6. Background extraction creates the compact lesson derivative.
7. UI shows readiness:
   - video available;
   - extraction pending/running/ready/failed;
   - practice can start when a minimal derivative is ready.
8. User watches the video.
9. User taps a bottom voice-practice control.
10. Realtime teacher starts a lesson based on the derivative.

If extraction fails:

- keep the video available for watching;
- explain the failure in plain language;
- allow retry;
- allow a fallback mode where the user provides a short lesson summary manually.

## Operations And Service

- Deployment target: local Mac or Mac mini, to be confirmed.
- Deployment profile: local-development first.
- Service mode: manual for v1.
- Autostart: disabled initially.
- Start command: `npm run dev` in the generated project.
- Stop command: stop the owning dev-server process.
- Healthcheck command: smoke, lint, tests and build.
- Log path: `logs/`.
- Restart policy: manual.

## Proactivity

- Proactive mode: manual in v1.
- Trigger sources: user opens lesson, user starts voice practice, user asks for review.
- Schedule: none in v1.
- Heartbeat interval: none.
- Idle behavior: wait for learner action.
- User interruption policy: do not interrupt. Future spaced-repetition reminders require explicit opt-in.

## Harness Inventory

- Information boundaries: separate raw video transcript, structured lesson plan, learner memory, active voice session context and assessment result.
- Tool system: YouTube intake/transcription, lesson extraction, semantic search over prior lessons, learner-progress lookup, exercise generation, assessment recording.
- Execution orchestration: slow video processing and lesson extraction run before or outside the live voice session; realtime voice handles practice; heavier evaluation or lesson synthesis can run as queued sidecar tasks.
- Memory and state: structured lesson library plus learner model. Markdown may document artifacts, but operational state should use SQLite from v1 because progress, attempts and spaced repetition need querying.
- Evaluation and observability: lesson outcome, attempt logs, recurring error patterns, mastered/weak topics, checkable smoke tests.
- Constraints, validation and recovery: do not invent video content if transcript is unavailable; clearly mark uncertain extraction; keep corrections pedagogically useful and short; preserve learner privacy.
- Human approval gates: importing a new lesson, deleting learner history, enabling reminders, exposing the service outside trusted local/Tailscale network.
- Completion criteria: one YouTube lesson can be ingested, practiced by voice, assessed, stored, and referenced in a later lesson.

## Data, Memory And Sources

- Input data types:
  - YouTube URLs;
  - transcripts;
  - lesson notes;
  - learner voice turns/transcripts;
  - optional text answers.
- Stored data:
  - video metadata and source URL;
  - compact lesson derivative;
  - optional raw transcript only when explicitly useful and safe;
  - extracted vocabulary/patterns/tasks;
  - lesson status;
  - learner attempts;
  - corrections;
  - weak topics;
  - mastered topics;
  - spaced repetition queue.
- Sensitive data:
  - learner speech transcripts;
  - learning weaknesses;
  - OpenAI API key;
  - Codex auth;
  - possibly copyrighted video transcripts.
- Memory model:
  - SQLite operational source of truth;
  - compact Markdown lesson summaries for human inspection;
  - embeddings/semantic index for lesson/topic retrieval once corpus exists.
- Indexing/search needs:
  - search by topic, vocabulary, grammar pattern, communicative situation, lesson source, weak skill and review due date;
  - semantic search over lesson summaries and prior weak points.
- External verification needs:
  - YouTube metadata and transcript availability;
  - official OpenAI Realtime docs before implementation;
  - current YouTube/transcription tool behavior before scaffold.
- Source freshness requirements:
  - store video URL, title, channel, publication date when available, retrieved date and transcript method.

## Lesson Derivative Policy

Default storage should be a compact lesson derivative, not a full copied lesson
book.

The derivative should preserve:

- lesson topic and communicative situation;
- target vocabulary;
- target phrases and grammar/speaking patterns;
- teacher's key rules or explanations;
- examples needed for exercises;
- comprehension questions;
- speaking drills;
- role-play prompts;
- assessment criteria for this specific video.

The derivative should remove:

- filler;
- long motivational sections;
- repeated examples that add no new pattern;
- ads/sponsor blocks;
- irrelevant channel talk;
- excessive transcript text.

Raw transcript storage is optional and should be treated as sensitive/source
material. For normal use, the agent should rely on the compact derivative plus
source URL/time references.

## Correction, Assessment And Language Style

- Correction style: conversational, brief and encouraging, like a real teacher in a live speaking lesson.
- The agent should usually correct one or two important issues at a time, not every minor imperfection.
- Preferred flow:
  1. acknowledge the learner's answer naturally;
  2. give a short correction or better phrase;
  3. ask the learner to repeat or use it in a new situation;
  4. continue the conversation.
- Assessment style: lightweight continuous assessment plus a short final lesson outcome.
- Visible score: optional and simple, such as `needs practice`, `getting better`, `good for now`, `mastered for now`.
- Avoid long rubric explanations in the live lesson unless the user asks.
- Explanation language: English-first during practice to keep immersion. Russian is allowed as a rescue mode for difficult explanations, confusion, or when the user asks.
- Agent voice should feel like a friendly, funny teacher, not an exam proctor.

## Learning Memory Model

Funny Teacher memory must support personalized learning, not just storage.

Core entities:

- `lessons`: one source video or manually created lesson.
- `lesson_segments`: chunks/sections of the video lesson.
- `lesson_targets`: vocabulary, grammar, speaking pattern, pronunciation focus, communicative function.
- `exercises`: generated or extracted tasks tied to lesson targets.
- `practice_sessions`: one voice practice run.
- `attempts`: learner answer, expected target, correction, score and retry count.
- `learner_profile`: current level assumptions, preferred correction style, interests and goals.
- `skill_state`: mastered/weak/in-progress state per topic/pattern.
- `review_queue`: spaced repetition items due for reuse.

Memory behavior:

- New lessons should compare with previous targets.
- Later lessons may include natural review from older weak or important topics.
- The agent should avoid drilling old material mechanically; review should be embedded in realistic dialogue.
- Weak points should decay or strengthen based on repeated successful attempts.
- A lesson can be marked `mastered_for_now`, but not permanently mastered without later review.
- Review from previous lessons should appear as natural dialogue tasks, not as a mechanical flashcard drill unless the user asks for drills.

Lesson lifecycle statuses:

- `captured`: URL saved, metadata/transcript not processed yet.
- `extracting`: transcript/metadata/derivative extraction is running.
- `ready`: compact lesson derivative is ready for practice.
- `practicing`: voice session is active.
- `mastered_for_now`: learner passed the current lesson check.
- `needs_review`: learner should repeat or drill the material.
- `failed`: extraction failed and needs retry or manual fallback.

## Tools And Integrations

| Capability | Default Boundary | Notes |
| --- | --- | --- |
| Realtime voice practice | server API + browser WebRTC | Low-latency teacher/student conversation. |
| YouTube ingest/transcription | CLI/script | Prefer project-local scripts based on Techscope transcription patterns. |
| Lesson extraction | Codex sidecar or API model | Converts transcript into structured lesson plan and tasks. |
| YouTube player | web UI | Embedded or linked viewer on the lesson screen. |
| Assessment recorder | local API/SQLite | Stores attempts, corrections, scores and lesson outcome. |
| Semantic lesson search | local embeddings | Finds related prior lessons and weak points for review. |
| Codex development sidecar | CLI/script | Implementation, tests and scaffold operations. |

## Security And Permissions

- Secrets required: OpenAI API key; optional Codex CLI auth outside project.
- `.env.example` variables:
  - `OPENAI_API_KEY`;
  - `OPENAI_REALTIME_MODEL`;
  - `OPENAI_REALTIME_VOICE`;
  - `OPENAI_INPUT_TRANSCRIBE_MODEL`;
  - `APP_BASE_URL`;
  - `ALLOWED_ORIGINS`;
  - `FUNNY_TEACHER_DB_PATH`;
  - optional transcription settings.
- Allowed network access: OpenAI Realtime/API; YouTube/transcript retrieval; optional source metadata lookup.
- Allowed filesystem access: generated Funny Teacher project folder and its data directory.
- User authorization model: single trusted local learner in v1.
- Risk notes:
  - learner voice transcripts are sensitive;
  - YouTube transcript storage may have copyright implications, so store compact lesson derivatives when possible;
  - do not expose without auth;
  - do not claim exact pronunciation scoring unless the implementation measures it.

## Scaffold Requirements

- Target folder: `/Users/jkl/FunnyTeacher` unless user chooses another path.
- Files to generate:
  - `AGENTS.md`;
  - `README.md`;
  - `.env.example`;
  - `docs/architecture.md`;
  - `docs/operator-guide.md`;
  - `interfaces/manifest.json`;
  - `memory/manifest.json`;
  - `tools/manifest.json`;
  - `operations/manifest.json`;
  - scripts for smoke/status;
  - scripts for YouTube lesson ingest;
  - API route for YouTube lesson submit/extraction status;
  - web voice UI with lesson video area and bottom voice-practice controls.
- Dependencies: to be selected after research; likely Next.js/React, SQLite, OpenAI Realtime, YouTube/transcription utilities, local embeddings later.
- Setup commands: `npm install`, configure `.env.local`, run dev server.
- Run commands: `npm run dev`, `npm run smoke`, `npm test`.
- Tests/healthchecks:
  - config loads;
  - lesson ingest with fixture transcript;
  - lesson extraction produces structured targets;
  - assessment recorder stores attempt;
  - review queue selects prior weak target;
  - realtime tool contracts validate.
  - lesson page renders a video placeholder/player area and voice start controls.
  - YouTube URL submit creates a lesson record and extraction job/status.
- User training guide:
  - how to add a YouTube lesson;
  - how to watch the lesson inside the app;
  - how to start practice;
  - how to interpret assessment;
  - how to repeat or move on.

## Research Basis

- Related TechScope artifacts:
  - `04_standards/realtime-voice-control-for-codex-agents.md`;
  - `07_workflows/agents-mother.md`;
  - `07_workflows/youtube-transcription.md`;
  - local Techscope YouTube transcription scripts and patterns.
- Current primary sources checked: pending.
- Trusted secondary sources checked: pending.
- Alternatives considered:
  - clone FESPA26: rejected; Funny Teacher should be built from scratch.
  - use only chat/text: rejected; speaking practice is core.
  - web voice plus heavy text dashboard: rejected for v1; user wants natural conversation flow.
  - full transcript as primary memory: rejected for v1; compact lesson derivative is preferred.
  - use Realtime as the whole teacher brain: rejected; lesson memory and assessment require structured tools.
- Decision rationale: use voice-agent boundary as a pattern, but create a new domain-specific learning harness and memory model.

## Open Questions Before Scaffold

- Confirm exact generated folder name: `/Users/jkl/FunnyTeacher` or another spelling.
- Which sample YouTube URL or fixture transcript should be used in automated tests, if real YouTube access is unavailable in CI/local test mode?
- Should v1 use OpenAI API models directly for lesson extraction, Codex CLI, or both?
- Should voice practice use `gpt-realtime-2` by default, or should we research the current best Realtime model before scaffold?
- Should the YouTube player use embedded iframe only, or also store local transcript/time references linked to video timestamps?

## Acceptance Checklist

- [x] Contract reviewed with user.
- [ ] Runtime family selected.
- [x] Interface mode selected.
- [x] Telegram need explicitly decided.
- [x] Harness inventory complete.
- [x] Security model documented.
- [x] Tests/healthchecks defined.
- [x] Handoff/training plan defined.
- [x] YouTube URL intake flow selected.
- [x] Semantic search layer selected and integrated into realtime tools.
- [ ] YouTube fixture strategy selected.
- [x] Memory model reviewed with user.
