---
id: 2026-06-26-fas-agent-development-task
type: review
status: draft
created: 2026-06-26
updated: 2026-06-26
topics:
  - agent-engineering
  - agent-factory
  - agent-improvement
  - fas
  - threejs
  - gltf
  - model-loading
  - animation
tools:
  - Codex
  - AGENTS.md
  - Three.js
  - GLTFLoader
sources:
  - ../FAS
  - 11_agents/research/2026-06-26-fas-agent-pattern-pack.md
  - 11_agents/contracts/2026-06-22-fas-agent-contract.md
  - 11_agents/research/2026-06-24-fas-third-dog-character-development-task.md
  - 11_agents/research/2026-06-24-fas-third-dog-character-pattern-pack.md
related:
  agent_contracts:
    - 11_agents/contracts/2026-06-22-fas-agent-contract.md
  pattern_packs:
    - 11_agents/research/2026-06-26-fas-agent-pattern-pack.md
supersedes: []
superseded_by: []
development_task_type: improve
target_project: ../FAS
pattern_pack: 11_agents/research/2026-06-26-fas-agent-pattern-pack.md
pattern_research_status: complete
semantic_memory_status: complete
semantic_failure_log: none
memory_research_status: complete
external_research_status: pending
synthesis_status: pending
verified: pending
memory_domain: child-agents
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
confidence: medium
---

# Agent Development Task: FAS DOG Model Upgrade

Date: 2026-06-26
Status: draft

## Operator Task

Обновить агента FAS: найти и внедрить новую 3D-модель DOG со свободной
лицензией с открытым исходным кодом, допускающей некоммерческое использование.
Требования: более реалистичный внешний вид, плавные анимации минимум для idle и
ходьбы/бега, мягкая интеграция без поломки текущей логики. Проверить
совместимость лицензии, корректность импорта, работу анимаций и базовую
производительность; при необходимости адаптировать риг/клипсы.

## Current Project State

- Project path: `/Users/jkl/FAS`.
- Classification: existing Pritha child-agent local web app with Vite,
  Three.js, GLTFLoader, manual controls and optional Realtime voice.
- Preflight result: FAS exists and the current DOG path is
  `/Users/jkl/FAS/public/assets/models/dog-quaternius.glb`, loaded from
  `/assets/models/dog-quaternius.glb`.
- Current DOG asset metadata: Quaternius Dog from Poly Pizza, recorded as
  Public Domain (CC0), size 296880 bytes.
- Parsed current DOG animation inventory: `Death`, `Headbutt`, `Idle`,
  `Idle_Eating`, `Jump_Loop`, `Jump_Start`, `Run`, `Walk`.
- Current implementation areas:
  `/Users/jkl/FAS/src/animation-controller.js`,
  `/Users/jkl/FAS/src/main.js`,
  `/Users/jkl/FAS/src/command-router.js`,
  `/Users/jkl/FAS/public/assets/models/third-party-assets.json`, and
  `/Users/jkl/FAS/public/assets/README.md`.

## Memory Coverage

- Pattern pack:
  `11_agents/research/2026-06-26-fas-agent-pattern-pack.md`.
- Memory stats: 617 documents, 5746 chunks, 1889 entities, 14289 relations and
  5568 embeddings.
- Exact FTS query for `FAS Three.js DOG glTF realistic model animation`
  returned no rows.
- Narrow FTS queries for `FAS`, `Three.js glTF model loading` and
  `agent improvement` returned relevant FAS lifecycle, Three.js/WebGL and
  agent-improvement artifacts.
- Domain retrieval covered `agent-building-knowledge`, `pritha-self` and
  `child-agents`.
- Semantic search completed with no failure log. The top results were the prior
  FAS third-DOG development task, prior FAS DOG pattern pack, FAS contract GLTF
  deferred function and FAS DOG acceptance criteria.

## Selected Patterns To Apply

- `pattern-01`: FAS contract - keep local-first boundaries, manual fallback and
  existing command state contract.
