---
id: 2026-06-23-pictureboom-agent-research-2
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
  - 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
  - 07_workflows/agents-mother.md
  - 07_workflows/agents-mother-roadmap.md
  - 04_standards/agent-creation-harness.md
  - 04_standards/agent-environment-compatibility.md
  - 04_standards/agent-tool-integration-selection.md
  - 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack-2.md
  - 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack.md
  - 11_agents/research/2026-06-23-pictureboom-agent-research.md
  - 11_agents/reports/2026-06-23-fas-tailscale-control-center-routing-report.md
  - 11_agents/profiles/fas.md
  - 07_workflows/2026-06-21-pritha-github-install-reproducibility-roadmap.md
  - 07_workflows/2026-06-22-pritha-child-agent-external-research-gate-implementation-plan.md
  - 04_standards/pritha-self-model.md
  - 07_workflows/2026-06-23-pritha-voice-codex-app-thread-routing-implementation-plan.md
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
pattern_pack: 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack-2.md
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
- Runtime family: codex-native
- Primary interface: local web.
- Telegram mode: none
- Expected hosting: local Mac.
- Memory model: file-backed local media inbox, no embeddings or Pritha memory

## Local memory findings

### 1. Agent Pattern Pack: PictureBoom

- Path: 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack.md
- Type/status: review/draft
- Heading: Task Basis
- Relevance note: ## Task Basis  - Contract/project: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md - Agent/task: PictureBoom - Query: PictureBoom provide a local Pritha child agent that receives internally codex-native scaffold plus deterministic local web app. local web. Pritha Control Center agent card; Codex project/thread none. file-backed local media inbox, no embeddings or Pritha memory none for v1. local scripts/

### 2. Review: PictureBoom agent architecture research

- Path: 11_agents/research/2026-06-23-pictureboom-agent-research.md
- Type/status: review/draft
- Heading: Contract summary
- Relevance note: ## Contract summary  - Contract: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md - Agent name: PictureBoom - Mission: provide a local Pritha child agent that receives internally - Target user: Pritha voice operator testing an image-generation inbox and - Runtime family: codex-native scaffold plus deterministic local web app. - Primary interface: local web. - Telegram mode: none. - Expected hosting: local

### 3. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: V1 core functions
- Relevance note: ### V1 core functions  - Provide a local web app for PictureBoom. - Provide an agent-local image inbox under the PictureBoom project. - Store image metadata next to image files inside the PictureBoom project. - Accept internal Codex image-result handoff from Pritha Voice Control through a   local script or endpoint selected during scaffold. - Render a mobile-first vertical image feed without visible image frames. - S

### 4. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Purpose
- Relevance note: ## Purpose  - Agent name: PictureBoom - Primary mission: provide a local Pritha child agent that receives internally   generated Codex image results from Pritha Voice Control and presents them as   a mobile-first image feed. - Target user: Pritha voice operator testing an image-generation inbox and   review surface from a phone or local browser. - Success criteria:   - contract is accepted before scaffold;   - projec

### 5. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Critical user workflows
- Relevance note: ### Critical user workflows  - Operator asks in Pritha Voice Control for an image generation addressed to   PictureBoom. - Codex creates or receives the image result and writes it to the PictureBoom   inbox with metadata. - Operator opens PictureBoom from Pritha Control Center. - Operator scrolls the mobile feed and sees image title and creation time. - Operator deletes an image; the UI and PictureBoom-local storage

### 6. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Runtime isolation and boundary
- Relevance note: ## Runtime isolation and boundary  - Runtime isolation profile: project-folder. - Sandbox required: optional later. - Sandbox candidate: none for v1. - Host control plane: Pritha Control Center and operator terminal/Codex. - Agent execution boundary: `/Users/jkl/PictureBoom` local web process and   agent-local data folders. - Credential boundary: host-only; credentials are configured through UI or   local placeholder

