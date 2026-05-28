---
id: 2026-05-19-fespa26-agent-contract
type: agent-contract
status: draft
created: 2026-05-19
updated: 2026-05-19
topics:
  - agent-engineering
  - agent-factory
  - harness-engineering
  - fespa26
tools:
  - Codex
  - AGENTS.md
agent_platforms:
  - Codex
model_context:
  - gpt-realtime-2
  - Codex CLI
runtime_environment:
  - hybrid
config_surfaces:
  - AGENTS.md
  - workflows
  - scripts
portability: codex-native
sources:
  - user-interview
  - https://developers.openai.com/api/docs/models/gpt-realtime-2
  - https://developers.openai.com/api/docs/guides/realtime-conversations
  - https://developers.openai.com/api/reference/resources/realtime
  - 07_workflows/agents-mother.md
  - 04_standards/agent-creation-harness.md
related:
  intakes: []
  briefs: []
  reviews: []
  decisions: []
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-environment-compatibility.md
    - 04_standards/agent-tool-integration-selection.md
  workflows:
    - 07_workflows/agents-mother.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-19
source_updated: 2026-05-19
source_version: contract draft v1
retrieved: 2026-05-19
verified: pending
valid_for: initial FESPA26 local web agent design
temporal_status: current
---

# Agent Project Contract: FESPA26

Date: 2026-05-19
Status: draft

## Purpose

- Agent name: FESPA26
- Primary mission: Voice-first Codex CLI agent for processing FESPA 2026 media and building a bilingual live news feed for Durst, Flora, Scodix, PrintFactory and related exhibitors
- Target user: single operator
- Success criteria: user can speak with the agent in Russian or English, upload/link media, have the material saved into local memory, and see generated/curated feed cards in a mobile-first vertical web feed.
- Out of scope: public multi-user deployment, automatic publishing to external social networks, paid ad buying, unattended web scraping at scale, and automatic long-running service/autostart without explicit approval.

## Functional scope

### V1 core functions

- Web UI with three tabs: voice console, mobile-first live feed, and settings.
- Realtime voice dialogue using `gpt-realtime-2` as the conversational dispatcher.
- Codex CLI sidecar as the agent core for heavier reasoning, media/news synthesis, planning, and feed-edit proposals.
- Media intake for text paste, links, uploaded files, photos/images, YouTube URLs and web resources.
- Local memory for ingested sources, extracted facts, feed items, design settings, dialogue notes and processing jobs.
- Dynamic feed projection from memory: text cards, images, file/media references, tables, charts and embeddable module placeholders.
- Bilingual Russian/English interaction and quick UI/feed language switch.
- Operator-controlled processing: ingest, analyze, generate feed item, edit feed design, run smoke checks.

### Deferred functions

- Fully automatic background ingestion queue.
- Telegram intake adapter.
- Production auth beyond single local operator.
- OCR/transcription/video processing for every format.
- External publishing/export pipelines.
- Embeddings/vector search and graph memory if v1 lexical/SQLite memory proves insufficient.
- Launchd/autostart service profile.

### Critical user workflows

- Talk to the agent by voice and ask it to summarize FESPA booth work or propose feed updates.
- Paste a text/link or upload a media file and ask the agent to extract useful news-feed material.
- Open the feed tab on a phone-sized viewport and review the generated vertical stream.
- Switch UI/feed language between Russian and English without losing state.
- Ask the agent to change feed style, ordering, emphasis, or content blocks.
- Run a local smoke test before using the agent at the exhibition.

## Runtime and interface

- Runtime family: hybrid
- Primary interface: web
- Secondary interfaces: local CLI maintenance scripts
- Telegram mode: none
- Expected hosting: local Mac first; Mac mini service later only after approval

## Operations and service

- Deployment target: local Mac
- Deployment profile: local-development
- Service mode: manual
- Autostart: disabled
- Start command: npm run dev
- Stop command: stop the dev server process
- Healthcheck command: npm run test && npm run build
- Log path: logs/
- Restart policy: manual unless contract is updated

## Proactivity

- Proactive mode: manual
- Trigger sources: voice command, UI ingest form, local CLI command
- Schedule: not-applicable
- Heartbeat interval: not-applicable
- Idle behavior: sleep until trigger
- User interruption policy: do not interrupt unless configured by user

## Harness inventory

