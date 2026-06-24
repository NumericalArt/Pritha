---
id: 2026-06-23-pictureboom-agent-research
type: review
status: draft
created: 2026-06-23
updated: 2026-06-23
topics:
  - agent-engineering
  - agent-factory
  - architecture-validation
  - pictureboom
tools:
  - Codex
  - AGENTS.md
  - Telegram
agent_platforms:
  - Codex
model_context:
  - unknown
runtime_environment:
  - codex-native scaffold plus deterministic local web app.
config_surfaces:
  - AGENTS.md
  - workflows
  - scripts
portability: codex-native
sources:
  - 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
  - 07_workflows/agents-mother.md
  - 07_workflows/agents-mother-roadmap.md
  - 04_standards/agent-creation-harness.md
  - 04_standards/agent-environment-compatibility.md
  - 04_standards/agent-tool-integration-selection.md
  - 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack.md
  - 11_agents/registry.md
  - 04_standards/agent-ai-safe-security-checklist.md
  - 11_agents/reports/2026-05-25-funny-teacher-agent-scaffold-report.md
  - 11_agents/reports/2026-06-12-stupidjoke-agent-post-creation-review.md
  - 11_agents/profiles/fas.md
  - 02_briefs/2026-05-28-descendant-meta-improvement-input-brief.md
  - 11_agents/reports/2026-06-22-fas-scaffold-report.md
  - 11_agents/contracts/2026-06-22-web-summit-check-agent-agent-contract.md
  - 03_reviews/2026-06-07-yandex-ai-safe-agent-security-assessment.md
  - 01_sources/signals/2026-06-02-codex-app-server-rate-limit-telemetry-signal.md
  - 04_standards/realtime-voice-control-for-codex-agents.md
  - 07_workflows/2026-06-21-pritha-github-install-reproducibility-roadmap.md
  - 03_reviews/2026-06-16-pritha-current-state-snapshot.md
  - 07_workflows/memory-domain-routing.md
  - 03_reviews/2026-06-22-last30days-skill-pritha-harness-assessment.md
  - 11_agents/contracts/2026-06-12-stupidjoke-agent-contract.md
  - 11_agents/skills/evidence-classification/SKILL.md
  - 04_standards/expert-information-assessment.md
  - 07_workflows/expert-information-assessment.md
  - 08_templates/assessment.md
  - 11_agents/skills/markdown-memory-update/SKILL.md
  - 04_standards/memory-structure.md
  - 07_workflows/memory-indexing.md
  - docs/memory.md
  - 11_agents/skills/raster-ui-asset-design/SKILL.md
  - 04_standards/raster-ui-assets-for-child-agents.md
  - 07_workflows/raster-ui-asset-generation.md
  - 03_reviews/2026-06-21-raster-image-generation-ui-source-batch-review.md
  - 11_agents/skills/telegram-intake-triage/SKILL.md
  - 07_workflows/telegram-intake-bot.md
  - 07_workflows/media-intake-processing.md
  - 04_standards/agent-untrusted-input-security.md
related:
  agent_contracts:
    - 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-environment-compatibility.md
    - 04_standards/agent-tool-integration-selection.md
    - 04_standards/memory-domains.md
    - 04_standards/pritha-self-model.md
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/agents-mother-roadmap.md
supersedes: []
superseded_by: []
freshness_status: uncertain
source_published: 2026-06-23
source_updated: 2026-06-23
source_version: research draft v1
retrieved: 2026-06-23
verified: 2026-06-23
valid_for: pre-scaffold architecture validation
temporal_status: unknown
research_gate_status: complete
memory_research_status: complete
external_research_status: not-applicable
external_research_backend: none
external_research_completed_at: 2026-06-23
external_research_freshness_window_days: 30
external_research_topics:
  - not-applicable
synthesis_status: not-applicable
pattern_pack: 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack.md
pattern_research_status: complete
semantic_memory_status: complete
semantic_failure_log: none
---

# Review: PictureBoom agent architecture research

Date: 2026-06-23
Status: draft

## Question

Is the current agent contract ready to move toward scaffold, and what architecture checks must be completed first?

## Contract summary

