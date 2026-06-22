---
id: 2026-06-22-web-summit-check-agent-agent-contract
type: agent-contract
status: accepted
created: 2026-06-22
updated: 2026-06-22
topics:
  - agent-engineering
  - agent-factory
  - harness-engineering
  - web-summit-check-agent
tools:
  - Codex
  - AGENTS.md
  - Apple Mail
  - CLI
agent_platforms:
  - Codex
model_context:
  - unknown
runtime_environment:
  - codex-native
config_surfaces:
  - AGENTS.md
  - workflows
  - scripts
portability: codex-native
sources:
  - user-interview
  - 07_workflows/agents-mother.md
  - 04_standards/agent-creation-harness.md
  - 04_standards/agent-runtime-placement.md
related:
  intakes: []
  briefs: []
  reviews: []
  decisions: []
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-environment-compatibility.md
    - 04_standards/agent-tool-integration-selection.md
    - 04_standards/agent-runtime-placement.md
  workflows:
    - 07_workflows/agents-mother.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-22
source_updated: 2026-06-22
source_version: web summit mail-analysis implementation v1
retrieved: 2026-06-22
verified: 2026-06-22
valid_for: Web Summit correspondence analysis v1
temporal_status: current
memory_domain: child-agents
memory_domains:
  - child-agents
  - agent-building-knowledge
subject:
  kind: child-agent
  id: web-summit-check-agent
privacy: public
retention: durable
review_status: accepted
confidence: medium
---

# Agent Project Contract: WebSummitCheckAgent

Date: 2026-06-22
Status: accepted

## Purpose

- Agent name: WebSummitCheckAgent
- Primary mission: Analyze Web Summit-related correspondence from fixture data or explicitly gated local Apple Mail access, then produce a chronology, decisions/actions, current offers, communication options and next steps without storing secrets or installing services.
- Target user: single Pritha operator
- Success criteria: AGENTS launch dry-run passes, generated report and structured JSON are created, real Apple Mail mode is disabled unless explicitly confirmed, macOS permission prompts remain manual, smoke test passes, and no Pritha secrets or private state are copied.
- Out of scope: Telegram, Realtime voice, external APIs, MCP connectors, private Pritha memory writes, queues, logs, service installation, deployment, background proactivity, credential writes, and automatic/unconfirmed mailbox access.

## Functional scope

### V1 core functions

- Provide fixture-based Web Summit correspondence analysis
- expose an AGENTS launch scenario that runs fixture dry-run and reports output paths
- expose CLI commands for dry-run, fixture test, real-access status and explicitly gated real Apple Mail analysis
- filter Inbox/Sent messages by keyword and the confirmed date range
- generate chronology, decisions/agreements, completed actions, open actions, current offers, communication options and possible joint projects
- document permissions, safety gates and no-secret boundaries
- support smoke and fixture tests

### Deferred functions

- richer UI beyond CLI
- richer interfaces
- durable memory beyond Markdown notes and generated local reports
- skills or MCP connectors
- deployment automation beyond read-only plan/status

### Critical user workflows

- Codex opens the project and reads AGENTS.md
- operator runs the AGENTS launch scenario: `node scripts/agents-launch.mjs dry-run`
- operator runs dry-run fixture analysis
- operator reviews generated `output/web-summit-analysis/latest.md`
- operator runs real-status before any real Apple Mail access
- operator invokes real analysis only with `--confirm-real-mail-access` and handles macOS prompts manually

## Runtime and interface

- Runtime family: codex-native
- Primary interface: Codex project
- Secondary interfaces: CLI
- Telegram mode: none
- Expected hosting: local Mac

## Runtime placement

- Runtime placement profile: deterministic-first
- Multi-model routing requested: no
- Local inference required: no
- Local inference adapter: none
- Provider fallbacks: manual review or future Codex task after contract update
- Privacy routing rules: keep all work local unless a future accepted contract explicitly allows external providers
- Model budget policy: no model spend in v1 beyond operator-driven Codex sessions
- Route healthcheck: node scripts/smoke-test.mjs; node scripts/web-summit-analysis.mjs test
- Route change log: document changes in reports

| Task class | Runtime class | Current candidate | Verified | Recheck before scaffold | Fallback | Eval fixture | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Planning | frontier-hosted | TBD current model | 2026-06-22 | yes | human/manual | TBD | architecture and workflow discovery |
| Coding | Codex/frontier-hosted | TBD current model | 2026-06-22 | yes | human/manual | TBD | code changes and tests |
| Extraction | deterministic-code | Node fixture/Apple Mail parser | 2026-06-22 | yes | manual review | fixture Web Summit messages | bounded local fields and excerpts |
| Summarization | deterministic-code | Node heuristics | 2026-06-22 | yes | Codex/manual review | fixture Web Summit messages | report shape is deterministic v1 |
| Classification | deterministic-code | keyword/date/direction rules | 2026-06-22 | yes | manual review | fixture Web Summit messages | no model dependency in v1 |
| Transcription | local/hosted-audio | TBD current model | 2026-06-22 | yes | hosted-audio/local | TBD | accuracy and language dependent |
| Embeddings | local/small-hosted | TBD current model | 2026-06-22 | yes | hosted | TBD | good local candidate |
| Memory query | local/small-hosted | TBD after eval | 2026-06-22 | yes | frontier-hosted | TBD | privacy-sensitive |
| Security scan | frontier-hosted/specialized | TBD current model | 2026-06-22 | yes | manual | TBD | do not underpower high-risk checks |

## Operations and service

- Deployment target: local Mac
- Deployment profile: local-development
- Service mode: none
- Autostart: disabled
- Start command: node scripts/agents-launch.mjs dry-run
- Stop command: not-applicable
- Healthcheck command: node scripts/smoke-test.mjs
- Log path: logs/
- Restart policy: manual unless contract is updated

