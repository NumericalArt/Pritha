---
id: 2026-06-30-web-design-agent-agent-research
type: review
status: draft
created: 2026-06-30
updated: 2026-06-30
topics:
  - agent-engineering
  - agent-factory
  - architecture-validation
  - web-design-agent
tools:
  - Codex
  - AGENTS.md
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
  - 11_agents/contracts/2026-06-30-web-design-agent-agent-contract.md
  - 07_workflows/agents-mother.md
  - 07_workflows/agents-mother-roadmap.md
  - 04_standards/agent-creation-harness.md
  - 04_standards/agent-environment-compatibility.md
  - 04_standards/agent-tool-integration-selection.md
  - 11_agents/research/2026-06-30-web-design-agent-agent-pattern-pack.md
  - 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack-2.md
  - 11_agents/research/2026-06-23-pictureboom-agent-research-2.md
  - 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack.md
  - 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
  - 07_workflows/2026-06-23-pritha-voice-codex-app-thread-routing-implementation-plan.md
  - 04_standards/pritha-self-model.md
  - 03_reviews/2026-06-23-pritha-voice-codex-app-thread-routing-review.md
  - 03_reviews/2026-06-30-voice-1782819236933-cf36ab8af1c67-voice-session-memory.md
related:
  agent_contracts:
    - 11_agents/contracts/2026-06-30-web-design-agent-agent-contract.md
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
source_published: 2026-06-30
source_updated: 2026-06-30
source_version: research draft v1
retrieved: 2026-06-30
verified: 2026-06-30
valid_for: pre-scaffold architecture validation
temporal_status: unknown
research_gate_status: complete
memory_research_status: complete
external_research_status: complete
external_research_backend: manual
external_research_completed_at: 2026-06-30T11:55:00Z
external_research_freshness_window_days: 30
external_research_topics:
  - memory-rag-storage
  - operations-deployment
  - untrusted-input-security
  - declared-dependencies
  - pattern-inbox-embeddings
synthesis_status: complete
pattern_pack: 11_agents/research/2026-06-30-web-design-agent-agent-pattern-pack.md
pattern_research_status: complete
semantic_memory_status: complete
semantic_failure_log: none
---

# Review: web-design-agent agent architecture research

Date: 2026-06-30
Status: draft

## Question

Is the current agent contract ready to move toward scaffold, and what architecture checks must be completed first?

## Contract summary

- Contract: 11_agents/contracts/2026-06-30-web-design-agent-agent-contract.md
- Agent name: web-design-agent
- Mission: provide a standalone, operator-driven UI/UX and web-design
- Target user: single Pritha operator.
- Runtime family: codex-native
- Primary interface: Codex project/thread.
- Telegram mode: none
- Expected hosting: local Mac.
- Memory model: minimal Markdown candidate memory with status fields.

## Local memory findings

### 1. Agent Pattern Pack: PictureBoom

- Path: 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack-2.md
- Type/status: review/draft
- Heading: Task Basis
- Relevance note: ## Task Basis  - Contract/project: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md - Agent/task: PictureBoom - Query: PictureBoom provide a local Pritha child agent that receives internally codex-native local web. Pritha Control Center agent card; Codex project/thread none file-backed local media inbox, no embeddings or Pritha memory none for v1. local scripts/endpoints for ingest, list, delete and healt

### 2. Review: PictureBoom agent architecture research

- Path: 11_agents/research/2026-06-23-pictureboom-agent-research-2.md
- Type/status: review/draft
- Heading: 1. Agent Pattern Pack: PictureBoom
- Relevance note: ### 1. Agent Pattern Pack: PictureBoom  - Path: 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack.md - Type/status: review/draft - Heading: Task Basis - Relevance note: ## Task Basis  - Contract/project: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md - Agent/task: PictureBoom - Query: PictureBoom provide a local Pritha child agent that receives internally codex-native scaffold plus determinis

### 3. Review: PictureBoom agent architecture research

