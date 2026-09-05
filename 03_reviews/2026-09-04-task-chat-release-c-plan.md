---
id: task-chat-release-c-plan-2026-09-04
type: review
status: implemented-release-pending
created: 2026-09-04
updated: 2026-09-05
topics: [task-chat, attachments, multimodality, privacy]
tools: [Pritha, Codex, TypeScript]
sources: [operator-approved-task-chat-roadmap-2026-09-04, 'https://learn.chatgpt.com/docs/app-server']
related:
  workflows: [07_workflows/task-chat-evolution-roadmap.md, 07_workflows/control-center-staged-release.md]
supersedes: []
superseded_by: []
memory_domain: pritha-self
subject:
  kind: review
  id: task-chat-release-c
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Release C: original file delivery

## Scope and limits

Accept all original file types; detect PNG/JPEG/GIF/WebP for native image input.
Other images and documents/audio/video/archives remain original files available
to Codex tools on request. No upload-time execution, unpacking or paid media
processing. Defaults: 10 files per message, 100 MiB each, 250 MiB per message,
10 GiB per-instance stored attachments. Surface these limits before upload.
Unreferenced uploads expire after 24 hours and are cleaned opportunistically on
upload. Referenced files never expire automatically, including archived chats.
No new background service. Browser retries retain the original File and upload
ID within the current draft; reload persistence applies to sent attachments.

## Data and API

- PUT attachments/{UUID}: raw streamed file, encoded original name in a header;
  count bytes, hash content, restrict names, serialize mutations, write only
  below the instance-private attachment directory, reject symlink escapes.
  Same ID/content is idempotent; different content conflicts. Remove partial
  data on failure, never promote a partial upload. Bound quota and expiry scans.
- GET attachments/{UUID}: authenticated same-instance original download with
  no-store, nosniff and restrictive content headers. Image preview only for
  detected supported images. Never return the server path in public metadata.
- Extend text-compatible turn requests with optional attachment IDs; permit
  attachment-only messages. Resolve IDs server-side, validate file integrity,
  combined limits, native filesystem access and selected model inputModalities
  before starting a turn. Validate first-message inputs before creating a chat.
- Store attachment-message metadata before native dispatch so uncertain delivery
  can reconcile the same client message ID. Include IDs in request hashing.
  The native transcript keeps the original prompt plus a deterministic file
  manifest and native image inputs. Private metadata describes attachments and
  the generated manifest, not a second transcript. Strip only that exact
  generated suffix from the user's display; restore chips from metadata.
- Revalidate image capability when changing model in an existing image-bearing
  history. Unknown capability fails with a friendly explanation; never discard
  images or silently select another model. Do not widen sandbox permissions.

## UI

File picker, drag/drop and paste images; original text paste still works.
Display upload progress state, names/sizes, image previews, Remove and Retry.
Draft state is keyed per chat. Disable send until every selected file is ready;
on rejection retain text and files. Lock edits while delivery is uncertain and
retry exactly the captured text/attachment IDs. Render downloadable attachment
chips in history, including when an original becomes unavailable. Archive and
copy controls remain usable and the composer remains reachable on mobile.

## Verification and rollout

Test binary integrity for representative image/document/source/audio/video/
archive data, idempotency/conflict, interrupted stream, limits/quota, symlink and
traversal rejection, upload expiry versus referenced retention, model capability
and existing-history checks, new attachment-only chats, unknown delivery and
history replay. Desktop/mobile tests cover selection/drop/paste, preview,
removal/retry and rejected send. No billable model turn is needed for fixtures.
Run full applicable verification and isolated production build. Keep referenced
attachment data on rollback; roll back only code and incompatible metadata via
the staged-release transaction. Prepare the NeuralDeep adaptation using actual
release commits and explicit provider/model capability tests.

## Results

Implemented original upload/download, per-chat attachment drafts, native image
inputs, file manifests, capability validation, history links and durable send
reconciliation. A final history review also added `Load earlier messages` with
retry and retention of already loaded pages, removing the 50-turn UI ceiling.
The history transport ceiling is explicitly 16 MiB/page; overflow is reported,
never silently truncated.

- All 142 Control Center unit tests passed, including binary integrity across
  eight representative file types, quotas, expiry, malformed metadata, symlinks,
  model/image-history checks and restart reconciliation with one native turn.
- Eleven desktop/mobile integration scenarios passed; the additional older-page
  failure/retry/refresh scenario passed after correcting its fixture timestamp.
- Real isolated HTTP upload/download preserved a 12 MiB original byte for byte,
  verifying the raised proxy body ceiling. Typecheck and production build passed.
- Read-only verification against the installed native runtime confirmed original
  filesystem access. All 9 advertised models explicitly reported modalities;
  8 reported image support. No model was silently substituted or invoked.
- Read-only native history inspection found 6 readable Direct Chat records and
  169 readable Voice bindings with matching native ID/workspace. Two Direct
  records returned `thread not loaded`, which maps to the preserved-history
  missing state. Every inspected old binding matched local cached-version
  identity evidence. No historical request was replayed or registry migrated.

Semantic processing by live models and trusted-peer/mobile-device access remain
release smoke checks; fixture tests do not claim to verify model output quality.
Full self-test, privacy and strict health evidence are recorded in the delivery
report. Production lifecycle and fleet rollout remain pending.