- Contract: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Agent name: PictureBoom
- Mission: provide a local Pritha child agent that receives internally
- Target user: Pritha voice operator testing an image-generation inbox and
- Runtime family: codex-native scaffold plus deterministic local web app.
- Primary interface: local web.
- Telegram mode: none.
- Expected hosting: local Mac.
- Memory model: file-backed local media inbox, no embeddings or Pritha memory

## Local memory findings

### 1. Pritha Registry

- Path: 11_agents/registry.md
- Type/status: agent-registry/active
- Heading: Agents
- Relevance note: ## Agents  | Agent | Mission | Runtime | Interface | Deployment | Proactivity | Evidence | | --- | --- | --- | --- | --- | --- | --- | | FAS | provide a local one-page theater-scene demo agent where a | codex-native scaffold plus deterministic browser app. | local web. / Telegram none. | local Mac. | none. | contracts:1 scaffold:1 test:0 handoff:0 ops:1 deploy:1 evolve:0 | | FESPA26 | voice-first Codex-native workben

### 2. Standard: Agent AI-SAFE Security Checklist

- Path: 04_standards/agent-ai-safe-security-checklist.md
- Type/status: standard/draft
- Heading: Use When
- Relevance note: ## Use When  - Creating or validating an `agent-contract`. - Scaffolding a Codex-native child agent. - Adding Telegram, web, API, voice, MCP, skills, browser, file upload, RAG, memory, deployment, proactivity or multi-agent communication. - Reviewing an existing project that may become a Pritha-managed agent. - Writing scaffold, test, handoff, operations or deployment reports.

### 3. Agent Scaffold Report: Funny Teacher

- Path: 11_agents/reports/2026-05-25-funny-teacher-agent-scaffold-report.md
- Type/status: scaffold-report/complete
- Heading: Summary
- Relevance note: ## Summary  - Agent name: Funny Teacher - Target folder: `<SIBLING_AGENT_ROOT>/FunnyTeacher` - Contract: `11_agents/contracts/2026-05-25-funny-teacher-agent-contract.md` - Runtime: local Next.js web app with Codex-native project instructions. - Primary interface: Web Voice Only. - Telegram: not included in v1. - Operations: manual local dev server, no autostart. - Memory: SQLite operational memory plus required seman

### 4. Agent Post-Creation Review: StupidJoke

- Path: 11_agents/reports/2026-06-12-stupidjoke-agent-post-creation-review.md
- Type/status: agent-post-creation-review/accepted
- Heading: Summary
- Relevance note: ## Summary  - Project path: `<SIBLING_AGENT_ROOT>/StupidJoke` - Classification: minimal Codex-native child-agent scaffold. - Related lifecycle reports: contract, failed scaffold-prep report, scaffold completion report, and test report. - Result: working v0.1.0 scaffold with deterministic health, smoke, and Node tests.

### 5. Child Agent Profile: FAS

- Path: 11_agents/profiles/fas.md
- Type/status: child-agent-profile/active
- Heading: Child Agent Profile: FAS
- Relevance note: # Child Agent Profile: FAS  - Name: FAS - Folder: `/Users/jkl/FAS` - Mission: local one-page theater scene demo with Three.js avatar and Realtime   voice command dispatch. - Runtime: local browser app plus Node API for Realtime ephemeral sessions. - Interface: realtime-voice-ui with manual command fallback. - Deployment: manual Control Center managed local web service; developer Vite   mode remains separate. - Proact

### 6. Brief: Descendant Meta-Improvement Input

- Path: 02_briefs/2026-05-28-descendant-meta-improvement-input-brief.md
- Type/status: brief/active
- Heading: Key Claims
- Relevance note: ## Key Claims  - A generated agent scaffold is a starting point, not a final ceiling. - Future functionality can be added through the agent's native interface, especially Codex App for Codex-native descendants. - If a descendant receives an external internet resource that is not directly relevant to its mission, the agent should not silently merge it into domain memory. - Such material should be handled as meta-impro

### 7. Standard: agent-creation-harness

- Path: 04_standards/agent-creation-harness.md
- Type/status: standard/draft
- Heading: Examples
- Relevance note: ## Examples  - A research assistant agent may be Codex-native with Markdown memory, YouTube transcription, web verification and no Telegram. - A personal operations agent may be Codex-native with Telegram as the primary chat interface and a one-user allowlist. - A service agent may use an API runtime, but still starts from an `agent-contract` and receives a scaffold report after tests. - A voice learning agent should

