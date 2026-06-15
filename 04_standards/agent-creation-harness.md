---
id: agent-creation-harness
type: standard
status: draft
created: 2026-05-18
updated: 2026-06-15
last_reviewed: 2026-06-15
owner: Techscope/user
topics:
  - agent-engineering
  - agent-factory
  - harness-engineering
  - agent-architecture
  - pritha
tools:
  - Codex
  - AGENTS.md
  - Telegram
  - CLI
  - OpenAI Agents SDK
  - OpenAI Realtime API
  - Tailscale
  - launchd
  - NemoClaw
  - OpenShell
  - Pritha
agent_platforms:
  - Codex
  - OpenAI Agents SDK
  - Claude Code
  - Gemini CLI
  - Cursor
  - Hermes Agent
model_context:
  - mixed
runtime_environment:
  - codex-desktop
  - codex-cli
  - cli
  - api
  - local-model
  - messaging-gateway
config_surfaces:
  - AGENTS.md
  - workflows
  - templates
  - scripts
  - .env.example
  - Telegram bot token
  - skills
  - MCP
portability: adapter-needed
sources:
  - 03_reviews/2026-05-18-techscope-agents-mother-scenario-review.md
  - 04_standards/agent-environment-compatibility.md
  - 04_standards/agent-tool-integration-selection.md
  - https://developers.openai.com/api/docs/guides/agents
  - https://openai.github.io/openai-agents-python/agents/
  - https://www.anthropic.com/engineering/building-effective-agents
  - https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
  - https://docs.langchain.com/oss/python/langgraph/durable-execution
  - 11_agents/reports/2026-05-26-funny-teacher-v1-agent-post-creation-review.md
  - 11_agents/reports/2026-05-26-funny-teacher-agent-user-interaction-review.md
  - 11_agents/reports/2026-05-29-funny-teacher-pritha-reference-example.md
  - 03_reviews/2026-05-26-openclaw-hacked-agent-security-assessment.md
  - 04_standards/agent-runtime-placement.md
  - 04_standards/agent-team-operating-model.md
  - 04_standards/agent-harness-evaluation.md
  - 02_briefs/2026-05-27-nvidia-nemoclaw-sandboxed-agent-runtime-brief.md
  - 03_reviews/2026-05-27-nvidia-nemoclaw-sandboxed-agent-runtime-assessment.md
  - https://openai.com/ru-RU/index/harness-engineering/
  - 03_reviews/2026-05-31-openai-harness-engineering-agent-readable-repo-assessment.md
  - 03_reviews/2026-06-02-agent-harness-engineering-source-batch-review.md
  - 03_reviews/2026-06-02-codex-surfaces-enterprise-deployment-source-batch-review.md
  - 03_reviews/2026-06-02-agent-scheduling-heartbeat-source-batch-review.md
  - 03_reviews/2026-06-02-agent-skills-source-batch-review.md
  - 03_reviews/2026-06-02-agentic-ui-source-batch-review.md
  - 03_reviews/2026-06-07-yandex-ai-safe-agent-security-assessment.md
  - 04_standards/agent-ai-safe-security-checklist.md
  - 03_reviews/2026-06-11-pi-agent-architecture-assessment.md
  - 04_standards/agent-minimal-core-extension-surface.md
related:
  decisions: []
  reviews:
    - 03_reviews/2026-05-18-techscope-agents-mother-scenario-review.md
    - 03_reviews/2026-05-31-openai-harness-engineering-agent-readable-repo-assessment.md
    - 03_reviews/2026-06-02-agent-harness-engineering-source-batch-review.md
    - 03_reviews/2026-06-02-codex-surfaces-enterprise-deployment-source-batch-review.md
    - 03_reviews/2026-06-02-agent-scheduling-heartbeat-source-batch-review.md
    - 03_reviews/2026-06-02-agent-skills-source-batch-review.md
    - 03_reviews/2026-06-02-agentic-ui-source-batch-review.md
    - 03_reviews/2026-06-07-yandex-ai-safe-agent-security-assessment.md
    - 03_reviews/2026-06-11-pi-agent-architecture-assessment.md
  briefs: []
  workflows:
    - 07_workflows/agents-mother.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/agent-runtime-placement.md
    - 04_standards/agent-team-operating-model.md
    - 04_standards/agent-harness-evaluation.md
    - 04_standards/agent-proactivity-scheduling.md
    - 04_standards/agent-ai-safe-security-checklist.md
    - 04_standards/agent-minimal-core-extension-surface.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-18
