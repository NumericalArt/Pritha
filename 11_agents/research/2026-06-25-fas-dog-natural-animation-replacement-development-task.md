---
id: 2026-06-25-fas-dog-natural-animation-replacement-development-task
type: review
status: draft
created: 2026-06-25
updated: 2026-06-25
topics:
  - agent-engineering
  - agent-improvement
  - child-agent
  - fas
  - threejs
  - gltf
  - asset-licensing
tools:
  - Codex
  - Pritha Voice Control
  - Three.js
  - GLTFLoader
sources:
  - 11_agents/contracts/2026-06-22-fas-agent-contract.md
  - 11_agents/research/2026-06-25-fas-dog-natural-animation-replacement-pattern-pack.md
  - 11_agents/research/2026-06-24-fas-third-dog-character-pattern-pack.md
  - 11_agents/research/2026-06-24-fas-third-dog-character-development-task.md
  - 11_agents/reports/2026-06-22-fas-scaffold-report.md
  - 11_agents/profiles/fas.md
  - <FAS_ROOT>/AGENTS.md
  - <FAS_ROOT>/src/animation-controller.js
  - <FAS_ROOT>/src/main.js
  - <FAS_ROOT>/src/command-router.js
  - <FAS_ROOT>/public/assets/models/third-party-assets.json
related:
  agent_contracts:
    - 11_agents/contracts/2026-06-22-fas-agent-contract.md
  pattern_packs:
    - 11_agents/research/2026-06-25-fas-dog-natural-animation-replacement-pattern-pack.md
supersedes: []
superseded_by: []
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
confidence: high
development_task_type: improve
target_project: <FAS_ROOT>
pattern_pack: 11_agents/research/2026-06-25-fas-dog-natural-animation-replacement-pattern-pack.md
pattern_research_status: complete
semantic_memory_status: complete
semantic_failure_log: none
memory_research_status: complete
external_research_status: pending-required
synthesis_status: pending
verified: pending
---

# Agent Development Task: FAS Dog Natural Animation Replacement

Date: 2026-06-25
Status: draft

## Operator Task

Для агента ФАС: заменить текущую собаку на модель/анимацию с более
естественными движениями при командах. Требование: использовать источник с
некоммерческой свободной лицензией, пригодной для исследовательского
использования (без коммерческого использования). Найти подходящий ресурс,
интегрировать, обновить реакции на команды для естественности, проверить
стабильность поведения. Кратко зафиксировать источник и лицензионное
ограничение.

## Current Project State

- Project path: `<FAS_ROOT>`.
- Classification: existing Pritha child-agent local web app with Three.js scene,
  manual command controls and optional Realtime voice.
- Pattern pack:
  `11_agents/research/2026-06-25-fas-dog-natural-animation-replacement-pattern-pack.md`.
- Semantic/embedding search: complete; failure log: none.
- Keyword memory retrieval:
  - `FAS dog model animation glTF` returned prior FAS dog-character research.
  - `noncommercial research license model asset` returned no rows.
  - `agent improvement interface visual verification` returned agent-development
    and FAS visual-check patterns.
- Domain memory retrieval: `agent-building-knowledge`, `pritha-self` and
  `child-agents` were queried.
- External research: required before implementation because the task selects a
  third-party model and has an explicit noncommercial research-use license
  constraint.

## Step-1 Target Map Summary

- Current dog runtime URL: `/assets/models/dog-quaternius.glb`.
- Current dog file: `<FAS_ROOT>/public/assets/models/dog-quaternius.glb`,
  `296880` bytes.
- Current documented source/license: Quaternius Dog from Poly Pizza, Public
  Domain (CC0), recorded in `public/assets/models/third-party-assets.json`.
- Current GLB inventory: one scene, one mesh, one skin and eight animation clips:
  `death`, `headbutt`, `idle`, `idle_eating`, `jump_loop`, `jump_start`, `run`,
  `walk`.
- Current command mapping:
  - `idle` -> `idle`
  - `walk` -> `walk`
  - `jump` -> `jump_start`
  - `circle` -> `run`
  - `dance` -> `headbutt`
  - `hands_up` -> `headbutt`
  - `squat` -> `idle_eating`
