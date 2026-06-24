---
id: 2026-06-24-fas-background-backdrop-optimization-development-task
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
tools:
  - Codex
  - Pritha Voice Control
  - Three.js
sources:
  - 11_agents/contracts/2026-06-22-fas-agent-contract.md
  - 11_agents/research/2026-06-24-fas-background-backdrop-optimization-pattern-pack.md
  - 11_agents/reports/2026-06-22-fas-scaffold-report.md
  - 11_agents/profiles/fas.md
  - /Users/jkl/FAS/AGENTS.md
  - /Users/jkl/FAS/src/animation-controller.js
  - /Users/jkl/FAS/scripts/healthcheck.mjs
related:
  agent_contracts:
    - 11_agents/contracts/2026-06-22-fas-agent-contract.md
  pattern_packs:
    - 11_agents/research/2026-06-24-fas-background-backdrop-optimization-pattern-pack.md
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
target_project: /Users/jkl/FAS
pattern_pack: 11_agents/research/2026-06-24-fas-background-backdrop-optimization-pattern-pack.md
pattern_research_status: complete
semantic_memory_status: complete
semantic_failure_log: none
memory_research_status: complete
external_research_status: not-applicable
synthesis_status: not-applicable
verified: pending
---

# Agent Development Task: FAS Background Backdrop Optimization

Date: 2026-06-24
Status: draft

## Operator Task

Для агента FAS оптимизировать растр генерации фонового задника: уменьшить
разрешение и вес, сохранив корректное растяжение на весь экран в мобильном и
десктопном интерфейсе. На время загрузки фонового изображения показывать
пустой экран без резервного старого задника. Удалить использование старого
быстрого задника, чтобы он не появлялся. Проверить, что изменения не
затрагивают другие части интерфейса.

## Current Project State

- Project path: `/Users/jkl/FAS`.
- Classification: existing Pritha child-agent local web app with Three.js scene,
  generated raster background assets, manual controls and optional Realtime
  voice.
- Pattern pack:
  `11_agents/research/2026-06-24-fas-background-backdrop-optimization-pattern-pack.md`.
- Semantic/embedding search: complete; failure log: none.
- Keyword memory retrieval: exact background query returned no rows; narrower
  `FAS`, `Three.js WebGL interface asset loading performance`, and `agent
  improvement interface visual verification` queries returned relevant FAS
  lifecycle, raster, WebGL and harness patterns.
- Domain memory retrieval: `agent-building-knowledge`, `pritha-self` and
  `child-agents` were queried.
- External research: not applicable for this task because the requested change
  can be made by optimizing existing local raster assets and local Three.js
  loading behavior without selecting a new external source, loader, API,
  browser format policy or dependency.

## Step-1 Target Map Summary

- Active desktop backdrop:
  `/assets/generated/ballet-stage-photoreal-desktop.png`, `16:9`,
  currently `1920x1080`, about `2.3M`.
- Active mobile backdrop:
  `/assets/generated/ballet-stage-photoreal-mobile-v2.png`, `9:16`,
  currently `1080x1920`, about `1.7M`.
- Selection rule in `src/animation-controller.js`: use mobile when
  `width <= 720` or viewport aspect `< 0.82`; otherwise use desktop.
- Current old fallback path:
  `createProceduralBackdrop()` creates `procedural-stage-backdrop` and sets
  `scene.background`; `applyPhotoBackdropTexture()` hides it only after the
  photo texture loads; photo-load failure re-enables it when no photo is active.
- Current cover behavior:
  `refreshPhotoBackdropFrame()` computes view dimensions from camera
  FOV/aspect/distance and scales the plane with `PHOTO_BACKDROP_OVERSCAN`.
- Current healthcheck mismatch:
  `scripts/healthcheck.mjs` requires `ballet-stage-photoreal-mobile.png` and
  `theater-backdrop.png`, but active code uses `ballet-stage-photoreal-mobile-v2.png`
  and the operator wants the old fallback removed.

## Scope

- Reduce active backdrop raster dimensions and byte size.
- Preserve visual aspect ratios and full-viewport cover behavior on mobile and
  desktop.
- Remove the old quick/procedural backdrop from loading and failure states so
  loading displays an empty background rather than a previous fallback.
- Align healthcheck expectations with active assets and remove stale fallback
  requirements.
- Verify static checks and mobile/desktop visual behavior.

## Non-Goals

- No new commands, characters, voice behavior or audio changes.
- No Control Center routing, Tailscale, launchd, service or deployment changes.
- No credentials, `.env` edits, private memory, queue or log changes.
- No broad redesign of controls, transcript UI, hero selection or layout.
- No internet research unless a later implementation step chooses a new external
  asset, new image format/fallback policy or new loader/API.

## Required Codex Pipeline

1. Read this development task and the pattern pack before editing.
2. Inspect the current FAS background code and generated asset files.
3. Optimize only the active desktop/mobile backdrop assets or active asset
   references.
4. Remove the procedural/old-fast backdrop from the photo loading and failure
   path while preserving manual controls and visible status behavior.
5. Preserve or adjust cover-style plane scaling only if required by visual
   verification.
6. Update healthcheck and asset documentation only where directly required by
   changed active assets.
7. Run `npm run syntax`, `npm run healthcheck`, `npm run smoke` and `npm run build`
   as applicable.
8. Run desktop and mobile visual checks confirming full-screen coverage, empty
   loading state and no old fallback flash.
9. Review the final diff and report changed files plus any residual risk.

## Acceptance Criteria

- Active desktop and mobile background rasters are smaller in resolution and
  byte size than the current active files.
- The background still covers the full scene on desktop and mobile without
  visible gaps or distortion.
- During initial background image load, the old quick/procedural backdrop is not
  shown.
- If a background texture fails before any photo backdrop is active, FAS does
  not re-enable the old procedural backdrop.
- Healthcheck no longer requires stale inactive fallback assets.
- Manual command controls, hero selection, voice fallback, audio controls and
  Control Center metadata are not changed by this task.
- Static and visual checks pass or failures are documented with concise reasons.
