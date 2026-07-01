---
id: 2026-06-30-web-design-agent-agent-contract
type: agent-contract
status: accepted
created: 2026-06-30
updated: 2026-06-30
topics:
  - child-agent
  - ui-ux
  - web-design
  - design-research
  - candidate-memory
  - codex
tools:
  - Codex
  - AGENTS.md
  - Pritha Control Center
  - Markdown
  - Node.js
sources:
  - task:2026-06-30T11-43-42-760Z-241bc651
  - 07_workflows/agents-mother.md
  - 08_templates/agent-project-contract.md
  - 04_standards/agent-creation-harness.md
  - 04_standards/memory-domains.md
  - 04_standards/agent-runtime-placement.md
  - 04_standards/agent-team-operating-model.md
  - 04_standards/agent-untrusted-input-security.md
  - 04_standards/agent-interface-experience.md
related:
  intakes: []
  briefs: []
  reviews: []
  decisions: []
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/memory-domains.md
    - 04_standards/pritha-self-model.md
    - 04_standards/agent-runtime-placement.md
    - 04_standards/agent-team-operating-model.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/agent-harness-evaluation.md
    - 04_standards/agent-skill-pack-lifecycle.md
    - 04_standards/agent-interface-experience.md
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/agent-skill-pack-selection.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-30
source_updated: 2026-06-30
source_version: web-design-agent voice task contract v1
retrieved: 2026-06-30
verified: 2026-06-30
valid_for: web-design-agent v1 contract and scaffold gate
temporal_status: current
memory_domain: child-agents
memory_domains:
  - child-agents
  - agent-building-knowledge
subject:
  kind: child-agent
  id: web-design-agent
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Agent Project Contract: web-design-agent

Date: 2026-06-30
Status: accepted

## Purpose

- Agent name: web-design-agent
- Primary mission: provide a standalone, operator-driven UI/UX and web-design
  assistant that can intake design materials, extract reusable examples and
  principles, keep candidate memory only after confirmation, and produce
  practical interface recommendations for web projects.
- Target user: single Pritha operator.
- Success criteria:
  - accepted contract exists before scaffold;
  - project scaffold is created at `/Users/jkl/Pritha_Dasha/web-design-agent`;
  - agent is standalone and has no required filesystem binding to sisquiz;
  - operator can later use it for sisquiz-related UI/UX work by providing
    project context or materials explicitly;
  - intake workflow is clear for links, pasted text, screenshots, examples and
    design principles;
  - useful material is stored first as a candidate, not as committed curated
    memory;
  - candidate memory writes require explicit operator confirmation;
  - recommendations are concrete, scoped to the provided interface context and
    preserve trade-offs;
  - no secrets, `.env`, private memory, queues, logs or credentials are copied
    from Pritha or sibling projects;
  - basic smoke or healthcheck verifies scaffold files and intake directories.
- Out of scope:
  - autonomous redesigns or background monitoring;
  - direct editing of sisquiz or any other project without a later explicit
    task;
  - copying private Pritha state, `.memory`, `.memory-private`, `.private`,
    `.queue`, `.logs`, `.env` files or credentials;
  - deployment, launchd, cron, heartbeat, queue watcher, cloud publishing or
    public exposure;
  - paid/secret-backed external design APIs;
  - Figma, browser, image-generation or screenshot automation unless selected
    by a later accepted contract update.
- Target folder: sibling of Pritha, `/Users/jkl/Pritha_Dasha/web-design-agent`.
- Contract status before scaffold: accepted by operator-approved Pritha Control
  Center task `2026-06-30T11-43-42-760Z-241bc651`; scaffold remains gated by
  Pritha memory research, pattern-pack and external/current-source gate status.

## Pritha lineage metadata

- Seed name: web-design-agent
- Parent agent: Pritha
- Lineage: Pritha child-agent scaffold for a standalone design-advice and
  design-material intake assistant.
- Traits: manual-only, design-research oriented, candidate-memory first,
  confirmation-gated writes, local project-folder boundary.
- Inheritance: Pritha child-agent safety rules, no secret copying, no private
  memory copying, no unapproved service/deployment changes, research gate
  before scaffold, Control Center card readiness before completion.
