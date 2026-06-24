---
id: pictureboom-agent-contract
type: agent-contract
status: accepted
created: 2026-06-23
updated: 2026-06-23
topics:
  - child-agent
  - image-feed
  - codex
  - control-center
  - tailscale
  - local-web-agent
tools:
  - Codex
  - Pritha Control Center
  - Tailscale
  - Node.js
  - local filesystem
sources:
  - task:2026-06-23T21-27-28-024Z-f21f0e64
  - 07_workflows/agents-mother.md
  - 04_standards/agent-creation-harness.md
  - 04_standards/tailscale-private-device-access-for-local-agents.md
  - docs/tailscale-private-access.md
related:
  workflows:
    - 07_workflows/agents-mother.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/tailscale-private-device-access-for-local-agents.md
    - 04_standards/agent-interface-experience.md
    - 04_standards/agent-untrusted-input-security.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-23
source_updated: 2026-06-23
source_version: PictureBoom voice task contract v1
retrieved: 2026-06-23
verified: 2026-06-23
valid_for: PictureBoom v1 scaffold and ready-to-test local agent
temporal_status: current
memory_domain: child-agents
memory_domains:
  - child-agents
  - agent-building-knowledge
subject:
  kind: child-agent
  id: pictureboom
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Agent Project Contract: PictureBoom

Date: 2026-06-23
Status: accepted

## Purpose

- Agent name: PictureBoom
- Primary mission: provide a local Pritha child agent that receives internally
  generated Codex image results from Pritha Voice Control and presents them as
  a mobile-first image feed.
- Target user: Pritha voice operator testing an image-generation inbox and
  review surface from a phone or local browser.
- Success criteria:
  - contract is accepted before scaffold;
  - project scaffold is created at `/Users/jkl/PictureBoom`;
  - Pritha Control Center can show PictureBoom as a child-agent card with a
    launch/check/open path;
  - PictureBoom can be reached locally and is prepared for private Tailscale
    access;
  - image files and metadata are stored only inside the PictureBoom project,
    for example under `images/inbox`;
  - Voice Control can address PictureBoom, Codex can generate or deliver an
    image result, and the result appears in the PictureBoom feed;
  - mobile feed uses a dark gray geometric background, shows `Version:
    PictureBoom`, `Design by Прита`, and `NumericalArt`, and lists images
    without frames in a vertical scroll;
  - each image card shows a short two- or three-word title and creation time;
  - delete is the only end-user action and removes both the feed card and
    PictureBoom-local image/metadata memory.
- Out of scope:
  - external image-generation providers;
  - external image-generation API keys;
  - public internet publishing or Tailscale Funnel;
  - launchd, cron, heartbeat, background queue watchers or autostart services
    without a later explicit deployment decision;
  - storing generated images in Pritha, `.memory`, queues, logs or private
    user memory;
  - multi-user authorization, public sharing, social publishing or billing.
- Target folder: sibling of Pritha, `/Users/jkl/PictureBoom`.
- Contract status before scaffold: accepted by matching operator requirements
  in task `2026-06-23T21-27-28-024Z-f21f0e64`; scaffold is still gated by
  Pritha memory research.

## Pritha lineage metadata

- Seed name: PictureBoom
- Parent agent: Pritha
- Lineage: Pritha child-agent scaffold for a local image inbox and mobile feed.
- Traits: local-first, Codex-assisted image handoff, Control Center card,
  Tailscale-ready, project-local media storage, delete-only user action.
- Inheritance: Pritha child-agent safety rules, no secret copying, no private
  memory copying, no unapproved service changes, research gate before scaffold.
- Mutation: image-card feed for Codex-generated images addressed through Voice
  Control.
- Trial criteria: local healthcheck, feed storage/delete tests, Control Center
  discovery check, and manual open of local/Tailscale-ready URL.

## Functional scope

### V1 core functions

- Provide a local web app for PictureBoom.
- Provide an agent-local image inbox under the PictureBoom project.
- Store image metadata next to image files inside the PictureBoom project.
- Accept internal Codex image-result handoff from Pritha Voice Control through a
  local script or endpoint selected during scaffold.