- Path: 11_agents/research/2026-06-23-pictureboom-agent-research-2.md
- Type/status: review/draft
- Heading: 1. Agent Pattern Pack: PictureBoom
- Relevance note: ### 1. Agent Pattern Pack: PictureBoom  - Path: 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack.md - Type/status: review/draft - Heading: Task Basis - Relevance note: ## Task Basis  - Contract/project: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md - Agent/task: PictureBoom - Query: PictureBoom provide a local Pritha child agent that receives internally codex-native scaffold plus determinis

### 4. Agent Pattern Pack: PictureBoom

- Path: 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack.md
- Type/status: review/draft
- Heading: Task Basis
- Relevance note: ## Task Basis  - Contract/project: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md - Agent/task: PictureBoom - Query: PictureBoom provide a local Pritha child agent that receives internally codex-native scaffold plus deterministic local web app. local web. Pritha Control Center agent card; Codex project/thread none. file-backed local media inbox, no embeddings or Pritha memory none for v1. local scripts/

### 5. Review: PictureBoom agent architecture research

- Path: 11_agents/research/2026-06-23-pictureboom-agent-research-2.md
- Type/status: review/draft
- Heading: 8. Agent Project Contract: PictureBoom
- Relevance note: ### 8. Agent Project Contract: PictureBoom  - Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md - Type/status: agent-contract/accepted - Heading: Runtime and interface - Relevance note: ## Runtime and interface  - Runtime family: codex-native scaffold plus deterministic local web app. - Codex surface profile: app-supervised for development and internal image   generation handoff; no external generati

### 6. Review: PictureBoom agent architecture research

- Path: 11_agents/research/2026-06-23-pictureboom-agent-research-2.md
- Type/status: review/draft
- Heading: 6. Agent Project Contract: PictureBoom
- Relevance note: ### 6. Agent Project Contract: PictureBoom  - Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md - Type/status: agent-contract/accepted - Heading: Runtime and interface - Relevance note: ## Runtime and interface  - Runtime family: codex-native scaffold plus deterministic local web app. - Codex surface profile: app-supervised for development and internal image   generation handoff; no external generati

### 7. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: V1 core functions
- Relevance note: ### V1 core functions  - Provide a local web app for PictureBoom. - Provide an agent-local image inbox under the PictureBoom project. - Store image metadata next to image files inside the PictureBoom project. - Accept internal Codex image-result handoff from Pritha Voice Control through a   local script or endpoint selected during scaffold. - Render a mobile-first vertical image feed without visible image frames. - S

### 8. Agent Pattern Pack: PictureBoom

- Path: 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack-2.md
- Type/status: review/draft
- Heading: pattern-01: Agent Pattern Pack: PictureBoom
- Relevance note: ### pattern-01: Agent Pattern Pack: PictureBoom - Status: selected - Source kind: fts - Memory domain: general - Pattern kind: memory-match - Confidence: medium - Path: 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack.md - Heading: Task Basis - Applicability: Use as candidate reusable context after checking fit with the current task. - Rationale: Selected because it matched the agent-development task thro

### 9. Agent Pattern Pack: PictureBoom

- Path: 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack-2.md
- Type/status: review/draft
- Heading: pattern-08: Agent Project Contract: PictureBoom
- Relevance note: ### pattern-08: Agent Project Contract: PictureBoom - Status: selected - Source kind: fts - Memory domain: general - Pattern kind: memory-match - Confidence: medium - Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md - Heading: Runtime and interface - Applicability: Use as candidate reusable context after checking fit with the current task. - Rationale: Selected because it matched the agent-developme

### 10. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Pritha lineage metadata
- Relevance note: ## Pritha lineage metadata  - Seed name: PictureBoom - Parent agent: Pritha - Lineage: Pritha child-agent scaffold for a local image inbox and mobile feed. - Traits: local-first, Codex-assisted image handoff, Control Center card,   Tailscale-ready, project-local media storage, delete-only user action. - Inheritance: Pritha child-agent safety rules, no secret copying, no private   memory copying, no unapproved service

### 11. Review: PictureBoom agent architecture research

- Path: 11_agents/research/2026-06-23-pictureboom-agent-research-2.md
- Type/status: review/draft
- Heading: 7. Agent Project Contract: PictureBoom
- Relevance note: ### 7. Agent Project Contract: PictureBoom  - Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md - Type/status: agent-contract/accepted - Heading: Pritha lineage metadata - Relevance note: ## Pritha lineage metadata  - Seed name: PictureBoom - Parent agent: Pritha - Lineage: Pritha child-agent scaffold for a local image inbox and mobile feed. - Traits: local-first, Codex-assisted image handoff, Contro

