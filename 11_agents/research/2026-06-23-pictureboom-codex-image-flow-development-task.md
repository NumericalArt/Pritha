---
id: 2026-06-23-pictureboom-codex-image-flow-development-task
type: review
status: draft
created: 2026-06-23
updated: 2026-06-23
topics:
  - agent-engineering
  - agent-improvement
  - control-center
  - realtime-voice
  - pictureboom
tools:
  - Codex
  - Pritha Voice Control
  - PictureBoom
sources:
  - 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
  - 11_agents/research/2026-06-23-pictureboom-agent-research-2.md
  - 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack-2.md
  - 11_agents/reports/2026-06-23-pictureboom-scaffold-report.md
  - interfaces/control-center/src/lib/realtime/pritha-runtime.ts
  - interfaces/control-center/src/app/api/realtime/tool/route.ts
  - /Users/jkl/PictureBoom/docs/image-handoff.md
  - /Users/jkl/PictureBoom/scripts/image-inbox.mjs
  - /Users/jkl/PictureBoom/scripts/web-server.mjs
  - /Users/jkl/PictureBoom/tests/feed-ui.test.mjs
related:
  agent_contracts:
    - 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
  pattern_packs:
    - 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack-2.md
supersedes: []
superseded_by: []
memory_domain: child-agents
memory_domains:
  - agent-building-knowledge
  - pritha-self
  - child-agents
subject:
  kind: agent
  id: pictureboom
privacy: internal
retention: durable
review_status: draft
confidence: medium
development_task_type: improve
target_project: /Users/jkl/PictureBoom
pattern_pack: 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack-2.md
pattern_research_status: reused-complete
semantic_memory_status: reused
memory_research_status: reused-complete
external_research_status: not-applicable
external_research_reason: no new external provider, public publisher, service install, model API, dependency, or deployment target is introduced by this scoped change
synthesis_status: not-applicable
verified: pending
---

# Agent Development Task: PictureBoom Codex Image Flow

Date: 2026-06-23
Status: draft

## Operator Task

Add a Pritha voice command or flow that lets the operator ask for an image,
delegates image generation to Codex, and delivers the generated file into
PictureBoom with:

- an inbox card under `images/inbox`;
- a two or three word title;
- request id metadata;
- prompt summary metadata when available;
- no generated image file copied into Pritha memory, queues, logs or reports;
- no external image provider, public publishing, service install, scheduler or
  credential write;
- feed success defined as `image-inbox` list/check passing and the card
  appearing through PictureBoom feed API/UI;
- browser output limited to card id, title, created time and local image URL,
  never prompt summary or request id.

## Research Gate

This is an existing PictureBoom child-agent improvement. The required memory
research and pattern pack are reused from the accepted PictureBoom creation
gate:

- Research report: `11_agents/research/2026-06-23-pictureboom-agent-research-2.md`.
- Pattern pack: `11_agents/research/2026-06-23-pictureboom-agent-pattern-pack-2.md`.
- Contract: `11_agents/contracts/2026-06-23-pictureboom-agent-contract.md`.

External current-source research is not applicable for this step because the
scoped implementation must not add a new external provider, public publisher,
runtime dependency, model API, deployment target, scheduler, service install or
credential path. Codex image generation remains upstream in the Codex task
environment; PictureBoom remains a deterministic local inbox/feed.

Attempted helper command:

```sh
node scripts/pritha.mjs improve /Users/jkl/PictureBoom --task "<operator task>"
```

The helper failed before producing an artifact with a local CLI argument/path
error. This manual brief preserves the required gate and scope without changing
runtime behavior.

## Current Contracts Inspected

### Pritha Realtime

- Realtime tool surface currently exposes `run_codex_task` through
  `interfaces/control-center/src/lib/realtime/pritha-runtime.ts`.
- The public realtime tool POST route delegates to `handlePrithaRealtimeTool`
  in `interfaces/control-center/src/app/api/realtime/tool/route.ts`.