- Mutation: specializes the generic Pritha child-agent harness for UI/UX and
  web-design examples, principles and practical interface recommendations.
- Trial criteria: contract accepted, research gate complete or not-applicable,
  scaffold smoke test passes, candidate-memory workflow is documented, and
  Control Center card readiness is explicit.

## Functional scope

### V1 core functions

- Accept operator-provided web-design materials: links, pasted text, screenshots
  described by the operator, short examples, principles and interface problems.
- Treat all incoming design materials as untrusted until reviewed.
- Extract useful UI/UX claims, examples, patterns, anti-patterns, risks and open
  questions from provided material.
- Store extracted items as candidate memory drafts only after explicit operator
  confirmation.
- Keep raw materials out of curated memory by default; store concise source
  notes and derived candidate entries.
- Produce practical recommendations for a given page, component, flow or game
  site context.
- Separate facts, design opinions, inspiration, hypotheses and implementation
  constraints.
- Record trade-offs: complexity, implementation cost, accessibility, mobile
  ergonomics, performance, visual consistency and maintainability.
- Provide a simple intake workflow and file layout inside the agent project.
- Provide a smoke or healthcheck command for scaffold readiness.
- Provide a user handoff guide explaining how to submit material and ask for
  recommendations.

### Deferred functions

- Direct access to sisquiz or other project repositories.
- Automated browser inspection, Playwright screenshots or visual regression.
- Figma, design-system or image-generation integrations.
- Durable SQLite, embeddings or external vector store.
- Scheduled design scouting, background ingestion or web crawling.
- Multi-user collaboration, public publishing or notification channels.
- Deployment beyond local manual project use.

### Critical user workflows

- Operator opens the web-design-agent project in Codex and asks for advice on a
  UI/UX problem.
- Operator provides a link, pasted text or described visual example.
- Agent extracts candidate design lessons and asks for confirmation before
  saving them.
- Operator confirms selected candidates; agent writes only the selected
  candidate notes to local candidate-memory files.
- Operator provides a target interface context, later including sisquiz if
  desired; agent returns practical recommendations and trade-offs.
- Operator runs a smoke test to confirm scaffold readiness.

## Runtime and interface

- Runtime family: codex-native
- Codex surface profile: app-supervised or cli-local, depending on the operator
  surface used for the project.
- Primary interface: Codex project/thread.
- Secondary interfaces: Pritha Control Center agent card; local CLI/status
  command for smoke checks.
- Interface experience profile: chat-or-codex-thread.
- Interface user controls: approve, reject, cancel and retry through the Codex
  or Control Center task flow.
- Interface state model: durable project-local Markdown candidate memory.
- Interface rendering boundary: none for v1; recommendations are textual.
- UI framework: none.
- AI UI layer: none.
- UI message/state contract: task prompt plus optional local Markdown candidate
  files; no custom UI component contract in v1.
- Typed tool component plan: not selected for v1.
- Raster visual asset layer: none for v1.
- Raster asset purpose: none.
- Raster generation path: none.
- Raster prompt/spec: not applicable.
- Raster reference image policy: operator may describe screenshots or provide
  inspected material in a later task; v1 scaffold does not store raw images by
  default.
- Raster rendering boundary: none.
- Raster format/size policy: no raster storage in v1 unless a later accepted
  update adds it.
- Raster accessibility/fallback: recommendations must consider accessibility
  when relevant.
- Raster privacy/licensing: do not store raw copyrighted or private visual
  assets as curated memory by default.
- Raster readiness check: not applicable for v1.
- 3D visual layer: none.
- 3D renderer: none.
- 3D purpose: none.
- 3D scene state contract: none.
- 3D asset/source policy: none.
- 3D performance/mobile target: not applicable.
- 3D MCP/debug connector: none.
- 3D fallback: none.
- Codex account/rate-limit telemetry: none.
- Codex telemetry bucket/limitId: not applicable.
- Codex telemetry displayed fields: none.
- Codex telemetry unavailable-data behavior: not applicable.
- Codex telemetry privacy boundary: no Codex account details stored by the
  child agent.