### 8. Agent Scaffold Report: FAS

- Path: 11_agents/reports/2026-06-22-fas-scaffold-report.md
- Type/status: scaffold-report/complete
- Heading: Summary
- Relevance note: ## Summary  - Agent name: FAS - Target folder: `/Users/jkl/FAS` - Contract: `11_agents/contracts/2026-06-22-fas-agent-contract.md` - Runtime family: local web app plus OpenAI Realtime voice dispatcher. - Interfaces: local browser page, manual command fallback, Realtime WebRTC   voice mode. - Telegram mode: none. - Research report: not separate; contract references relevant Pritha standards   and current local task pl

### 9. Agent Project Contract: WebSummitCheckAgent

- Path: 11_agents/contracts/2026-06-22-web-summit-check-agent-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Research basis
- Relevance note: ## Research basis  - Related Pritha artifacts: 07_workflows/agents-mother.md; 04_standards/agent-creation-harness.md; 04_standards/agent-runtime-placement.md; 04_standards/agent-environment-compatibility.md; 04_standards/agent-tool-integration-selection.md - Current primary sources checked: not-applicable for v1 because no external platform/API/runtime dependency is selected. - Trusted secondary sources checked: Prit

### 10. Assessment: AI-SAFE v1.0 for Pritha Child-Agent Security

- Path: 03_reviews/2026-06-07-yandex-ai-safe-agent-security-assessment.md
- Type/status: assessment/draft
- Heading: Agent Environment Profile
- Relevance note: ## Agent Environment Profile  - Agent platforms: Pritha-created Codex-native agents, optional Telegram/web/API adapters, MCP/skills-enabled agents, multi-agent descendants. - Model context: frontier reasoning/Codex for planning and coding; smaller/local models only for validated bounded subtasks. - Runtime environment: local project folder, Codex App/thread, CLI, optional service/runtime adapters. - Config surfaces:

### 11. Signal: Codex App-Server Rate Limit Telemetry

- Path: 01_sources/signals/2026-06-02-codex-app-server-rate-limit-telemetry-signal.md
- Type/status: signal/refined
- Heading: Boundaries
- Relevance note: ## Boundaries  - Do not add this to ordinary child agents that only run inside a Codex   workspace without app-server integration. - Do not expose ChatGPT access tokens to browser UI. - Do not store account emails, tokens or raw auth payloads in Pritha memory. - Do not treat `usedPercent` as exact cost accounting. - Do not require this telemetry for every Codex-native child agent.

### 12. Standard: Realtime Voice Control For Codex Agents

- Path: 04_standards/realtime-voice-control-for-codex-agents.md
- Type/status: standard/active
- Heading: Agent Environment Compatibility
- Relevance note: ## Agent Environment Compatibility  - Agent platforms: Codex-native agents with optional OpenAI Realtime voice layer. - Model context: observed with `gpt-realtime-2` and cheap-mode `gpt-realtime-mini`. - Runtime environment: local Next.js web UI, server API routes, local SQLite, Codex App/CLI transports. - Config surfaces: `AGENTS.md`, realtime instructions, tool schemas, server routes, codex task service, queue scri


## Domain-aware memory findings

### Agent-building knowledge

Use these as standards, workflows and reusable patterns for the new contract.

### 1. Standard: Agent AI-SAFE Security Checklist

- Path: 04_standards/agent-ai-safe-security-checklist.md
- Type/status: standard/draft
- Heading: Use When
- Relevance note: ## Use When  - Creating or validating an `agent-contract`. - Scaffolding a Codex-native child agent. - Adding Telegram, web, API, voice, MCP, skills, browser, file upload, RAG, memory, deployment, proactivity or multi-agent communication. - Reviewing an existing project that may become a Pritha-managed agent. - Writing scaffold, test, handoff, operations or deployment reports.

### 2. Agent Post-Creation Review: StupidJoke

- Path: 11_agents/reports/2026-06-12-stupidjoke-agent-post-creation-review.md
- Type/status: agent-post-creation-review/accepted
- Heading: Summary
- Relevance note: ## Summary  - Project path: `<SIBLING_AGENT_ROOT>/StupidJoke` - Classification: minimal Codex-native child-agent scaffold. - Related lifecycle reports: contract, failed scaffold-prep report, scaffold completion report, and test report. - Result: working v0.1.0 scaffold with deterministic health, smoke, and Node tests.

