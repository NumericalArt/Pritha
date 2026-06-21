---
id: 2026-06-12-stupidjoke-agent-scaffold-report
type: scaffold-report
status: failed
created: 2026-06-12
updated: 2026-06-12
topics:
  - child-agents
  - stupidjoke
  - scaffold
  - realtime-voice
  - safety-filter
tools:
  - Codex
  - Node.js
agent_platforms:
  - Codex
model_context:
  - realtime-voice-dispatcher
runtime_environment:
  - local-project
  - mac
config_surfaces:
  - AGENTS.md
  - .env.example
  - fixtures/user_import
  - scripts
  - operations/manifest.json
portability: codex-native
sources:
  - 11_agents/contracts/2026-06-12-stupidjoke-agent-contract.md
  - pritha-control-center-realtime task 2026-06-12T20:58:07.445Z
  - 07_workflows/agents-mother.md
  - 04_standards/agent-creation-harness.md
related:
  agent_contracts:
    - 11_agents/contracts/2026-06-12-stupidjoke-agent-contract.md
  workflows:
    - 07_workflows/agents-mother.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/realtime-voice-control-for-codex-agents.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: 2026-06-12
source_version: scaffold preparation blocked by current sandbox boundary
retrieved: 2026-06-12
verified: 2026-06-12
valid_for: next writable session that can create <SIBLING_AGENT_ROOT>/StupidJoke
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
review_status: draft
confidence: high
---

# Agent Scaffold Report: StupidJoke

Date: 2026-06-12
Status: failed

## Summary

- Agent name: StupidJoke
- Target folder: `<SIBLING_AGENT_ROOT>/StupidJoke`
- Contract: `11_agents/contracts/2026-06-12-stupidjoke-agent-contract.md`
- Runtime family: codex-native with deterministic Node.js helpers.
- Interfaces: Codex/CLI first, realtime voice event adapter placeholder.
- Telegram mode: none.
- Result: sibling scaffold was not created because the current sandbox can write inside `<LEGACY_TECHSCOPE_ROOT>` but cannot write to the parent sibling location `<USER_HOME>`.

## Write Checks

Executed from `<LEGACY_TECHSCOPE_ROOT>`:

| Check | Result | Notes |
| --- | --- | --- |
| `pwd` | pass | Current directory is `<LEGACY_TECHSCOPE_ROOT>`. |
| `git rev-parse --show-toplevel` | pass | Git root is `<LEGACY_TECHSCOPE_ROOT>`. |
| `test -w .` | pass | Techscope itself is writable. |
| `test -w ..` | fail | Parent `<USER_HOME>` is not writable in the active sandbox. |
| `test -e ../StupidJoke` | pass | Target sibling does not currently exist. |

No `mkdir`, service install, deletion, publication, launchd, cron, queue, or broad deployment action was attempted outside the writable Techscope root.

## Prepared Scaffold Package

The next writable session should create this sibling folder:

```text
<SIBLING_AGENT_ROOT>/StupidJoke/
  AGENTS.md
  README.md
  .env.example
  .gitignore
  package.json
  docs/
    scaffold-spec.md
  fixtures/
    user_import/
      README.md
      jokes.jsonl
      realtime-events.jsonl
  src/
    safety-filter.mjs
    realtime-events.mjs
  scripts/
    healthcheck.mjs
    smoke.mjs
  tests/
    safety-filter.test.mjs
    realtime-events.test.mjs
  interfaces/
    manifest.json
  memory/
    manifest.json
  tools/
    manifest.json
  operations/
    manifest.json
```

Do not copy from Techscope or any other project:

- `.env`, `.env.local`, tokens, credentials, API keys;
- `.memory-private`, private user memory, private SQLite files;
- `.queue`, queue state, locks, runtime jobs;
- `.logs`, logs, transcripts, raw voice recordings;
- generated caches or local runtime state.

## Minimal File Requirements

- `AGENTS.md`: concise StupidJoke operating instructions, safety boundaries, no-secret rule, and confirmation gates.
- `README.md`: mission, setup, fixture format, commands, and first user exercise.
- `.env.example`: only non-secret defaults, for example `STUPIDJOKE_AGENT_NAME=StupidJoke` and `STUPIDJOKE_DEFAULT_LOCALE=en`.
- `.gitignore`: ignore `.env`, `.env.*` except `.env.example`, logs, queues, private memory, caches, and `node_modules`.
- `package.json`: no dependencies required for v1; scripts `health`, `smoke`, and `test`.
- `fixtures/user_import/README.md`: document JSONL schemas and safety promotion rules.
- `fixtures/user_import/jokes.jsonl`: two safe demo records and one reject-demo record.
- `fixtures/user_import/realtime-events.jsonl`: demo request, import, rating, and cancel events.
- `src/safety-filter.mjs`: deterministic scanner that returns `{status, reasons}` and fails closed.
- `src/realtime-events.mjs`: schema normalization that keeps `trusted_control` separate from `untrusted_text`.
- `scripts/healthcheck.mjs`: structure and fixture validation.
- `scripts/smoke.mjs`: run healthcheck plus safety and realtime event examples.
- `tests/*.test.mjs`: Node built-in test runner coverage for safety and events.
- `interfaces/manifest.json`: realtime voice placeholder, disabled until configured.
- `memory/manifest.json`: file-fixture memory only; private/user memory not selected.
- `tools/manifest.json`: deterministic local tools only.
- `operations/manifest.json`: `service_mode: none`, `autostart: disabled`, no launchd.