- Interface side-effect policy: approval-required for all memory writes; no
  project edits outside the child-agent folder unless a later task explicitly
  grants scope.
- Voice/Codex approval gate: all-writes for candidate-memory commits and risky
  actions.
- Interface fallback: text-summary and local Markdown files.
- Telegram mode: none
- Expected hosting: local Mac.

## Control Center card contract

- Agents tab card required: yes.
- Card id / slug: web-design-agent.
- Card display name: web-design-agent.
- Registry source: `11_agents/registry.md`.
- Required card lineage: contract, scaffold-report and profile when available.
- Card first visible state: manual-only or blocked-with-next-actions until
  scaffold and readiness checks are complete.
- Control Center manifest fields required: blockers, next actions, healthcheck
  command and control_center_contract.
- Start/Stop execution mode: disabled-plan-only for v1 unless a later accepted
  operations decision adds runtime controls.
- Structured start command approved: no.
- Structured stop command approved: no.
- Expected blockers before runtime is complete: scaffold missing, smoke test
  missing or card readiness missing.
- Operator-visible next actions: run research, pattern-pack, scaffold, registry
  rebuild and card-readiness check.
- Card readiness command: `node scripts/pritha.mjs card-readiness web-design-agent`.
- Card completion rule: creation is not complete while card-readiness status is
  `missing`.

## Runtime isolation and boundary

- Runtime isolation profile: project-folder.
- Sandbox required: optional later.
- Sandbox candidate: none for v1.
- Host control plane: Pritha Control Center plus Codex task/thread.
- Agent execution boundary: `/Users/jkl/Pritha_Dasha/web-design-agent`.
- Credential boundary: host-only; no secrets in project files, prompts,
  candidate memory or reports.
- Network policy: operator-approved; no autonomous browsing or API calls in v1.
- Filesystem policy: read/write inside the web-design-agent project only by
  default; any access to another project, including sisquiz, requires a later
  explicit task scope.
- Integration policy presets: Codex project, Pritha Control Center, local
  Markdown files, smoke script.
- Operator approval flow: required for memory commits, external network
  research, project edits outside web-design-agent, service changes,
  publication, deletion and credentials.
- Snapshot/restore needs: standard project folder backup later if the agent
  becomes operationally important.
- Runtime boundary notes: Pritha tracks contract, reports and registry metadata;
  child-agent candidate memory stays in the child project.

## Runtime placement

- Runtime placement profile: deterministic-first
- Provider boundary: chatgpt-sign-in or Codex app-supervised for operator-driven
  reasoning; no API key boundary selected for v1.
- Enterprise governance required: no.
- Enterprise provider notes: not selected.
- Multi-model routing requested: no
- Local inference required: no.
- Local inference adapter: none.
- Provider fallbacks: manual review or later Codex task.
- Privacy routing rules: raw operator materials remain bounded to the active
  task; only confirmed derived candidates are written to project-local memory.
- Model budget policy: no background model calls; only operator-driven Codex
  sessions.
- Route healthcheck: `node scripts/smoke-test.mjs` after scaffold.
- Route change log: document runtime changes in future operations or
  post-creation reports.

| Task class | Runtime class | Current candidate | Verified | Recheck before scaffold | Fallback | Eval fixture | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Planning | Codex/frontier-hosted | Current Codex App model | 2026-06-30 | yes | human/manual | design-task prompt | Operator-driven planning and recommendation framing. |
| Coding | Codex/frontier-hosted | Current Codex App model | 2026-06-30 | yes | human/manual | scaffold smoke test | Only for scaffold and future explicit edits. |
| Extraction | Codex/frontier-hosted | Current Codex App model | 2026-06-30 | yes | manual review | sample design link/text note | Extract design lessons from untrusted material. |
| Summarization | Codex/frontier-hosted | Current Codex App model | 2026-06-30 | yes | manual review | sample source note | Summaries must separate fact/opinion/hypothesis. |
| Classification | deterministic-code | Markdown frontmatter and folder status | 2026-06-30 | yes | manual review | candidate note fixture | Candidate vs accepted memory state is explicit. |
| Memory query | deterministic-file-search | ripgrep/Markdown search | 2026-06-30 | yes | manual review | candidate memory fixture | No embeddings in v1. |
| Security scan | Codex/frontier-hosted plus checklist | Current Codex App model | 2026-06-30 | yes | manual | untrusted-input fixture | Prompt injection and unsafe memory writes are key risks. |