### 12. Review: PictureBoom agent architecture research

- Path: 11_agents/research/2026-06-23-pictureboom-agent-research-2.md
- Type/status: review/draft
- Heading: 6. Agent Project Contract: PictureBoom
- Relevance note: ### 6. Agent Project Contract: PictureBoom  - Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md - Type/status: agent-contract/accepted - Heading: Pritha lineage metadata - Relevance note: ## Pritha lineage metadata  - Seed name: PictureBoom - Parent agent: Pritha - Lineage: Pritha child-agent scaffold for a local image inbox and mobile feed. - Traits: local-first, Codex-assisted image handoff, Contro


## Domain-aware memory findings

### Agent-building knowledge

Use these as standards, workflows and reusable patterns for the new contract.

### 1. Agent Pattern Pack: PictureBoom

- Path: 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack-2.md
- Type/status: review/draft
- Heading: Task Basis
- Relevance note: ## Task Basis  - Contract/project: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md - Agent/task: PictureBoom - Query: PictureBoom provide a local Pritha child agent that receives internally codex-native local web. Pritha Control Center agent card; Codex project/thread none file-backed local media inbox, no embeddings or Pritha memory none for v1. local scripts/endpoints for ingest, list, delete and healt

### 2. Agent Pattern Pack: PictureBoom

- Path: 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack.md
- Type/status: review/draft
- Heading: Task Basis
- Relevance note: ## Task Basis  - Contract/project: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md - Agent/task: PictureBoom - Query: PictureBoom provide a local Pritha child agent that receives internally codex-native scaffold plus deterministic local web app. local web. Pritha Control Center agent card; Codex project/thread none. file-backed local media inbox, no embeddings or Pritha memory none for v1. local scripts/

### 3. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: V1 core functions
- Relevance note: ### V1 core functions  - Provide a local web app for PictureBoom. - Provide an agent-local image inbox under the PictureBoom project. - Store image metadata next to image files inside the PictureBoom project. - Accept internal Codex image-result handoff from Pritha Voice Control through a   local script or endpoint selected during scaffold. - Render a mobile-first vertical image feed without visible image frames. - S

### 4. Agent Pattern Pack: PictureBoom

- Path: 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack-2.md
- Type/status: review/draft
- Heading: pattern-01: Agent Pattern Pack: PictureBoom
- Relevance note: ### pattern-01: Agent Pattern Pack: PictureBoom - Status: selected - Source kind: fts - Memory domain: general - Pattern kind: memory-match - Confidence: medium - Path: 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack.md - Heading: Task Basis - Applicability: Use as candidate reusable context after checking fit with the current task. - Rationale: Selected because it matched the agent-development task thro

### 5. Agent Pattern Pack: PictureBoom

- Path: 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack-2.md
- Type/status: review/draft
- Heading: pattern-08: Agent Project Contract: PictureBoom
- Relevance note: ### pattern-08: Agent Project Contract: PictureBoom - Status: selected - Source kind: fts - Memory domain: general - Pattern kind: memory-match - Confidence: medium - Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md - Heading: Runtime and interface - Applicability: Use as candidate reusable context after checking fit with the current task. - Rationale: Selected because it matched the agent-developme

### 6. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Pritha lineage metadata
- Relevance note: ## Pritha lineage metadata  - Seed name: PictureBoom - Parent agent: Pritha - Lineage: Pritha child-agent scaffold for a local image inbox and mobile feed. - Traits: local-first, Codex-assisted image handoff, Control Center card,   Tailscale-ready, project-local media storage, delete-only user action. - Inheritance: Pritha child-agent safety rules, no secret copying, no private   memory copying, no unapproved service


### Pritha self

Use these to understand current Pritha capabilities and constraints.

### 1. Coding Implementation Plan: Pritha Voice Codex App Thread Routing

