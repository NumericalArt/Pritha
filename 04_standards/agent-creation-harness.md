---
id: agent-creation-harness
type: standard
status: draft
created: 2026-05-18
updated: 2026-05-28
last_reviewed: 2026-05-28
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
  - 03_reviews/2026-05-26-openclaw-hacked-agent-security-assessment.md
  - 04_standards/agent-runtime-placement.md
  - 04_standards/agent-team-operating-model.md
  - 04_standards/agent-harness-evaluation.md
  - 02_briefs/2026-05-27-nvidia-nemoclaw-sandboxed-agent-runtime-brief.md
  - 03_reviews/2026-05-27-nvidia-nemoclaw-sandboxed-agent-runtime-assessment.md
related:
  decisions: []
  reviews:
    - 03_reviews/2026-05-18-techscope-agents-mother-scenario-review.md
  briefs: []
  workflows:
    - 07_workflows/agents-mother.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/agent-runtime-placement.md
    - 04_standards/agent-team-operating-model.md
    - 04_standards/agent-harness-evaluation.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-18
source_updated: 2026-05-28
source_version: Techscope draft standard v3 + Pritha alias vocabulary
retrieved: 2026-05-18
verified: 2026-05-28
valid_for: TechScope agent creation workflow from 2026-05-18 onward
temporal_status: current
---

# Standard: agent-creation-harness

Status: draft
Owner: Techscope/user
Last reviewed: 2026-05-28

## Rule

Every new agent created by TechScope must start from an explicit `agent-contract` and must be delivered as a working, testable scaffold with a documented harness.

TechScope may use its own architecture as a reference, but it must not clone itself blindly. The new agent's runtime, interface, memory, tools and security model must follow the contract.

Pritha descendants are assembled from contract-selected modules, not from one universal bundle. Every future agent should receive the harness, memory, data, skills, MCP servers, interface adapters, tools, evals and operations modules that its contract actually needs, and no more. A pattern marked `adopt-in-scaffold` means "available for Pritha to select and compose", not "automatically copied into every descendant".

The initial scaffold is a starting point, not the final boundary of the agent. A descendant can always be evolved through its native interface, especially Codex App/Codex thread for Codex-native agents, plus any other interface selected in its contract. When a descendant receives an internet resource that is not directly relevant to its domain mission, it should treat the resource as meta-improvement input rather than domain memory: evaluate whether the material improves the agent's harness, memory, tools, skills, MCP, UX, evals, safety or operations, then record a brief/review/decision locally or send a distilled lesson back to Pritha/Techscope.

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
- Prefer `codex-native + optional Telegram` as the first scaffold path unless the contract chooses another runtime.
- Record runtime family, interface mode, target folder, hosting expectation, memory model, tool boundaries and tests.
- Record team mode: single agent, coordinator plus workers, specialist team or
  external harness team.
- Record runtime placement per task class: deterministic code, local model,
  small hosted model, frontier hosted model, Codex sidecar or human/manual.
- Record untrusted input sources, risk tier, quarantine policy, token/media budget caps and human approval gates.
- Record runtime isolation profile: no isolation, process-only, project-folder,
  container, sandbox or remote sandbox. For always-on, external-facing or
  permission-heavy agents, explicitly justify if sandboxing is not used.
- Treat Telegram as an optional interface adapter, not a default requirement.
- If Telegram is selected, require queueing, concise user-facing replies, log visibility, token isolation and explicit authorization mode.
- Do not copy `.env`, tokens, credentials, personal data or private runtime state from TechScope into the new agent.
- Choose the narrowest reliable tool boundary using `agent-tool-integration-selection`.
- Apply `agent-untrusted-input-security` before allowing external content to drive model context, tools, memory or spend.
- Apply `agent-runtime-placement` before assuming one global model or before
  adding local inference as a cost/privacy optimization.
- Apply `agent-team-operating-model` before splitting a new project into
  multiple role agents, scheduled agents or worker runtimes.
- Apply `agent-harness-evaluation` before choosing OpenCode, Pi, Hermes,
  OpenClaw or any other non-Codex/local-model harness as the foundation for a new
  agent.
- Apply `agent-environment-compatibility` before borrowing patterns from non-Codex tools.
- Generate a `scaffold-report` after files are created and tests are run.
- After the first meaningful working version, create a post-creation review and preserve the user interaction path that shaped the agent.
- Index contracts and scaffold reports into TechScope memory.
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
- Source updated: 2026-05-26.
- Source version: Techscope draft standard v1 plus Funny Teacher lifecycle evidence.
- Retrieved: 2026-05-18.
- Verified: 2026-05-26.
- Valid for: TechScope agent creation workflow from 2026-05-18 onward.
- Freshness status: current.
- Temporal status: current.
- Recheck when: Codex, OpenAI Agents SDK, Telegram Bot API, Claude Code, Gemini CLI, Cursor, Hermes Agent or other target runtimes change context loading, tool execution, auth, memory, hooks, gateways or deployment semantics.

## Examples

- A research assistant agent may be Codex-native with Markdown memory, YouTube transcription, web verification and no Telegram.
- A personal operations agent may be Codex-native with Telegram as the primary chat interface and a one-user allowlist.
- A service agent may use an API runtime, but still starts from an `agent-contract` and receives a scaffold report after tests.
- A voice learning agent should preserve interaction history because lesson UX, memory controls and reset behavior often emerge only after real mobile testing.

## Related decisions

- `04_standards/agent-environment-compatibility.md`
- `04_standards/agent-tool-integration-selection.md`