- `pattern-02`: prior FAS DOG development task - reuse current DOG integration
  files and command mapping.
- `pattern-03`: prior FAS DOG pattern pack - verify license, format, decoder
  needs and asset size before import.
- `pattern-04`: FAS scaffold report - keep the edit surface narrow.
- `pattern-05`: FAS profile - do not change service, deployment, Tailscale,
  proactivity or credentials.
- `pattern-06`: WebGL model-loading signal - prefer local GLB/glTF and verify
  performance/fallback behavior.
- `pattern-07`: interface experience standard - preserve visible controls,
  responsive framing and manual workflows.
- `pattern-08`: untrusted external asset policy - treat downloaded model
  content and metadata as untrusted.
- `pattern-09`: descendant improvement routing - keep only distilled evidence
  and attribution metadata in durable artifacts.

## External Research Topics

External research is pending and required before model import.

1. Current official Three.js `GLTFLoader` documentation for local GLB/glTF
   loading and decoder setup when selected assets use compression.
2. Current source page or repository for the selected realistic DOG model,
   including author, license, source availability and direct download evidence.
3. Candidate model animation inventory proving idle and walk/run support or
   identifying the smallest rig/clip adaptation required.
4. Candidate model technical profile: file size, texture size, polygon/mesh
   complexity, compression extensions and browser compatibility.
5. License compatibility evidence for noncommercial use and local
   redistribution, including required attribution and license files.
6. Fallback candidate with clear license and GLB/glTF compatibility.

## Scope

- Replace or augment the current DOG model with a more realistic DOG asset.
- Keep model files local under `/Users/jkl/FAS/public/assets/models/`.
- Preserve existing hero selection and command vocabulary.
- Preserve current stagehand and heroine behavior.
- Map `idle`, `walk` and `circle`/run to real model clips when available.
- Keep procedural overlays and fallback behavior only where they help smooth
  transitions or compensate for missing clips.
- Update asset provenance metadata and README.

## Non-Goals

- No new voice/manual command vocabulary.
- No service, launchd, cron, heartbeat, queue watcher, Tailscale or deployment
  changes.
- No credential changes or secret writes.
- No hotlinked remote assets.
- No broad frontend redesign.
- No unrelated sibling-agent edits.
- No persistent transcript, queue or private memory changes.

## Implementation Constraints

- Do not implement until the next step collects current-source model and license
  evidence.
- If a candidate has unclear license terms, missing source evidence or no clear
  local redistribution permission, reject it.
- If a candidate requires Draco/Meshopt or another decoder, verify the official
  Three.js integration path before adding dependencies or decoder assets.
- If the realistic model is significantly heavier than the current 296880-byte
  DOG asset, record file size and performance trade-off before import.
- Keep `.env.local`, `.state`, `.logs`, queues and private memory out of scope.

## Required Codex Pipeline

1. Read this development task and the pattern pack before editing.
2. Perform current-source research for candidate DOG models and Three.js loader
   requirements.
3. Select the smallest suitable model that meets license, realism, animation
   and performance constraints.
4. Import the asset locally and update attribution/license metadata.
5. Update renderer/clip mapping with the smallest change that preserves current
   behavior.
6. Verify import, idle animation, walk/run animation, basic performance,
   desktop/mobile framing and no regressions in manual controls.
7. Report changed files, source/license evidence, tests run and any residual
   limitations.

## Acceptance Criteria

- FAS still exposes the existing selectable characters, including DOG.
- DOG uses the new selected model or a documented fallback if no compatible
  model is found.
- DOG idle and walk/run animations work smoothly or have documented, verified
  adaptation.
- Existing stagehand, heroine, manual buttons and voice command allowlist remain
  intact.
- License/source evidence supports free use, open/source availability and
  noncommercial use, with attribution/license files included as required.
- Local verification checks pass or failures are documented as blockers.

## Next Step

Proceed to current-source model research. Do not import or edit FAS runtime code
until the license gate has enough evidence to select a candidate.
