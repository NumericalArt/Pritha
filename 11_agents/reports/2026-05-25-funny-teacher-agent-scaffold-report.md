---
id: 2026-05-25-funny-teacher-agent-scaffold-report
type: scaffold-report
status: complete
created: 2026-05-25
updated: 2026-05-25
topics:
  - agent-engineering
  - funny-teacher
  - voice-agents
  - language-learning
  - semantic-search
tools:
  - Codex
  - Next.js
  - OpenAI Realtime API
  - SQLite
  - OpenAI embeddings
agent_platforms:
  - Codex
  - OpenAI Realtime API
model_context:
  - gpt-realtime-2
  - text-embedding-3-small
runtime_environment:
  - web-ui
  - local-project
  - mac
config_surfaces:
  - AGENTS.md
  - .env.example
  - interfaces/manifest.json
  - memory/manifest.json
  - tools/manifest.json
  - operations/manifest.json
portability: adapter-needed
sources:
  - 11_agents/contracts/2026-05-25-funny-teacher-agent-contract.md
  - 04_standards/realtime-voice-control-for-codex-agents.md
  - 07_workflows/agents-mother.md
related:
  agent_contracts:
    - 11_agents/contracts/2026-05-25-funny-teacher-agent-contract.md
  workflows:
    - 07_workflows/agents-mother.md
  standards:
    - 04_standards/realtime-voice-control-for-codex-agents.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-25
source_updated: 2026-05-25
source_version: scaffold v1
retrieved: 2026-05-25
verified: 2026-05-25
valid_for: initial Funny Teacher local web voice scaffold
temporal_status: current
---

# Agent Scaffold Report: Funny Teacher

Date: 2026-05-25
Status: complete

## Summary

- Agent name: Funny Teacher
- Target folder: `/Users/jkl/FunnyTeacher`
- Contract: `11_agents/contracts/2026-05-25-funny-teacher-agent-contract.md`
- Runtime: local Next.js web app with Codex-native project instructions.
- Primary interface: Web Voice Only.
- Telegram: not included in v1.
- Operations: manual local dev server, no autostart.
- Memory: SQLite operational memory plus required semantic search layer.

## Implemented

- Created independent project scaffold in `/Users/jkl/FunnyTeacher`.
- Added `AGENTS.md`, `README.md`, `.env.example`, docs, interface/memory/tools/operations manifests.
- Added Next.js app with YouTube URL input, embedded video area, bottom voice controls and EN/RU switch.
- Added lesson API:
  - `POST /api/lessons`
  - `GET /api/lessons`
  - `GET /api/lessons/[id]`
- Added SQLite schema for lessons, targets, exercises, sessions, attempts, skill state and semantic chunks.
- Added compact lesson derivative extraction from metadata/transcript/manual notes.
- Added semantic memory:
  - `semantic_chunks` table;
  - OpenAI embeddings when `OPENAI_API_KEY` is configured;
  - lexical fallback when embeddings are unavailable;
  - `POST /api/semantic/query`.
- Added Realtime voice session endpoint:
  - `POST /api/realtime/session`;
  - keeps permanent API key server-side;
  - sends lesson context and tool schemas.
- Added Realtime tool endpoint:
  - `search_lesson_memory`;
  - `record_attempt`;
  - `set_lesson_outcome`.
- Added smoke, test, health, interface, memory, operations and deployment-status scripts.

## Semantic Search Rule

Semantic search is not optional for Funny Teacher v1. The Realtime teacher is instructed to call `search_lesson_memory` when the learner asks about words, translations, phrase patterns, grammar, older lessons or weak points.

The semantic layer is derivative and rebuildable. If embeddings are unavailable, the API still answers through lexical scoring, so voice practice remains usable without silently failing.

## Verification

| Check | Result | Notes |
| --- | --- | --- |
| `npm install` | pass | dependencies installed |
| `npm run smoke` | pass | structure and realtime semantic wiring checked |
| `npm test` | pass | 2 node tests |
| `npm run build` | pass | Next.js 16.2.6 production build |
| `npm audit --omit=dev` | pass | 0 vulnerabilities after PostCSS override |
| `GET /api/health` | pass | SQLite initialized, voice secret not configured |
| `POST /api/lessons` | pass | YouTube lesson created from URL |
| `POST /api/semantic/query` | pass | semantic query returned lesson chunks |
| `POST /api/realtime/session` without key | pass | returns 503 instead of leaking/copying secrets |

## Current Limitation

- OpenAI voice call was not completed because `OPENAI_API_KEY` is intentionally not copied into the project.
- YouTube transcript extraction currently falls back to metadata/manual notes when transcript is unavailable.
- Browser visual automation plugin was not available as a callable tool in this session; UI was verified by build and live API checks, not screenshot.

## Next Steps

- Add `.env.local` with `OPENAI_API_KEY` when ready to test voice.
- Open the app at `http://127.0.0.1:3033`.
- Paste a YouTube lesson URL.
- Watch the video, then press `Talk`.
- After the first real lesson, create a post-creation review to decide which Funny Teacher patterns should be promoted back into Agents Mother standards.
