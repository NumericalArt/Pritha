---
id: fas-agent-contract
type: agent-contract
status: accepted
created: 2026-06-22
updated: 2026-06-22
topics:
  - child-agent
  - realtime-voice
  - threejs
  - theater-demo
  - local-web-agent
tools:
  - Codex
  - OpenAI Realtime API
  - Three.js
  - WebRTC
  - Web Audio
  - SpeechSynthesis
sources:
  - task:2026-06-22T20-32-26-515Z-a4b9c201
  - 07_workflows/agents-mother.md
  - 04_standards/agent-creation-harness.md
  - 04_standards/agent-interface-experience.md
  - 04_standards/realtime-voice-control-for-codex-agents.md
  - 04_standards/realtime-voice-control-ui.md
  - 04_standards/raster-ui-assets-for-child-agents.md
  - 04_standards/agent-untrusted-input-security.md
related:
  workflows:
    - 07_workflows/agents-mother.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-interface-experience.md
    - 04_standards/realtime-voice-control-for-codex-agents.md
    - 04_standards/realtime-voice-control-ui.md
    - 04_standards/raster-ui-assets-for-child-agents.md
    - 04_standards/agent-untrusted-input-security.md
supersedes: []
superseded_by: []
memory_domain: child-agents
memory_domains:
  - child-agents
  - agent-building-knowledge
subject:
  kind: child-agent
  id: FAS
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Agent Project Contract: FAS

Date: 2026-06-22
Status: accepted

## Purpose

- Agent name: FAS
- Primary mission: provide a local one-page theater-scene demo agent where a
  humanoid Three.js character responds to voice or manual commands with visible
  animation, text replies, speech synthesis and music control.
- Target user: Pritha voice operator evaluating a lightweight realtime voice
  interface and 3D browser agent scaffold.
- Success criteria:
  - local app scaffold exists at `/Users/jkl/FAS`;
  - raster stage background and Three.js humanoid scene are implemented;
  - commands cover walk, jump, circle, dance, hands up, squat and stop;
  - OpenAI Realtime voice is configured through server-side environment only;
  - manual offline/browser fallback exists for every command;
  - no secrets, private memory, queues, logs or autostart services are copied.
- Out of scope:
  - production deployment;
  - launchd, cron, heartbeat or background services;
  - persistent transcript storage;
  - publication, messaging or file-writing voice tools;
  - remote/unlicensed asset downloads.
- Target folder: sibling of Pritha, `/Users/jkl/FAS`.
- Contract status before scaffold: accepted by explicit operator request and UI
  decision gate in task `2026-06-22T20-32-26-515Z-a4b9c201`.

## Pritha Lineage Metadata

- Seed name: FAS
- Parent agent: Pritha
- Lineage: Pritha child-agent scaffold for realtime voice and 3D UI demo.
- Traits: local-first, realtime-voice-ui, deterministic command router,
  manual fallback, raster UI asset layer, Three.js avatar layer.
- Inheritance: Pritha child-agent safety rules, secret exclusion, no autostart,
  explicit approval for system changes.
- Mutation: theatrical avatar scene with local music and OpenAI Realtime
  command streaming.
- Trial criteria: `npm run smoke`, browser manual command checks, Realtime voice
  check after operator-provided credentials.

## Functional Scope

### V1 Core Functions

- Render a local one-page theater scene.
- Use a raster background asset for the stage.
- Render a simple humanoid character on Three.js.
- Animate walk, jump, circle, dance, hands up, squat and stop.
- Route short Russian/English commands through an allowlisted command router.
- Provide manual command buttons for offline and unsupported browsers.
- Create Realtime ephemeral sessions through a local server endpoint.
- Accept Realtime function-call commands and dispatch only allowlisted intents.
- Reply with visible text and browser speech synthesis when supported.
- Play local background music with start/stop and volume control.
- Detect browser capabilities and show fallback states.

### Deferred Functions

- Replace procedural humanoid with a licensed GLTF skinned model.
- Add Playwright visual tests after dependency install.
- Add richer choreography timeline and animation mixer crossfades.
- Add operator-selected voices and localized command packs.
- Add optional PWA/offline cache after a separate review.

### Critical User Workflows

- Open local page and run manual command buttons with no credentials.
- Configure server-side `OPENAI_API_KEY`, start voice, speak a short command and
  see the character act.
- Start music, adjust volume and stop music.
- Recover from unsupported microphone, WebRTC, speech synthesis, WebGL or asset
  load failure without losing manual controls.

## Runtime And Interface

- Runtime family: codex-native scaffold plus deterministic browser app.
- Codex surface profile: app-supervised for future edits; no Codex runtime in
  the app.
- Primary interface: local web.
- Secondary interfaces: Codex project/thread for development.
- Interface experience profile: realtime-voice-ui.
- Interface user controls: reset/stop voice, manual commands, music start/stop,
  volume, help.
- Interface state model: ephemeral.
- Interface rendering boundary: custom-web.
- UI framework: plain browser modules with Vite and Three.js.
- AI UI layer: custom Realtime command dispatcher.
- UI message/state contract: transcript turns, voice state, scene state,
  capability state and command intent.
- Raster visual asset layer: generated.
- Raster asset purpose: workflow-state and stage texture/background.
- Raster generation path: deterministic local script.
- Raster prompt/spec: theater curtain, stage floor, spotlight backdrop; no text.
- Raster reference image policy: none for v1.
- Raster rendering boundary: local static asset.
- Raster format/size policy: PNG under `public/assets/generated/`.
- Raster accessibility/fallback: DOM text and controls carry meaning; canvas
  has an accessible label.
