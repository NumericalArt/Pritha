---
id: 2026-06-24-fas-third-dog-character-development-task
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
  - gltf
tools:
  - Codex
  - Pritha Voice Control
  - Three.js
sources:
  - 11_agents/contracts/2026-06-22-fas-agent-contract.md
  - 11_agents/research/2026-06-24-fas-third-dog-character-pattern-pack.md
  - 11_agents/reports/2026-06-22-fas-scaffold-report.md
  - 11_agents/profiles/fas.md
  - /Users/jkl/FAS/AGENTS.md
  - /Users/jkl/FAS/src/animation-controller.js
  - /Users/jkl/FAS/src/main.js
  - /Users/jkl/FAS/src/command-router.js
  - /Users/jkl/FAS/public/assets/models
related:
  agent_contracts:
    - 11_agents/contracts/2026-06-22-fas-agent-contract.md
  pattern_packs:
    - 11_agents/research/2026-06-24-fas-third-dog-character-pattern-pack.md
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
confidence: medium
development_task_type: improve
target_project: /Users/jkl/FAS
pattern_pack: 11_agents/research/2026-06-24-fas-third-dog-character-pattern-pack.md
pattern_research_status: complete
semantic_memory_status: complete
semantic_failure_log: none
memory_research_status: complete
external_research_status: pending
synthesis_status: pending
verified: pending
---

# Agent Development Task: FAS Third Dog Character

Date: 2026-06-24
Status: draft

## Operator Task

Добавить третьего управляемого персонажа в агент FAS: стилизованную собаку на
базе модели из открытого источника, совместимой с Three.js (предпочтительно
glTF) и допускающей свободное использование. Интегрировать модель в сцену и
существующий контроллер анимаций, не добавляя новых пользовательских команд, а
используя уже заложенные команды интерфейса. Обеспечить корректное
переключение персонажей, базовые анимации, отсутствие регресса существующего
героя, и проверить работоспособность в локальном режиме. При необходимости
подобрать ближайшие соответствия анимаций к уже существующим действиям.

## Current Project State

- Project path: `/Users/jkl/FAS`.
- Classification: existing Pritha child-agent local web app with Three.js scene
  and manual command fallback.
- Pattern pack:
  `11_agents/research/2026-06-24-fas-third-dog-character-pattern-pack.md`.
- Semantic/embedding search: complete; failure log: none.
- Keyword memory retrieval: narrower `FAS`, `Three.js` and `agent improvement`
  queries returned relevant FAS lifecycle and Three.js interface patterns; the
  exact combined query returned no rows.
- Domain memory retrieval: `agent-building-knowledge`, `pritha-self` and
  `child-agents` were queried.
- Current implementation areas to inspect in the next step:
  `/Users/jkl/FAS/src/animation-controller.js`,
  `/Users/jkl/FAS/src/main.js`,
  `/Users/jkl/FAS/src/command-router.js`,
  `/Users/jkl/FAS/src/styles.css`, and `/Users/jkl/FAS/public/assets/models`.

## Scope

- Add a third selectable character: a stylized dog.
- Use a freely usable, source-verified, Three.js-compatible model, preferably
  GLB/glTF.
- Keep the model local in the FAS asset tree; no remote hotlinks.
- Reuse existing command intents and UI command vocabulary.
- Map missing dog-specific actions to the nearest existing animation or safe
  fallback pose.
- Preserve current heroes and existing manual/voice command flows.
- Verify local build/runtime behavior.

## Non-Goals

- No new user command vocabulary.
- No service, launchd, cron, Tailscale or deployment changes.
- No credential changes or secret writes.
- No broad frontend redesign.
- No unverified or unclearly licensed model import.

## Required Codex Pipeline

1. Read this development task and the pattern pack before implementation.
2. Inspect FAS character architecture, UI controls, command routing and current
   asset conventions.
3. Perform current-source research for the dog model and Three.js loader path,
   using source/license evidence before import.
4. Import the smallest suitable local asset and update attribution metadata.
5. Integrate selection and command-state mapping without changing the command
   vocabulary.
6. Run syntax, healthcheck, build and smoke where appropriate.
7. Verify desktop/mobile visual behavior and served asset freshness as tooling
   allows.
8. Report changed files, selected model/license and remaining limitations.

## External Research Topics

- Current Three.js `GLTFLoader` usage and any compression decoder requirements.
- Current license and attribution terms for the selected dog model.
- Current download/archive evidence that the model is GLB/glTF and can be used
  locally.
- Fallback model candidate if the first asset is too large, incorrectly
  licensed or technically unsuitable.

## Acceptance Criteria

- FAS exposes three selectable characters, including the dog.
- Existing heroes still switch and animate.
- The dog responds to existing commands with basic visible behavior or safe
  fallback behavior.
- Manual command controls remain available without credentials.
- The selected dog model is local, source-verified and attributed as required.
- Local checks pass or any non-blocking warnings are documented.
