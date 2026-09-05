---
id: pritha-task-chat-evolution-delivery-report-2026-09-05
type: agent-delivery-report
status: implemented-release-pending
created: 2026-09-05
updated: 2026-09-05
topics: [task-chat, history-recovery, archive, clipboard, attachments, fleet]
tools: [Pritha, Codex, Next.js, Playwright]
sources: [operator-approved-task-chat-roadmap-2026-09-04]
related:
  workflows: [07_workflows/task-chat-evolution-roadmap.md, 07_workflows/control-center-staged-release.md]
  standards: [04_standards/control-center-codex-chat-api-contract.md, 04_standards/pritha-good-state-alignment.md]
  reviews: [03_reviews/2026-09-04-task-chat-release-a-plan.md, 03_reviews/2026-09-04-task-chat-release-b-plan.md, 03_reviews/2026-09-04-task-chat-release-c-plan.md]
supersedes: []
superseded_by: []
memory_domain: pritha-self
subject:
  kind: pritha
  id: pritha
privacy: public
retention: durable
review_status: reviewed
confidence: high
---

# Task Chat evolution: implementation delivery

All three feature stages are implemented and verified in an isolated worktree
on `codex/task-chat-reliability`. Production services, native history, primary
checkout changes and replica private state were not modified. This report is
implementation evidence and a release handoff, not production acceptance.

## Implementation anchors

| Stage | Full commit | Result |
| --- | --- | --- |
| A | `79ee5a403f813f483768850213481f7433cc1609` | Stable storage identity; verified recovery; truthful history errors |
| B | `a1fd2faa54817fa847307f0738d51236eaa25739` | Unified Voice list; local Archive/Restore; complete response copy |
| C | `71f5be857702227acedc9a89f7c72b07a7af11a7` | Original file upload/history; multimodal checks; retry safety; earlier pages |

Cumulative C candidate: `854a4203c7241bc274e6a12ebaca7265d80faf7e`, including
transfer documentation and the typed restored-history fixture correction.
Standalone typecheck passes at this pin. Use this candidate or an explicitly
recorded later documentation-only descendant for the final C release gates.

The roadmap and separate coding plans record sequencing, contracts, migration
and rollback. The reliable Control Center Good State Baseline dated 2026-08-28
was read directly alongside the Voice alignment result. Native transcript
ownership, no prompt replay, private state isolation and managed releases remain
unchanged. The initial short inline YAML subject syntax was corrected in all
implementation commits before publication, using the project's supported nested
form; the full self-test then passed.

## Verification evidence

| Check | Result and scope |
| --- | --- |
| A focused unit + desktop/mobile | 20 unit tests; 2 history recovery UI scenarios |
| B focused unit + desktop/mobile | 22 unit tests; 6 history/archive/copy/existing-flow scenarios |
| Final Control Center unit suite | 142/142 passed |
| Final whole-project self-test | 508/508 unit tests; environment, privacy, Markdown validation, memory rebuild, smoke and Telegram dry-run passed; no critical regressions |
| Typecheck and production build | Passed for each feature stage; final UI built in isolated checkout |
| Final Task Chat browser suite | 12/12 passed, including desktop/mobile, clipboard denial, upload/drop/paste, retry, rejected send, attachment-only creation, history reload and older-page failure/retry |
| Real original upload/download | 12 MiB payload passed through actual HTTP/proxy; downloaded bytes equal original |
| Native filesystem access | Installed Codex confirmed the exact isolated original is a regular accessible file |
| Strict health | /codex and /task-chat passed; 11 referenced JavaScript chunks passed |
| Final diff/privacy | Whitespace checks and strict tracked privacy audit passed; fixtures contain synthetic data |

Unit tests cover eight file classes, integrity, quota, expiry/retention,
malformed metadata, symlinks, unknown/image-incompatible models, historical
images, archive aliases and accepted-but-unacknowledged native delivery followed
by restart/retry without duplicate dispatch. Copy includes a long Markdown
answer with multiline code and Unicode. The 16 MiB history page ceiling fails
visibly rather than cutting content; earlier pages have an explicit control.