### 3. Agent Scaffold Report: FAS

- Path: 11_agents/reports/2026-06-22-fas-scaffold-report.md
- Type/status: scaffold-report/complete
- Heading: Summary
- Relevance note: ## Summary  - Agent name: FAS - Target folder: `/Users/jkl/FAS` - Contract: `11_agents/contracts/2026-06-22-fas-agent-contract.md` - Runtime family: local web app plus OpenAI Realtime voice dispatcher. - Interfaces: local browser page, manual command fallback, Realtime WebRTC   voice mode. - Telegram mode: none. - Research report: not separate; contract references relevant Pritha standards   and current local task pl

### 4. Agent Project Contract: WebSummitCheckAgent

- Path: 11_agents/contracts/2026-06-22-web-summit-check-agent-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Research basis
- Relevance note: ## Research basis  - Related Pritha artifacts: 07_workflows/agents-mother.md; 04_standards/agent-creation-harness.md; 04_standards/agent-runtime-placement.md; 04_standards/agent-environment-compatibility.md; 04_standards/agent-tool-integration-selection.md - Current primary sources checked: not-applicable for v1 because no external platform/API/runtime dependency is selected. - Trusted secondary sources checked: Prit

### 5. Assessment: AI-SAFE v1.0 for Pritha Child-Agent Security

- Path: 03_reviews/2026-06-07-yandex-ai-safe-agent-security-assessment.md
- Type/status: assessment/draft
- Heading: Agent Environment Profile
- Relevance note: ## Agent Environment Profile  - Agent platforms: Pritha-created Codex-native agents, optional Telegram/web/API adapters, MCP/skills-enabled agents, multi-agent descendants. - Model context: frontier reasoning/Codex for planning and coding; smaller/local models only for validated bounded subtasks. - Runtime environment: local project folder, Codex App/thread, CLI, optional service/runtime adapters. - Config surfaces:

### 6. Signal: Codex App-Server Rate Limit Telemetry

- Path: 01_sources/signals/2026-06-02-codex-app-server-rate-limit-telemetry-signal.md
- Type/status: signal/refined
- Heading: Boundaries
- Relevance note: ## Boundaries  - Do not add this to ordinary child agents that only run inside a Codex   workspace without app-server integration. - Do not expose ChatGPT access tokens to browser UI. - Do not store account emails, tokens or raw auth payloads in Pritha memory. - Do not treat `usedPercent` as exact cost accounting. - Do not require this telemetry for every Codex-native child agent.


### Pritha self

Use these to understand current Pritha capabilities and constraints.

### 1. Roadmap / Technical Specification: Pritha GitHub Install Reproducibility

- Path: 07_workflows/2026-06-21-pritha-github-install-reproducibility-roadmap.md
- Type/status: workflow/active
- Heading: Phase 6 - Child-Agent Git Module
- Relevance note: ## Phase 6 - Child-Agent Git Module  Goal: every generated child agent is version-controlled from the start.  Deliverables:  - `git` becomes a mandatory child-agent harness module. - Contract template gains a `version_control_profile` section:   `system: git`, `required: true`, `initialization: scaffold`, `commit_policy`,   `remote_policy`, `private_state_exclusions`. - Scaffold preflight fails before writing if `git

### 2. Pritha Current State Snapshot

- Path: 03_reviews/2026-06-16-pritha-current-state-snapshot.md
- Type/status: review/complete
- Heading: Child-Agent Snapshot
- Relevance note: ## Child-Agent Snapshot  StupidJoke is the current active child-agent example for a local safe joke agent. Its profile records a local web console, in-process scheduler, JSONL runtime memory, allowlisted source adapter and optional browser Realtime voice bridge.

### 3. Workflow: memory-domain-routing

- Path: 07_workflows/memory-domain-routing.md
- Type/status: workflow/draft
- Heading: Routing Rules
- Relevance note: ## Routing Rules  | Material | Primary domain | | --- | --- | | "Pritha can/should/does..." | `pritha-self` | | New child agent contract/report/test/handoff/evolution | `child-agents` | | Harness, memory, skills, MCP, tools, runtime, interface or eval pattern | `agent-building-knowledge` | | User working preference | `user-model` in local-private memory | | External article/video/post/source | `source-material` first

