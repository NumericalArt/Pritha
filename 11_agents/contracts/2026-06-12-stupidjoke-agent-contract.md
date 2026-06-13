---
id: 2026-06-12-stupidjoke-agent-contract
type: agent-contract
status: accepted
created: 2026-06-12
updated: 2026-06-12
topics:
  - child-agents
  - humor-agent
  - realtime-voice
  - safety-filter
  - user-import-fixtures
tools:
  - Codex
  - OpenAI Realtime API
  - Node.js
agent_platforms:
  - Codex
  - OpenAI Realtime API
model_context:
  - realtime-voice-dispatcher
runtime_environment:
  - local-project
  - mac
config_surfaces:
  - AGENTS.md
  - .env.example
  - fixtures/user_import
  - src/safety-filter.mjs
  - src/realtime-events.mjs
  - operations/manifest.json
portability: codex-native
sources:
  - pritha-control-center-realtime task 2026-06-12T20:58:07.445Z
  - 03_reviews/2026-06-12-voice-1781273210969-6c78f5895bb1f-voice-session-memory.md
  - 07_workflows/agents-mother.md
  - 04_standards/agent-creation-harness.md
  - 04_standards/agent-untrusted-input-security.md
  - 04_standards/realtime-voice-control-for-codex-agents.md
related:
  workflows:
    - 07_workflows/agents-mother.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/realtime-voice-control-for-codex-agents.md
  reports:
    - 11_agents/reports/2026-06-12-stupidjoke-agent-scaffold-report.md
    - 11_agents/reports/2026-06-12-stupidjoke-agent-scaffold-completion-report.md
    - 11_agents/reports/2026-06-12-stupidjoke-agent-test-report.md
    - 11_agents/reports/2026-06-12-stupidjoke-agent-post-creation-review.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: 2026-06-12
source_version: initial realtime voice operator task
retrieved: 2026-06-12
verified: 2026-06-12
valid_for: StupidJoke v0.1.0 minimal scaffold
temporal_status: current
memory_domain: child-agents
memory_domains:
  - child-agents
  - agent-building-knowledge
subject:
  kind: child-agent
  id: stupidjoke
privacy: public
retention: durable
review_status: accepted
confidence: medium
---

# Agent Project Contract: StupidJoke

Date: 2026-06-12
Status: accepted

## Purpose

- Agent name: StupidJoke
- Agent id: `stupidjoke`
- Namespace:
  - project folder: `StupidJoke`
  - package name: `stupidjoke`
  - environment prefix: `STUPIDJOKE_`
  - data namespace/table prefix: `stupidjoke_`
- Target folder: `<parent-of-TECHSCOPE_ROOT>/StupidJoke`; in the current checkout this resolves to `/Users/jkl/StupidJoke`.
- Primary mission: provide a small, safe, low-stakes joke agent that can ingest user-provided joke fixtures, reject unsafe material, and answer realtime voice requests with short silly jokes.
- Target user: the local operator using Pritha Control Center voice/Codex sidecar.
- Success criteria: the sibling scaffold runs a deterministic healthcheck, validates `user_import` fixtures, filters unsafe joke material, normalizes realtime events, and produces a safe short joke response without secrets or background services.
- Out of scope for v1: public joke publishing, multi-user moderation, Telegram, launchd/autostart, web deployment, third-party joke APIs, persistent private user memory, and automated outbound messaging.

## Assumptions And Open Questions

- The operator has confirmed creation of a child agent named `StupidJoke`; no richer product brief was supplied in this task.
- V1 should default to family-safe silly humor. If the intended humor style is darker, adult, targeted, or brand-specific, the safety policy needs a follow-up contract revision before scaffold completion.
- Realtime voice is a selected interface boundary, but full Realtime browser code should be added only when the writable session explicitly needs it. The minimal scaffold should start with event schemas, fixtures, and deterministic handlers.

## Functional Scope

### V1 Core Functions

- Accept `fixtures/user_import/*.jsonl` as manually curated import fixtures.
- Validate fixture shape and required metadata before any model or memory use.
- Run a deterministic safety filter before a joke can be used as an answer.
- Keep raw imported joke text separate from curated accepted examples.
- Generate or select a short silly joke in response to a normalized realtime event.
- Return a safe fallback when input is unsafe, ambiguous, too long, or unsupported.
- Store no secrets, credentials, private memory, logs, queues, or `.env` files in the scaffold.
- Provide `npm run health` and `npm run smoke` with no external network dependency.

