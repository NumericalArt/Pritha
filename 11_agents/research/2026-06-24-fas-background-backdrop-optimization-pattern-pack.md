---
id: 2026-06-24-fas-background-backdrop-optimization-pattern-pack
type: review
status: draft
created: 2026-06-24
updated: 2026-06-24
topics:
  - agent-engineering
  - agent-improvement
  - child-agent
  - fas
  - threejs
  - raster-ui-assets
  - visual-verification
tools:
  - Codex
  - Pritha memory
  - Three.js
  - PNG
sources:
  - 11_agents/contracts/2026-06-22-fas-agent-contract.md
  - 11_agents/reports/2026-06-22-fas-scaffold-report.md
  - 11_agents/profiles/fas.md
  - 04_standards/raster-ui-assets-for-child-agents.md
  - 04_standards/agent-interface-experience.md
  - 01_sources/signals/2026-06-16-webgl-3d-interface-resource-batch-signal.md
  - 03_reviews/2026-06-16-webgl-3d-interface-resource-batch-review.md
  - 07_workflows/agents-mother.md
  - 04_standards/agent-creation-harness.md
  - /Users/jkl/FAS/AGENTS.md
  - /Users/jkl/FAS/src/animation-controller.js
  - /Users/jkl/FAS/scripts/healthcheck.mjs
related:
  agent_contracts:
    - 11_agents/contracts/2026-06-22-fas-agent-contract.md
  development_tasks:
    - 11_agents/research/2026-06-24-fas-background-backdrop-optimization-development-task.md
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - pritha-self
  - child-agents
subject:
  kind: agent
  id: fas
privacy: internal
retention: durable
review_status: draft
confidence: high
pattern_pack_status: complete
semantic_memory_status: complete
semantic_failure_log: none
selected_pattern_count: 8
external_research_seed_count: 0
external_research_status: not-applicable
verified: pending
---

# Agent Pattern Pack: FAS Background Backdrop Optimization

Date: 2026-06-24
Status: draft

## Task Basis

- Target project: `/Users/jkl/FAS`
- Agent/task: optimize the generated raster stage backdrop, remove the old fast
  backdrop fallback, keep full-screen cover behavior on mobile and desktop, and
  verify no unrelated interface changes.
- Development task type: existing child-agent improvement.

## Memory Retrieval Coverage

- CLI gate attempt:
  - `node scripts/pritha.mjs improve ../FAS --task <operator task>` was
    attempted first, but the local CLI returned `The "path" argument must be of
    type string. Received undefined` before writing artifacts.
  - This file is the equivalent Codex-readable pattern pack required before the
    implementation step.
- Keyword search:
  - `node scripts/query-memory.mjs search "FAS background raster backdrop Three.js asset loading"`
    returned no rows, so the pack uses narrower retrieval.
  - `node scripts/query-memory.mjs search "FAS"` returned the accepted FAS
    contract, scaffold report, child-agent profile, Control Center reports and
    prior FAS development-task evidence.
  - `node scripts/query-memory.mjs search "Three.js WebGL interface asset loading performance"`
    returned the WebGL/Three.js interface signal and review plus the interface
    standard.
  - `node scripts/query-memory.mjs search "agent improvement interface visual verification"`
    returned the Agents Mother workflow and agent-creation harness standard.
- Domain search:
  - `agent-building-knowledge` was queried for standards, workflows and
    reusable interface/raster/verification patterns.
  - `pritha-self` was queried for current Pritha capabilities and operational
    boundaries.
  - `child-agents` was queried for FAS lifecycle evidence and comparable
    child-agent reports.
- Subject search:
  - `node scripts/query-memory.mjs by-subject agent fas` returned the previous
    FAS third-dog task and pattern pack; this confirms lifecycle coverage but
    is not a direct background-asset pattern.
- Semantic search:
  - Query: `FAS background raster backdrop Three.js asset loading mobile desktop fullscreen cover`.
  - Status: complete.
  - Rows: 8.
  - Failure log: none.

## Selected Patterns

### pattern-01: FAS Contract Raster And 3D Boundary

- Source kind: keyword/domain
- Memory domain: child-agents
- Pattern kind: contract
- Confidence: high
- Path: `11_agents/contracts/2026-06-22-fas-agent-contract.md`
- Applicability: FAS explicitly selects a local raster stage background, a
  Three.js avatar scene, local generated assets and manual fallback controls.
- Guidance: keep the task inside the existing local web interface and generated
  asset layer. Do not add network dependencies, deployment, services, secrets
  or new command behavior.

### pattern-02: FAS Scaffold And Harness Boundaries

- Source kind: keyword/domain
- Memory domain: child-agents
- Pattern kind: lifecycle-evidence
- Confidence: high
- Paths:
  - `11_agents/reports/2026-06-22-fas-scaffold-report.md`
  - `/Users/jkl/FAS/AGENTS.md`