### 4. Roadmap / Technical Specification: Pritha GitHub Install Reproducibility

- Path: 07_workflows/2026-06-21-pritha-github-install-reproducibility-roadmap.md
- Type/status: workflow/active
- Heading: Executive Position
- Relevance note: ## Executive Position  The 2026-06-21 audit does not call for a rewrite. The current implementation is architecturally sound and has performed well in manual testing across devices. This roadmap treats the existing design as the baseline and adds a safer, repeatable product-install layer around it.  The target outcome is simple:  ```sh git clone https://github.com/NumericalArt/Pritha.git pritha cd pritha node scripts

### 5. Pritha Current State Snapshot

- Path: 03_reviews/2026-06-16-pritha-current-state-snapshot.md
- Type/status: review/complete
- Heading: Child-Agent Lifecycle
- Relevance note: ## Child-Agent Lifecycle  Pritha must not scaffold production child agents directly from a vague idea. The normal lifecycle is:  1. collect a full specification; 2. create an `agent-contract`; 3. perform Pritha memory research against relevant standards, workflows,    decisions, reports and profiles; 4. verify volatile external choices against current primary documentation when    needed; 5. accept the contract; 6. s

### 6. Assessment: last30days-skill for Pritha Harness

- Path: 03_reviews/2026-06-22-last30days-skill-pritha-harness-assessment.md
- Type/status: assessment/draft
- Heading: Decision
- Relevance note: ## Decision  Adopt the pattern, not the dependency yet.  Pritha should add a mandatory fresh external-verification step to child-agent research, and `last30days-skill` is a strong backend candidate for that step. It should remain candidate-only until a pinned, isolated pilot proves that it can run on the local Pritha host, produce parseable JSON, and integrate with Pritha's Markdown-first memory without bypassing evi


### Child-agent lifecycle evidence

Use these only as evidence of successful or failed patterns. Do not clone a
past child agent by default.

### 1. Agent Post-Creation Review: StupidJoke

- Path: 11_agents/reports/2026-06-12-stupidjoke-agent-post-creation-review.md
- Type/status: agent-post-creation-review/accepted
- Heading: Summary
- Relevance note: ## Summary  - Project path: `<SIBLING_AGENT_ROOT>/StupidJoke` - Classification: minimal Codex-native child-agent scaffold. - Related lifecycle reports: contract, failed scaffold-prep report, scaffold completion report, and test report. - Result: working v0.1.0 scaffold with deterministic health, smoke, and Node tests.

### 2. Child Agent Profile: FAS

- Path: 11_agents/profiles/fas.md
- Type/status: child-agent-profile/active
- Heading: Child Agent Profile: FAS
- Relevance note: # Child Agent Profile: FAS  - Name: FAS - Folder: `/Users/jkl/FAS` - Mission: local one-page theater scene demo with Three.js avatar and Realtime   voice command dispatch. - Runtime: local browser app plus Node API for Realtime ephemeral sessions. - Interface: realtime-voice-ui with manual command fallback. - Deployment: manual Control Center managed local web service; developer Vite   mode remains separate. - Proact

### 3. Agent Scaffold Report: FAS

- Path: 11_agents/reports/2026-06-22-fas-scaffold-report.md
- Type/status: scaffold-report/complete
- Heading: Summary
- Relevance note: ## Summary  - Agent name: FAS - Target folder: `/Users/jkl/FAS` - Contract: `11_agents/contracts/2026-06-22-fas-agent-contract.md` - Runtime family: local web app plus OpenAI Realtime voice dispatcher. - Interfaces: local browser page, manual command fallback, Realtime WebRTC   voice mode. - Telegram mode: none. - Research report: not separate; contract references relevant Pritha standards   and current local task pl

### 4. Agent Project Contract: WebSummitCheckAgent

- Path: 11_agents/contracts/2026-06-22-web-summit-check-agent-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Research basis
- Relevance note: ## Research basis  - Related Pritha artifacts: 07_workflows/agents-mother.md; 04_standards/agent-creation-harness.md; 04_standards/agent-runtime-placement.md; 04_standards/agent-environment-compatibility.md; 04_standards/agent-tool-integration-selection.md - Current primary sources checked: not-applicable for v1 because no external platform/API/runtime dependency is selected. - Trusted secondary sources checked: Prit

