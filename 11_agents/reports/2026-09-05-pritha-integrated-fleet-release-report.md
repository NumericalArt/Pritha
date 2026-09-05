---
id: pritha-integrated-fleet-release-2026-09-05
type: agent-deployment-report
status: deployed
created: 2026-09-05
updated: 2026-09-05
topics: [task-chat, history, archive, attachments, settings, memory, staged-release, fleet]
tools: [Pritha, Codex, Git, Next.js, Playwright]
sources: [operator-authorized-integrated-release-2026-09-05]
related:
  workflows: [07_workflows/task-chat-evolution-roadmap.md, 07_workflows/control-center-staged-release.md]
  reviews: [03_reviews/2026-09-05-pritha-integrated-release-plan.md]
  standards: [04_standards/control-center-codex-chat-api-contract.md]
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

# Integrated Pritha release

The operator authorized committing all pending work, updating local main and
GitHub, and performing the managed main → Dasha → Sasha → Marina rollout plus
the running MacBook instance. NeuralDeep stays a separate adaptation.

## Exact source points

- Memory: `8be310d89ce530aecbab470ba4d339295b8af40e` preserves the nine original
  pending memory edits and adds instance environment resolution to memory
  entrypoints. No database, embedding binary or credential was committed.
- Integrated features and Settings: `4c52125c7c29bea4b6ac8ffea09644acdc794424`.
  Includes history A, archive/copy B, attachments C and the numeric Settings
  validation/draft fix. Settings summary now reads current status per request.
- Final executable release: `1c0ed2c42a20e02f1d1bf931001544e5eb113315` adds the
  Finder fingerprint correction and fixed web dependency versions. It contains
  the preceding commits; no reset, force-push or unrelated-work discard occurred.
- Release tooling: `4467828d6b8e92dfbf0c360a1804f2809f4ce296` verifies shutdown
  before rollback and isolates the music test helper's temporary modules. This
  changes no compiled UI source or dependency. The report/documentation commit
  containing this artifact is the final repository synchronization point.

## Verification

- Isolated full self-test passes 513/513 unit tests, Markdown validation, memory
  rebuild, smoke, privacy and Telegram dry-run; no critical regressions.
- 15 desktop/mobile browser scenarios pass: verified history recovery,
  archive/restore, full response copy and clipboard denial, original file
  upload/drop/paste/history, attachment-only creation, retry and older pages,
  numeric drafts and milliseconds, App/CLI preference, invalid save, catalog
  selection, persisted values and current Settings status.
- Standalone typecheck and production build pass. Strict /codex, /task-chat and
  /settings checks pass with 13 JavaScript chunks in the candidate.
- Actual image optimization returns the expected 64-pixel WebP through sharp
  0.35.0/libvips 8.18.3. The pinned web stack is Next 16.2.11, PostCSS 8.5.23,
  nanoid 3.3.18 and sharp 0.35.0; npm audit reports zero findings as verified on
  2026-09-05. This is a dated dependency audit, not a guarantee about future
  advisories or every possible application vulnerability.
- Seven focused rollout/isolation checks pass, including failed-health rollback,
  pinned/clean Git checks, real registry-change rejection, harmless Finder
  changes, protected dotfiles and changed/dangling symlinks.
- Final follow-up self-test passes all 518 unit tests and all quality gates,
  with no critical regressions. Ten focused updater scenarios pass after the
  rollback correction. The earlier 513-test result refers to the compiled UI
  release before these five new release-tool regression tests were added.

## History and user data

On the main instance, the reported old Direct Chat was verified against its
native storage and restored through the new API: all six turns are readable,
continuation is enabled and six response-copy controls are visible. An older
Voice record was also restored and its original history is readable; its
existing read-only continuation policy remains enforced. No old prompt was
replayed, no native transcript was rewritten and no chat was auto-archived.
Other eligible old bindings expose Restore access; unavailable originals retain
an explanation and their records.