## Operations and service

- Deployment target: none for v1 beyond local project folder.
- Deployment profile: local-development.
- Service mode: none
- Autostart: disabled
- Start command: not applicable for v1.
- Stop command: not applicable for v1.
- Healthcheck command: `node scripts/smoke-test.mjs` after scaffold.
- Log path: none by default; if logs are added later, keep them project-local
  and out of tracked curated memory unless summarized.
- Restart policy: manual only.

## Proactivity

- Proactive mode: manual
- Scheduler owner: none.
- Trigger sources: explicit operator requests in Codex/Control Center.
- Schedule: not applicable.
- Timezone: America/Los_Angeles when dated artifacts are created.
- Heartbeat interval: not applicable.
- Concurrency policy: forbid-overlap for future write tasks.
- Missed-run policy: not applicable.
- Retry/backoff policy: manual retry.
- Max runtime: task-bounded.
- Idempotency/dedupe key: source URL or source title plus date for candidate
  notes when available.
- Background memory write policy: disabled; memory writes require approval.
- Background untrusted-input policy: no background intake in v1.
- Run status/log path: task-local output only; no durable queue required.
- Missed-run monitor: none.
- Alert channel: none.
- Kill switch / pause command: cancel the active Codex/Control Center task.
- Idle behavior: no action until the operator asks.
- User interruption policy: do not interrupt or notify proactively.

## Team mode

- Team mode: single-agent.
- Coordinator/worker split: not selected.
- Specialist roles: implicit review lenses only: design critique,
  accessibility, product pragmatism and implementation feasibility.
- Reason for no team split: v1 has one manual intake/recommendation workflow and
  no independent schedules, workers or notification streams.

## Skills and procedural memory

- Skill needs: none
- Skill notes: future design-review skill may be proposed after research.
- Allowed skill sources: local-only
- Skill source notes: later external or trusted sources require explicit approval.
- Skill install mode: recommend
- Skill mutation policy: read-only
- Skill script policy: instruction-only.
- Skill network policy: approval-required.
- Skill source pinning: none.
- Skill eval policy: smoke-only for v1.
- Installed skills: none.
- Candidate skills: to be filled by research if useful.
- External skill approval: required before vendor/link/runtime install.
- Skill trusted catalogs: Pritha local skill standards only.
- Skill update policy: update through a future accepted contract or operations
  report.
- Skill audit command: `node scripts/skills-status.mjs` if scaffold adds it.

## MCP connectors

- MCP needs: none for v1.
- Allowed MCP sources: local-only unless later explicitly approved.
- MCP install mode: recommend.
- MCP auth policy: no-secrets-in-repo.
- MCP toolset policy: narrow-only.
- MCP side-effect policy: approval-required.
- Selected MCP connectors: none.
- Candidate MCP connectors: none for scaffold v1.
- Pending MCP auth: none.
- MCP readiness command: not applicable unless a later scaffold adds MCP.
- MCP audit/update policy: use a future accepted contract update.

## Harness inventory

- Information boundaries: only concise operating instructions, intake workflow,
  candidate notes and generated reports belong in the child project; no Pritha
  private memory, queues, logs, credentials or raw private user data are copied.
- Runtime placement: deterministic-first file workflow plus operator-driven
  Codex reasoning.
- Tool system: minimal local CLI/scripts for smoke checks; no side-effectful
  external tools in v1.
- Execution orchestration: manual step-by-step Codex/Control Center tasks.
- Memory and state: Markdown candidate-memory files and source notes inside
  the child project; no SQLite, embeddings, runtime queue or external vector
  store in v1.
- Evaluation and observability: smoke test validates required files, directories
  and candidate-memory workflow placeholders.
- Constraints, validation and recovery: stop on requests to copy secrets,
  private Pritha state, service configs or raw private materials; recover by
  returning a bounded operator question.
