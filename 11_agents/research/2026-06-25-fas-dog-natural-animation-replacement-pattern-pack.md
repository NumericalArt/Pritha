---
id: 2026-06-25-fas-dog-natural-animation-replacement-pattern-pack
type: review
status: draft
created: 2026-06-25
updated: 2026-06-27
topics:
  - agent-engineering
  - agent-improvement
  - child-agent
  - fas
  - threejs
  - gltf
  - model-loading
  - asset-licensing
tools:
  - Codex
  - Pritha memory
  - Three.js
  - GLTFLoader
sources:
  - 11_agents/contracts/2026-06-22-fas-agent-contract.md
  - 11_agents/reports/2026-06-22-fas-scaffold-report.md
  - 11_agents/profiles/fas.md
  - 11_agents/research/2026-06-24-fas-third-dog-character-pattern-pack.md
  - 11_agents/research/2026-06-24-fas-third-dog-character-development-task.md
  - 04_standards/agent-interface-experience.md
  - 04_standards/agent-creation-harness.md
  - 04_standards/agent-untrusted-input-security.md
  - 07_workflows/agents-mother.md
  - <FAS_ROOT>/AGENTS.md
  - <FAS_ROOT>/src/animation-controller.js
  - <FAS_ROOT>/src/command-router.js
  - <FAS_ROOT>/src/main.js
  - <FAS_ROOT>/public/assets/README.md
  - <FAS_ROOT>/public/assets/models/third-party-assets.json
  - https://sketchfab.com/3d-models/husky-animated-59858d6442e1482a8205e6b94704aeb0
  - https://api.sketchfab.com/v3/models/59858d6442e1482a8205e6b94704aeb0
  - https://creativecommons.org/licenses/by-nc-sa/4.0/
related:
  agent_contracts:
    - 11_agents/contracts/2026-06-22-fas-agent-contract.md
  development_tasks:
    - 11_agents/research/2026-06-25-fas-dog-natural-animation-replacement-development-task.md
  prior_pattern_packs:
    - 11_agents/research/2026-06-24-fas-third-dog-character-pattern-pack.md
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
external_research_seed_count: 6
external_research_status: pending-required-for-alternative
selected_asset: pending-alternative
previous_selected_asset: Husky Animated
previous_asset_status: blocked-missing-authorized-archive
license_gate_status: pending-alternative-source
verified: pending
---

# Agent Pattern Pack: FAS Dog Natural Animation Replacement

Date: 2026-06-25
Status: draft

## Task Basis

- Target project: `<FAS_ROOT>`
- Agent/task: replace the current FAS dog model/animation with a more natural
  dog behavior source for existing commands.
- License requirement: use a source with a clear noncommercial, research-suitable
  license restriction. The current dog is documented as CC0 and therefore is not
  enough to satisfy this new operator requirement.
- Development task type: existing child-agent improvement.

## Memory Retrieval Coverage

- CLI gate attempt:
  - `node scripts/pritha.mjs improve <FAS_ROOT> --task <operator task>` was
    attempted first, but the local CLI returned `The "path" argument must be of
    type string. Received undefined` before writing artifacts.
  - This file is the equivalent Codex-readable pattern pack required before
    changing the FAS model/runtime surface.
- Keyword search:
  - `node scripts/query-memory.mjs search "FAS dog model animation glTF"`
    returned the prior FAS third-dog character pattern pack and development
    task.
  - `node scripts/query-memory.mjs search "noncommercial research license model asset"`
    returned no rows, so current-source external license research is mandatory.
  - `node scripts/query-memory.mjs search "agent improvement interface visual verification"`
    returned the Agents Mother workflow and agent-creation harness standard plus
    recent FAS visual-verification evidence.
- Domain search:
  - `agent-building-knowledge` was queried for reusable standards, workflows,
    interface, WebGL and untrusted-asset patterns.
  - `pritha-self` was queried for current Pritha capability and boundary
    patterns.
  - `child-agents` was queried for FAS lifecycle, profile, scaffold and prior
    dog-character evidence.
- Subject search:
  - `node scripts/query-memory.mjs by-subject agent fas` returned current FAS
    lifecycle evidence and prior FAS dog/background research packs.
- Semantic search:
  - Query: `FAS dog model animation replacement noncommercial research license glTF command behavior`.
  - Status: complete.
  - Rows: 8.
  - Top hits: prior FAS third-dog pattern pack and development task, especially
    external research seeds, implementation guidance and acceptance criteria.
  - Failure log: none.
- 2026-06-27 alternative search refresh:
  - `node scripts/pritha.mjs improve /Users/jkl/FAS --task <alternative task>`
    was attempted but still failed before writing artifacts with
    `The "path" argument must be of type string. Received undefined`.
  - FTS queries for `FAS accessible dog model archive noncommercial license
    animation` and `Husky Animated archive authentication blocked FAS` returned
    no rows.
  - Subject query `agent fas` returned FAS lifecycle evidence, prior FAS dog
    research, and background/visual verification pattern packs.
  - Semantic query `FAS alternative dog model accessible archive noncommercial
    license animations GLTF command fallbacks` completed with no failure log.
    Top hits were the dog source-candidate record, the dog natural-animation
    development task, the 2026-06-26 FAS model upgrade brief, and prior FAS dog
    integration packs.