### 7. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Pritha lineage metadata
- Relevance note: ## Pritha lineage metadata  - Seed name: PictureBoom - Parent agent: Pritha - Lineage: Pritha child-agent scaffold for a local image inbox and mobile feed. - Traits: local-first, Codex-assisted image handoff, Control Center card,   Tailscale-ready, project-local media storage, delete-only user action. - Inheritance: Pritha child-agent safety rules, no secret copying, no private   memory copying, no unapproved service

### 8. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Runtime and interface
- Relevance note: ## Runtime and interface  - Runtime family: codex-native scaffold plus deterministic local web app. - Codex surface profile: app-supervised for development and internal image   generation handoff; no external generation provider in the app. - Primary interface: local web. - Secondary interfaces: Pritha Control Center agent card; Codex project/thread   for development; Pritha Voice Control as upstream task intake. - I

### 9. FAS Tailscale And Control Center Routing Report

- Path: 11_agents/reports/2026-06-23-fas-tailscale-control-center-routing-report.md
- Type/status: agent-operations-report/complete
- Heading: Summary
- Relevance note: ## Summary  - Project path: `/Users/jkl/Pritha`, sibling runtime `/Users/jkl/FAS`. - Classification: Control Center child-agent routing and private-device access. - Deployment target: local Mac with optional trusted Tailscale access. - Service mode: manual Control Center managed local web service. - Autostart: unchanged, disabled for FAS. - Proactive mode: unchanged, none/manual. - Result: Control Center no longer in

### 10. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Tools and integrations
- Relevance note: ## Tools and integrations  | Capability | Default boundary | Notes | | --- | --- | --- | | Contract and scaffold | CLI/script | Use Pritha scripts where available. | | Image handoff | local script/endpoint | Writes only under PictureBoom project. | | Feed list/delete | local web app | Deletes project-local image and metadata. | | Control Center card | operations manifest/registry | No hardcoded private Tailscale URL.

### 11. Child Agent Profile: FAS

- Path: 11_agents/profiles/fas.md
- Type/status: child-agent-profile/active
- Heading: Child Agent Profile: FAS
- Relevance note: # Child Agent Profile: FAS  - Name: FAS - Folder: `/Users/jkl/FAS` - Mission: local one-page theater scene demo with Three.js avatar and Realtime   voice command dispatch. - Runtime: local browser app plus Node API for Realtime ephemeral sessions. - Interface: realtime-voice-ui with manual command fallback. - Deployment: manual Control Center managed local web service; developer Vite   mode remains separate. - Proact

### 12. Review: PictureBoom agent architecture research

- Path: 11_agents/research/2026-06-23-pictureboom-agent-research.md
- Type/status: review/draft
- Heading: 1. Pritha Registry
- Relevance note: ### 1. Pritha Registry  - Path: 11_agents/registry.md - Type/status: agent-registry/active - Heading: Agents - Relevance note: ## Agents  | Agent | Mission | Runtime | Interface | Deployment | Proactivity | Evidence | | --- | --- | --- | --- | --- | --- | --- | | FAS | provide a local one-page theater-scene demo agent where a | codex-native scaffold plus deterministic browser app. | local web. / Telegram none. | loca


## Domain-aware memory findings

### Agent-building knowledge

Use these as standards, workflows and reusable patterns for the new contract.

### 1. Agent Pattern Pack: PictureBoom

- Path: 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack.md
- Type/status: review/draft
- Heading: Task Basis
- Relevance note: ## Task Basis  - Contract/project: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md - Agent/task: PictureBoom - Query: PictureBoom provide a local Pritha child agent that receives internally codex-native scaffold plus deterministic local web app. local web. Pritha Control Center agent card; Codex project/thread none. file-backed local media inbox, no embeddings or Pritha memory none for v1. local scripts/

### 2. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: V1 core functions
- Relevance note: ### V1 core functions  - Provide a local web app for PictureBoom. - Provide an agent-local image inbox under the PictureBoom project. - Store image metadata next to image files inside the PictureBoom project. - Accept internal Codex image-result handoff from Pritha Voice Control through a   local script or endpoint selected during scaffold. - Render a mobile-first vertical image feed without visible image frames. - S