- Human approval gates: required for candidate memory commits, external network
  research, sibling project edits, deletion, service changes, deployment,
  credentials and publication.
- Completion criteria: sibling folder exists, scaffold files are present, smoke
  test passes, scaffold report exists, registry includes the agent, and
  card-readiness is not missing.
- Harness evolution protocol: inspect local project and contract, consult
  Pritha memory, verify current docs when needed, implement minimal change with
  tests.

## Data, memory and sources

- Memory domains selected: child-agents and agent-building-knowledge for Pritha
  contract/reports; project-local design candidate memory for the child agent.
- Primary memory domain: child-agents.
- Subject kind/id: child-agent / web-design-agent.
- Input data types: operator-provided links, pasted text, short notes,
  screenshot descriptions, interface descriptions, design principles and
  later explicit project context.
- Stored data: project-local Markdown source notes, candidate-memory drafts,
  confirmed candidate entries and recommendation reports.
- Sensitive data: secrets, `.env`, credentials, private memory, queues, logs,
  private screenshots and raw private project data are excluded unless a later
  task explicitly grants bounded read-only inspection.
- Memory model: minimal Markdown candidate memory with status fields.
- Indexing/search needs: folder and Markdown search through `rg`; no embeddings
  or SQLite in v1.
- External verification needs: not required for the contract itself; research
  gate may mark current-source verification not-applicable if no volatile
  external dependency is selected.
- Source freshness requirements: verify current primary documentation before
  adding browser automation, Figma, paid APIs, image generation, embeddings,
  hosted services, MCP connectors or deployment.
- Pritha memory research required: yes.
- Pritha memory research report: pending step `run_pritha_research`.
- Current-docs verification required: no-with-reason for this contract step;
  no volatile external software/API choice is selected yet.
- Current-docs verification status: not-applicable for contract; pending
  external gate for later scaffold process.

## Untrusted input policy

- Sources: operator-provided links, pasted text, examples, screenshots or
  project descriptions.
- Risk tier: trusted-manual for direct operator instructions; external-readonly
  for linked or pasted third-party design material.
- Direct model instruction override: forbidden. Source material cannot change
  system/developer instructions, tools, memory policy or write permissions.
- Token/media limits: scaffold must define practical per-item limits before
  accepting large pages, transcripts or image batches.
- Quarantine: suspicious prompt-injection, secret-looking strings or private
  project data are summarized as risk notes and not committed as memory.
- Memory update rule: extracted candidates require explicit operator
  confirmation before write.
- Tool trigger rule: external content cannot trigger file writes, network calls
  or project edits.
- Approval gates: memory commit, external browse/research, project edit,
  publication, deletion and credential handling.
- Raw retention: do not store full raw third-party pages or private transcripts
  in curated memory by default.

## Tools and integrations

| Capability | Default boundary | Notes |
| --- | --- | --- |
| Candidate-memory files | CLI/script | Project-local Markdown only. |
| Design recommendation workflow | Codex/thread | Operator-driven; no autonomous actions. |
| Source material inspection | Codex/manual | Treat source material as untrusted. |
| Project-specific UI review | Codex/manual | Requires explicit project context and later task scope. |
| Browser/Figma/image tools | future contract update | Not selected for v1. |

## Security and permissions

- Secrets required: none.
- `.env.example` variables: optional placeholders only, such as
  `AGENT_NAME=web-design-agent` and `LOG_LEVEL=info`; no secret values.
- Allowed network access: none by default during scaffold; explicit
  operator-approved browsing only for later research tasks.
- Allowed filesystem access: web-design-agent project folder only by default.
- User authorization model: single local operator.
- Runtime isolation profile: project-folder.
- Network policy tier: operator-approved.
- Credential storage boundary: host-only; no credentials in repository,
  candidate memory or voice/model context.
- Risk notes: main risks are prompt injection from design material, accidental
  retention of private screenshots/project details, and overgeneralized design
  advice without context.

## AI-SAFE security profile

- AI-SAFE profile: minimal.
- AI-SAFE review status: reviewed for contract; recheck during scaffold.
- Interface / input-output controls: manual Codex thread, no autonomous UI or
  messaging surface.
- Reasoning and planning controls: keep recommendations evidence-linked and
  separate facts from opinions.