- Render a mobile-first vertical image feed without visible image frames.
- Show the required background text: `Version: PictureBoom`, `Design by Прита`,
  and `NumericalArt`.
- Show a calm dark gray geometric background that does not distract from images.
- Show a short two- or three-word title and creation time under each image.
- Provide one user action: delete.
- Delete removes the card from the UI and deletes the corresponding
  PictureBoom-local file and metadata record.
- Provide local healthcheck and operation commands for Control Center.
- Provide Control Center metadata so Pritha can show and open the agent card.
- Prepare Tailscale private-access metadata and commands without hardcoding
  private URLs into tracked artifacts.

### Deferred functions

- Rich image search, tagging or collections.
- Multi-user accounts or public gallery sharing.
- Background generation queue or scheduler.
- Cloud deployment.
- App authentication beyond trusted local/Tailscale boundary.
- Advanced moderation workflow beyond the v1 internal Codex handoff boundary.
- Image editing, variants and batch operations.

### Critical user workflows

- Operator asks in Pritha Voice Control for an image generation addressed to
  PictureBoom.
- Codex creates or receives the image result and writes it to the PictureBoom
  inbox with metadata.
- Operator opens PictureBoom from Pritha Control Center.
- Operator scrolls the mobile feed and sees image title and creation time.
- Operator deletes an image; the UI and PictureBoom-local storage both remove
  it.
- Operator opens the app from a trusted device through the prepared Tailscale
  route after the final approved Serve action.

## Runtime and interface

- Runtime family: codex-native
- Runtime notes: codex-native scaffold plus deterministic local web app.
- Codex surface profile: app-supervised for development and internal image
  generation handoff; no external generation provider in the app.
- Primary interface: local web.
- Secondary interfaces: Pritha Control Center agent card; Codex project/thread
  for development; Pritha Voice Control as upstream task intake.
- Interface experience profile: workflow-ui.
- Interface user controls: delete only inside the feed; Control Center may
  provide start/check/open actions.
- Interface state model: durable project-local image files and metadata.
- Interface rendering boundary: custom-web.
- UI framework: existing scaffold choice during implementation; React/Vite or
  equivalent local web stack is acceptable if it matches Pritha conventions.
- AI UI layer: none in PictureBoom UI; Codex image generation stays upstream in
  Pritha/Codex.
- UI message/state contract: `ImageCard { id, title, createdAt, imagePath,
  metadataPath }` plus feed list state.
- Typed tool component plan: not selected for v1.
- Raster visual asset layer: existing-assets plus Codex-generated feed images.
- Raster asset purpose: generated image review feed.
- Raster generation path: internal Codex only; no external image-generation
  service integration.
- Raster prompt/spec: prompt text comes from Pritha Voice Control task context
  and is stored only as safe metadata needed for the card.
- Raster reference image policy: no remote reference-image ingestion in v1.
- Raster rendering boundary: local static files served by PictureBoom.
- Raster format/size policy: common browser image formats in `images/inbox`;
  metadata stored as JSON next to the file or in an agent-local manifest.
- Raster accessibility/fallback: image cards include title text and creation
  time; empty feed state is local UI text.
- Raster privacy/licensing: generated or operator-provided through internal
  Codex path; no external provider terms added by PictureBoom.
- Raster readiness check: sample inbox item renders, and delete removes it.
- 3D visual layer: none.
- 3D renderer: none.
- 3D purpose: none.
- 3D scene state contract: none.
- 3D asset/source policy: none.
- 3D performance/mobile target: not applicable.
- 3D MCP/debug connector: none.
- 3D fallback: none.
- Codex account/rate-limit telemetry: none in PictureBoom v1.
- Codex telemetry bucket/limitId: not applicable.
- Codex telemetry displayed fields: none.
- Codex telemetry unavailable-data behavior: not applicable.
- Codex telemetry privacy boundary: no Codex account details in PictureBoom.
- Interface side-effect policy: delete writes only inside PictureBoom project
  storage.
- Voice/Codex approval gate: risky-actions-only; Tailscale mutating commands
  require final exact-command approval.
- Interface fallback: local browser feed and CLI/status output.
- Telegram mode: none
- Expected hosting: local Mac.

## Runtime isolation and boundary