### 3. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Purpose
- Relevance note: ## Purpose  - Agent name: PictureBoom - Primary mission: provide a local Pritha child agent that receives internally   generated Codex image results from Pritha Voice Control and presents them as   a mobile-first image feed. - Target user: Pritha voice operator testing an image-generation inbox and   review surface from a phone or local browser. - Success criteria:   - contract is accepted before scaffold;   - projec

### 4. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Critical user workflows
- Relevance note: ### Critical user workflows  - Operator asks in Pritha Voice Control for an image generation addressed to   PictureBoom. - Codex creates or receives the image result and writes it to the PictureBoom   inbox with metadata. - Operator opens PictureBoom from Pritha Control Center. - Operator scrolls the mobile feed and sees image title and creation time. - Operator deletes an image; the UI and PictureBoom-local storage

### 5. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Runtime isolation and boundary
- Relevance note: ## Runtime isolation and boundary  - Runtime isolation profile: project-folder. - Sandbox required: optional later. - Sandbox candidate: none for v1. - Host control plane: Pritha Control Center and operator terminal/Codex. - Agent execution boundary: `/Users/jkl/PictureBoom` local web process and   agent-local data folders. - Credential boundary: host-only; credentials are configured through UI or   local placeholder

### 6. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Pritha lineage metadata
- Relevance note: ## Pritha lineage metadata  - Seed name: PictureBoom - Parent agent: Pritha - Lineage: Pritha child-agent scaffold for a local image inbox and mobile feed. - Traits: local-first, Codex-assisted image handoff, Control Center card,   Tailscale-ready, project-local media storage, delete-only user action. - Inheritance: Pritha child-agent safety rules, no secret copying, no private   memory copying, no unapproved service


### Pritha self

Use these to understand current Pritha capabilities and constraints.

### 1. FAS Tailscale And Control Center Routing Report

- Path: 11_agents/reports/2026-06-23-fas-tailscale-control-center-routing-report.md
- Type/status: agent-operations-report/complete
- Heading: Summary
- Relevance note: ## Summary  - Project path: `/Users/jkl/Pritha`, sibling runtime `/Users/jkl/FAS`. - Classification: Control Center child-agent routing and private-device access. - Deployment target: local Mac with optional trusted Tailscale access. - Service mode: manual Control Center managed local web service. - Autostart: unchanged, disabled for FAS. - Proactive mode: unchanged, none/manual. - Result: Control Center no longer in

### 2. FAS Tailscale And Control Center Routing Report

- Path: 11_agents/reports/2026-06-23-fas-tailscale-control-center-routing-report.md
- Type/status: agent-operations-report/complete
- Heading: Changes
- Relevance note: ## Changes  - Updated `interfaces/control-center/src/lib/access-mode.ts` so Tailscale mode returns a child agent URL only when the agent has a provided Tailscale URL. It no longer rewrites `127.0.0.1:<agent-port>` to `<tailscale-host>:<agent-port>`. - Updated `interfaces/control-center/src/lib/control-center/server.ts` to read `tailscale serve status --json` and derive child-agent Tailscale URLs only when actual Serv

### 3. Roadmap / Technical Specification: Pritha GitHub Install Reproducibility

- Path: 07_workflows/2026-06-21-pritha-github-install-reproducibility-roadmap.md
- Type/status: workflow/active
- Heading: Executive Position
- Relevance note: ## Executive Position  The 2026-06-21 audit does not call for a rewrite. The current implementation is architecturally sound and has performed well in manual testing across devices. This roadmap treats the existing design as the baseline and adds a safer, repeatable product-install layer around it.  The target outcome is simple:  ```sh git clone https://github.com/NumericalArt/Pritha.git pritha cd pritha node scripts

### 4. Coding Implementation Plan: Child-Agent External Research Gate

- Path: 07_workflows/2026-06-22-pritha-child-agent-external-research-gate-implementation-plan.md
- Type/status: workflow/draft
- Heading: Phase 7: Wire Voice Control Agent-Creation Instructions
- Relevance note: ### Phase 7: Wire Voice Control Agent-Creation Instructions  Goal: make voice-originated child-agent creation use the same gate.  Files:  - `interfaces/control-center/src/lib/realtime/pritha-runtime.ts` - `tests/control-center-codex-planning.test.mjs` - `tests/control-center-codex-safety.test.mjs` - `tests/pritha-voice-control.test.mjs`  Code changes:  1. Update realtime instructions:    - when creating a child agent

