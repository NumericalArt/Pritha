---
id: task-chat-composer-tools-implementation-review-2026-10-29
type: assessment
status: completed-with-limitations
created: 2026-10-29
updated: 2026-10-29
topics: [pritha, control-center, task-chat, quote-reply, image-annotation, regression-testing]
tools: [Pritha, Codex, TypeScript, React, Playwright, Chromium, WebKit, Canvas]
sources:
  - interfaces/control-center/src/lib/codex-chat/quote-reply.ts
  - interfaces/control-center/src/lib/codex-chat/image-annotation.ts
  - interfaces/control-center/tests/e2e/task-chat-composer-tools.spec.ts
  - tests/control-center-composer-tools.test.mjs
related:
  workflows:
    - 07_workflows/task-chat-composer-tools-compatibility.md
    - 07_workflows/control-center-staged-release.md
  standards:
    - 04_standards/pritha-good-state-alignment.md
  contracts:
    - 11_agents/contracts/2026-05-28-pritha-claude-code-adapter-agent-contract.md
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
recommendation: review
source_version: working-tree-based-on-e976b62; composer-tools-v1
verified: 2026-10-29
---

# Task Chat composer tools: implementation review

## Delivered behavior

The operator approved implementing the two UX patterns in Control Center:
quote a selected passage from a completed Pritha answer and annotate a draft
image on demand. The canonical route is `/task-chat`; `/codex` remains a
query-preserving redirect. The browser implementation was authored locally;
neither reference plugin nor a new graphics/SDK dependency was installed.

Quotes append editable Markdown to the existing chat draft, preserve Unicode,
code indentation and line breaks, enforce the 64,000 character total limit,
and never auto-send. A selection must belong to one eligible message body in
the current chat. User messages, streaming answers, activity and controls are
excluded. Both ordinary and paginated history rendering participate without
eagerly fetching full historical responses.

The lazy-loaded editor offers arrow, rectangle, pen, text, colours, widths,
font sizes, undo and redo. Static PNG/JPEG/WebP inputs are bounded at 16 million
pixels, 8192 pixels per side and 100 MiB. Export is PNG in the decoded original
dimensions, preserving alpha and JPEG orientation. Unsupported images retain
ordinary upload/send behavior. Unsaved changes require confirmation to discard.
Native dialog containment is supplemented by an explicit Tab cycle for WebKit.

Applying an edit uploads a new immutable attachment under a new UUID. The
prior draft row remains until the copy is confirmed and verified. Retries reuse
the exact exported bytes and ID. Copy replacement preserves ordering/count,
including a full ten-file draft. The first original remains available through
an optional draft reference, subject to existing unreferenced-file expiry.
Reediting starts from the flattened copy, and return-original checks availability.

The original upload API, server storage, provider protocols, natively stored
history and delivery coordinator were not changed. Pending message/queue
snapshots remain immutable. Draft-scoped locks prevent editing their attachments;
stop and native approval/input operations keep their existing behavior. Async
results verify ownership and cancellation before publishing. Restore errors are
scoped to their original draft. Reload during upload restores the last confirmed
attachment, and no PNG bytes or editable layers enter sessionStorage.

## Baseline alignment and issues found

Good State Alignment was run for Task Chat/composer/attachments before changes.
The reliable Codex Control Center and voice/music baselines were relevant; this
is an aligned additive change. The source tree was clean at the start.

The previously hanging native-secret cross-worker test was reproduced with a
bounded run. It requires a Unix socket unavailable in the restricted sandbox.
The same test passed outside that restriction without changing runtime code.
The targeted chat/history regression run then passed all 50 tests.

Browser checks caught and led to fixes for returning focus to the actual opener,
fitting portrait images inside the workspace, opaque modal backgrounds, and
keeping Tab inside the dialog under WebKit. Tests assert exported PNG dimensions,
actual marked pixels, alpha, EXIF orientation, source-byte preservation and the
attachment IDs in submitted payloads. Test fixtures wait for the selected chat,
rather than typing into the initial pre-navigation empty composer.

The first full browser run passed 113/114 tests. Its sole failure was an existing
Settings regression test that used `gpt-5.5` for the `very_high` effort alias.
The unchanged runtime correctly returned `unavailable_codex_model` for that
catalog entry. The pre-change test was verified in HEAD and the Settings/runtime
implementation had no task diff. The test now uses `gpt-5.6-sol`, the same available
model exercised by its remaining assertions, and still asserts normalization to
`xhigh`. No runtime availability checks were weakened or model support added.

## Verification

- Full unit regression: 888 passed in the self-test quality gate; no skips/failures.
- Composer unit/storage contracts: 7 passed, including real private attachment
  storage, conflicting original writes and copy-only message preparation.
- Typecheck and whitespace/diff checks: passed.
- Golden checks: passed after correcting nested subject frontmatter and allowing
  generated memory writes to the configured external state root.
- Self-test: pass, zero warnings and zero regressions; embeddings restore passed.
- Targeted Chromium browser suite before final strict-health addition: 19 passed.
- Final targeted WebKit suite: 20 passed, zero skips/flaky/failures, including
  strict health for candidate pages and their JavaScript chunks.
- Final post-accessibility-fix targeted run: 40 passed across Chromium and WebKit
  (20 each), zero skips/flaky/failures. Apply and Cancel both restore focus to the
  appropriate attachment control, including after its immutable ID changes.
- Full final Chromium browser suite on the final implementation: 114 passed,
  zero skips/flaky/failures (including existing Settings, Voice, Agents, themes,
  scroll, history, concurrency and attachment tests).

Checks ran in disposable browser state, a separate build directory and a fresh
test port. Existing Turbopack NFT trace warnings remain; the candidate build
succeeded. Full-suite output, screenshots and synthetic browser traces are local
generated artifacts and are not included in this tracked report.

## Claude Code preparation

The linked compatibility workflow and offline JSON fixture capture reference
plugin versions/commits, required UI surfaces, edited-image delivery checks and
manual recheck triggers. The fixture is deliberately `not-verified` and has
`runtimeEnabled: false`. Offline tests prove portable formatting/image contracts,
not Claude live compatibility. The old adapter contract remains draft; no child
agent, provider registration, credentials or Claude configuration was created.

## Remaining operational boundaries

At the end of implementation, native Safari and physical iPhone checks had not
been performed. Installed
WebKit covers the automated Safari-engine scenarios, including touch input,
without claiming a native-device manual trial.

At that point, production deployment, service restart and fleet rollout had
not been performed.
Any release must follow the staged-release workflow with its separate immediate
lifecycle authorization, verified candidate/instance identity, operational health
and rollback. Git commit/tag/push was not requested or performed.

The operator subsequently authorized a separate production update on 2026-10-29.
The main instance was released from implementation commit `3a3c36d`; native
Safari quote, annotation and original-restore checks passed. Replicas were not
updated. See `03_reviews/2026-10-29-task-chat-composer-tools-release-review.md`
for deployment evidence and remaining physical-device/peer limitations.

Rollback needs no server migration: revert the UI additions or restore the prior
compiled release through the runtime manager, preserving private attachment
storage. An older UI ignores the optional original reference; the selected copy
remains an ordinary attachment. Existing files are never deleted for rollback.