source_updated: 2026-06-11
source_version: Techscope draft standard v13 + Funny Teacher reference example + OpenAI/OpenAI Codex/Anthropic/LangChain/Cursor/Thoughtworks/arXiv harness source batch + Codex surfaces/AWS batch + scheduling/heartbeat batch + Agent Skills batch + agentic UI batch + AI-SAFE child-agent checklist + Pi minimal-core/extension-surface assessment + Pritha Voice/Codex approval-gate update
retrieved: 2026-05-18
verified: 2026-06-11
valid_for: TechScope agent creation workflow from 2026-05-18 onward
temporal_status: current
---

# Standard: agent-creation-harness

Status: draft
Owner: Techscope/user
Last reviewed: 2026-06-07

## Rule

Every new agent created by TechScope must start from an explicit `agent-contract` and must be delivered as a working, testable scaffold with a documented harness.

TechScope may use its own architecture as a reference, but it must not clone itself blindly. The new agent's runtime, interface, memory, tools and security model must follow the contract.

Pritha descendants are assembled from contract-selected modules, not from one universal bundle. Every future agent should receive the harness, memory, data, skills, MCP servers, interface adapters, tools, evals and operations modules that its contract actually needs, and no more. A pattern marked `adopt-in-scaffold` means "available for Pritha to select and compose", not "automatically copied into every descendant".

The initial scaffold is a starting point, not the final boundary of the agent. A descendant can always be evolved through its native interface, especially Codex App/Codex thread for Codex-native agents, plus any other interface selected in its contract. When a descendant receives an internet resource that is not directly relevant to its domain mission, it should treat the resource as meta-improvement input rather than domain memory: evaluate whether the material improves the agent's harness, memory, tools, skills, MCP, UX, evals, safety or operations, then record a brief/review/decision locally or send a distilled lesson back to Pritha/Techscope.

Scaffold readiness is gated: the contract must be `accepted`, Pritha memory
research must be checked for relevant standards/workflows/decisions/reports,
and volatile external choices must be verified against current primary sources
before production scaffold decisions. A draft scaffold is allowed only as an
explicit experiment and must not be presented as a ready descendant.

Every generated child harness must carry the same evolution rule. For any
future change to instructions, memory, tools, skills, MCP, interfaces,
operations, deployment, proactivity, security, model routing, evals, tests or
recovery behavior, the child agent should first inspect its own project and
contract, then consult Pritha memory, then verify current documentation where
needed, then implement the narrowest change with verification.

OpenAI's 2026-02-11 harness-engineering article strengthens the default Pritha rule: a created agent's repository is the agent-readable operating environment. `AGENTS.md` should be a concise map and contract entrypoint; deeper knowledge belongs in versioned docs, standards, workflows, plans, tests, scripts and reports that future Codex sessions can discover, validate and update.

The June 2026 harness source batch strengthens this into a lifecycle rule:
harness engineering is not only initial scaffolding. Pritha should shape the
agent's environment, give it durable handoff state, evaluate final environment
outcomes, mine traces and repeated corrections, then convert proven failures
into better docs, tools, tests, skills, MCP boundaries or standards.

The Codex surfaces and enterprise deployment batch adds a selection rule:
`codex-native` is not one runtime shape. A child-agent contract should record
which Codex surface is selected, if any: local CLI, app-supervised work,
cloud task, IDE-attached work, app-server, SDK-orchestrated MCP worker,
workspace agent, Bedrock-backed provider path or mixed. Unselected surfaces are
skipped, not silently inherited.

The Agent Skills source batch adds a skill-layer rule: skills are reusable
procedural memory selected by contract, not a default extension bundle. External
skills are treated as supply-chain and prompt-injection inputs until reviewed,
pinned, approved and evaluated. Skill catalogs are discovery surfaces, not trust
decisions.