## Proactivity

- Proactive mode: none
- Trigger sources: manual user request
- Schedule: not-applicable
- Heartbeat interval: not-applicable
- Idle behavior: sleep until manual invocation
- User interruption policy: do not interrupt unless configured by user

## Skills and procedural memory

- Skill needs: none
- Allowed skill sources: local-only
- Skill install mode: recommend
- Skill mutation policy: read-only
- Installed skills: none yet; research step may recommend local reviewed skills
- Candidate skills: to be filled by research
- External skill approval: explicit approval required before any external skill is vendored, linked or runtime-installed
- Skill update policy: read-only for scaffold v1; update through Pritha audit
- Skill audit command: node scripts/skills-status.mjs

## Harness inventory

- Information boundaries: AGENTS.md and README provide only concise operating instructions; no Pritha private memory, queues, logs, credentials, or raw user data are copied into the child project.
- Runtime placement: deterministic-first; local inference no; fallbacks manual review or future Codex task after contract update
- Tool system: minimal local CLI scripts only
- Execution orchestration: manual step-by-step workflow with explicit operator checkpoints
- Memory and state: Markdown notes, JSON manifests and generated local Web Summit analysis reports; no SQLite, embeddings, runtime queue, private Pritha memory, or logs in v1.
- Evaluation and observability: structure validation through `node scripts/smoke-test.mjs`; status through `node scripts/agent-cli.mjs status`.
- Constraints, validation and recovery: stop on missing required scaffold files or any request to add secrets, external integrations, background services, deployment, or private memory without a new accepted contract.
- Human approval gates: required before credential writes, service installation, deployment, deletion, background proactivity, external integrations, or copying private Pritha state.
- Completion criteria: sibling folder exists, minimal harness files are present, smoke test passes, Pritha scaffold report exists, and registry includes the agent.

## Data, memory and sources

- Input data types: synthetic fixture messages; explicitly gated local Apple Mail messages matching Web Summit filters
- Stored data: tracked Markdown/JSON/config files and generated local reports under `output/web-summit-analysis/`
- Sensitive data: email credentials and Pritha private memory are forbidden; full raw email bodies are not stored by default
- Memory model: Markdown notes plus generated local reports
- Indexing/search needs: none for v1; reports are read directly
- External verification needs: not-applicable for v1; Apple Mail access uses local macOS automation and requires manual permission prompts
- Source freshness requirements: tests only for v1; recheck current primary docs before adding any volatile platform/API/runtime dependency later.

## Tools and integrations

| Capability | Default boundary | Notes |
| --- | --- | --- |
| Project files and local checks | CLI/script | Default for Codex-native scaffold |
| Agent operating procedure | skill/workflow | Encode repeatable Pritha rules |
| Web Summit fixture analysis | CLI/script | Default dry-run path; never reads Apple Mail |
| Apple Mail access | local automation | Disabled by default; requires `--confirm-real-mail-access` and macOS permission approval |
| External services | MCP/API | Only when contract requires auth/service boundary |
| Rendered or visual checks | browser/manual | Use when UI or dynamic pages matter |

## Security and permissions

- Secrets required: none known yet; do not request email passwords, app passwords, tokens or `.env` values
- `.env.example` variables: AGENT_NAME and LOG_LEVEL placeholders only
- Allowed network access: none by default; future network use requires contract update and verification
- Allowed filesystem access: agent project folder only by default; Apple Mail access only through the explicit real-run command
- User authorization model: local operator
- Risk notes: main risk is accidental mailbox access or over-retention of personal email content; v1 keeps real access explicitly gated and stores bounded excerpts only.

## Scaffold requirements

- Target folder: ../WebSummitCheckAgent
- Files to generate: AGENTS.md, README.md, .env.example, workflow notes, scripts, smoke test, user training guide
- Dependencies: minimal until scaffold profile is selected
- Setup commands: `cp .env.example .env` only if local overrides are needed; no secrets required
- Run commands: `node scripts/agents-launch.mjs dry-run`; `node scripts/agents-launch.mjs real-status`; `node scripts/web-summit-analysis.mjs dry-run`; `node scripts/web-summit-analysis.mjs real-status`
- Tests/healthchecks: structure validation, smoke test and fixture analysis test
- User training guide: Run node scripts/smoke-test.mjs, node scripts/agents-launch.mjs dry-run and node scripts/agents-launch.mjs real-status

## Research basis

- Related Pritha artifacts: 07_workflows/agents-mother.md; 04_standards/agent-creation-harness.md; 04_standards/agent-runtime-placement.md; 04_standards/agent-environment-compatibility.md; 04_standards/agent-tool-integration-selection.md
- Current primary sources checked: not-applicable for v1 because no external platform/API/runtime dependency is selected.
- Trusted secondary sources checked: Pritha memory research completed in `11_agents/research/2026-06-22-web-summit-check-agent-agent-research.md`.
- Alternatives considered: do nothing until a named domain exists; create only a contract without sibling folder; create a larger Pritha-style scaffold. The selected option is a minimal sibling project so Control Center can see an existing child-agent project immediately.
- Decision rationale: operator explicitly requested a new minimal child-agent harness; codex-native, local, manual, no-service, no-network, no-secret scaffold is the lowest-risk implementation that remains valid for later expansion.

## Acceptance checklist

- [x] Contract reviewed with user through approved Pritha Control Center UI decision gate.
- [x] Runtime family selected.
- [x] Runtime placement selected.
- [x] Interface mode selected.
- [x] Telegram need explicitly decided.
- [x] Harness inventory complete.
- [x] Security model documented.
- [x] Tests/healthchecks defined.
- [x] Handoff/training plan defined.