- Runtime isolation profile: project-folder.
- Sandbox required: optional later.
- Sandbox candidate: none for v1.
- Host control plane: Pritha Control Center and operator terminal/Codex.
- Agent execution boundary: `/Users/jkl/PictureBoom` local web process and
  agent-local data folders.
- Credential boundary: host-only; credentials are configured through UI or
  local placeholders, never from voice/model context.
- Network policy: local-first; Tailscale private access only after approved
  Serve configuration; no external image provider network calls.
- Filesystem policy: PictureBoom may read/write only its project-local app
  files, `images/inbox`, metadata and test fixtures.
- Integration policy presets: Pritha Control Center, Pritha Voice Control
  task routing, internal Codex handoff, Tailscale private access.
- Operator approval flow: required for mutating Tailscale Serve/install/off,
  service/autostart, deletion outside PictureBoom, publication or credential
  writes.
- Snapshot/restore needs: standard child-agent project snapshot later.
- Runtime boundary notes: Pritha stores only control metadata and reports, not
  generated images.

## Runtime placement

- Runtime placement profile: deterministic-first
- Provider boundary: chatgpt-sign-in or Codex app-supervised for upstream image
  generation; PictureBoom itself has no provider key boundary.
- Enterprise governance required: no.
- Enterprise provider notes: not selected.
- Multi-model routing requested: no
- Local inference required: no
- Local inference adapter: none.
- Provider fallbacks: manual sample image fixture for tests; no external
  generation fallback.
- Privacy routing rules: generated image files remain in PictureBoom project;
  prompts and metadata are minimized.
- Model budget policy: no background model calls from PictureBoom.
- Route healthcheck: local health endpoint plus storage/delete smoke test.
- Route change log: record future provider or Codex handoff changes in
  operations reports.

| Task class | Runtime class | Current candidate | Verified | Recheck before scaffold | Fallback | Eval fixture | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Voice intake | Pritha Voice Control | Existing Pritha Codex task routing | 2026-06-23 | no | manual Codex task | task payload fixture | Upstream to PictureBoom. |
| Image generation | internal Codex | Codex App/thread image result | 2026-06-23 | no | sample fixture | local sample image | No external providers or API keys. |
| Ingestion | deterministic code | Local script or endpoint | 2026-06-23 | no | file copy fixture | inbox JSON | Writes only to PictureBoom. |
| Feed rendering | deterministic code | Local web UI | 2026-06-23 | no | static empty state | sample card | Mobile vertical scroll. |
| Delete | deterministic code | Local filesystem delete | 2026-06-23 | no | manual file inspection | storage/delete test | Deletes image and metadata. |
| Tailscale access | local operations | Tailscale Serve after approval | 2026-06-23 | yes | local URL | health status | No Funnel/public exposure. |

## Operations and service

- Deployment target: local Mac.
- Deployment profile: local-development.
- Service mode: manual
- Autostart: disabled
- Start command: to be generated in `operations/manifest.json`, expected shape
  `npm run dev -- --host 127.0.0.1 --port <port>` or equivalent.
- Stop command: to be generated in `operations/manifest.json` if Control Center
  managed process control is selected.
- Healthcheck command: to be generated during scaffold.
- Log path: local development console; no tracked logs.
- Restart policy: manual.

## Proactivity

- Proactive mode: manual
- Scheduler owner: none.
- Trigger sources: operator request in Pritha Voice Control and manual local
  testing.
- Schedule: none.
- Timezone: America/Los_Angeles for displayed local created times unless the UI
  chooses browser-local formatting.
- Heartbeat interval: none.
- Concurrency policy: forbid-overlap for ingestion writes.
- Missed-run policy: not applicable.
- Retry/backoff policy: manual retry only.
- Max runtime: local dev session.
- Idempotency/dedupe key: image metadata `id`.
- Background memory write policy: disabled.
- Background untrusted-input policy: no background ingestion.
- Run status/log path: local health endpoint and optional console output.
- Missed-run monitor: none.
- Alert channel: none.
- Kill switch / pause command: stop local process.
- Idle behavior: show existing feed or empty state.
- User interruption policy: deleting a card is immediate and local.