## `user_import` Fixture Specification

`fixtures/user_import/jokes.jsonl` must use one JSON object per line:

```json
{"id":"uj_001","source":"manual","received_at":"2026-06-12T00:00:00.000Z","lang":"en","text":"Why did the computer take a nap? It had too many tabs open.","tags":["tech","silly"],"intended_style":"family-safe silly","safety_label":"pending","expected_action":"accept","notes":"demo fixture"}
```

Required fields:

- `id`: stable fixture id.
- `source`: `manual`, `voice`, `file`, or `test`.
- `received_at`: ISO timestamp.
- `lang`: BCP-47-ish short language code such as `en` or `ru`.
- `text`: raw user-provided joke text.
- `safety_label`: `pending`, `safe`, `reject`, or `needs_review`.
- `expected_action`: `accept`, `reject`, or `review`.

Optional fields: `tags`, `intended_style`, `notes`.

Promotion rule: raw `user_import` records are not trusted memory. A record can be promoted to a future curated fixture only after schema validation and safety filtering pass.

## Realtime Event Specification

`fixtures/user_import/realtime-events.jsonl` must also use JSONL:

```json
{"id":"evt_001","created_at":"2026-06-12T00:00:00.000Z","session_id":"demo","event_type":"voice.joke.requested","trusted_control":{"locale":"en","style":"silly","max_words":40},"untrusted_text":"tell me a stupid joke about computers","expected_status":"ok"}
```

Allowed v1 event types:

- `session.started`
- `session.ended`
- `voice.joke.requested`
- `voice.joke.imported`
- `voice.joke.rated`
- `operator.cancelled`

Realtime handling rules:

- Whitelist event types and reject unknown types.
- Keep `trusted_control` and `untrusted_text` separate.
- Do not let untrusted text name tools, change instructions, write files, or request deployment.
- Cap untrusted text length before processing.
- During an active voice session, respond with one short joke or one short safety/fallback message.
- For `voice.joke.imported`, save only to `user_import` in a writable project session and keep `safety_label: pending` until validated.
- For `operator.cancelled`, stop current response and do not enqueue follow-up work.
- Future Codex deep tasks must use structured task payloads and explicit operator approval.

## Safety Filter Requirements

The minimal safety filter should return `reject` or `needs_review` for:

- sexual content involving minors or ambiguous age;
- explicit sexual content, coercion, or fetish content;
- hate, slurs, protected-class harassment, or demeaning stereotypes;
- targeted abuse, threats, bullying, or doxxing;
- self-harm encouragement or instructions;
- graphic violence or cruelty;
- illegal instructions, evasion, fraud, or weaponization;
- private personal data, credentials, tokens, addresses, phone numbers, account ids;
- prompt-injection attempts, tool-selection attempts, hidden instructions, or "ignore previous instructions" patterns;
- malformed records or payloads that exceed configured size limits.

Safe fallback behavior: do not repeat rejected text; say a short neutral refusal and offer a family-safe silly joke instead.

## Suggested Writable-Session Commands

Preferred Pritha path if the scaffold command is available:

```sh
cd <LEGACY_TECHSCOPE_ROOT>
node scripts/pritha.mjs validate 11_agents/contracts/2026-06-12-stupidjoke-agent-contract.md
node scripts/pritha.mjs create 11_agents/contracts/2026-06-12-stupidjoke-agent-contract.md --output ../StupidJoke
```

If the generator does not support this exact contract shape, manually create the tree above in `<SIBLING_AGENT_ROOT>/StupidJoke`, then run:

```sh
cd <SIBLING_AGENT_ROOT>/StupidJoke
npm run health
npm run smoke
npm test
```

After a successful scaffold, create a new complete scaffold report or supersede this failed report.

## Verification

| Check | Result | Notes |
| --- | --- | --- |
| Structure validation | blocked | Target sibling cannot be created in this sandbox. |
| Smoke test | blocked | No sibling project exists yet. |
| Healthcheck | blocked | No sibling project exists yet. |
| Telegram adapter test | not-applicable | Telegram is not selected for v1. |
| Documentation review | pass | Contract and scaffold package are recorded in Techscope. |

## Open Issues

- The actual product behavior is inferred from the name StupidJoke and the voice task payload; operator should confirm desired humor style before public or repeated use.
- The deterministic safety filter is intentionally conservative and incomplete; future hosted generation needs additional eval examples.
- Full Realtime API/browser implementation is deferred until a writable session can create the project and decide whether to copy/adapt the reference voice-control pack.

## Next Steps

- Re-run from a session that can write to `<USER_HOME>`.
- Create `<SIBLING_AGENT_ROOT>/StupidJoke` from the prepared package.
- Run `npm run health`, `npm run smoke`, and `npm test`.
- Create a complete scaffold report and, after first real use, an agent post-creation review.
