---
id: agents-mother
type: workflow
status: experimental
created: 2026-05-18
updated: 2026-05-30
topics:
  - agent-engineering
  - agent-factory
  - harness-engineering
  - codex
tools:
  - Codex
  - AGENTS.md
  - Telegram
  - CLI
  - OpenAI Agents SDK
  - OpenAI Realtime API
  - gpt-realtime-2
  - Pritha
sources:
  - 03_reviews/2026-05-18-techscope-agents-mother-scenario-review.md
  - 04_standards/agent-creation-harness.md
  - 04_standards/agent-environment-compatibility.md
  - 04_standards/agent-tool-integration-selection.md
  - 04_standards/realtime-voice-control-for-codex-agents.md
  - 11_agents/contracts/2026-05-25-fespa26-agent-contract.md
  - 11_agents/reports/2026-05-25-fespa26-agent-post-creation-review.md
  - 11_agents/reports/2026-05-29-fespa26-voice-control-and-feed-memory-update.md
  - 11_agents/reports/2026-05-26-funny-teacher-v1-agent-post-creation-review.md
  - 11_agents/reports/2026-05-26-funny-teacher-agent-user-interaction-review.md
  - 11_agents/reports/2026-05-29-funny-teacher-pritha-reference-example.md
  - 05_decisions/2026-05-29-realtime-voice-control-universal-pattern.md
  - 03_reviews/2026-05-26-openclaw-hacked-agent-security-assessment.md
  - 04_standards/agent-runtime-placement.md
  - 04_standards/agent-harness-evaluation.md
  - 04_standards/agent-team-operating-model.md
  - 04_standards/agent-skill-pack-lifecycle.md
related:
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-environment-compatibility.md
    - 04_standards/agent-tool-integration-selection.md
    - 04_standards/realtime-voice-control-for-codex-agents.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/agent-runtime-placement.md
    - 04_standards/agent-harness-evaluation.md
    - 04_standards/agent-team-operating-model.md
    - 04_standards/agent-skill-pack-lifecycle.md
  templates:
    - 08_templates/agent-project-contract.md
    - 08_templates/agent-scaffold-report.md
  workflows:
    - 07_workflows/agents-mother-roadmap.md
    - 07_workflows/agent-skill-pack-selection.md
supersedes: []
superseded_by: []
---

# Workflow: agents-mother / Pritha

Status: experimental

## Goal

Use TechScope as an agent factory: design, validate, scaffold, test and hand off new working agents from a user request or jointly developed specification.

Pritha is the public alias and product name for this layer. Existing `agents-mother` paths and artifact types remain valid for compatibility; new user-facing CLI/docs should prefer Pritha vocabulary.

The default v1 target is a production-testable sibling project. The first
implementation path is `codex-native + optional interface adapters`.

FESPA26 is the first successful external agent captured in this lifecycle. It is
not a template to copy blindly, but it provides the first evidence-backed event
and reportage agent pattern: `event material -> source memory -> Codex
processing -> reviewed feed card -> explicit publication`. Its current voice
architecture also upgrades the reusable voice-control pattern to `Realtime
dispatcher + deterministic server tools + Codex App/thread transport + Codex
CLI/queue fallback`.

Funny Teacher is the first successful language-learning voice agent. It adds
evidence for `Realtime teacher + durable SQLite lesson memory + semantic
retrieval + explicit selected-memory-focus/reset controls`.

Funny Teacher is also the canonical Pritha feedback-loop example: the useful
agent shape emerged through user corrections, mobile testing, memory UX
questions, idempotency fixes and version fixation, not from the initial scaffold
alone. Use `11_agents/reports/2026-05-29-funny-teacher-pritha-reference-example.md`
when comparing a future voice or learning agent against proven lineage evidence.

## Core rule

Do not scaffold a new agent directly from a vague idea. First create an `agent-contract`, validate it against TechScope memory and current sources, then generate a working scaffold with tests and a handoff guide.

## Workflow

1. Capture the request as an intake or direct thread brief.
2. Run a staged interview:
   - purpose, target user and success criteria;
   - core v1 functions and deferred functions;
   - runtime family: Codex-native, CLI, API, local model, hybrid or environment-specific;
   - interaction interface: Telegram, CLI, web, API, Codex project or mixed;
   - team mode: single agent, coordinator plus workers, specialist team or external harness team;
   - data, memory, tools, permissions, secrets and operational constraints;
   - runtime placement: deterministic code, local model, small hosted model,
     frontier hosted model, Codex sidecar or manual/human;
   - whether the user explicitly wants different models for different task
     classes, or whether multi-model routing should be avoided for v1;
   - untrusted input sources, quarantine rules, token/media budget caps and approval gates;
   - skill needs, allowed skill sources, install mode and mutation policy;
   - acceptance tests and training expectations.
