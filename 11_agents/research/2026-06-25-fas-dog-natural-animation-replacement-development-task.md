---
id: 2026-06-25-fas-dog-natural-animation-replacement-development-task
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
  - asset-licensing
tools:
  - Codex
  - Pritha Voice Control
  - Three.js
  - GLTFLoader
sources:
  - 11_agents/contracts/2026-06-22-fas-agent-contract.md
  - 11_agents/research/2026-06-25-fas-dog-natural-animation-replacement-pattern-pack.md
  - 11_agents/research/2026-06-25-fas-dog-model-source-candidates.md
  - 11_agents/research/2026-06-24-fas-third-dog-character-pattern-pack.md
  - 11_agents/research/2026-06-24-fas-third-dog-character-development-task.md
  - 11_agents/reports/2026-06-22-fas-scaffold-report.md
  - 11_agents/profiles/fas.md
  - <FAS_ROOT>/AGENTS.md
  - <FAS_ROOT>/src/animation-controller.js
  - <FAS_ROOT>/src/main.js
  - <FAS_ROOT>/src/command-router.js
  - <FAS_ROOT>/public/assets/models/third-party-assets.json
  - https://sketchfab.com/3d-models/husky-animated-59858d6442e1482a8205e6b94704aeb0
  - https://api.sketchfab.com/v3/models/59858d6442e1482a8205e6b94704aeb0
  - https://creativecommons.org/licenses/by-nc-sa/4.0/
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
selected_asset: pending-alternative
previous_selected_asset: Husky Animated
previous_asset_status: blocked-missing-authorized-archive
license_gate_status: pending-alternative-source
external_research_status: pending-required-for-alternative
synthesis_status: complete-for-alternative-brief
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

## 2026-06-27 Continuation Decision

- Operator-selected asset: `Husky Animated`.
- Source: Sketchfab model
  `https://sketchfab.com/3d-models/husky-animated-59858d6442e1482a8205e6b94704aeb0`.
- API evidence:
  `https://api.sketchfab.com/v3/models/59858d6442e1482a8205e6b94704aeb0`.
- Author: Kastle (`https://sketchfab.com/kastle`).
- License: CC Attribution-NonCommercial-ShareAlike 4.0
  (`https://creativecommons.org/licenses/by-nc-sa/4.0/`).
- License requirements to preserve: author credit, license link,
  noncommercial use only, indication of changes, and ShareAlike for modified
  versions.
- Verified on: 2026-06-27.
- Technical facts from current source metadata: downloadable free Sketchfab
  asset, glTF extension, archives available for `source`, `gltf`, `usdz` and
  `glb`, 468 faces, 312 vertices, one texture and one animation.
- Accepted limitation: only one animation is available; command behavior must
  use explicit fallbacks plus existing FAS procedural overlays.
- Import constraint: the unauthenticated Sketchfab download endpoint requires
  credentials, so integration must use the legitimate Sketchfab download flow
  or an operator-provided archive. Do not bypass access controls or store
  credentials in the repository.

## 2026-06-27 Alternative Asset Decision

The Husky path is no longer the active implementation path. The integration
step for `Husky Animated` was blocked because the actual authorized archive was
not available in workspace evidence and the public Sketchfab download API
requires authentication. The one-animation limitation also remains weak for the
natural command-movement goal.

New active search criteria:

1. Use a literal dog model rather than a wolf/canine substitute unless the
   operator later approves a species trade-off.
2. Require a clear noncommercial research-suitable license, preferably with
   explicit Creative Commons or project license text.
3. Require credible provenance from the model author/source; reject
   game-ripper/game-extracted candidates without independent rights evidence.
4. Require a verifiable archive available without bypassing access controls:
   free/keyless official download, public repository release, or
   operator-provided/approved archive.
5. Prefer local GLB/glTF with embedded or local textures and no new decoder
   dependency. If Draco/Meshopt/KTX2 appears, verify the official Three.js
   loader path before adding support.
6. Prefer at least idle plus walk/run animation. Additional sit/crouch, jump,
   play/gesture, turn or dance-like clips are useful for FAS command mapping.
7. Keep the implementation surface narrow: local asset files, dog model URL,
   clip map/fallback behavior, dog-specific procedural overlays if needed,
   asset metadata/docs and relevant healthcheck expectations only.