- Path: 07_workflows/2026-06-23-pritha-voice-codex-app-thread-routing-implementation-plan.md
- Type/status: workflow/active
- Heading: Target Behavior
- Relevance note: ## Target Behavior  Default routing mode:  ```ts type CodexAppThreadRoutingMode =   | "per_task"   | "control"   | "subject_scoped"   | "subject_scoped_rotate"; ```  Phase 1 default:  ```ts codexAppThreadRoutingMode: "subject_scoped" ```  Supported behavior:  - `per_task`: one App thread per Pritha Codex task id. Planner, execution and   step runs for the same task must reuse that one task thread. - `control`: one pr

### 2. Coding Implementation Plan: Pritha Voice Codex App Thread Routing

- Path: 07_workflows/2026-06-23-pritha-voice-codex-app-thread-routing-implementation-plan.md
- Type/status: workflow/active
- Heading: Acceptance Criteria
- Relevance note: ## Acceptance Criteria  - Default behavior no longer creates one Codex App UI thread per voice task when   the subject is the same stable agent or subsystem. - Work on FAS reuses an `agent:fas` thread. - Work on Pritha Control Center uses a separate `pritha:control-center` thread. - Planner, execution and step runs for one task share the same thread route. - `per_task` is still available and creates at most one threa

### 3. Standard: pritha-self-model

- Path: 04_standards/pritha-self-model.md
- Type/status: standard/draft
- Heading: Current Self Model
- Relevance note: ## Current Self Model  Pritha is the public project identity and Codex-native agent factory. It turns user intent, local memory and reviewed architecture patterns into minimal, testable child-agent scaffolds. Historical `Techscope` names remain in selected compatibility paths, environment variables and memory artifacts, but new operator-facing language should prefer Pritha.  Current Pritha has three durable surfaces:

### 4. Coding Implementation Plan: Pritha Voice Codex App Thread Routing

- Path: 07_workflows/2026-06-23-pritha-voice-codex-app-thread-routing-implementation-plan.md
- Type/status: workflow/active
- Heading: Phase 8: Tests
- Relevance note: ## Phase 8: Tests  Add `tests/control-center-codex-thread-routing.test.mjs`.  Because current control-center tests mostly inspect TS source from Node, phase 1 tests can follow that pattern, with targeted source checks:  - `PrithaCodexThreadScope` exists in `types.ts`; - `CodexAppThreadRoutingMode` exists in `pritha-runtime.ts`; - runtime settings include `codexAppThreadRoutingMode`; - settings route accepts and valid

### 5. Review: Pritha Voice Codex App Thread Routing

- Path: 03_reviews/2026-06-23-pritha-voice-codex-app-thread-routing-review.md
- Type/status: review/draft
- Heading: Recommended Design
- Relevance note: ## Recommended Design  Implement `codexAppThreadRoutingMode`, defaulting to `subject_scoped`.  Suggested modes:  - `per_task`: current behavior, one App thread per request id. - `control`: existing global control-thread reuse, env/debug only. - `subject_scoped`: one active App thread per stable subject. - `subject_scoped_rotate`: subject-scoped with automatic generation rotation.  Add a `threadScope` object to Codex

### 6. Voice Session Memory: voice-1782819236933-cf36ab8af1c67

- Path: 03_reviews/2026-06-30-voice-1782819236933-cf36ab8af1c67-voice-session-memory.md
- Type/status: review/draft
- Heading: Durable Signals
- Relevance note: ## Durable Signals  - 13:41:52 user: Мы уже начали создавать этого агента, этот есть прям кодекс таск RDT, агент вроде как назывался Web Design Agent, значит тебе, наверное, нужно продолжать создание через этот кодекс таск, вот он у меня висит здесь, я его вижу. - 13:41:54 assistant: Поняла, давай аккуратно разберёмся, что сейчас с этой задачей и как её правильно продолжить. - 13:41:54 tool: Tool call: inspect_codex_


### Child-agent lifecycle evidence

Use these only as evidence of successful or failed patterns. Do not clone a
past child agent by default.

### 1. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: V1 core functions
- Relevance note: ### V1 core functions  - Provide a local web app for PictureBoom. - Provide an agent-local image inbox under the PictureBoom project. - Store image metadata next to image files inside the PictureBoom project. - Accept internal Codex image-result handoff from Pritha Voice Control through a   local script or endpoint selected during scaffold. - Render a mobile-first vertical image feed without visible image frames. - S