### 5. Standard: pritha-self-model

- Path: 04_standards/pritha-self-model.md
- Type/status: standard/draft
- Heading: Current Self Model
- Relevance note: ## Current Self Model  Pritha is the public project identity and Codex-native agent factory. It turns user intent, local memory and reviewed architecture patterns into minimal, testable child-agent scaffolds. Historical `Techscope` names remain in selected compatibility paths, environment variables and memory artifacts, but new operator-facing language should prefer Pritha.  Current Pritha has three durable surfaces:

### 6. Coding Implementation Plan: Pritha Voice Codex App Thread Routing

- Path: 07_workflows/2026-06-23-pritha-voice-codex-app-thread-routing-implementation-plan.md
- Type/status: workflow/active
- Heading: Phase 3: Explicit And Derived Scope
- Relevance note: ## Phase 3: Explicit And Derived Scope  Extend `run_codex_task` tool schema in `realtimeTools()`.  Add optional fields:  ```json {   "subject_kind": "agent|pritha|task|control",   "subject_id": "string",   "subject_label": "string",   "thread_reset": false } ```  Voice instruction update:  - When operator names a child agent, pass `subject_kind=agent` and   `subject_id=<agent-name-or-slug>`. - When task is about Cont


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
- Heading: Purpose
- Relevance note: ## Purpose  - Agent name: PictureBoom - Primary mission: provide a local Pritha child agent that receives internally   generated Codex image results from Pritha Voice Control and presents them as   a mobile-first image feed. - Target user: Pritha voice operator testing an image-generation inbox and   review surface from a phone or local browser. - Success criteria:   - contract is accepted before scaffold;   - projec

### 3. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Critical user workflows
- Relevance note: ### Critical user workflows  - Operator asks in Pritha Voice Control for an image generation addressed to   PictureBoom. - Codex creates or receives the image result and writes it to the PictureBoom   inbox with metadata. - Operator opens PictureBoom from Pritha Control Center. - Operator scrolls the mobile feed and sees image title and creation time. - Operator deletes an image; the UI and PictureBoom-local storage

### 4. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Runtime isolation and boundary
- Relevance note: ## Runtime isolation and boundary  - Runtime isolation profile: project-folder. - Sandbox required: optional later. - Sandbox candidate: none for v1. - Host control plane: Pritha Control Center and operator terminal/Codex. - Agent execution boundary: `/Users/jkl/PictureBoom` local web process and   agent-local data folders. - Credential boundary: host-only; credentials are configured through UI or   local placeholder

### 5. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Pritha lineage metadata
- Relevance note: ## Pritha lineage metadata  - Seed name: PictureBoom - Parent agent: Pritha - Lineage: Pritha child-agent scaffold for a local image inbox and mobile feed. - Traits: local-first, Codex-assisted image handoff, Control Center card,   Tailscale-ready, project-local media storage, delete-only user action. - Inheritance: Pritha child-agent safety rules, no secret copying, no private   memory copying, no unapproved service

### 6. Agent Project Contract: PictureBoom

- Path: 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
- Type/status: agent-contract/accepted
- Heading: Runtime and interface
- Relevance note: ## Runtime and interface  - Runtime family: codex-native scaffold plus deterministic local web app. - Codex surface profile: app-supervised for development and internal image   generation handoff; no external generation provider in the app. - Primary interface: local web. - Secondary interfaces: Pritha Control Center agent card; Codex project/thread   for development; Pritha Voice Control as upstream task intake. - I


## Pattern Pack

- Path: 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack-2.md
- Status: complete
- Selected patterns: 18
- Semantic/embedding search: complete
- Semantic failure log: none
- External research seeds: inbox embeddings, embeddings none, target voice, voice operator, web. telegram, telegram mode, handoff voice, voice control, results voice, local browser., browser. success, asks voice, project-folder. sandbox, sandbox required, later. sandbox, sandbox candidate

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