- Knowledge / memory / RAG controls: candidate-memory writes require explicit
  operator confirmation; raw untrusted material is not curated memory.
- Execution / tools / MCP / skills controls: no MCP, no external skills and no
  write-capable tools beyond project-local files in v1.
- Infrastructure / operations / orchestration controls: no service install,
  deployment, launchd, cron, heartbeat or queue watcher.
- AI-SAFE selected layers: input policy, memory approval gate, project-folder
  boundary and no-secret policy.
- AI-SAFE skipped layers: sandbox, external gateway, MCP auth and service
  operations; skipped because v1 is manual/local with no external runtime.
- AI-SAFE open risks: future browser/Figma/screenshot integrations need a new
  risk review.
- AI-SAFE recheck sources: agent-untrusted-input-security and
  agent-ai-safe-security-checklist before adding integrations.

## Scaffold requirements

- Target folder: `/Users/jkl/Pritha_Dasha/web-design-agent`.
- Files to generate: `AGENTS.md`, `README.md`, `.env.example`, intake workflow
  notes, candidate-memory directories or templates, smoke test or healthcheck,
  and user handoff guide.
- Dependencies: minimal Node.js or shell-only checks, selected during scaffold.
- Setup commands: no secret setup; optional local copy from `.env.example` only
  if scaffold needs non-secret overrides.
- Run commands: operator-driven Codex project; smoke command after scaffold is
  expected to be `node scripts/smoke-test.mjs`.
- Tests/healthchecks: required file/directory check, no-secret pattern check
  for scaffold artifacts, and candidate-memory workflow fixture.
- User training guide: explain how to submit material, how candidate memory
  confirmation works, how to ask for UI recommendations, and how to use the
  agent later for sisquiz with explicit context.

## Research basis

- Related Pritha artifacts:
  - `07_workflows/agents-mother.md`
  - `08_templates/agent-project-contract.md`
  - `04_standards/agent-creation-harness.md`
  - `04_standards/memory-domains.md`
  - `04_standards/pritha-self-model.md`
  - `04_standards/agent-runtime-placement.md`
  - `04_standards/agent-team-operating-model.md`
  - `04_standards/agent-untrusted-input-security.md`
  - `04_standards/agent-interface-experience.md`
- Pritha memory searches performed: pending required research step.
- Pattern pack: pending required pattern-pack step.
- Semantic/embedding memory status: pending required pattern-pack step.
- Semantic failure log: not applicable until semantic search is attempted.
- Pritha standards/workflows/decisions used: agents-mother workflow and agent
  contract template for this contract step.
- Comparable child-agent evidence used: not yet selected; to be filled by
  research and pattern-pack.
- Pattern-derived external research seeds: pending pattern-pack.
- Current primary sources checked: not-applicable for contract step; no volatile
  external API, model name, integration or deployment dependency is selected.
- Trusted secondary sources checked: not-applicable for contract step.
- Alternatives considered:
  - keep task blocked on sisquiz path;
  - create an agent bound to sisquiz;
  - create a standalone manual UI/UX assistant.
- Decision rationale: the updated operator request explicitly removed the
  sisquiz binding and asked for a standalone, non-autonomous, minimal
  memory-backed assistant. A local Codex-native child-agent project with
  confirmation-gated candidate memory is the smallest useful scaffold.

## Acceptance checklist

- [x] Contract reviewed with user through approved Pritha Control Center task.
- [x] Contract status is `accepted` before production scaffold.
- [ ] Pritha memory research completed or explicitly waived with reason.
- [ ] Current primary sources checked for volatile choices or marked
  not-applicable in the research gate.
- [x] Runtime family selected.
- [x] Runtime isolation profile selected or explicitly marked unnecessary.
- [x] Runtime placement selected per task class.
- [x] Interface mode selected.
- [x] Telegram need explicitly decided.
- [x] Skills policy selected.
- [x] MCP policy selected or explicitly skipped.
- [x] Harness inventory complete.
- [x] Security model documented.
- [x] AI-SAFE security profile completed.
- [x] Tests/healthchecks defined.
- [x] Handoff/training plan defined.