### 5. Agent Project Contract: WebSummitCheckAgent

- Path: 11_agents/contracts/2026-06-22-web-summit-check-agent-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Harness inventory
- Relevance note: ## Harness inventory  - Information boundaries: AGENTS.md and README provide only concise operating instructions; no Pritha private memory, queues, logs, credentials, or raw user data are copied into the child project. - Runtime placement: deterministic-first; local inference no; fallbacks manual review or future Codex task after contract update - Tool system: minimal local CLI scripts only - Execution orchestration:

### 6. Agent Project Contract: StupidJoke

- Path: 11_agents/contracts/2026-06-12-stupidjoke-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Runtime And Interface
- Relevance note: ## Runtime And Interface  - Runtime family: codex-native - Runtime notes: deterministic Node.js helpers for the minimal scaffold. - Codex surface profile: app-supervised or cli-local during development. - Primary interface: Codex project plus CLI healthcheck for v1. - Secondary interfaces: realtime voice event adapter placeholder. - Interface experience profile: realtime-voice-ui later; event-stream/CLI fixture tests


## Pattern Pack

- Path: 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack.md
- Status: complete
- Selected patterns: 24
- Semantic/embedding search: complete
- Semantic failure log: none
- External research seeds: deterministic browser, browser app., web. telegram, telegram none., fespa26 voice-first, voice-first codex-native, adding telegram, telegram web, web api, api voice, voice mcp, mcp skills, skills browser, browser file, upload rag, rag deployment

Codex must read this pattern pack before scaffold or agent improvement work. If semantic/embedding search failed, continue only with the warning recorded above and use external research to compensate for missing semantic retrieval.

## Standards and workflow basis

### Standard: agent-creation-harness

- Path: 04_standards/agent-creation-harness.md
- Basis: Every new agent created by TechScope must start from an explicit `agent-contract` and must be delivered as a working, testable scaffold with a documented harness. TechScope may use its own architecture as a reference, but it must not clone itself blindly. The new agent's runtime, interface, memory, tools and security model must follow the contract. Pritha descendants are assembled from contract-selected modules, not from one universal bundle. Every future agent should receive the harness, memory

### Standard: agent-environment-compatibility

- Path: 04_standards/agent-environment-compatibility.md
- Basis: Every Techscope artifact about coding agents, LLM agents, agent tooling or agent configuration must identify the agent environment it describes and whether the idea is portable to Codex. Codex is the primary implementation target for Techscope. Other environments are valuable research sources, but their patterns must be translated through an environment compatibility layer before becoming Techscope standards.

### Standard: agent-tool-integration-selection

- Path: 04_standards/agent-tool-integration-selection.md
- Basis: Before adding a capability to an agent, choose the narrowest reliable integration boundary: - use CLI/script when a local deterministic command maps directly to the job; - use a skill when the missing piece is repeatable procedure, project convention or harness logic; - use MCP when the capability needs a durable service boundary, authentication, remote execution, shared governance, tool discovery, auditability or rendered/processed output; - use browser/manual review when the task requires visu

### Standard: memory-domains

- Path: 04_standards/memory-domains.md
- Basis: Pritha memory uses two independent axes: - folder/stage: maturity of knowledge; - memory domain: semantic area of meaning. Do not replace the current staged Markdown architecture with domain folders. Add domain metadata so a single artifact can belong to several domains.

### Standard: pritha-self-model

- Path: 04_standards/pritha-self-model.md
- Basis: Pritha self-knowledge is canonical only when it lives in curated artifacts: standards, decisions, workflows, reports and reviewed summaries. Generated wiki pages can help navigation but cannot define what Pritha is or does.

### Workflow: agents-mother / Pritha

- Path: 07_workflows/agents-mother.md
- Basis: Use TechScope as an agent factory: design, validate, scaffold, test and hand off new working agents from a user request or jointly developed specification. Pritha is the public alias and product name for this layer. Existing `agents-mother` paths and artifact types remain valid for compatibility; new user-facing CLI/docs should prefer Pritha vocabulary. The default v1 target is a production-testable sibling project. The first implementation path is `codex-native + optional interface adapters`. F