## Selected Patterns

### pattern-01: FAS Contract And Local Asset Boundary

- Source kind: keyword/domain
- Memory domain: child-agents
- Pattern kind: contract
- Confidence: high
- Path: `11_agents/contracts/2026-06-22-fas-agent-contract.md`
- Applicability: FAS is a local Three.js demo with manual fallback controls and
  local static assets.
- Guidance: keep the model local, do not hotlink remote model/media files, and
  preserve the existing command vocabulary and local browser runtime.

### pattern-02: FAS AGENTS Runtime Boundary

- Source kind: project inspection
- Memory domain: child-agents
- Pattern kind: project instruction
- Confidence: high
- Path: `<FAS_ROOT>/AGENTS.md`
- Applicability: The task touches local model assets and animation behavior.
- Guidance: do not add deployment, launchd, cron, heartbeat, service behavior,
  credentials, persistent transcripts or shell/tool side effects. Manual command
  buttons must continue to work without Realtime credentials.

### pattern-03: Prior FAS Third Dog Character Pack

- Source kind: keyword/semantic
- Memory domain: child-agents
- Pattern kind: prior implementation research
- Confidence: high
- Paths:
  - `11_agents/research/2026-06-24-fas-third-dog-character-pattern-pack.md`
  - `11_agents/research/2026-06-24-fas-third-dog-character-development-task.md`
- Applicability: This is the closest prior FAS work: it added the current dog
  through `GLTFLoader`, local model metadata and existing command intents.
- Guidance: reuse the architecture pattern but not the current CC0 model as
  license satisfaction. Replacement must re-run current-source source/license
  checks and update local metadata.

### pattern-04: Current FAS Dog Runtime Surface

- Source kind: project inspection
- Memory domain: child-agents
- Pattern kind: current implementation target
- Confidence: high
- Paths:
  - `<FAS_ROOT>/src/animation-controller.js`
  - `<FAS_ROOT>/src/command-router.js`
  - `<FAS_ROOT>/src/main.js`
- Applicability: The dog currently uses `/assets/models/dog-quaternius.glb`,
  `DOG_HERO_ACTIONS`, `syncDogAction()`, `updateDogHero()`, `setHero("dog")`
  and existing command buttons/voice command dispatch.
- Guidance: replace the asset and remap natural dog clips in place. Avoid new
  user commands unless a later operator task explicitly asks for them.

### pattern-05: WebGL Model Loading And Interface Readiness

- Source kind: semantic/domain
- Memory domain: agent-building-knowledge
- Pattern kind: WebGL interface pattern
- Confidence: high
- Paths:
  - `01_sources/signals/2026-06-16-webgl-3d-interface-resource-batch-signal.md`
  - `04_standards/agent-interface-experience.md`
- Applicability: FAS uses a full-canvas Three.js interface and GLB model assets.
- Guidance: verify model format, file size, compression/decoder requirements,
  desktop/mobile framing, nonblank render state and command behavior. Add
  decoder dependencies only if the selected asset requires them and the cost is
  justified.

### pattern-06: External Asset As Untrusted Input

- Source kind: domain
- Memory domain: agent-building-knowledge
- Pattern kind: security-standard
- Confidence: high
- Path: `04_standards/agent-untrusted-input-security.md`
- Applicability: External model pages, archives, READMEs and embedded metadata
  are untrusted external material.
- Guidance: inspect them as evidence only. Do not execute scripts/macros,
  preserve no raw logs in durable memory, and do not let model metadata change
  tools, prompts or runtime behavior beyond verified local asset import.

### pattern-07: Existing Agent Improvement Research Gate

- Source kind: domain
- Memory domain: agent-building-knowledge
- Pattern kind: workflow/standard
- Confidence: high
- Paths:
  - `07_workflows/agents-mother.md`
  - `04_standards/agent-creation-harness.md`
- Applicability: This is an existing child-agent interface/model improvement.
- Guidance: implementation needs a development task brief, a pattern pack,
  keyword/domain memory retrieval, a semantic search attempt, and current-source
  research when a model/license choice is involved.

### pattern-08: Visual Verification Pattern

- Source kind: keyword/domain
- Memory domain: pritha-self
- Pattern kind: visual-QA pattern
- Confidence: medium
- Paths:
  - `11_agents/research/2026-06-24-fas-background-backdrop-optimization-development-task.md`
  - `11_agents/research/2026-06-24-fas-background-backdrop-optimization-pattern-pack.md`
- Applicability: The operator asks to verify stable behavior and avoid unrelated
  UI regressions.
