---
id: neuraldeep-task-chat-adaptation
type: workflow
status: prepared-release-pending
created: 2026-09-05
updated: 2026-09-05
topics: [task-chat, neuraldeep, attachments, model-capabilities]
tools: [Pritha, Codex, Git]
sources: [operator-approved-task-chat-roadmap-2026-09-04]
related:
  workflows: [07_workflows/task-chat-evolution-roadmap.md, 07_workflows/control-center-staged-release.md]
  standards: [04_standards/control-center-codex-chat-api-contract.md]
supersedes: []
superseded_by: []
memory_domain: pritha-self
subject:
  kind: workflow
  id: neuraldeep-task-chat-adaptation
privacy: public
retention: durable
review_status: reviewed
confidence: high
---

# NeuralDeep: adapt the verified Task Chat changes

This guide transfers behavior, contracts and tests. The mother implementation
is verified in isolation; production A/B/C acceptance is still pending. Update
this status after the release report records actual deployment. Do not describe
the changes as already installed in NeuralDeep.

## Source commits and order

| Stage | Full mother commit | User outcome |
| --- | --- | --- |
| A | `79ee5a403f813f483768850213481f7433cc1609` | Verified history access across Codex upgrades |
| B | `a1fd2faa54817fa847307f0738d51236eaa25739` | One Voice list, local archive, full response copy |
| C | `71f5be857702227acedc9a89f7c72b07a7af11a7` | Original attachments, model checks, earlier history pages |

For C, include the typed history fixture correction
`854a4203c7241bc274e6a12ebaca7265d80faf7e`. This is the cumulative C candidate
after the transfer documentation commit. Its standalone typecheck passes.
Inspect the complete B-to-C-candidate diff when mapping source tests.

Read each exact diff with `git show <commit>` after fetching the reviewed
mother remote. Fetch is inspection, not permission to merge. Before EACH stage,
write a local coding plan with touched files, data/API changes, migration,
fixtures, operator demo, release steps and rollback. Record the local resulting
commit and evidence before proceeding. Never bulk replace modified modules or
cherry-pick conflicting runtime files without architectural review.

The local source inspection on 2026-09-05 found separate
`codex-chat/cli-runtime.ts`, `neuraldeep-cli-runner.ts`,
`admission-coordinator.ts`, `voice-topic-routing.ts`,
`voice-topic-store.ts`, `voice-task-links.ts` and NeuralDeep account/
credential modules. Re-read the actual checkout; its README may lag behind
implemented routing. Preserve CLI execution/resume, native admission locking,
Voice topic and task relationships, state isolation, Keychain credentials,
Responses adapter behavior, authorization, billing/rate-limit errors and
provider diagnostics. The mother's App Server manager is not a replacement for
this architecture.

## A: storage and history

Inventory actual storage identity, schema versions, CLI/native history source
and task associations. Separate stable storage/profile ownership from binary
version and protocol availability. Preserve any stronger NeuralDeep identity
boundary; do not replace it with a path hash if its account/profile isolation
requires more evidence.

For an old binding, prove original storage, native conversation ID and
workspace/profile before offering Restore access. Missing proof means an
explanation and preserved record. Migration must be repeatable, backed up in
private state and reversible; retain native IDs, receipts and Voice links.
Distinguish loading, verified empty, temporary error, different storage,
unsupported format and missing history. Reading history and permission to
continue are separate. Do not replay prompts, auto-archive, or invent a
conversion. If NeuralDeep has a known older transcript schema, specify a
read-only parser and a separately labelled converted copy with original/hash/
provenance and a verified migration test. Unsupported input remains preserved.

Test upgrades within one storage, a real other home/profile, absent/corrupt
history, transient failure, wrong native ID/workspace, repeat recovery and
rollback. Inspect real old records read-only; never dispatch an old prompt.

## B: archive and copy

Keep Direct Chats and Voice Tasks. Remove the Legacy filter while preserving
source records. Deduplicate only proven same-storage native conversations
within the same group, combining all task links and retaining aliases.

Archive is private, per-instance visibility metadata. It cannot invoke native
Codex archive, stop a CLI process/Voice task, or alter NeuralDeep's admission
locks. An archived alias keeps later duplicate aliases hidden. Activity must not
restore a hidden chat. Preserve archived deep links, filtered search/pagination,
Show archived and Restore from archive across restart.