- Raster privacy/licensing: generated locally; no external source asset.
- Raster readiness check: asset exists and scene loads nonblank.
- 3D visual layer: Three.js.
- 3D renderer: WebGLRenderer.
- 3D purpose: avatar command visualization.
- 3D scene state contract: `idle`, `walk`, `jump`, `circle`, `dance`,
  `hands_up`, `squat`, `error`.
- 3D asset/source policy: procedural local humanoid for v1; future GLTF must be
  local/licensed.
- 3D performance/mobile target: low-poly procedural geometry, capped pixel
  ratio, responsive canvas.
- 3D MCP/debug connector: none.
- 3D fallback: visible unsupported-browser state and manual command UI.
- Interface side-effect policy: local animation/audio/UI state only.
- Voice/Codex approval gate: risky-actions-only; no risky actions in v1.
- Interface fallback: manual buttons and text replies.
- Telegram mode: none.
- Expected hosting: local Mac.

## Runtime Isolation And Boundary

- Runtime isolation profile: project-folder.
- Sandbox required: optional for future hardening.
- Sandbox candidate: none for v1.
- Host control plane: operator terminal and browser.
- Agent execution boundary: `/Users/jkl/FAS` Node/Vite process.
- Credential boundary: server-side environment only.
- Network policy: manual mode local-only; Realtime voice contacts OpenAI only
  after explicit operator action.
- Filesystem policy: app does not write runtime data; generated assets are
  created by explicit script.
- Integration policy presets: OpenAI Realtime only.
- Operator approval flow: required for future writes, deployment, service,
  publication or credential changes.
- Snapshot/restore needs: git/workspace snapshot only.
- Runtime boundary notes: browser receives ephemeral session credentials, not
  the OpenAI API key.

## Runtime Placement

- Runtime placement profile: deterministic-first.
- Provider boundary: direct-openai for Realtime voice only.
- Enterprise governance required: no.
- Multi-model routing requested: no.
- Local inference required: no.
- Provider fallbacks: manual command buttons.
- Privacy routing rules: speech goes to OpenAI only when operator starts
  Realtime voice with configured credentials; manual mode remains local.
- Model budget policy: no background calls; voice calls only during live
  operator session.
- Route healthcheck: local `/api/health` plus manual Realtime start check.

| Task class | Runtime class | Current candidate | Verified | Recheck before scaffold | Fallback | Eval fixture | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Command routing | deterministic code | CommandRouter | 2026-06-22 | no | manual buttons | phrase table | Allowlisted intents only. |
| Voice dialog | hosted realtime | OpenAI Realtime API, model from env | 2026-06-22 local standards only | yes before production use | manual buttons | live command smoke | No internet verification requested in payload. |
| Animation | deterministic code | Three.js procedural skeleton | 2026-06-22 | no | static error state | manual buttons | No model dependency. |
| Speech reply | browser API | SpeechSynthesis | 2026-06-22 | no | text reply | command smoke | Browser-dependent. |
| Music | browser API | HTMLAudio | 2026-06-22 | no | silent mode | music controls | Local generated WAV. |

## Operations And Service

- Deployment target: local Mac.
- Deployment profile: local-development.
- Service mode: manual.
- Autostart: disabled.
- Start command: `npm run dev` for foreground development;
  `npm run control-center:start` for confirmation-gated Control Center start.
- Stop command: `Ctrl+C` for foreground development;
  `npm run control-center:stop` for managed local process stop.
- Healthcheck command: `npm run healthcheck`.
- Local URL: `http://127.0.0.1:8787` for Control Center managed runtime;
  `http://127.0.0.1:5173` for Vite dev.
- Log path: foreground terminal for dev; ignored `.logs/fas-runtime.log` for
  Control Center managed runtime.
- Restart policy: manual only after explicit operator action.

## Proactivity

- Proactive mode: none.
- Scheduler owner: none.
- Trigger sources: manual browser interaction only.
- Background memory write policy: disabled.
- Kill switch / pause command: stop local dev process.
- Idle behavior: no work.
- User interruption policy: none.

## Skills, MCP, Tools And Memory

- Skill needs: none.
- MCP needs: none.
- Durable memory: none in v1.
- Runtime tools: local animation/audio command handlers only.
- External connectors: OpenAI Realtime only, credential-gated by environment.

## Untrusted Input Policy

- Risk tier: external-tooling, limited to speech transcript/model output mapped
  through an allowlist.
- Sources: live microphone audio and Realtime model function calls.
- Token/media budget: bounded by live session duration; no background queue.
- Quarantine: unknown commands are ignored and surfaced as text help.
- Direct raw input to tools: forbidden.
- Human approval gates: required for any future side effect beyond local UI,
  local animation and local audio.

## AI-SAFE Review

- Interface: manual fallback and visible voice/error state selected.
- Reasoning/planning: no autonomous planning in runtime.
- Knowledge: no durable memory or retrieval in v1.
- Execution/tools: only allowlisted local intents.
- Infrastructure/orchestration: no service, scheduler, deployment or autostart.

## Acceptance Tests

- `npm run generate:assets`.
- `npm run syntax`.
- `npm run healthcheck`.
- `npm run smoke`.
- Browser manual command check.
- Realtime voice check after operator-provided credentials.

## External Verification

No external browsing was performed because the task payload set
`requiresInternet: false`. Realtime model names and browser/API details are
version-bound and should be rechecked against official OpenAI and browser docs
before productionizing beyond this local scaffold.