Read-only inspection using the installed Codex verified six Direct Chat records
and 169 Voice bindings with exact native ID/workspace agreement. Two Direct
records returned `thread not loaded`; the gateway classifies that as missing
native history and preserves their records. All inspected old bindings matched
cached local version evidence. The originally reported thread's six turns were
readable. No transcript, original attachment or private identifier is in this
report, and no native mutation or historical turn replay was used to verify it.

The installed model catalog returned explicit inputModalities for all nine
advertised models, with image support in eight. These are observed capability
counts, not a universal Codex claim. Model processing quality was not tested by
billable live turns. Real phone clipboard and trusted-peer access remain final
device checks; viewport fixtures do not substitute for them.

The isolated self-test reports one legacy launchd-root-audit warning because
the temporary developer checkout has no matching legacy service jobs. No job
was installed or changed to silence it. A previously observed Next build NFT
trace warning did not fail typecheck/build. Recheck actual per-instance service
and environment warnings during rollout.

## API and retention details

The v1 API additions preserve text clients. History availability is distinct
from continuation permission. Restore access verifies the native thread before
atomically changing only the binding identity, retaining a private backup.
The old native format was readable; no speculative transcript converter was
introduced. Unsupported formats remain preserved with an explanation.

Archive is only per-instance visibility, independent of task activity and
native Codex archive. Known aliases are retained and combined only after
storage verification. New activity cannot undo archive. Files are private
originals with durable message links. Limits: 10/message, 100 MiB/file,
250 MiB/message, 10 GiB/instance. Unreferenced uploads expire after 24 hours on
a subsequent upload; referenced originals never expire automatically. Browser
reload requires reselecting unsent files; sent history survives reload/restart.
No automatic extraction, transcription, unpacking or code execution occurs.

## Release transaction still required

Read-only fleet preflight stopped at main with `checkout_dirty`: nine existing
memory implementation/test files are uncommitted. They were present before this
work and are preserved. Dasha, Sasha and Marina passed the corresponding
preflight checks. No release transaction was started. The current main release
remains the prior accepted code.

1. Coordinate completion/preservation of the existing primary memory work.
   Do not reset or automatically stash another task's changes. If that work
   produces new main commits, reconcile/retest the release branch and refresh
   all target pins; do not force-push main or conceal divergence.
2. Publish and stage A, then B, then C, holding each next main advancement until
   the previous release passes. The current updater requires the target to
   equal origin/main. Feature commits may be published to the review branch
   together without switching running services. Documentation follow-ups can
   accompany the final accepted target; record its full SHA explicitly.
3. Run the per-release plan and isolated build/verification for that exact pin.
   Back up each instance's private registry/native history according to policy.
   Keep migration backups and originals private and instance-local.
4. Immediately before service mutation, obtain explicit approval under
   `07_workflows/control-center-staged-release.md`. Apply main first, then Dasha,
   Sasha and Marina to the same pin, stopping on the first failure. Check exact
   health-v2 release identity, /codex, /task-chat and all referenced chunks, plus
   isolation fingerprints and Git cleanliness. Do not skip explicit strict
   page/chunk checks merely because the manager's health endpoint passed.
5. Verify real old history read/recovery without replay, active Voice archive,
   clipboard and a synthetic attachment delivery with the selected model.
   Repeat after each instance. Keep rollback builds until acceptance.
6. Run the MacBook update locally on that machine to the accepted pin using
   `docs/update-second-local-macbook.md`. Peer access remains unverified until
   tested there. Do not copy private settings, history or originals.
7. Give NeuralDeep `docs/neuraldeep-task-chat-adaptation.md` together with the
   final release result. Its separate CLI/Voice/provider architecture is
   adapted by capability and contract, never overwritten wholesale.

Rollback restores the managed prior build/service state. Restore a migration's
private registry snapshot only before new activity makes it stale; otherwise
revert the affected identity fields under a stopped writer while preserving all
new receipts, links, archive decisions and attachment metadata. Preserve every
referenced original. Rollback is not permission to rewrite native history or
restore an entire old state directory over newer user activity.

Production acceptance, per-instance rollout results and NeuralDeep's own local
implementation commit must be appended after those actions actually occur.