The agentic UI source batch adds an interface-layer rule: UI is a harness
boundary, not decoration. Rich UI is selected only when a workflow needs user
visibility, state editing, progress, cancellation, approvals, visual comparison
or interactive widgets. Chat-only remains the default for simple work.

The AI-SAFE source adds a cross-layer security pass for child agents. Before
scaffold readiness is marked complete, Pritha should review selected modules
across interface, reasoning/planning, knowledge, tools/execution and
infrastructure/orchestration. This is a vendor-neutral threat-modeling check,
not a dependency on a cloud provider.

The Pi architecture assessment adds a minimal-core rule: a child agent should
separate stable core runtime responsibilities from optional capability modules.
Tools, skills, MCP connectors, memory layers, UI widgets, subagents, schedulers,
model routers and package systems are selected by contract and recorded with
trust/readiness metadata. Pi is evidence for the pattern, not Pritha's default
runtime.

## Pritha naming and lineage vocabulary

Pritha is the public name for the Agents Mother layer: the spec-to-agent compiler that creates and evolves child agents. The technical `agent-contract`, report types, `11_agents/` paths and validation schemas remain unchanged in v0.1.

Use Pritha vocabulary as a narrative layer:

- seed: the user-facing name for an agent specification;
- descendant: a created child agent;
- lineage: where the agent came from and which scaffold/reports shaped it;
- traits: capabilities and stable behavior patterns;
- inheritance: base safety, tool, memory and style policies inherited from Techscope/Pritha;
- mutation: task-specific adaptation;
- trial: evaluation before handoff or release.

The compatibility rule is alias-first: new Pritha names may wrap existing Agents Mother commands, but old command paths must keep working until a separate migration decision removes them.

## Voice and Codex approval gates

Pritha Voice Control and Codex thread should expose the same development
capabilities for child-agent creation and evolution. Voice is not a read-only
transport. Instead, risky operations move into an explicit UI decision gate:
service install/uninstall, scheduler/cron/launchd enablement, deployment or
publishing, deletion, credential/secret writes and danger-full-access sandbox.

The gate is execution-blocking, not specification-blocking. The Codex task is
created, visible in the task queue and auditable, but the sidecar does not start
until the operator presses Approve. Reject records a terminal rejected status.
Secrets are never collected through voice/model context; use the child-agent
credential UI or placeholder docs.

## Use when

- designing a new agent from user requirements;
- creating a sibling project for a new Codex-native agent;
- deciding whether a new agent needs Telegram, CLI, web, API or another interface;
- adapting patterns from OpenClaw, Hermes, Claude Code, Gemini CLI, Cursor or other agent environments;
- turning TechScope knowledge into reusable agent architecture.

## Avoid when

- the request is only a one-off analysis task inside TechScope;
- the user has not agreed on the agent's purpose and success criteria;
- source freshness or platform semantics cannot be verified;
- the requested agent would require secrets, deployment or external actions that are not explicitly approved.

## Required practices

- Create an `agent-contract` before generating project files.
- Require `status: accepted` before production scaffold; use
  `--allow-draft-scaffold` only for an explicit experimental scaffold.
- Run Pritha memory research before scaffold and record whether current
  external documentation verification is complete or pending.
- Prefer `codex-native + optional Telegram` as the first scaffold path unless the contract chooses another runtime.
- Record runtime family, interface mode, target folder, hosting expectation, memory model, tool boundaries and tests.
- Record Codex surface profile when Codex is involved: CLI, app, IDE, cloud,
  app-server, MCP worker, workspace agent, Bedrock-backed provider or none.
- Record team mode: single agent, coordinator plus workers, specialist team or
  external harness team.
- Record runtime placement per task class: deterministic code, local model,
  small hosted model, frontier hosted model, Codex sidecar or human/manual.
- Record untrusted input sources, risk tier, quarantine policy, token/media budget caps and human approval gates.
- Record an AI-SAFE security profile for non-trivial agents using
  `agent-ai-safe-security-checklist`: interface, reasoning/planning, knowledge,
  tools/execution and infrastructure/orchestration controls.
- Record runtime isolation profile: no isolation, process-only, project-folder,
  container, sandbox or remote sandbox. For always-on, external-facing or
  permission-heavy agents, explicitly justify if sandboxing is not used.