### 2. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Pritha lineage metadata
- Relevance note: ## Pritha lineage metadata  - Seed name: PictureBoom - Parent agent: Pritha - Lineage: Pritha child-agent scaffold for a local image inbox and mobile feed. - Traits: local-first, Codex-assisted image handoff, Control Center card,   Tailscale-ready, project-local media storage, delete-only user action. - Inheritance: Pritha child-agent safety rules, no secret copying, no private   memory copying, no unapproved service

### 3. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Runtime and interface
- Relevance note: ## Runtime and interface  - Runtime family: codex-native - Runtime notes: codex-native scaffold plus deterministic local web app. - Codex surface profile: app-supervised for development and internal image   generation handoff; no external generation provider in the app. - Primary interface: local web. - Secondary interfaces: Pritha Control Center agent card; Codex project/thread   for development; Pritha Voice Contro

### 4. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Tools and integrations
- Relevance note: ## Tools and integrations  | Capability | Default boundary | Notes | | --- | --- | --- | | Contract and scaffold | CLI/script | Use Pritha scripts where available. | | Image handoff | local script/endpoint | Writes only under PictureBoom project. | | Feed list/delete | local web app | Deletes project-local image and metadata. | | Control Center card | operations manifest/registry | No hardcoded private Tailscale URL.

### 5. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Purpose
- Relevance note: ## Purpose  - Agent name: PictureBoom - Primary mission: provide a local Pritha child agent that receives internally   generated Codex image results from Pritha Voice Control and presents them as   a mobile-first image feed. - Target user: Pritha voice operator testing an image-generation inbox and   review surface from a phone or local browser. - Success criteria:   - contract is accepted before scaffold;   - projec

### 6. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Runtime isolation and boundary
- Relevance note: ## Runtime isolation and boundary  - Runtime isolation profile: project-folder. - Sandbox required: optional later. - Sandbox candidate: none for v1. - Host control plane: Pritha Control Center and operator terminal/Codex. - Agent execution boundary: `/Users/jkl/PictureBoom` local web process and   agent-local data folders. - Credential boundary: host-only; credentials are configured through UI or   local placeholder


## Pattern Pack

- Path: 11_agents/research/2026-06-30-web-design-agent-agent-pattern-pack.md
- Status: complete
- Selected patterns: 24
- Semantic/embedding search: complete
- Semantic failure log: none
- External research seeds: inbox embeddings, embeddings none, handoff voice, voice control, card tailscale-ready, tailscale-ready project-local, 2026-06-23-pritha-voice-codex-app-thread-routing-implementation-plan.md coding, plan voice, voice app, per voice, voice when, voice, 2026-06-23-pritha-voice-codex-app-thread-routing-implementation-plan.md, reviews 2026-06-23-pritha-voice-codex-app-thread-routing-review.md, 2026-06-23-pritha-voice-codex-app-thread-routing-review.md review, review voice

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
| Research gate | pending | Complete only after memory, external evidence and synthesis are complete or explicitly not applicable. |
| Memory research | complete | Local Pritha memory search completed for this report. |
| External research | pending | Fresh external evidence still needs to be gathered. |
| Synthesis | pending | Memory vs external comparison is pending. |

## External Research Topics

### 1. Memory, RAG and storage dependency choices

- ID: `memory-rag-storage`
- Query: current RAG memory embeddings vector database storage dependency documentation agent
- Reason: Semantic memory, embeddings, vector store, graph store or RAG mentioned.
- Required: yes
- Preferred sources: official-docs, changelog, github, trusted-secondary
- Freshness window: 30 days

### 2. Operations, deployment and proactive execution constraints

- ID: `operations-deployment`
- Query: current macOS launchd cron service deployment agent safety background scheduler best practices
- Reason: Service, autostart, deployment or proactive execution selected.
- Required: yes
- Preferred sources: official-docs, security-docs, trusted-secondary
- Freshness window: 30 days

### 3. Untrusted input security and quarantine

- ID: `untrusted-input-security`
- Query: current agent untrusted input prompt injection quarantine scanner validation security best practices
- Reason: External or untrusted input appears in the contract.
- Required: yes
- Preferred sources: security-docs, trusted-secondary, official-docs
- Freshness window: 30 days