- Information boundaries: separate realtime conversation state, durable local memory, raw uploads, generated feed items and operator settings.
- Tool system: Realtime function tools call server-side handlers; Codex CLI runs through a controlled sidecar wrapper; file/web/Youtube handlers are explicit tools.
- Execution orchestration: fast voice path remains realtime; slow media/research/feed synthesis goes through jobs and Codex sidecar; UI shows status without blocking speech.
- Memory and state: SQLite source-of-truth sidecar for projects, dialogue turns, sources, media assets, extracted facts, feed items, jobs and UI settings.
- Evaluation and observability: health endpoint, smoke test, job status, runtime status, structured logs and sample feed validation.
- Constraints, validation and recovery: local single-user only, no hidden autostart, no copied secrets, bounded upload directory, explicit job status and fail-closed Codex runtime.
- Human approval gates: operator approval before deleting memory, enabling external publishing, enabling autostart, or broadening filesystem/network access.
- Completion criteria: web app starts, healthcheck passes, three tabs render, ingest creates memory records, feed renders records, settings switch language/model, Codex runtime status is visible.

## Data, memory and sources

- Input data types: voice dialogue, pasted text, web links, YouTube links, uploaded files, photos/images, audio/video references and manual notes.
- Stored data: dialogue turns, source records, extracted facts, media metadata, feed items, design settings, jobs and logs.
- Sensitive data: OpenAI API key, Codex auth, exhibition media before publication, private booth/customer notes.
- Memory model: SQLite-first operational memory plus Markdown docs; raw media stored under local uploads and referenced from DB.
- Indexing/search needs: keyword search in v1; semantic/vector search deferred until enough corpus exists.
- External verification needs: official exhibitor/vendor pages, OpenAI docs, web resources linked by user, and manual verification for claims before public use.
- Source freshness requirements: record source URL, received date, publication/update date when available, booth/company context and verification status.

## Tools and integrations

| Capability | Default boundary | Notes |
| --- | --- | --- |
| Voice dialogue | OpenAI Realtime API | `gpt-realtime-2` with tool_choice auto and server-side tools |
| Agent core | Codex CLI | Controlled sidecar for heavier synthesis and feed-edit proposals |
| Media intake | CLI/script + API route | Upload/link/text handlers write to memory/jobs |
| Feed rendering | Web UI | Mobile-first vertical projection from memory |
| External verification | browser/API/manual | Use official sources first; no blind claims |

## Security and permissions

- Secrets required: OpenAI API key; Codex CLI auth via local Codex installation; optional proxy later.
- `.env.example` variables: OPENAI_API_KEY, OPENAI_REALTIME_MODEL, CODEX_BIN, AGENT_DATA_DIR, FESPA26_ALLOWED_ORIGIN.
- Allowed network access: OpenAI API plus user-provided URLs and official source verification.
- Allowed filesystem access: agent project folder and configured local data/uploads directory only by default.
- User authorization model: local operator
- Risk notes: no public deployment without auth; no automatic publishing; uploaded media may contain private exhibition/customer information.

## Scaffold requirements

- Target folder: /Users/jkl/FESPA26
- Files to generate: AGENTS.md, README.md, .env.example, Next.js app, API routes, memory schema, Codex runtime wrapper, ingest scripts, smoke tests, operations notes and user training guide.
- Dependencies: Next.js, React, TypeScript, Zod, SQLite via Node runtime, OpenAI Realtime API over WebRTC, Codex CLI via local binary.
- Setup commands: npm install; cp .env.example .env.local; configure OPENAI_API_KEY and CODEX_BIN.
- Run commands: npm run dev; npm run test; npm run build.
- Tests/healthchecks: smoke test, TypeScript/build, API health, memory initialization, feed sample rendering.
- User training guide: first exercise ingests a text/link about FESPA and creates a bilingual feed item.

## Research basis

- Related TechScope artifacts: 07_workflows/agents-mother.md; 04_standards/agent-creation-harness.md; 04_standards/agent-environment-compatibility.md; 04_standards/agent-tool-integration-selection.md
- Current primary sources checked: OpenAI gpt-realtime-2 model page; OpenAI Realtime conversations/function calling guide; OpenAI Realtime API reference.
- Trusted secondary sources checked: pending
- Alternatives considered: reuse gpt-realtime-mini plus background chunk enrichment; use only Codex CLI without realtime tool calling; use Telegram-first interface.
- Decision rationale: `gpt-realtime-2` is selected for stronger realtime instruction following and tool use; Codex CLI remains the heavier sidecar instead of being placed directly in the low-latency speech path.

## Acceptance checklist

- [x] Contract reviewed with user.
- [x] Runtime family selected.
- [x] Interface mode selected.
- [x] Telegram need explicitly decided.
- [x] Harness inventory complete.
- [x] Security model documented.
- [x] Tests/healthchecks defined.
- [x] Handoff/training plan defined.