- Apply `agent-proactivity-scheduling` before adding cron, heartbeat, scheduled
  tasks, event-driven watchers, queue watchers, recurring notifications or
  durable workflow schedules. Background autonomy is disabled by default and
  requires explicit contract fields for scheduler owner, memory writes,
  concurrency, monitoring, alerts and kill switch.
- Treat Telegram as an optional interface adapter, not a default requirement.
- Apply `agent-interface-experience` before adding web UI, generated UI,
  embedded chat apps, AG-UI-style event streams, MCP Apps/UI widgets or other
  rich interaction surfaces. The contract must record the interface profile,
  user controls, state model, rendering trust boundary, side-effect policy,
  privacy prompts, fallback and readiness check.
- If Telegram is selected, require queueing, concise user-facing replies, log visibility, token isolation and explicit authorization mode.
- Do not copy `.env`, tokens, credentials, personal data or private runtime state from TechScope into the new agent.
- Choose the narrowest reliable tool boundary using `agent-tool-integration-selection`.
- Apply `agent-mcp-connector-lifecycle` before adding external MCP servers to a
  child agent. MCP is an optional contract-selected connector layer; selected
  connectors need source review, scoped toolsets, auth policy, approval gates,
  readiness status and fallback.
- Apply `agent-skill-pack-lifecycle` before adding reusable skills to a child
  agent. Skills are optional contract-selected modules; external skills require
  provenance review, source pinning, script/resource inspection, approval,
  trigger/side-effect evals, readiness status and update/audit policy.
- Apply `agent-untrusted-input-security` before allowing external content to drive model context, tools, memory or spend.
- Apply `agent-runtime-placement` before assuming one global model or before
  adding local inference as a cost/privacy optimization.
- Apply `agent-team-operating-model` before splitting a new project into
  multiple role agents, scheduled agents or worker runtimes.
- Apply `agent-harness-evaluation` before choosing OpenCode, Pi, Hermes,
  OpenClaw or any other non-Codex/local-model harness as the foundation for a new
  agent.
- Apply `agent-minimal-core-extension-surface` when defining the scaffold module
  boundary: record core runtime, extension surface, selected modules, skipped
  modules, trust levels, activation mode, permissions, readiness and evals.
- Apply `agent-environment-compatibility` before borrowing patterns from non-Codex tools.
- Generate a `scaffold-report` after files are created and tests are run.
- After the first meaningful working version, create a post-creation review and preserve the user interaction path that shaped the agent.
- Index contracts and scaffold reports into TechScope memory.
- For agents that may run across multiple sessions or context windows, scaffold
  explicit handoff state: task list, progress log, current blockers, git state,
  initialization command, health/smoke command and next bounded increment.
- Distinguish feedforward surfaces from feedback surfaces. Feedforward surfaces
  include `AGENTS.md`, contracts, standards, workflows, skills, examples and
  architectural constraints. Feedback surfaces include tests, linters, type
  checks, browser checks, traces, logs, eval transcripts, review comments and
  user corrections.
- Keep `AGENTS.md` concise and map-like. Do not turn it into a monolithic manual; route detailed architecture, operations, security, QA, memory and product guidance to versioned repo-local artifacts.
- Treat repo-local knowledge as the system of record for future agents. If a rule, decision, product constraint or repeated correction matters, encode it in Markdown, tests, scripts, linters, skills, workflows or another discoverable project artifact.
- Make verification surfaces agent-readable where scope justifies it: healthchecks, smoke tests, browser checks, screenshots, logs, metrics, traces and actionable failure messages.
- Convert repeated review comments, trace failures and user corrections into
  durable docs, templates, checks, skills, tool boundaries or workflow changes
  instead of relying on memory of prior conversations.
- For long-lived or high-throughput agent-generated projects, plan periodic cleanup/doc-gardening so drift, stale docs, inconsistent patterns and low-quality generated artifacts are corrected incrementally.
- Treat model swaps as harness changes, not only provider changes. A different
  model may need different prompt shape, tool schemas, context ordering, eval
  baselines, retry policy or verification surfaces.
