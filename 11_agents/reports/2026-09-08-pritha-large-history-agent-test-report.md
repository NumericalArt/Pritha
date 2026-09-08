---
id: pritha-large-history-agent-test-report-2026-09-08
type: agent-test-report
status: passed
created: 2026-09-08
updated: 2026-09-08
topics: [task-chat, large-history, regression-testing]
tools: [Pritha, Codex, Next.js, Playwright, Node.js]
sources: [docs/task-chat-large-history.md, tests/control-center-large-history.test.mjs, tests/control-center-history-transport.test.mjs]
related:
  workflows: [07_workflows/control-center-staged-release.md]
  standards: [04_standards/pritha-good-state-alignment.md]
supersedes: []
superseded_by: []
memory_domain: pritha-self
subject:
  kind: workflow
  id: task-chat-large-history
privacy: public
retention: durable
review_status: reviewed
confidence: high
source_version: Pritha base 11a3c016a7b2ec0f078484937e794df13d196969; desktop runtime 0.153.4; CLI runtime 0.153.0
verified: 2026-09-08
---

# Large Task Chat history patch: implementation and validation

## Outcome

Task Chat now requests bounded recent history, lazy activity pages and complete
original text parts. Dedicated read-only connections support both installed
Codex runtime families. Legacy consumers retain `/turns`. No native logs,
archive flags, receipts, execution connections or instance bindings are migrated.

A real read-only check of the affected large conversation returned 11 recent
turns in 36,456 bytes through either provider. Native page reads took 12 ms with
the bundled App runtime and 10 ms with the standalone CLI. A latest-turn activity
page was approximately 25 KiB and original answer text was readable separately.
The earlier full response measured 2,726,325 bytes. These timings measure local
reader execution after initialization, not cold startup, a phone's connection,
or the complete HTTP navigation journey. The diagnostic fixture used normalized
bindings without private attachment metadata; it establishes the payload reduction
without exposing private chat content or identifiers here.

## Safety and compatibility

Good State Alignment was checked for Task Chat history and App/CLI compatibility.
The changes retain native history ownership, private instance state, explicit
archive/recovery decisions, full-response copying, drafts and idempotent sending.
The implementation was validated in an isolated checkout before integration. User-authored
untracked work in the canonical checkout is preserved.

The reader has a 25-second absolute operation deadline, 35-second browser timeout,
256 KiB page envelope budget and 64 KiB body-part budget. Compatibility snapshots
and body caches are memory-only and bounded; expired positions produce errors
without clearing displayed history. Oversized native frames fail before parsing.
A transport retry cannot close the execution connection or send resume/turn calls.

## Validation

- Focused tests exercise 10,000 turns for both providers, thousands of commands
  within one turn, over 10 MiB of Unicode text reconstructed exactly, byte-bound
  activity pages, cross-storage cursors, expiry, content revision changes,
  coalesced compatibility reads and explicit runtime fallback.
- Transport tests exercise experimental read initialization, rejection of write
  methods, the native frame limit, transport retry and deadline isolation.
- Existing Goal, archive/recovery, attachments, turn idempotency and privacy
  regression tests are included in validation.
- Browser tests cover desktop/mobile layouts, archive/restore, failed older pages,
  preserved text, original attachments, lazy activity, complete Unicode copying,
  a response arriving after 13 seconds, and a modeled 1 Mbps / 300 ms transfer.
- The isolated production build is checked through `/api/health`, `/task-chat`,
  `/codex` and every JavaScript chunk referenced by those pages.
- Final focused run: 59 tests passed. Final isolated self-test: pass, 777 tests
  passed, zero failures/skips and no warnings. Environment, privacy audit,
  Markdown validation, memory rebuild, smoke tests and Telegram dry-run passed.
- Final isolated browser run: 19 passed, zero failures/skips/flaky tests. The
  production build, its type checking, health, both page routes and every
  referenced JavaScript chunk passed.
- Authored Markdown validates: 731 documents; disposable memory rebuild indexed
  731 documents and 6,834 chunks before final report wording was updated.

The first browser run exposed a stale fixture lacking `streamUrl`, and a later
assertion required a separate error-text element after adding its recovery button.
Both were fixed. The first broad self-test was constrained by sandbox loopback
restrictions; a permitted isolated rerun also found an outdated Goal fixture
import list, which was fixed without changing Goal behavior.

## Release boundary

No live service, Tailscale configuration, heartbeat or NeuralDeep instance was
changed. Managed deployment requires immediate separate lifecycle approval.
The previous compiled build remains the rollback anchor. A phone on the actual
trusted access path still needs post-deployment acceptance; simulated transfer
is not evidence of that path's health.

For NeuralDeep and headless CLI audit, see
`docs/neuraldeep-large-history-adaptation.md`. Its separate durable-source and
legacy 200-turn retention issue must be resolved in that checkout; the canonical
patch does not change Codex CLI's own terminal resume implementation.