### 1. OpenAI Realtime API and voice model behavior

- ID: `openai-realtime`
- Query: OpenAI Realtime API current documentation client secrets calls WebRTC transcription model voice behavior
- Reason: Realtime voice, audio, speech or transcription selected.
- Required: yes
- Preferred sources: official-docs, changelog
- Freshness window: 30 days

### 2. Memory, RAG and storage dependency choices

- ID: `memory-rag-storage`
- Query: current RAG memory embeddings vector database storage dependency documentation agent
- Reason: Semantic memory, embeddings, vector store, graph store or RAG mentioned.
- Required: yes
- Preferred sources: official-docs, changelog, github, trusted-secondary
- Freshness window: 30 days

### 3. Operations, deployment and proactive execution constraints

- ID: `operations-deployment`
- Query: current macOS launchd cron service deployment agent safety background scheduler best practices
- Reason: Service, autostart, deployment or proactive execution selected.
- Required: yes
- Preferred sources: official-docs, security-docs, trusted-secondary
- Freshness window: 30 days

### 4. Untrusted input security and quarantine

- ID: `untrusted-input-security`
- Query: current agent untrusted input prompt injection quarantine scanner validation security best practices
- Reason: External or untrusted input appears in the contract.
- Required: yes
- Preferred sources: security-docs, trusted-secondary, official-docs
- Freshness window: 30 days

### 5. Declared dependency versions and install safety

- ID: `declared-dependencies`
- Query: current versions changelog security install documentation local web runtime selected during scaffold; no external
- Reason: Contract declares dependencies that should be checked before scaffold.
- Required: yes
- Preferred sources: official-docs, github, changelog
- Freshness window: 30 days

### 6. Current-source check for memory pattern: inbox embeddings

- ID: `pattern-inbox-embeddings`
- Query: current official documentation changelog security discussion inbox embeddings agent harness
- Reason: Selected Pritha memory pattern produced this external research seed.
- Required: yes
- Preferred sources: official-docs, github, changelog, trusted-secondary
- Freshness window: 30 days

### 7. Current-source check for memory pattern: embeddings none

- ID: `pattern-embeddings-none`
- Query: current official documentation changelog security discussion embeddings none agent harness
- Reason: Selected Pritha memory pattern produced this external research seed.
- Required: yes
- Preferred sources: official-docs, github, changelog, trusted-secondary
- Freshness window: 30 days

### 8. Current-source check for memory pattern: target voice

- ID: `pattern-target-voice`
- Query: current official documentation changelog security discussion target voice agent harness
- Reason: Selected Pritha memory pattern produced this external research seed.
- Required: yes
- Preferred sources: official-docs, github, changelog, trusted-secondary
- Freshness window: 30 days

### 9. Current-source check for memory pattern: voice operator

- ID: `pattern-voice-operator`
- Query: current official documentation changelog security discussion voice operator agent harness
- Reason: Selected Pritha memory pattern produced this external research seed.
- Required: yes
- Preferred sources: official-docs, github, changelog, trusted-secondary
- Freshness window: 30 days

### 10. Current-source check for memory pattern: web. telegram

- ID: `pattern-web-telegram`
- Query: current official documentation changelog security discussion web. telegram agent harness
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

## Skill candidates

Policy: needs=`selected`; sources=`local-only`; install=`link`; mutation=`read-only`.

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

- Runtime family: keep `codex-native` unless research finds a hard blocker.
- Telegram: keep out of scaffold v1 unless the user explicitly selects it later.
- Memory: start from `file-backed local media inbox, no embeddings or Pritha memory`; add SQLite/embeddings only if v1 workflows need retrieval.
- Scaffold should remain minimal, testable and free of copied Pritha secrets.

## Risks and open questions

- Contract validation issues: none blocking from structural validator
- Source freshness is pending until external verification is completed.
- Scaffold should not start if runtime docs, Telegram behavior or dependency versions are uncertain.

## Next step

Run external verification for the checklist above, update this review or the contract, then proceed to scaffold planning.