- At the end of setup/init, verify and state module readiness for the selected agent: harness, memory, data layer, skills, MCP, tools, interfaces, operations and any selected external connectors. Missing optional modules are reported as skipped; missing selected modules are reported as failed or pending-auth.
- If realtime voice control is selected, initialize the default realtime tool surface unless the contract explicitly opts out: internet access, agent memory access and Codex CLI sidecar access. Treat these as selected realtime-interface modules; setup must report their readiness and must not silently mark the voice interface as ready when memory or Codex CLI access is missing.
- Preserve an evolution path through the agent's native interface. For Codex-native descendants, document how to continue development in Codex App and how to route non-domain learning materials into agent self-improvement review rather than task memory.

## Harness inventory

Each created agent must document:

- selected modules: which parts of harness, memory, data, skills, MCP, tools, evals, interfaces and operations are included and why;
- information boundaries: what the model sees, what remains hidden, how context is compressed;
- runtime boundary: where the agent runs, what the host controls, where secrets
  live, and what network/filesystem policy applies;
- untrusted-input boundary: which external sources enter, what is quarantined, and what cannot directly affect tools or memory;
- tool system: available tools, routing rules, permissions and tool output filtering;
- runtime placement: which model/runtime handles each task class, fallback,
  budget policy, privacy routing and route healthchecks;
- execution orchestration: task phases, queues, retries, human checkpoints and completion criteria;
- memory and state: what persists, where it lives and how it is updated;
- evaluation and observability: tests, healthchecks, logs, traces and review points;
- constraints, validation and recovery: forbidden actions, schema checks, fallback paths and rollback rules.
- user interaction review: initial request, clarifying questions, user feedback, failed assumptions and product decisions that emerged during real testing.
- agent legibility: the maps, docs, checks, logs, UI/browser verification paths and remediation messages that let future agent runs understand and safely change the project.
- long-running continuity: the handoff artifacts and state reset rules that let
  a future session resume without raw chat history.
- improvement loop: how traces, eval failures, review comments and user
  corrections become harness changes.

## Agent environment compatibility

- Agent platforms: Codex is the primary implementation target; other platforms are research sources or adapter targets.
- Model context: record model family and version when known.
- Runtime environment: Codex project, CLI, API service, local model, messaging gateway or hybrid.
- Config surfaces: `AGENTS.md`, workflows, templates, scripts, `.env.example`, skills, MCP and platform-native files only when selected.
- Portability: adapter-needed by default.
- Codex adaptation: translate external patterns into TechScope/Codex-compatible contracts and workflows first.
- Environment-specific caveats: do not assume Claude hooks, Gemini memory, Cursor rules, Hermes gateways or OpenAI Agents SDK primitives behave like Codex project rules.

## Temporal validity

- Source published: 2026-05-18 user scenario and current external docs.
- Source updated: 2026-06-07.
- Source version: Techscope draft standard v11 plus Funny Teacher reference
  evidence, OpenAI/OpenAI Codex/Anthropic/LangChain/Cursor/Thoughtworks/arXiv
  harness source batch, Codex surfaces/AWS batch, scheduling/heartbeat batch and
  Agent Skills, agentic UI and AI-SAFE child-agent checklist source batches.
- Retrieved: 2026-05-18.
- Verified: 2026-06-07.
- Valid for: TechScope agent creation workflow from 2026-05-18 onward.
- Freshness status: current.
- Temporal status: current.
- Recheck when: Codex, OpenAI Agents SDK, Telegram Bot API, Claude Code, Gemini CLI, Cursor, Hermes Agent or other target runtimes change context loading, tool execution, auth, memory, hooks, gateways or deployment semantics.

## Examples

- A research assistant agent may be Codex-native with Markdown memory, YouTube transcription, web verification and no Telegram.
- A personal operations agent may be Codex-native with Telegram as the primary chat interface and a one-user allowlist.
- A service agent may use an API runtime, but still starts from an `agent-contract` and receives a scaffold report after tests.
- A voice learning agent should preserve interaction history because lesson UX, memory controls and reset behavior often emerge only after real mobile testing.
- Funny Teacher is the current reference example for a Pritha-made voice learning agent: use its post-creation review before copying any pattern, and preserve its lesson that selected memory focus needs an explicit reset.

## Related decisions

- `04_standards/agent-environment-compatibility.md`
- `04_standards/agent-tool-integration-selection.md`