Each instance has its own private preflight snapshot and managed rollback build.
Configuration, registries, credentials, history and attachments were not copied
between instances. Live receipts and originals are retained. The study checkout
found on the MacBook was not the running Pritha and remains untouched.

## Release exceptions investigated

The first MacBook attempt stopped before a service switch because Finder changed
`.DS_Store` while a release directory was created. runtime.env and the agent
registry matched their private backup; child-agent fingerprints were unchanged.
A subsequent npm install hit a transient ENOTEMPTY error in a dependency
directory and was retried before service switching. The final updater ignores
only regular Finder metadata files, records that
exception and still protects similarly named links/directories and other files.

A later MacBook cold start exceeded the initial health budget. Its rollback
ignored a manager stop-grace failure; the restored prior build needed a managed
start after the delayed child exited. The service was recovered, then the new
build deployed successfully with invocation budgets of 180 seconds for startup,
20 seconds per request and 120 seconds for rollback health. Matching build ID,
manager ownership and unchanged private fingerprints were verified. Subsequent
strict checks passed all five pages and 13 chunks, and a serial self-test passed
all 513 tests and live health at its normal timeout. No foreign process or other
service was killed.

The release-tool follow-up now requires explicit manager success, retries only
the specific stop-grace error once and preserves both builds if stop remains
unconfirmed. `rollback-stop-failed` cannot be reported as completed rollback.
Ten updater scenarios pass, including delayed recovery, permanent delay,
ownership refusal and malformed/missing success replies. An existing music
test helper also received private temporary directories after a concurrent
transpilation race was reproduced; production music behavior is unchanged.

An initial main self-test exceeded UI request timeouts while another local build
was running. All unit/quality checks passed; a serial self-test and five-page
strict health recheck passed afterward. The existing legacy launchd audit warning
was retained; no old Telegram/web job was modified to silence it. Private network
page checks also required a bounded 15-second request budget on the trusted peer.

## Final deployment evidence

All five ordinary instances deployed the exact cumulative UI source pin
`1c0ed2c42a20e02f1d1bf931001544e5eb113315` through their own managed transactions.

| Instance | Managed UI release | Isolation | Strict pages / chunks | Transport |
| --- | --- | --- | --- | --- |
| Main | deployed | unchanged | 5 / 13 pass | App default; CLI available |
| Dasha | deployed | unchanged | 5 / 13 pass | App default; CLI available |
| Sasha | deployed | unchanged | 5 / 13 pass | App default; CLI available |
| Marina | deployed | unchanged | 5 / 13 pass | App default; CLI available |
| MacBook | deployed after recovery | unchanged | 5 / 13 pass | App default; CLI available |

The checked pages are /voice, /agents, /codex, /task-chat and /settings. Main and
MacBook serial self-tests pass without critical regressions. MacBook resolves
the desktop-bundled Codex 0.153.3 for App Server; its standalone CLI 0.36.0
responds successfully to `exec --help` and remains the separate fallback.
No model request was launched merely to check transport availability. Existing
instance-specific timeout and sandbox preferences were preserved.

The final repository synchronization contains only release CLI tooling, tests
and authored documentation beyond the deployed UI pin. The entire UI source
and lockfile tree remains identical; a documentation refresh does not restart
healthy services. Rebuild each instance's own authored-memory index and retain
private verification receipts for the resulting common repository commit.
Private manifests retain actual paths, build IDs, process ownership, snapshot
fingerprints and timestamps. No such machine identifiers are published here.

## NeuralDeep and device boundary

Use [the NeuralDeep adaptation guide](../../docs/neuraldeep-task-chat-adaptation.md)
with these exact source pins. Map changes onto its CLI/provider and Voice-topic
architecture; do not replace those modules wholesale or assume every model is
multimodal. The separate NeuralDeep checkout and service were not changed.
The MacBook procedure uses its verified manager environment and correct running
checkout. Browser viewport tests do not claim a physical phone clipboard test.