- Applicability: Confirms the implementation areas and verification commands:
  `src/animation-controller.js`, generated/public assets, `scripts/healthcheck.mjs`,
  `scripts/smoke-test.mjs`, `npm run syntax`, `npm run healthcheck` and
  `npm run smoke`.
- Guidance: implementation should be narrow: background assets, backdrop loading
  behavior and directly related checks only.

### pattern-03: FAS Child-Agent Profile

- Source kind: keyword/domain
- Memory domain: child-agents
- Pattern kind: profile
- Confidence: high
- Path: `11_agents/profiles/fas.md`
- Applicability: FAS is a manual local web service with no proactivity and no
  autostart.
- Guidance: do not touch Control Center routing, Tailscale, launchd, service
  install/uninstall, credentials or runtime queue behavior.

### pattern-04: Raster UI Asset Size And Responsive Policy

- Source kind: keyword/domain/semantic
- Memory domain: agent-building-knowledge
- Pattern kind: raster-asset-standard
- Confidence: high
- Path: `04_standards/raster-ui-assets-for-child-agents.md`
- Applicability: The task is specifically about generated raster UI assets:
  smaller output variants, mobile crop, file size and responsive behavior.
- Guidance: optimize for the intended viewport slots instead of retaining one
  oversized asset. Record dimensions/byte deltas and verify mobile crop, file
  size and layout behavior before readiness.

### pattern-05: WebGL Responsive Canvas Contract

- Source kind: keyword/semantic
- Memory domain: agent-building-knowledge
- Pattern kind: WebGL interface pattern
- Confidence: high
- Paths:
  - `01_sources/signals/2026-06-16-webgl-3d-interface-resource-batch-signal.md`
  - `03_reviews/2026-06-16-webgl-3d-interface-resource-batch-review.md`
- Applicability: FAS uses a full-window Three.js canvas, responsive camera
  framing and a background plane.
- Guidance: preserve the pattern where CSS owns the displayed canvas size,
  renderer size and camera projection are updated from the displayed viewport,
  and desktop/mobile screenshots or pixel checks confirm the scene is nonblank
  and framed.

### pattern-06: Agent Interface Experience Readiness

- Source kind: keyword/domain/semantic
- Memory domain: agent-building-knowledge
- Pattern kind: interface-standard
- Confidence: high
- Path: `04_standards/agent-interface-experience.md`
- Applicability: The FAS backdrop is both a raster visual asset and part of a
  Three.js visual layer.
- Guidance: keep text and controls in DOM, keep fallback behavior explicit, and
  verify raster file size, responsive behavior, mobile crop and desktop/mobile
  3D render state before calling the interface ready.

### pattern-07: Agent Development Research Gate

- Source kind: domain
- Memory domain: agent-building-knowledge
- Pattern kind: workflow/standard
- Confidence: high
- Paths:
  - `07_workflows/agents-mother.md`
  - `04_standards/agent-creation-harness.md`
- Applicability: Existing child-agent improvements need a development task
  brief, pattern pack, memory search and semantic-search attempt before
  implementation.
- Guidance: this pattern pack satisfies the local research gate. Implementation
  may proceed without external research because no volatile external dependency
  or source asset is being selected.

### pattern-08: Control Center Mobile And Visual QA

- Source kind: semantic/domain
- Memory domain: pritha-self
- Pattern kind: visual-QA-pattern
- Confidence: medium
- Path: `07_workflows/2026-06-12-control-center-voice-page-roadmap.md`
- Applicability: The operator explicitly asked to verify mobile and desktop UI
  behavior and avoid unrelated interface regressions.
- Guidance: future verification should include desktop and mobile viewport
  checks, canvas nonblank/framing checks, and confirmation that controls remain
  reachable and unaffected.

## External Research Seeds

No current-source external research is required for this implementation if the
next step keeps the existing local Three.js texture-loading path and optimizes
existing local assets only.

External research becomes required only if implementation introduces a new
browser image format/fallback strategy, a new loader, a new remote/source asset,
or a Three.js API change. None of those choices is needed for the requested
background optimization.

## Implementation Guidance

- Keep changes in `/Users/jkl/FAS` plus this Pritha research brief lineage.
- Optimize the active desktop and mobile background rasters currently selected
  by `src/animation-controller.js`.
- Preserve the active aspect ratios: desktop `16:9`, mobile `9:16`.
- Keep the current cover-style plane scaling logic unless verification shows a
  visible gap or distortion.
- Remove the old quick/procedural backdrop from the loading and failure path so
  first load shows an empty scene/background until the photo texture is ready.
- Align healthcheck requirements with the active optimized assets. Remove stale
  requirements for inactive backdrop files when they are no longer used.
- Do not alter command routing, hero selection, voice transport, audio controls,
  Control Center operations, credentials, deployment or service configuration.
- Run static checks after edits and perform desktop/mobile visual checks before
  final completion.