- Voice instructions already tell the realtime model to use `run_codex_task`
  for implementation and child-agent work, and to route child-agent work with
  `subject_kind=agent`.

### PictureBoom Handoff

- `/Users/jkl/PictureBoom/docs/image-handoff.md` defines the local handoff:
  `node scripts/image-inbox.mjs ingest --source <image-file> --title <title>
  --request-id <id> [--prompt <summary>]`.
- `/Users/jkl/PictureBoom/scripts/image-inbox.mjs` copies files only under
  `images/inbox`, writes card metadata, and updates `images/inbox/index.json`.
- `/Users/jkl/PictureBoom/scripts/web-server.mjs` exposes `GET /api/images`
  using only id, title, createdAt and local imageUrl.
- `/Users/jkl/PictureBoom/tests/feed-ui.test.mjs` already checks that
  promptSummary and requestId are not exposed by the feed API.

## Scoped Touch List

Expected Pritha files if implementation is needed:

- `interfaces/control-center/src/lib/realtime/pritha-runtime.ts`
  - Add a narrow PictureBoom image generation task template or stronger
    instruction branch for voice-triggered PictureBoom image requests.
  - Keep the actual image generation in Codex sidecar; do not add server-side
    image provider calls.
- `interfaces/control-center/src/components/voice/VoiceControlPage.tsx`
  - Only if a visible shortcut is needed; otherwise keep the flow voice-only
    through existing task cards.
- `interfaces/control-center/tests/e2e/control-center.spec.ts` or a focused
  realtime/tool test
  - Verify the generated Codex task payload routes to PictureBoom and contains
    the expected storage/privacy constraints.

Expected PictureBoom files if implementation is needed:

- `/Users/jkl/PictureBoom/tests/feed-ui.test.mjs`
  - Extend or add a fixture asserting that a post-ingest card appears in the
    feed and that request id and prompt summary remain metadata-only.
- `/Users/jkl/PictureBoom/scripts/image-inbox.mjs`
  - Touch only if ingest metadata or list behavior is insufficient.
- `/Users/jkl/PictureBoom/scripts/web-server.mjs`
  - Touch only if the feed API leaks metadata or misses valid cards.
- `/Users/jkl/PictureBoom/docs/image-handoff.md`
  - Touch only if the command/metadata contract needs clarification.

Files that should not be touched for this feature:

- Pritha private memory, task queue, runtime logs or `.env` files.
- PictureBoom deployment or launchd/service files.
- Tailscale configuration.
- Public publishing configuration.

## Implementation Constraints

- Do not store generated image bytes in Pritha memory, reports, queues or logs.
- Do not expose prompt summary or request id in browser HTML, JS, API response
  or rendered UI.
- Do not introduce external image providers or image-generation API keys.
- Do not install dependencies or services unless a later explicit operator gate
  says so.
- Keep PictureBoom as the project-local storage boundary for image files and
  card metadata.

## Verification Plan

1. Confirm the voice/UI flow creates a Codex task with:
   - `task_type=implementation`;
   - `write_mode=workspace_write`;
   - `subject_kind=agent`;
   - `subject_id=pictureboom`;
   - explicit instructions to generate internally with Codex and then call
     `image-inbox.mjs ingest`.
2. Run PictureBoom inbox tests:
   - `npm run inbox:test`;
   - `node scripts/image-inbox.mjs assert-local`;
   - `node scripts/image-inbox.mjs list --json`.
3. Run or extend feed checks:
   - `npm run web:check`;
   - API response contains new card id/title/imageUrl;
   - API/UI do not contain request id or prompt summary.
4. If an end-to-end generation smoke is run, use only Codex internal image
   generation, write the generated file to Codex staging or PictureBoom-local
   inbox, and verify no Pritha-side image copy exists.

## Next Step

Proceed to define the voice handoff contract before editing runtime code.
