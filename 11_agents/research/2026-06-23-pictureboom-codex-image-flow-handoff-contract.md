---
id: 2026-06-23-pictureboom-codex-image-flow-handoff-contract
type: review
status: draft
created: 2026-06-23
updated: 2026-06-23
topics:
  - control-center
  - realtime-voice
  - codex-task
  - pictureboom
tools:
  - Codex
  - Pritha Voice Control
  - PictureBoom
sources:
  - 11_agents/research/2026-06-23-pictureboom-codex-image-flow-development-task.md
  - 11_agents/research/2026-06-23-pictureboom-agent-research-2.md
  - 11_agents/research/2026-06-23-pictureboom-agent-pattern-pack-2.md
  - interfaces/control-center/src/lib/realtime/pritha-runtime.ts
  - interfaces/control-center/src/app/api/realtime/tool/route.ts
  - /Users/jkl/PictureBoom/docs/image-handoff.md
  - /Users/jkl/PictureBoom/scripts/image-inbox.mjs
  - /Users/jkl/PictureBoom/scripts/web-server.mjs
related:
  agent_contracts:
    - 11_agents/contracts/2026-06-23-pictureboom-agent-contract.md
  research:
    - 11_agents/research/2026-06-23-pictureboom-codex-image-flow-development-task.md
supersedes: []
superseded_by: []
memory_domain: child-agents
subject:
  kind: agent
  id: pictureboom
privacy: internal
retention: durable
review_status: draft
confidence: medium
contract_version: pictureboom-codex-image-flow.v1
external_research_status: not-applicable
---

# PictureBoom Codex Image Flow Handoff Contract

Date: 2026-06-23
Status: draft

## Purpose

Define the Pritha Voice Control handoff shape for image requests addressed to
PictureBoom. Pritha must create a Codex task template. Pritha must not call an
image provider directly, store generated image bytes, or publish anything.

Codex generates exactly one image internally, then delivers the generated file
into PictureBoom with the existing local inbox command.

## Trigger Boundary

Allowed triggers:

- Pritha realtime voice intent addressed to PictureBoom.
- Optional Control Center UI shortcut that creates the same Codex task payload.

Not allowed in this contract:

- direct server-side image-generation provider calls from Pritha or PictureBoom;
- external image providers or image-provider credentials;
- public publishing;
- Pritha memory, queue, report or log storage for generated image files;
- launchd, cron, scheduler, service install or deployment changes.

## Command Payload

The voice/UI flow must submit a `run_codex_task` payload through the existing
Pritha realtime tool path.

Required high-level fields:

```json
{
  "task_type": "implementation",
  "write_mode": "workspace_write",
  "priority": "normal",
  "requires_internet": false,
  "subject_kind": "agent",
  "subject_id": "pictureboom",
  "subject_label": "PictureBoom",
  "thread_reset": false
}
```

Required task inputs inside the `task` text:

```json
{
  "scenePrompt": "<operator scene prompt>",
  "title": "<two or three word card title>",
  "requestId": "<Pritha/Codex task request id>",
  "promptSummary": "<optional bounded prompt summary>",
  "destination": "/Users/jkl/PictureBoom/images/inbox",
  "ingestCommand": "node scripts/image-inbox.mjs ingest --source <generated-image> --title <title> --request-id <requestId> --prompt <promptSummary>"
}
```

The task text must instruct Codex to:

1. generate exactly one image using internal Codex image generation;
2. save the generated file only in Codex staging or PictureBoom-local staging;
3. run the PictureBoom ingest command from `/Users/jkl/PictureBoom`;
4. use a two or three word title;
5. pass the Pritha request id to `--request-id`;
6. pass a short prompt summary to `--prompt` when available;
7. verify the card through `image-inbox` list/assert-local and feed checks;
8. report paths and card id without exposing prompt or request id in browser
   evidence.

## Codex Task Template

The generated Codex task should follow this template:

```text
Generate exactly one image for PictureBoom using internal Codex image generation.
Scene prompt: <operator scene prompt>.

After generation, deliver the generated image into /Users/jkl/PictureBoom only:
cd /Users/jkl/PictureBoom
node scripts/image-inbox.mjs ingest \
  --source <generated-image-file> \
  --title "<two or three word title>" \
  --request-id "<Pritha request id>" \
  --prompt "<short prompt summary>"

Do not use external image providers, provider credentials, public publishing,
Pritha memory, Pritha queues, Pritha logs, or Pritha reports for the generated
image file. Verify:
- node scripts/image-inbox.mjs list --json
- node scripts/image-inbox.mjs assert-local
- PictureBoom feed API/UI shows the card
- browser-facing API/UI does not expose prompt summary or request id
```

## PictureBoom Ingest Contract

PictureBoom remains the storage boundary.

Expected metadata after ingest:

```json
{
  "schema": "pictureboom.image-card.v1",
  "id": "<generated-card-id>",
  "title": "<two or three word title>",
  "createdAt": "<ISO timestamp>",
  "imageFile": "images/inbox/<generated-card-id>.<extension>",
  "metadataFile": "images/inbox/<generated-card-id>.json",
  "source": {
    "kind": "internal-codex",
    "requestId": "<Pritha request id>",
    "promptSummary": "<optional bounded prompt summary>"
  },
  "storage": {
    "projectLocalOnly": true,
    "prithaDuplicateStorage": false,
    "prithaStoragePath": null,
    "inbox": "images/inbox"
  }
}
```

The title may be normalized by `scripts/image-inbox.mjs`; the voice/UI contract
should still provide a concise two or three word title candidate.

## Browser Disclosure Contract

PictureBoom browser-facing surfaces may expose only:

```json
{
  "id": "<card id>",
  "title": "<card title>",
  "createdAt": "<ISO timestamp>",
  "imageUrl": "/images/inbox/<card file>"
}
```

The browser API, HTML, client JavaScript and rendered UI must not expose:

- request id;
- prompt summary;
- original generated file name;
- source metadata;
- storage metadata;
- provider details.

## Verification Contract

Minimum verification for the implementation step:

```sh
cd /Users/jkl/PictureBoom
node scripts/image-inbox.mjs contract --json
node scripts/image-inbox.mjs list --json
node scripts/image-inbox.mjs assert-local
npm run web:check
```

Implementation tests must also assert:

- a post-ingest card appears in `GET /api/images`;
- the feed item has id, title, createdAt and imageUrl;
- request id and prompt summary remain absent from browser-facing API/UI;
- no generated image file is copied into Pritha memory, queue, log or report
  locations.

## Failure Handling

If Codex image generation is unavailable, the task must fail with a concise
operator-facing error and must not fall back to external providers.

If PictureBoom ingest fails, the task must report the failed command and leave
any generated file in Codex staging or delete it according to the next explicit
operator instruction; it must not copy the image into Pritha.

If feed verification needs a server, a later verification step may start a
temporary local PictureBoom server and stop it afterward. This contract does
not authorize persistent services or autostart.