3. Create an `agent-contract` from `08_templates/agent-project-contract.md`.
4. Search TechScope memory for related agent patterns, standards, briefs, reviews, decisions and local skill candidates.
5. Verify volatile architecture choices through current primary sources and trusted secondary sources.
6. Record an architecture recommendation:
   - selected runtime family;
   - selected interface adapters;
   - harness evaluation plan when a non-Codex or local-model harness is being considered;
   - harness inventory;
   - security and permission model;
   - untrusted-input risk tier and scanner/quarantine path;
   - skill candidates, trust/risk score and activation decision;
   - testing and observability model.
7. Scaffold the new agent in a sibling folder unless the contract explicitly chooses another location.
8. Generate minimum project files:
   - `AGENTS.md` or runtime-native equivalent;
   - `README.md`;
   - `.env.example`;
   - workflow notes;
   - scripts or app entrypoints;
   - skill pack manifest, candidates and audit/status command;
   - smoke test or healthcheck;
   - user training guide.
9. If Telegram is selected, include a Telegram adapter profile:
   - one-user or multi-user mode;
   - queue for incoming updates;
   - text/link/media handling policy;
   - concise human-readable replies;
   - processing log;
   - token and user id only through environment variables.
10. Run tests and healthchecks.
11. Create a `scaffold-report` from `08_templates/agent-scaffold-report.md`.
12. After the first meaningful working version, create an `agent-post-creation-review`.
13. Record a user interaction review: initial prompt, clarifications, user feedback, failed assumptions and product decisions discovered during the build.
14. Rebuild TechScope memory indexes so the new contract and reports become searchable.

## Current commands

```sh
node scripts/pritha.mjs questions
node scripts/pritha.mjs init --name "agent-name" --mission "mission"
node scripts/pritha.mjs create --name "agent-name" --mission "mission"
node scripts/pritha.mjs create 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md --output ../agent-name
node scripts/pritha.mjs skills status
node scripts/pritha.mjs skills select 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md
node scripts/pritha.mjs skills audit ../existing-or-generated-agent
node scripts/pritha.mjs test ../existing-or-generated-agent
node scripts/pritha.mjs publish ../existing-or-generated-agent
node scripts/pritha.mjs lineage

# Compatibility aliases retained for v0.1:
node scripts/agents-mother.mjs questions
node scripts/agents-mother.mjs interview
node scripts/agents-mother.mjs init --name "agent-name" --mission "mission"
node scripts/agents-mother.mjs research 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md
node scripts/agents-mother.mjs scaffold 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md
node scripts/agents-mother.mjs test ../existing-or-generated-agent
node scripts/agents-mother.mjs handoff ../existing-or-generated-agent
node scripts/agents-mother.mjs operations ../existing-or-generated-agent
node scripts/agents-mother.mjs deploy ../existing-or-generated-agent plan
node scripts/agents-mother.mjs evolve ../existing-or-generated-agent --notes "lessons"
node scripts/agents-mother.mjs registry
node scripts/agents-mother.mjs validate 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md
node scripts/agents-mother.mjs list
```

## Pritha lineage vocabulary

- Seed: the user-facing specification for a new agent; technically this remains an `agent-contract`.
- Descendant: a generated child agent project.
- Lineage: the contract, scaffold report, test reports, handoff, operations and post-creation review chain.
- Traits: reusable capabilities and harness patterns proven by lifecycle evidence.
- Inheritance: base safety, memory, tool and operating rules carried into a descendant.
- Mutation: adaptation of inherited rules to the user's specific task and runtime.
- Trial: testing/evaluation before handoff or release.

Do not rename frontmatter `type` values, directories or memory schema as part of Pritha v0.1. The rebrand is a compatibility alias and narrative layer first.

## Default scaffold profile

- Location: sibling folder next to TechScope.
- Runtime: Codex-native project scaffold.
- Interface: project folder and instructions; Telegram optional if selected in the contract.
- Interface adapters: `interfaces/manifest.json`, `interfaces/README.md`, per-adapter notes and `scripts/interface-status.mjs`.
- Memory profile: `memory/manifest.json`, `memory/README.md` and `scripts/memory-status.mjs`.
- Tool profile: `tools/manifest.json`, `tools/README.md` and `scripts/tools-status.mjs`.
- Source of truth: Markdown plus runtime-specific files.
- Memory: start with local Markdown; add database/vector/graph layers only when the contract requires them.
- Safety: no copied secrets, no hidden long-running services, no deployment without explicit confirmation.

