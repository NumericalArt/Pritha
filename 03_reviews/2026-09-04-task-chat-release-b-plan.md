---
id: task-chat-release-b-plan-2026-09-04
type: review
status: implemented-release-pending
created: 2026-09-04
updated: 2026-09-05
topics: [task-chat, archive, clipboard, voice]
tools: [Pritha, Codex, TypeScript]
sources: [operator-approved-task-chat-roadmap-2026-09-04]
related:
  workflows: [07_workflows/task-chat-evolution-roadmap.md, 07_workflows/control-center-staged-release.md]
supersedes: []
superseded_by: []
memory_domain: pritha-self
subject:
  kind: review
  id: task-chat-release-b
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Release B: local archive and complete response copy

## Decisions

Aligned with the accepted reliable Control Center baseline. Archive is local
visibility, not native lifecycle; active tasks continue. Persist visibility in
the private registry atomically. Merge only bindings with a verified storage-v2
identity, equal native thread ID and equal group. Keep every original row and
merge task-link metadata in the list view. Any archived alias hides the logical
chat, including a later-created alias; restoring updates all known aliases.
Unverified legacy hashes never authorize deduplication.

## Implementation

- Add `view=all` for the unified list, retaining old current/legacy queries for
  existing clients. Apply archive filtering after alias visibility is resolved,
  before search and pagination. Metadata/turn events must preserve archive.
- Add local POST archive/unarchive routes returning ThreadSummary. They operate
  without a running Codex process, preserve lastStatus, links and receipts, and
  never call native archive/unarchive/interrupt. A saved archived deep link stays
  readable; composing there explains Restore from archive first.
- Remove the Legacy controls from the current UI. Add the selected row's small
  Archive/Restore from archive action and Show archived/Show active toggle.
  Track list request generation to discard results from an earlier group/view.
  A toggle clears selection and old pagination while preserving per-chat drafts.
- Copy response joins assistant_message Markdown in native order per turn,
  excludes user/tool/reasoning items and stays disabled while the turn is active.
  Do not truncate assistant Markdown during normalization. Show Copied or a
  clipboard error, with keyboard-accessible buttons and mobile-visible controls.

## Verification and rollback

Tests cover same/different storage deduplication, legacy separation, combined
task links, search/pagination after archive, active-task archive without native
calls, persistence/restart, late aliases, restore and event behavior. Clipboard
tests cover multiple assistant messages, code, Unicode, >256k characters,
interrupted turns and permission failure. Desktop/mobile fixtures exercise the
actual archive and copy controls. Run typecheck, existing Task Chat tests and
isolated build. Roll back code via staged release; preserve private archive
flags and original bindings. No native transcript migration is involved.

## Results

Implemented. Targeted unit tests: 22/22 pass. Desktop/mobile history, archive,
copy and existing Task Chat flow: 6/6 pass. Typecheck and isolated production
build pass (existing NFT trace warning). Production remains unchanged.

Implementation commit: `a1fd2fa`. Final cross-stage release checks and fleet
preflight are recorded in the Task Chat delivery report.