- Current one-shot dog intent: `jump`.
- Current fallback order in `syncDogAction()`: requested clip, then `idle`, then
  `walk`, then first available clip.
- Current procedural dog overlays in `updateDogHero()` add positional bob,
  circle movement, jump lift, dance sway, hands-up tilt and squat scaling.
- Current healthcheck gap: `scripts/healthcheck.mjs` does not require the dog
  GLB model asset.

## Scope

- Find and validate a replacement dog model/animation source with clear
  noncommercial research-use terms.
- Import the selected asset locally under the FAS asset tree.
- Update dog runtime references and model/license metadata.
- Remap existing dog commands to more natural clips or graceful fallbacks.
- Preserve the current hero selection UI, manual command vocabulary and
  Realtime command allowlist.
- Add or update asset health expectations if directly needed.
- Verify static and browser behavior after implementation.

## Non-Goals

- No new command vocabulary unless the operator separately asks.
- No OpenAI credentials, `.env`, secrets or runtime queue changes.
- No Control Center routing, Tailscale, launchd, cron, service install or
  deployment changes.
- No broad UI redesign or unrelated background/audio changes.
- No import of an asset with unclear license, missing noncommercial restriction
  or incompatible usage terms.
- No execution of external scripts, macros, source-site instructions or archive
  tooling beyond safe inspection/conversion steps chosen by Codex.

## External Research Scope

The next step must produce a source/license candidate record before any model
import:

1. Source URL, author/organization, asset title and retrieval date.
2. License name/version or explicit terms.
3. Evidence that use is noncommercial and suitable for research/local demo use.
4. Attribution and redistribution requirements.
5. Asset format, download/archive URL and whether textures are embedded/local.
6. Animation inventory and likely mapping to FAS intents.
7. Technical compatibility: GLB/glTF preferred; note any Draco/Meshopt/KTX2 or
   conversion requirements.
8. Rejection reasons for candidates with unclear terms, commercial-only terms,
   missing animation data, remote-only delivery or excessive complexity.

If source or license evidence is ambiguous, stop at the license gate and return
`decision_required` rather than importing the asset.

## Required Codex Pipeline

1. Read this development task and the pattern pack before implementation.
2. Perform current-source research for candidate dog model/animation resources
   and license terms.
3. Select one candidate only after the noncommercial research-use limitation is
   clear.
4. Import the smallest suitable local asset and update FAS model metadata.
5. Update `src/animation-controller.js` only around dog asset URL, clip mapping,
   fallback behavior and dog-specific natural motion adjustments.
6. Preserve `src/command-router.js` and `src/main.js` unless implementation
   proves a narrow change is required.
7. Update `public/assets/README.md`,
   `public/assets/models/third-party-assets.json` and possibly
   `scripts/healthcheck.mjs` for the selected model.
8. Run `npm run syntax`, `node scripts/healthcheck.mjs`, `npm run smoke` and
   `npm run build` as applicable.
9. Use a local dev/preview server and browser automation where available to
   verify dog selection plus representative commands on desktop and mobile.
10. Report changed files, selected model/source/license, noncommercial
    limitation and residual risk.

## Acceptance Criteria

- The replacement dog asset is local and no remote model/media hotlink is used.
- Source, author, license URL/terms, retrieval date and noncommercial limitation
  are recorded in FAS-facing documentation/metadata.
- The selected license clearly allows noncommercial research/local demo use and
  disallows commercial use.
- Dog selection does not fall back to stagehand under normal load.
- Existing commands produce more natural dog behavior where matching clips are
  available: `walk`, `jump`, `circle`, `dance`, `hands_up`, `squat`, `stop`.
- Missing actions degrade explicitly to the nearest natural dog clip or a stable
  code-level motion without console/model errors.
- Existing heroine/stagehand behavior, manual controls, optional voice fallback,
  audio controls and optimized backdrop behavior remain unaffected.
- Static checks and browser behavior checks pass, or failures are reported with
  concise reasons.