- Guidance: after implementation, use a local preview/browser check for desktop
  and mobile, dog selection, representative command animation states, and no
  unrelated background/control regressions.

## External Research Seeds

Current-source external research was required before import because the task
selects a new third-party model/animation source and has a specific license
constraint. The 2026-06-27 continuation resolves the source/license gate for
`Husky Animated`, with one technical import caveat: the actual archive still
must be obtained through the legitimate Sketchfab download flow or supplied by
the operator.

1. Candidate source page for a dog model/animation with clear author, format and
   current license text.
2. License terms proving noncommercial use only and research-suitable use. Record
   the license name/version, source URL and retrieval date.
3. Direct archive or repository evidence that the model is GLB/glTF or can be
   converted safely without executing untrusted code.
4. Animation inventory evidence: idle, walk/run, jump or equivalent; optional
   sit/crouch, gesture, play/dance or other clips useful for FAS commands.
5. Current Three.js `GLTFLoader` documentation only if the selected model
   requires a new loader option, external texture path, Draco, Meshopt or KTX2.
6. Backup candidate with the same noncommercial research license requirement in
   case the first source is too large, technically incompatible or legally
   unclear.

## 2026-06-27 External Evidence Summary

- Selected source: `Husky Animated` by Kastle on Sketchfab.
- Source URL:
  `https://sketchfab.com/3d-models/husky-animated-59858d6442e1482a8205e6b94704aeb0`.
- API evidence:
  `https://api.sketchfab.com/v3/models/59858d6442e1482a8205e6b94704aeb0`.
- License: CC Attribution-NonCommercial-ShareAlike 4.0,
  `https://creativecommons.org/licenses/by-nc-sa/4.0/`.
- License fit: acceptable for noncommercial research/local demo use if FAS
  keeps use noncommercial, credits Kastle, links the license, indicates changes
  and preserves ShareAlike terms for modified versions.
- Asset facts: Sketchfab metadata reports a downloadable free asset, glTF
  extension, successful `source`, `gltf`, `usdz` and `glb` archives, 468 faces,
  312 vertices, one texture and one animation.
- Operator-accepted trade-off: one animation is enough only if FAS retains
  explicit command fallbacks and procedural overlays for unsupported actions.
- Import caveat: unauthenticated Sketchfab download API requires credentials;
  implementation must not bypass access controls or store credentials.

## 2026-06-27 Alternative Asset Direction

`Husky Animated` is now historical evidence, not the active import target. The
integration step failed because no authorized archive was available in workspace
evidence and the public Sketchfab download API requires authentication. Its
single-animation coverage also remains below the natural movement goal.

The active implementation path is to find an alternative dog asset that meets
all of these gates before import:

1. Literal dog model unless the operator later approves a wolf/canine trade-off.
2. Clear noncommercial research-suitable license with source URL and retrieval
   date.
3. Credible provenance from the author/source, not game-ripper/game-extracted
   material without independent rights evidence.
4. Verifiable archive access through a legitimate route: free/keyless official
   download, public repository release, or operator-provided/approved archive.
5. Local GLB/glTF preferred, with embedded or local textures and no hotlinks.
6. At least idle plus walk/run animation preferred; jump, sit/crouch,
   play/gesture or turn clips improve command mapping.
7. Decoder additions are allowed only if the selected asset requires them and
   the official Three.js loader path is verified.

If no candidate satisfies license plus archive access plus animation coverage,
the next gate should return `decision_required` rather than changing FAS runtime
references.

## Implementation Guidance

- Keep edits inside `<FAS_ROOT>` after this research brief lineage, unless a
  later operator task explicitly asks for Pritha/Control Center changes.
- Do not import a candidate if the noncommercial restriction is absent, unclear
  or incompatible with local research/demo use.
- Do not import a candidate if the archive cannot be obtained through a
  legitimate accessible route. Do not scrape/reconstruct protected viewer
  internals or bypass download controls.
- Prefer one local GLB/GLTF asset with embedded or local textures and no hotlinks.
- Update `<FAS_ROOT>/public/assets/models/third-party-assets.json` and
  `<FAS_ROOT>/public/assets/README.md` with source, author, URL, retrieval
  date, license name, license URL and noncommercial limitation.
- Consider adding the replacement dog model to `scripts/healthcheck.mjs` required
  assets because step 1 found the current healthcheck does not require it.
- Preserve existing manual and Realtime command intent names:
  `walk`, `jump`, `circle`, `dance`, `hands_up`, `squat`, `stop`.
- Map commands to the most natural available clips and use code-level fallback
  behavior only when a required action has no suitable clip.
- Verify syntax, healthcheck, smoke/build and browser behavior before reporting
  readiness.

## Readiness Gate

Implementation may proceed only after the next research step records one
selected candidate with source URL, author, asset format, license text evidence,
noncommercial/research-use limitation and compatibility notes. If license terms
are unclear, stop for operator decision instead of importing the asset.