### Roadmap: Agents Mother

- Path: 07_workflows/agents-mother-roadmap.md
- Basis: Build TechScope into a full agent creation environment: it should interview the user, design a new agent, validate the architecture against TechScope memory and current sources, generate a working sibling project, test it, hand it off, and feed the results back into TechScope knowledge. Default target: production-testable agents, not paper-only specifications.


## Research Gate Status

| Gate | Status | Notes |
| --- | --- | --- |
| Research gate | complete | Memory research is complete and external provider research is explicitly not applicable for this contract. |
| Memory research | complete | Local Pritha memory search completed for this report. |
| External research | not-applicable | External image-generation providers and external API keys are explicitly forbidden by the accepted contract. |
| Synthesis | not-applicable | No memory-vs-external provider synthesis is required for the v1 internal Codex-only image flow. |

## External Research Topics

### 1. Telegram Bot API and adapter security

- ID: `telegram-bot-api`
- Query: Telegram Bot API current documentation long polling webhooks file downloads message limits bot token security
- Reason: Telegram interface selected or mentioned.
- Required: yes
- Preferred sources: official-docs, security-docs, trusted-secondary
- Freshness window: 30 days

### 2. OpenAI Realtime API and voice model behavior

- ID: `openai-realtime`
- Query: OpenAI Realtime API current documentation client secrets calls WebRTC transcription model voice behavior
- Reason: Realtime voice, audio, speech or transcription selected.
- Required: yes
- Preferred sources: official-docs, changelog
- Freshness window: 30 days

### 3. Memory, RAG and storage dependency choices

- ID: `memory-rag-storage`
- Query: current RAG memory embeddings vector database storage dependency documentation agent
- Reason: Semantic memory, embeddings, vector store, graph store or RAG mentioned.
- Required: yes
- Preferred sources: official-docs, changelog, github, trusted-secondary
- Freshness window: 30 days

### 4. Operations, deployment and proactive execution constraints

- ID: `operations-deployment`
- Query: current macOS launchd cron service deployment agent safety background scheduler best practices
- Reason: Service, autostart, deployment or proactive execution selected.
- Required: yes
- Preferred sources: official-docs, security-docs, trusted-secondary
- Freshness window: 30 days

### 5. Untrusted input security and quarantine

- ID: `untrusted-input-security`
- Query: current agent untrusted input prompt injection quarantine scanner validation security best practices
- Reason: External or untrusted input appears in the contract.
- Required: yes
- Preferred sources: security-docs, trusted-secondary, official-docs
- Freshness window: 30 days

### 6. Declared dependency versions and install safety

- ID: `declared-dependencies`
- Query: current versions changelog security install documentation local web runtime selected during scaffold; no external
- Reason: Contract declares dependencies that should be checked before scaffold.
- Required: yes
- Preferred sources: official-docs, github, changelog
- Freshness window: 30 days

### 7. Current-source check for memory pattern: deterministic browser

- ID: `pattern-deterministic-browser`
- Query: current official documentation changelog security discussion deterministic browser agent harness
- Reason: Selected Pritha memory pattern produced this external research seed.
- Required: yes
- Preferred sources: official-docs, github, changelog, trusted-secondary
- Freshness window: 30 days

### 8. Current-source check for memory pattern: browser app.

- ID: `pattern-browser-app`
- Query: current official documentation changelog security discussion browser app. agent harness
- Reason: Selected Pritha memory pattern produced this external research seed.
- Required: yes
- Preferred sources: official-docs, github, changelog, trusted-secondary
- Freshness window: 30 days

### 9. Current-source check for memory pattern: web. telegram

- ID: `pattern-web-telegram`
- Query: current official documentation changelog security discussion web. telegram agent harness
- Reason: Selected Pritha memory pattern produced this external research seed.
- Required: yes
- Preferred sources: official-docs, github, changelog, trusted-secondary
- Freshness window: 30 days

### 10. Current-source check for memory pattern: telegram none.

- ID: `pattern-telegram-none`
- Query: current official documentation changelog security discussion telegram none. agent harness
- Reason: Selected Pritha memory pattern produced this external research seed.
- Required: yes
- Preferred sources: official-docs, github, changelog, trusted-secondary
- Freshness window: 30 days