## Telegram decision point

Telegram is an interface adapter, not a mandatory property of every agent.

When Telegram is requested, decide whether it is:

- primary chat interface;
- intake/media upload channel;
- notification channel only;
- operator control channel;
- out of scope for v1.

Telegram-enabled agents must include an explicit queue and completion-status replies. User-facing bot responses should summarize the useful result, not expose internal file churn unless requested.

Current scaffold behavior:

- CLI/local status adapter is always generated for maintenance and smoke tests.
- Telegram files are generated only when `Telegram mode` is not `none`.
- Web/API/custom interfaces receive documented placeholders until a dedicated runtime layer is implemented.
- Telegram scaffold includes queue directories, dry-run polling, queue processing and healthcheck commands.

## Memory and tool profiles

Generated agents receive explicit memory and tool manifests:

- `minimal-markdown`: notes only;
- `markdown-first`: notes and decisions;
- `markdown-sqlite`: Markdown plus rebuildable SQLite placeholder;
- `markdown-embeddings`: Markdown plus index and embeddings placeholders;
- `external-or-specialized`: documented external/vector/graph integration placeholder.

Tool profiles are selected from the contract and can include `cli-script`, `workflow`, `mcp-api`, `browser-manual` and `telegram-adapter`.

## Runtime Placement Decision Point

Every non-trivial agent must decide where each class of inference work runs.
Use:

```text
04_standards/agent-runtime-placement.md
```

Default placement heuristic:

- use deterministic code/scripts for validation, indexing, file movement and
  repeatable non-language work;
- use frontier hosted models or Codex for workflow discovery, coding, complex
  planning, architecture and high-risk analysis;
- use smaller hosted models for bounded structured tasks when local operation is
  not worth the maintenance;
- use local open-weight models for stable, repeated, privacy-sensitive or
  high-volume tasks after eval examples prove quality.

The contract should record task routes, provider fallbacks, budget policy,
privacy routing rules, eval fixtures and route healthchecks. Local inference is
not "free" by default: hardware, power, model quality, operations, fallback and
security costs must be explicit.

Multi-model routing is not mandatory complexity. Add it when the user asks to
use different models for different tasks, or when cost, privacy, latency, risk or
quality requirements make it necessary. Concrete model names, prices and quotas
are only date-stamped candidates; the reusable rule is the placement principle,
and current official docs must be rechecked before scaffold or deployment.

## Harness Evaluation Decision Point

If a contract considers OpenCode, Pi, Hermes, OpenClaw or another external
harness instead of the Codex-native default, apply:

```text
04_standards/agent-harness-evaluation.md
```

The research step should define a small project-relevant eval pack before
choosing the harness. Exact public benchmark rankings are treated as temporal
evidence, not as a standing rule.

## Agent Team Decision Point

If the user wants one agent to cover multiple durable domains, or if the project
has separate roles, schedules, memories, notification streams or long-running
workers, apply:

```text
04_standards/agent-team-operating-model.md
```

Default is still one focused agent. Split into coordinator/specialists/workers
only when it reduces context/tool sprawl or matches real user workflows.

## Untrusted Input Decision Point

If a new agent reads external messages, email, websites, media transcripts,
uploads, screenshots, repository text or other user-forwarded media, apply:

```text
04_standards/agent-untrusted-input-security.md
```

The contract must explicitly choose:

- external sources that can reach the agent;
- whether raw content can reach the model context;
- whether raw content can update memory;
- per-item token/media/job budget caps;
- quarantine conditions;
- human approval gates;
- scanner model or deterministic validation layer;
- sensitive data that must be excluded from context.

External content must not directly select tools, mutate memory, spend budget or
send/publish data without passing through the chosen intake/security boundary.

## Voice Agent Decision Point

If the user wants a voice interface, do not treat the Realtime model as the whole
agent. Start from the active standard:

```text
04_standards/realtime-voice-control-for-codex-agents.md
```

Default voice architecture candidate:

- Realtime model: low-latency speech, concise answers and tool-call dispatch.
- Server tools: deterministic validation, state changes, queueing and approval
  gates.
- Codex App/thread transport: preferred foreground route for complex tasks that
  need Codex context and structured output.
- Codex CLI/queue fallback: worker or fallback route for synthesis,
  verification, media/file work, code changes and background jobs.
- Durable memory: explicit local or external state chosen by the contract.

The contract must still decide:

- whether voice is the primary interface or one adapter among several;
- which model is used for Realtime;
- what tools the voice model can call;
- which actions require confirmation;
- whether heavy work goes through Codex App/thread, contract-file handoff,
  Codex CLI, queue worker, synchronous tools or is disabled;