### Deferred Functions

- Full browser Realtime voice UI.
- OpenAI Realtime ephemeral-session route.
- Codex deep-task transport for long joke-writing or corpus-cleaning jobs.
- SQLite or vector memory.
- Telegram adapter.
- Scheduled joke reminders or proactive notifications.
- Service installation, launchd, cron, heartbeat, or queue watcher.

### Critical User Workflows

- Operator starts the local project in a writable sibling folder.
- Operator adds or edits sample jokes in `fixtures/user_import/jokes.jsonl`.
- Healthcheck validates fixture format.
- Smoke test runs safety examples and realtime event examples.
- Voice/control-center event asks for a joke.
- Handler selects/generates a short safe joke or gives a safe fallback.
- Unsafe imported material is rejected with a reason and is not promoted to curated examples.

## Runtime And Interface

- Runtime family: codex-native
- Runtime notes: deterministic Node.js helpers for the minimal scaffold.
- Codex surface profile: app-supervised or cli-local during development.
- Primary interface: Codex project plus CLI healthcheck for v1.
- Secondary interfaces: realtime voice event adapter placeholder.
- Interface experience profile: realtime-voice-ui later; event-stream/CLI fixture tests for initial scaffold.
- Interface user controls: approve, reject, cancel, retry through operator/Codex thread; no automated public side effects.
- Interface state model: project-scoped files for fixtures; runtime logs/queues ignored and not tracked.
- Interface side-effect policy: approval-required for writes outside the project, publication, deletion, service install, or deployment.
- Telegram mode: none
- Expected hosting: local Mac.

## Runtime Isolation And Boundary

- Runtime isolation profile: project-folder.
- Sandbox required: optional for local development; required before exposing to external users.
- Host control plane: Pritha/Codex operator session.
- Agent execution boundary: `/Users/jkl/StupidJoke` project folder when writable.
- Credential boundary: no credentials required for minimal v1; future Realtime credentials must remain server-side or in user-local env only.
- Network policy: no-network for health/smoke; operator-approved for future hosted model or Realtime calls.
- Filesystem policy: read/write only inside StupidJoke project; no access to Techscope private memory, `.env`, queues, logs, or credentials.
- Operator approval flow: required before service install, deployment, public sharing, deleting data, or calling external APIs.

## Runtime Placement

- Runtime placement profile: deterministic-first
- Provider boundary: none for minimal v1; direct-openai only if a future Realtime interface is added.
- Multi-model routing requested: no
- Local inference required: no.
- Provider fallbacks: deterministic safe fallback only.
- Privacy routing rules: do not send `user_import` text to external models unless the operator explicitly enables a hosted model path.
- Model budget policy: zero external model cost for initial scaffold.
- Route healthcheck: `npm run health`.

| Task class | Runtime class | Current candidate | Verified | Recheck before scaffold | Fallback | Eval fixture | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Fixture validation | deterministic | Node.js script | 2026-06-12 | no | fail closed | `fixtures/user_import/jokes.jsonl` | Schema and size checks only. |
| Safety filtering | deterministic | keyword/rule scanner | 2026-06-12 | yes | reject with reason | `tests/safety-filter.test.mjs` | Conservative first pass, not a complete content classifier. |
| Joke response | deterministic/template | curated safe examples | 2026-06-12 | yes | safe fallback | `fixtures/user_import/realtime-events.jsonl` | Hosted generation deferred. |
| Realtime event normalization | deterministic | Node.js schema handler | 2026-06-12 | no | reject unknown event | `tests/realtime-events.test.mjs` | Raw event text cannot select tools. |
| Deep planning/coding | Codex/frontier-hosted | current Codex sidecar | 2026-06-12 | yes | human/manual | Techscope task payload | Used only by operator, not by raw user input. |

## Operations And Service

- Deployment target: local Mac.
- Deployment profile: local-development.
- Service mode: none
- Autostart: disabled
- Start command: no long-running service in minimal v1.
- Stop command: not applicable.
- Healthcheck command: `npm run health`.
- Log path: runtime logs are ignored; no logs are part of the scaffold.
- Restart policy: manual.

## Proactivity