### 11. Current-source check for memory pattern: fespa26 voice-first

- ID: `pattern-fespa26-voice-first`
- Query: current official documentation changelog security discussion fespa26 voice-first agent harness
- Reason: Selected Pritha memory pattern produced this external research seed.
- Required: yes
- Preferred sources: official-docs, github, changelog, trusted-secondary
- Freshness window: 30 days


## External Research Evidence

- Not applicable for the selected v1 boundary. PictureBoom uses internal Codex handoff only, forbids external image-generation providers and external API keys, and relies on existing Pritha/Tailscale standards plus final local status checks.

## Memory vs External Comparison

- Not applicable for external providers. Local Pritha memory findings are the basis for scaffold, and implementation must preserve the contract boundary: images and metadata stay only inside the PictureBoom project.

## Scaffold Gate Decision

- Status: complete
- Decision: scaffold may proceed if all other contract checks pass.
- Required next action: continue to scaffold with the accepted contract and keep external image providers out of v1.

## External verification checklist

- [ ] Verify current Codex/AGENTS.md behavior and any target runtime docs before scaffold.
- [ ] Verify package/dependency versions before installing anything.
- [ ] Verify security and auth requirements for any external service selected by the contract.
- [ ] Verify current Telegram Bot API behavior for updates, long polling/webhooks, file downloads and message size limits.
- [ ] Verify token handling and one-user allowlist pattern before creating the Telegram adapter.

## Skill candidates

Policy: needs=`auto`; sources=`local-only`; install=`recommend`; mutation=`read-only`.

| Skill | Source | Fit | Trust | Risk | Recommendation |
| --- | --- | ---: | --- | --- | --- |
| evidence-classification | pritha-memory | 14 | local-reviewed | low | optional |
| markdown-memory-update | pritha-memory | 16 | local-reviewed | low | optional |
| raster-ui-asset-design | pritha-memory | 12 | local-reviewed | medium | optional |
| telegram-intake-triage | pritha-memory | 15 | local-reviewed | low | optional |

## Skill decisions required

- [ ] Keep recommended skills candidate-only unless the contract selects `Skill install mode: vendor`.
- [ ] Do not install external skills until explicit approval and audit workflow exists.
- [ ] Keep generated wiki pages as references only, never as direct skill provenance.

## Architecture recommendation

- Runtime family: keep `codex-native scaffold plus deterministic local web app.` unless research finds a hard blocker.
- Telegram: include it as `none.` adapter with queue, allowlist, concise replies and logs.
- Memory: start from `file-backed local media inbox, no embeddings or Pritha memory`; add SQLite/embeddings only if v1 workflows need retrieval.
- Scaffold should remain minimal, testable and free of copied Pritha secrets.

## Risks and open questions

- Contract validation issues: invalid Runtime family "codex-native scaffold plus deterministic local web app.". Expected: codex-native, cli, api, local-model, hybrid, environment-specific; invalid Runtime placement profile "deterministic-first.". Expected: deterministic-first, frontier-first, local-first, hybrid, unknown; invalid Multi-model routing requested. Expected: no, yes or only-if-needed; invalid Telegram mode "none.". Expected: none, primary-chat, intake-channel, notifications-only, operator-control; invalid Service mode "manual.". Expected: none, manual, launchd, external; invalid Autostart "disabled.". Expected: disabled, optional, launchd-on-approval, external; invalid Proactive mode "manual.". Expected: none, manual, scheduled, heartbeat, event-driven, queue-watcher, hybrid; invalid Skill needs "selected.". Expected: auto, none, selected; invalid Allowed skill sources "local-only.". Expected: local-only, trusted-only, external-with-approval; invalid Skill install mode "link.". Expected: recommend, vendor, link, runtime-install; invalid Skill mutation policy "read-only.". Expected: read-only, patch-with-approval, agent-managed; Telegram mode selected but Secrets required does not mention Telegram token; Telegram mode selected but User authorization model does not define Telegram allowlist/user id
- Source freshness is pending until external verification is completed.
- Scaffold should not start if runtime docs, Telegram behavior or dependency versions are uncertain.

## Next step

Run external verification for the checklist above, update this review or the contract, then proceed to scaffold planning.