## Step-2 Brief Status

- `node scripts/pritha.mjs improve /Users/jkl/FAS --task <husky task>` was
  attempted on 2026-06-27 and still failed before writing artifacts with
  `The "path" argument must be of type string. Received undefined`.
- This file remains the equivalent Codex-readable improvement brief for the
  Husky continuation, paired with
  `11_agents/research/2026-06-25-fas-dog-natural-animation-replacement-pattern-pack.md`.
- Memory coverage was refreshed for this continuation:
  - FTS query `FAS dog model animation` returned the prior FAS dog pattern
    packs, development tasks and source-candidate record.
  - FTS query `noncommercial research license model asset` returned this task
    and the pattern pack as the license-research gate evidence.
  - FTS query `agent improvement interface visual verification` returned the
    Agents Mother workflow, agent-creation harness standard and FAS
    visual-verification pattern packs.
  - Subject query `agent fas` returned the current FAS lifecycle evidence and
    dog/background research artifacts.
  - Semantic query `FAS Husky Animated dog model animation replacement
    noncommercial CC BY NC SA glTF command fallbacks` completed with no failure
    log; top hits were this task, the dog replacement pattern pack, the 2026-06-26
    FAS model upgrade brief and the Husky source-candidate record.
- Alternative search refresh on 2026-06-27:
  - `node scripts/pritha.mjs improve /Users/jkl/FAS --task <alternative task>`
    was attempted and still failed before writing artifacts with
    `The "path" argument must be of type string. Received undefined`.
  - FTS queries for `FAS accessible dog model archive noncommercial license
    animation` and `Husky Animated archive authentication blocked FAS` returned
    no rows.
  - Subject query `agent fas` returned the current FAS lifecycle evidence and
    the existing FAS dog/background research artifacts.
  - Semantic query `FAS alternative dog model accessible archive noncommercial
    license animations GLTF command fallbacks` completed with no failure log.
    Top hits were the dog source-candidate record, this task, the 2026-06-26 FAS
    model upgrade brief, and the prior third-dog development/pattern packs.

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

The next step must produce a source/license/archive candidate record before any
model import:

1. Source URL, author/organization, asset title and retrieval date.
2. License name/version or explicit terms.
3. Evidence that use is noncommercial and suitable for research/local demo use.
4. Attribution, redistribution and ShareAlike requirements if applicable.
5. Download/archive evidence proving access through a legitimate route without
   bypassing protection.
6. Asset format and whether textures/bin files are embedded or local.
7. Animation inventory and likely mapping to FAS intents.
8. Technical compatibility: GLB/glTF preferred; note any Draco/Meshopt/KTX2 or
   conversion requirements.
9. Rejection reasons for candidates with unclear terms, commercial-only terms,
   missing animation data, protected/credential-only archive access, remote-only
   delivery, game-ripper provenance risk or excessive complexity.

If source, license, provenance or archive accessibility evidence is ambiguous,
stop at the gate and return `decision_required` rather than importing the asset.

## Required Codex Pipeline

1. Read this development task and the pattern pack before implementation.
2. Use the 2026-06-27 alternative asset decision above as the active source
   search criteria. The Husky validation is historical context, not an import
   approval.
3. Perform current-source research for alternative dog model/animation resources
   and license/archive terms.
4. Select one candidate only after noncommercial use, provenance and archive
   accessibility are clear.
5. Before import, inspect the actual archive safely and confirm local glTF/GLB
   contents, texture paths, animation clip names and decoder requirements.
6. Import the smallest suitable local asset and update FAS model metadata.
7. Update `src/animation-controller.js` only around dog asset URL, clip mapping,
   fallback behavior and dog-specific procedural motion adjustments.
8. Preserve `src/command-router.js` and `src/main.js` unless implementation
   proves a narrow change is required.
9. Update `public/assets/README.md`,
   `public/assets/models/third-party-assets.json` and possibly
   `scripts/healthcheck.mjs` for the selected model.
10. Run `npm run syntax`, `node scripts/healthcheck.mjs`, `npm run smoke` and
   `npm run build` as applicable.
11. Use a local dev/preview server and browser automation where available to
   verify dog selection plus representative commands on desktop and mobile.
12. Report changed files, selected model/source/license, noncommercial
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