### 4. Declared dependency versions and install safety

- ID: `declared-dependencies`
- Query: current versions changelog security install documentation minimal Node.js or shell-only checks, selected during scaffold.
- Reason: Contract declares dependencies that should be checked before scaffold.
- Required: yes
- Preferred sources: official-docs, github, changelog
- Freshness window: 30 days

### 5. Current-source check for memory pattern: inbox embeddings

- ID: `pattern-inbox-embeddings`
- Query: current official documentation changelog security discussion inbox embeddings agent harness
- Reason: Selected Pritha memory pattern produced this external research seed.
- Required: yes
- Preferred sources: official-docs, github, changelog, trusted-secondary
- Freshness window: 30 days


## External Research Evidence

### 1. OWASP LLM08:2025 Vector and Embedding Weaknesses

- Topic ID: memory-rag-storage
- Backend: manual
- Source URL: https://genai.owasp.org/llmrisk/llm08-excessive-agency/
- Source type: security-docs
- Source published: 2025
- Source updated: unknown
- Retrieved: 2026-06-30
- Confidence: high
- Claim: The v1 contract should keep memory as local Markdown and avoid adding embeddings/vector storage because no retrieval workload requires it yet; if RAG is added later, it needs a separate security and source-freshness review.
- Evidence summary: OWASP treats vector and embedding systems as a distinct LLM application risk area because RAG pipelines can be vulnerable to harmful-content injection, retrieval manipulation, and sensitive-data exposure. This supports the contract decision to defer SQLite/embeddings/vector DB for v1 and use simple project-local candidate Markdown.
- Risk note: Do not promote candidate design material directly into vector memory; add a future contract update before embeddings or RAG.

### 2. Apple Support: Script management with launchd in Terminal on Mac

- Topic ID: operations-deployment
- Backend: manual
- Source URL: https://support.apple.com/guide/terminal/script-management-with-launchd-apdc6c1077b-5d5d-4d35-9c19-60f2397b2369/mac
- Source type: official-docs
- Source published: unknown
- Source updated: unknown
- Retrieved: 2026-06-30
- Confidence: high
- Claim: The scaffold should not install launchd jobs or enable background execution in v1; any future macOS service/autostart work must be a separate operations decision with explicit approval.
- Evidence summary: Apple documents launchd/launchctl as the macOS mechanism for loading and unloading daemons and agents. Because this agent is manual-only and has no service requirement, the safest v1 choice is no launchd, no cron, no heartbeat and no background watcher.
- Risk note: Service installation changes host behavior and must stay behind a later operator approval gate.

### 3. OWASP LLM01:2025 Prompt Injection

- Topic ID: untrusted-input-security
- Backend: manual
- Source URL: https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- Source type: security-docs
- Source published: 2025
- Source updated: unknown
- Retrieved: 2026-06-30
- Confidence: high
- Claim: Operator-provided links, pasted design text and screenshot descriptions must be treated as untrusted content that cannot directly alter tools, memory policy, permissions or project files.
- Evidence summary: OWASP identifies prompt injection as manipulation of model behavior through crafted inputs. This confirms the contract rule that design materials can be summarized and converted into candidates, but cannot directly trigger memory writes or tool actions.
- Risk note: Keep raw source instructions out of system/developer instruction paths and require confirmation for memory commits.

### 4. NCSC: Prompt injection is not SQL injection

- Topic ID: untrusted-input-security
- Backend: manual
- Source URL: https://www.ncsc.gov.uk/blog-post/prompt-injection-is-not-sql-injection
- Source type: security-docs
- Source published: 2025-12
- Source updated: unknown
- Retrieved: 2026-06-30
- Confidence: high
- Claim: Prompt injection needs impact reduction and approval boundaries, not just input filtering.
- Evidence summary: The NCSC frames prompt injection as an inherently confusable-deputy problem. This supports project-folder isolation, no autonomous tools, bounded source summaries and explicit operator gates before writes or external actions.
- Risk note: Even manual intake should avoid treating external design examples as trusted instructions.

### 5. Node.js Learn: Security Best Practices