Copy response uses ordered assistant Markdown for one response/turn, including
code and links. Exclude user text, reasoning and activity logs; disable during
generation and permit completed/interrupted/failed partial responses. Preserve
long text, Copied feedback, keyboard access and clipboard-denial errors.
Test active task archiving, reload, aliases, search, concurrent activity, desktop
and mobile, and a long multiline answer. Copy components are suitable for
selective reuse once NeuralDeep's turn normalization is mapped.

## C: attachments and provider capability contract

Port original-file storage and user interactions independently of transport:
picker, drop, image paste, previews, states, removal/retry, attachment-only
messages, history downloads, private retention and idempotent delivery. Defaults
in the mother: 10 files/message, 100 MiB/file, 250 MiB/message, 10 GiB/instance;
unreferenced uploads expire after 24 hours on a later upload. Referenced files
survive restart/archive and never expire automatically. If local limits differ,
document and display them before upload. Do not copy originals between instances.

Accepting an original is different from interpreting it. There is no automatic
transcription, frame extraction, archive expansion or execution. Treat file
contents and filenames as untrusted user data, never as higher-priority
instructions. Validate IDs, filenames, real paths, permissions, regular-file
status, length, hash and quotas. Preserve originals on metadata corruption.

For EACH available NeuralDeep model and each transport path, produce a local
capability matrix:

| Field | Required evidence |
| --- | --- |
| Model/provider/revision | Exact selected model and current authoritative metadata |
| Text and image modalities | Explicit supported/unsupported/unknown; no name-based inference |
| Original file access | CLI tool environment can read the exact private original |
| Image path | Browser → private file → CLI input → Responses adapter → provider |
| Unsupported types/limits | Exact transport/provider constraints and visible explanation |
| History/model change | Earlier image inputs remain supported or continuation is blocked |
| Errors | Authentication, quota, rate limit, transient and unsupported-input remain distinct |

The mother's `inputModalities` and `localImage` handling prove only its installed
App Server path. They do not prove the NeuralDeep CLI/Responses adapter forwards
images, files or multipart fields correctly. Test the entire local adapter
chain; do not replace it with App Server solely to reuse the mother code.

Unknown or unsupported multimodality must explain the limitation, preserve the
draft and originals, and prevent incompatible dispatch. Never choose a different
model, discard an image, turn it into a misleading text-only message, or claim
image understanding merely because a file uploaded successfully. Recheck
capabilities after model/provider changes, including text-only continuation of
a chat whose earlier turns contain images. Ordinary non-image files may be
provided to verified CLI tools for requested processing without claiming native
multimodal support. Audio/video originals do not imply native media understanding.

Persist attachment-message metadata before native dispatch. Include stable IDs
and explicit model settings in idempotency checks; preserve the original input
on retry and reconcile native client IDs/receipts after restart. Do not duplicate
the canonical transcript. Preserve existing text-client and bound-model
behavior. Test loss of the acknowledgement after native acceptance, then restart
and retry: there must still be only one native turn.

## Local acceptance and rollback

Use representative binary/image/document/source/audio/video/archive/unknown
files. Verify exact bytes in the runtime and after history reload, interrupted
upload, size/count/quota, expired draft versus retained original, symlinks,
corrupt metadata, model changes, missing originals and unsupported image models.
Run contract/adapter/unit tests, typecheck, production build, desktop/mobile UI,
privacy audit, self-test and local strict page/chunk health. A real provider
processing smoke test, when authorized, must use synthetic files and report
the exact tested model; fixture transport success does not prove output quality.

Before any migration, save a private recovery snapshot. Roll back code/build
through NeuralDeep's verified manager; restore only metadata written by the
failed migration and retain all referenced originals. Do not roll back unrelated
user activity, credentials, Voice topic state or task receipts. Record exclusions
and private backup location without publishing it. Obtain the immediate service
lifecycle approval required by the local workflow. Finish with a local delivery
report mapping mother commits to NeuralDeep commits, test evidence, remaining
limitations and an explicit list of preserved architectural differences.