## Skills and procedural memory

- Skill needs: selected
- Allowed skill sources: local-only
- Skill install mode: link
- Skill mutation policy: read-only
- Skill script policy: instruction-only.
- Skill network policy: no-network.
- Skill source pinning: none.
- Skill eval policy: smoke-only.
- Installed skills: none in the child scaffold by default.
- Candidate skills: raster UI asset design guidance from Pritha standards.
- External skill approval: not allowed for v1.
- Skill trusted catalogs: Pritha local skills only.
- Skill update policy: future contract update required.
- Skill audit command: to be generated only if skill layer is selected later.

## MCP connectors

- MCP needs: none.
- Allowed MCP sources: local-only.
- MCP install mode: recommend.
- MCP auth policy: no-secrets-in-repo.
- MCP toolset policy: narrow-only.
- MCP side-effect policy: approval-required.
- Selected MCP connectors: none.
- Candidate MCP connectors: none.
- Pending MCP auth: none.
- MCP readiness command: not applicable.
- MCP audit/update policy: future contract update required.

## Harness inventory

- Information boundaries: operator voice prompt is upstream task input; images
  and metadata are PictureBoom-local; Pritha keeps control/report metadata only.
- Runtime placement: deterministic local app plus Codex upstream generation.
- Tool system: local scripts/endpoints for ingest, list, delete and health.
- Execution orchestration: Pritha step-orchestrated creation; PictureBoom v1
  runs manually.
- Memory and state: project-local `images/inbox` and metadata.
- Evaluation and observability: healthcheck, storage/delete tests, UI smoke.
- Constraints, validation and recovery: reject path traversal, reject metadata
  outside project root, use atomic metadata writes where practical.
- Human approval gates: Tailscale Serve/install/off and any future service or
  credential action.
- Completion criteria: scaffold exists, app runs, feed renders fixture, delete
  removes fixture, Control Center sees card, Tailscale plan/status is available.
- Harness evolution protocol: inspect local project/contract, consult Pritha
  memory, verify current docs when needed, implement minimal change with tests.

## Data, memory and sources

- Memory domains selected: child-agents, agent-building-knowledge.
- Primary memory domain: child-agents.
- Subject kind/id: child-agent/pictureboom.
- Input data types: voice task summary, generated image file, generated image
  metadata.
- Stored data: image files and metadata only inside PictureBoom project.
- Sensitive data: no secrets; prompts may be personal and should stay local to
  PictureBoom metadata only when needed.
- Memory model: file-backed local media inbox, no embeddings or Pritha memory
  image duplication.
- Indexing/search needs: none for v1.
- External verification needs: no external image providers; Tailscale behavior
  relies on existing Pritha standard and final local status check.
- Source freshness requirements: recheck Tailscale/Control Center conventions
  before mutating Serve or operations manifests.
- Pritha memory research required: yes.
- Pritha memory research report: `11_agents/research/2026-06-23-pictureboom-agent-research.md`.
- Current-docs verification required: no-with-reason - no external provider is
  selected, and Tailscale docs are already represented by current Pritha
  standard for this v1 contract; local status must still be checked.
- Current-docs verification status: not-applicable for external providers;
  local Tailscale status is deferred to the final access step.

## Tools and integrations

| Capability | Default boundary | Notes |
| --- | --- | --- |
| Contract and scaffold | CLI/script | Use Pritha scripts where available. |
| Image handoff | local script/endpoint | Writes only under PictureBoom project. |
| Feed list/delete | local web app | Deletes project-local image and metadata. |
| Control Center card | operations manifest/registry | No hardcoded private Tailscale URL. |
| Tailscale access | operator-approved CLI | Serve only after final exact-command approval. |

## Security and permissions

- Secrets required: none for PictureBoom v1.
- `.env.example` variables: safe placeholders only, no external image provider
  keys.
- Allowed network access: local app and Tailscale private access; no public
  exposure; no external generation provider calls.
- Allowed filesystem access: PictureBoom project folder only.
- User authorization model: trusted local operator and trusted tailnet devices.
- Runtime isolation profile: project-folder.
- Network policy tier: operator-approved for Tailscale changes.
- Credential storage boundary: UI/local placeholders, no voice/model-context
  secret writes.