- Topic ID: declared-dependencies
- Backend: manual
- Source URL: https://nodejs.org/learn/getting-started/security-best-practices
- Source type: official-docs
- Source published: unknown
- Source updated: unknown
- Retrieved: 2026-06-30
- Confidence: high
- Claim: If the scaffold uses Node.js scripts, keep dependencies minimal, pinned and checked; no package install should be added unless needed by the scaffold.
- Evidence summary: Node.js security guidance recommends pinning dependency versions, checking for vulnerabilities and validating packages before installation. This supports a shell-or-minimal-Node smoke test and no production dependencies unless scaffold requirements force them.
- Risk note: Adding dependencies expands supply-chain risk; keep v1 dependency-free where practical.

### 6. GitHub Changelog: Upcoming breaking changes for npm v12

- Topic ID: declared-dependencies
- Backend: manual
- Source URL: https://github.blog/changelog/2026-06-09-upcoming-breaking-changes-for-npm-v12/
- Source type: changelog
- Source published: 2026-06-09
- Source updated: 2026-06-09
- Retrieved: 2026-06-30
- Confidence: high
- Claim: Install-time script behavior is changing in npm v12, so future Node-based scaffold dependencies should avoid implicit install scripts and document any approvals.
- Evidence summary: GitHub announced npm v12 security-related defaults that make install scripts and other risky install behaviors require explicit approval. For this v1, that reinforces no dependencies or explicitly reviewed dependencies only.
- Risk note: Future scaffold should not assume package install scripts run silently or safely.

### 7. OpenAI Developers: Custom instructions with AGENTS.md

- Topic ID: pattern-inbox-embeddings
- Backend: manual
- Source URL: https://developers.openai.com/codex/guides/agents-md
- Source type: official-docs
- Source published: unknown
- Source updated: unknown
- Retrieved: 2026-06-30
- Confidence: high
- Claim: The selected child-agent pattern should be adapted as project-local instructions and Markdown workflows, not copied as an embeddings inbox for v1.
- Evidence summary: OpenAI Codex documentation supports AGENTS.md as the persistent project guidance mechanism. For web-design-agent v1, this is enough for operating rules; an embeddings inbox is not necessary until a real retrieval workflow exists.
- Risk note: Do not add embedding storage merely because a prior child-agent pattern mentioned inbox/embeddings.

## Memory vs External Comparison

- Backend used: manual.
- Required topics covered: 5/5.
- Every required external research topic has at least one evidence item.
- Treat community/social evidence as signal only; primary docs and source dates remain authoritative for runtime/API choices.

## Scaffold Gate Decision

- Status: complete
- Decision: scaffold may proceed if all other contract checks pass.
- Required next action: review the evidence summaries during implementation and keep volatile choices version-bound.

## External verification checklist

- [x] Verify current Codex/AGENTS.md behavior and any target runtime docs before scaffold.
- [x] Verify package/dependency versions before installing anything.
- [x] Verify security and auth requirements for any external service selected by the contract.

## Skill candidates

Policy: needs=`none`; sources=`local-only`; install=`recommend`; mutation=`read-only`.

| Skill | Source | Fit | Trust | Risk | Recommendation |
| --- | --- | ---: | --- | --- | --- |
| none | n/a | 0 | n/a | n/a | none |

## Skill decisions required

- [ ] Keep recommended skills candidate-only unless the contract selects `Skill install mode: vendor`.
- [ ] Do not install external skills until explicit approval and audit workflow exists.
- [ ] Keep generated wiki pages as references only, never as direct skill provenance.

## Architecture recommendation

- Runtime family: keep `codex-native` unless research finds a hard blocker.
- Telegram: keep out of scaffold v1 unless the user explicitly selects it later.
- Memory: start from `minimal Markdown candidate memory with status fields.`; add SQLite/embeddings only if v1 workflows need retrieval.
- Scaffold should remain minimal, testable and free of copied Pritha secrets.

## Risks and open questions

- Contract validation issues: none blocking from structural validator
- Source freshness is pending until external verification is completed.
- Scaffold should not start if runtime docs, Telegram behavior or dependency versions are uncertain.

## Next step

Run external verification for the checklist above, update this review or the contract, then proceed to scaffold planning.