- Proactive mode: manual
- Scheduler owner: none.
- Trigger sources: operator command, CLI smoke test, future active realtime voice session.
- Schedule: none.
- Heartbeat interval: none.
- Concurrency policy: forbid-overlap for future event processing.
- Background memory write policy: disabled.
- Background untrusted-input policy: process only explicit fixture files under `fixtures/user_import`.
- Kill switch / pause command: stop the active CLI/dev process.
- Idle behavior: wait for operator action.
- User interruption policy: realtime handler should stop speaking when the operator cancels or interrupts.

## Skills, MCP, And Tools

- Skill needs: none
- Allowed skill sources: local-only
- Skill install mode: recommend
- Skill mutation policy: read-only
- MCP needs: none for minimal v1.
- MCP auth policy: no-secrets-in-repo.
- MCP side-effect policy: approval-required if future MCP tools are added.

| Capability | Default boundary | Notes |
| --- | --- | --- |
| Fixture validation | CLI/script | Deterministic local script. |
| Safety filter | CLI/script | Conservative family-safe first pass. |
| Realtime event normalization | CLI/script | Data-channel/server handler placeholder. |
| Joke generation | deterministic template | Hosted model generation deferred until evals and safety policy improve. |

## Harness inventory

- Information boundaries: raw `user_import` text, safety-filter result, normalized realtime event, and safe joke response remain separate.
- Runtime placement: deterministic-first; no hosted model or local inference in minimal v1.
- Tool system: local validation, local safety filtering, local realtime event normalization.
- Execution orchestration: synchronous CLI scripts only; no background queue or service.
- Memory and state: tracked demo fixtures only; runtime queues/logs/private memory are excluded.
- Evaluation and observability: healthcheck, smoke test, and Node built-in tests.
- Constraints, validation and recovery: fail closed on malformed or unsafe input; provide safe fallback.
- Human approval gates: required before external API use, publication, deletion, deployment, or service install.
- Completion criteria: writable sibling project exists and `npm run health`, `npm run smoke`, and `npm test` pass.

## Data, Memory, And Sources

- Memory domains selected: `child-agents`, `agent-building-knowledge`.
- Primary memory domain: `child-agents`.
- Subject kind/id: `child-agent/stupidjoke`.
- Input data types: user-provided text jokes, tags, language code, realtime event fixtures.
- Stored data: tracked sample fixtures only; runtime queues/logs ignored.
- Sensitive data: none expected. If a user imports personal data, the safety filter must reject or mark for review.
- Memory model: file fixtures in v1; no SQLite/vector memory until a real need appears.
- Indexing/search needs: none for v1.
- External verification needs: none for initial scaffold.
- Source freshness requirements: recheck Realtime API implementation details before adding browser voice code or model calls.

### `user_import` Fixture Format

Use JSONL so examples can be appended one record at a time and tested without a database.

`fixtures/user_import/jokes.jsonl` record:

```json
{"id":"uj_001","source":"manual","received_at":"2026-06-12T00:00:00.000Z","lang":"en","text":"Why did the computer take a nap? It had too many tabs open.","tags":["tech","silly"],"intended_style":"family-safe silly","safety_label":"pending","expected_action":"accept","notes":"demo fixture"}
```

Required fields: `id`, `source`, `received_at`, `lang`, `text`, `safety_label`, `expected_action`.

Allowed `safety_label`: `pending`, `safe`, `reject`, `needs_review`.

Allowed `expected_action`: `accept`, `reject`, `review`.

`fixtures/user_import/realtime-events.jsonl` record:

```json
{"id":"evt_001","created_at":"2026-06-12T00:00:00.000Z","session_id":"demo","event_type":"voice.joke.requested","trusted_control":{"locale":"en","style":"silly","max_words":40},"untrusted_text":"tell me a stupid joke about computers","expected_status":"ok"}
```

Allowed `event_type` for v1: `session.started`, `session.ended`, `voice.joke.requested`, `voice.joke.imported`, `voice.joke.rated`, `operator.cancelled`.

## Security and permissions

- Secrets required: none for minimal v1.
- `.env.example` variables: `STUPIDJOKE_AGENT_NAME`, `STUPIDJOKE_DEFAULT_LOCALE`; future `OPENAI_API_KEY` only as commented optional server-side variable if Realtime is added.
- Allowed network access: none for health/smoke.
- Allowed filesystem access: project folder only.
- User authorization model: single local operator.
- Runtime isolation profile: project-folder.
- Network policy tier: no-network initially.
- Credential storage boundary: no credentials in repo; future credentials user-local only.