- Risk notes: image files can contain private operator content; do not copy to
  Pritha memory, logs or reports.

## AI-SAFE security profile

- AI-SAFE profile: standard.
- AI-SAFE review status: reviewed for contract; implementation checks pending.
- Interface / input-output controls: UI displays only project-local images and
  metadata; delete is the only feed action.
- Reasoning and planning controls: Codex generation occurs upstream in Pritha
  task context, not inside the PictureBoom app.
- Knowledge / memory / RAG controls: no RAG or embeddings; local files only.
- Execution / tools / MCP / skills controls: no MCP; scripts must reject paths
  outside project root.
- Infrastructure / operations / orchestration controls: no autostart; Tailscale
  mutating actions require explicit final approval.
- AI-SAFE selected layers: interface, knowledge/memory, execution/tools,
  infrastructure.
- AI-SAFE skipped layers: external model/provider routing in PictureBoom.
- AI-SAFE open risks: final implementation must verify delete cannot escape the
  image inbox and that Tailscale URL is not hardcoded.
- AI-SAFE recheck sources: Pritha standards and local implementation tests.

## Scaffold requirements

- Target folder: `/Users/jkl/PictureBoom`.
- Files to generate: `AGENTS.md`, `README.md`, `.env.example`,
  `operations/manifest.json`, app source, `images/inbox/.gitkeep`, local
  scripts/endpoints for ingest/list/delete/health, tests, handoff notes.
- Dependencies: local web runtime selected during scaffold; no external
  image-generation SDKs.
- Setup commands: dependency install if needed; no secret setup required.
- Run commands: local dev/server command bound to `127.0.0.1`.
- Tests/healthchecks: contract/static checks, healthcheck, inbox list/delete
  test, UI smoke/build check, Control Center discovery check.
- User training guide: open via Pritha card, generate from Voice Control,
  review feed, delete card, confirm local/Tailscale URL state.

## Research basis

- Related Pritha artifacts:
  - `07_workflows/agents-mother.md`
  - `04_standards/agent-creation-harness.md`
  - `04_standards/tailscale-private-device-access-for-local-agents.md`
  - `docs/tailscale-private-access.md`
- Pritha memory searches performed: `node scripts/pritha.mjs research 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md`.
- Pattern pack: `11_agents/research/2026-06-23-pictureboom-agent-pattern-pack.md`.
- Semantic/embedding memory status: complete.
- Semantic failure log: none yet.
- Pritha standards/workflows/decisions used: agent creation harness, Tailscale
  private device access, untrusted input security, interface experience.
- Comparable child-agent evidence used: FAS/FESPA26/FunnyTeacher/StupidJoke
  inventory and Pritha memory matches from the research report.
- Pattern-derived external research seeds: none for v1 external providers.
- Current primary sources checked: not required for external image providers
  because they are explicitly out of scope.
- Trusted secondary sources checked: Pritha standards listed above.
- Alternatives considered:
  - external image-generation API: rejected by operator requirement;
  - storing images in Pritha: rejected by privacy/storage boundary;
  - public deployment: rejected for v1;
  - launchd/autostart: deferred behind separate deployment decision.
- Decision rationale: a local child agent with project-local media storage
  satisfies the operator's ready-to-test workflow while minimizing secrets,
  network exposure and cross-project data duplication.

## Acceptance checklist

- [x] Contract reviewed or auto-accepted by matching operator requirements.
- [x] Contract status is `accepted` before production scaffold.
- [x] Pritha memory research completed or explicitly waived with reason.
- [x] Current primary sources checked for volatile choices or marked not-applicable.
- [x] Runtime family selected.
- [x] Runtime isolation profile selected or explicitly marked unnecessary.
- [x] Runtime placement selected per task class.
- [x] Interface mode selected.
- [x] Telegram need explicitly decided.
- [x] Skills policy selected.
- [x] MCP policy selected or explicitly skipped.
- [x] Harness inventory complete.
- [x] Security model documented.
- [x] AI-SAFE security profile completed or explicitly marked minimal/not-applicable.
- [x] Tests/healthchecks defined.
- [x] Handoff/training plan defined.