- how transcripts and media are retained.

## Existing project inspection

Agents Mother can be pointed at an existing project folder. It must classify the folder before proposing changes:

- `techscope-generated-agent`: manifests and generated markers are present;
- `agent-project`: an instruction surface such as `AGENTS.md`, `CLAUDE.md` or `GEMINI.md` exists;
- `project-with-agent-signals`: some adapter/script signals exist, but the harness is incomplete;
- `project-without-agent-harness`: no meaningful agent harness found.

For existing projects, do not modify files during `test`. Create an `agent-test-report` and use it to discuss whether to add an agent contract or improve the existing harness.

## Handoff

Use `handoff` after scaffold or project inspection to create a user-facing operation guide. The handoff report should explain:

- how to start and test the agent;
- which secrets must be configured in `.env`;
- what is ready now;
- what is not ready or risky;
- the first user exercise;
- which layer should be improved next.

## Operations and service readiness

Generated agents must make service behavior explicit even when they are not services yet:

- `operations/manifest.json` records deployment target, deployment profile, service mode, autostart mode, proactivity model, start/stop commands, healthcheck and log path.
- `scripts/operations-status.mjs` prints the current operations profile.
- `scripts/deploy-service.mjs` automates deployment plan, status, install and uninstall.
- `launchd` support is generated only as a template when the contract selects `launchd` or `launchd-on-approval`.
- Scaffold, test, handoff and operations inspection must not start long-running processes or install autostart.
- Autostart is configurable, not globally forbidden: use `disabled` by default, then `optional`, `launchd-on-approval` or `external` only after the user explicitly chooses it.
- Deployment mutations require `--yes` and produce an `agent-deployment-report`.
- Before scaffold, ask where the agent will actually be deployed: local Mac, Mac mini, VPS, cloud, embedded/user device, external runtime or nowhere yet.
- Before scaffold, ask whether the agent should be proactive: none/manual, scheduled chrono/cron, heartbeat/pulse, event-driven webhook, queue watcher or hybrid.
- Do not add a background pulse, queue watcher, scheduler or notification loop unless the contract explicitly selects it.

Use:

```sh
node scripts/agents-mother.mjs operations <agent-path>
node scripts/agents-mother.mjs deploy <agent-path> plan
node scripts/agents-mother.mjs deploy <agent-path> status
node scripts/agents-mother.mjs deploy <agent-path> install --yes
node scripts/agents-mother.mjs deploy <agent-path> uninstall --yes
```

This creates `agent-operations-report` and `agent-deployment-report` artifacts in `11_agents/reports/`.

## Feedback and evolution

After an agent has lifecycle evidence, create a post-creation review and update the registry:

```sh
node scripts/agents-mother.mjs evolve <agent-path> --notes "what changed after real use"
node scripts/agents-mother.mjs registry
```

The post-creation review must separate:

- useful scaffold patterns;
- failed assumptions;
- reusable standard candidates;
- outdated or risky patterns.

For every agent that reaches a meaningful working version, also preserve the
interaction path with the user. This can be a dedicated
`agent-user-interaction-review`-style report using `type:
agent-post-creation-review`, or a clearly labeled section inside the
post-creation review for small agents. It must capture:

- the initial user request;
- clarifying prompts and answers;
- important user corrections;
- UX/product decisions discovered during real testing;
- assumptions that changed;
- reusable interaction patterns for future Agents Mother runs.

Do not promote a pattern into `04_standards/` from one lucky run. Promotion needs evidence from lifecycle reports and an explicit review/decision.

The realtime voice-control standard is active as of 2026-05-29 because FESPA26
and Funny Teacher confirm the shared boundary in two domains. Keep it
version-bound: recheck when Realtime APIs, Codex App transport or Codex CLI
sandbox behavior changes.

## Completion criteria

An Agents Mother run is complete only when:

- an `agent-contract` exists and validates;
- the selected architecture is grounded in TechScope memory and current sources;
- a working scaffold exists in the chosen folder;
- environment setup instructions are present;
- smoke tests or healthchecks pass, or failures are documented;
- the user has a short handoff guide explaining how to run and test the new agent.
- post-creation lessons are captured when the agent has meaningful lifecycle evidence.
- the user interaction/revision path is captured after the first successful working version.

## Non-goals for v1

- Universal generator for every agent platform.
- Automatic deployment.
- Automatic secret provisioning.
- Copying TechScope internals 1:1 into every new agent.
- Treating Telegram as mandatory.

## Roadmap

See `07_workflows/agents-mother-roadmap.md` for the full layered implementation roadmap.