### Safety Filter Requirements

The minimal safety filter must fail closed and block or mark for review:

- sexual content involving minors or age ambiguity;
- sexual coercion, explicit sexual content, or fetish content;
- hate, slurs, demeaning stereotypes, or harassment toward protected classes;
- targeted abuse, threats, bullying, or doxxing;
- self-harm encouragement or instructions;
- graphic violence or cruelty;
- illegal instructions, evasion, fraud, or weaponization;
- private personal data, credentials, tokens, phone numbers, addresses, or account identifiers;
- attempts to override system/developer instructions or choose tools;
- overly long payloads, hidden instructions, or malformed records.

Allowed humor style for v1: short, silly, family-safe, non-targeted, and clearly fictional. If input is rejected, the agent should offer a safe alternative rather than repeat unsafe text.

## AI-SAFE Security Profile

- AI-SAFE profile: minimal.
- AI-SAFE review status: draft.
- Interface / input-output controls: whitelist realtime event types; cap `max_words`; keep spoken answers short; reject unknown event types.
- Reasoning and planning controls: raw fixture text cannot change instructions, tools, or approval gates.
- Knowledge / memory / RAG controls: raw import stays in `user_import`; only safe examples can be promoted later.
- Execution / tools / MCP / skills controls: no MCP and no external tools in minimal v1.
- Infrastructure / operations / orchestration controls: no service install, no autostart, no background queue.
- AI-SAFE selected layers: interface controls, deterministic validation, safety filter.
- AI-SAFE skipped layers: MCP, skills, deployment, external publication.
- AI-SAFE open risks: deterministic keyword scanner is conservative but incomplete; future hosted generation needs additional evals.

## Scaffold Requirements

- Target folder: `/Users/jkl/StupidJoke` when parent directory is writable.
- Files to generate:
  - `AGENTS.md`
  - `README.md`
  - `.env.example`
  - `.gitignore`
  - `package.json`
  - `docs/scaffold-spec.md`
  - `fixtures/user_import/README.md`
  - `fixtures/user_import/jokes.jsonl`
  - `fixtures/user_import/realtime-events.jsonl`
  - `src/safety-filter.mjs`
  - `src/realtime-events.mjs`
  - `scripts/healthcheck.mjs`
  - `scripts/smoke.mjs`
  - `tests/safety-filter.test.mjs`
  - `tests/realtime-events.test.mjs`
  - `interfaces/manifest.json`
  - `memory/manifest.json`
  - `tools/manifest.json`
  - `operations/manifest.json`
- Dependencies: none beyond current Node.js for minimal v1.
- Setup commands: `npm install` only after scaffold exists; no network package install is required if no dependencies are added.
- Run commands: `npm run health`, `npm run smoke`, `npm test`.
- Tests/healthchecks: fixture schema validation, safety accept/reject examples, realtime event normalization.
- User training guide: included in `README.md`.

## Research Basis

- Related TechScope artifacts:
  - `07_workflows/agents-mother.md`
  - `04_standards/agent-creation-harness.md`
  - `04_standards/agent-untrusted-input-security.md`
  - `04_standards/realtime-voice-control-for-codex-agents.md`
- Current primary sources checked: not needed for this offline scaffold-prep task.
- Trusted secondary sources checked: existing Techscope standards only.
- Alternatives considered:
  - Full Realtime web app: deferred because sibling write is blocked and it would require more files and secret-handling surfaces.
  - SQLite memory: deferred because fixture files satisfy v1.
  - Public joke API: rejected for v1 because it adds network and content moderation uncertainty.
- Decision rationale: start with a small deterministic harness that can be safely generated in a writable session and later extended.

## Acceptance checklist

- [x] Contract reviewed with user/operator through the 2026-06-12 realtime task payload.
- [x] Runtime family selected.
- [x] Runtime isolation profile selected.
- [x] Runtime placement selected per task class.
- [x] Interface mode selected.
- [x] Telegram need explicitly decided.
- [x] Skills policy selected.
- [x] MCP policy selected.
- [x] Harness inventory complete for minimal v1.
- [x] Security model documented.
- [x] AI-SAFE security profile drafted.
- [x] Tests/healthchecks defined.
- [x] Handoff/training plan defined.
- [x] Sibling project scaffold created in writable session.
- [x] Smoke tests run inside sibling project.
