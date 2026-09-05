---
id: task-chat-release-a-plan-2026-09-04
type: review
status: in-progress
created: 2026-09-04
updated: 2026-09-04
topics: [task-chat, native-history, migration]
tools: [Pritha, Codex, TypeScript]
sources: [operator-approved-task-chat-roadmap-2026-09-04]
related:
  workflows: [07_workflows/task-chat-evolution-roadmap.md, 07_workflows/control-center-staged-release.md]
  reports: [11_agents/reports/2026-08-28-pritha-good-state-baseline-reliable-codex-control-center.md]
supersedes: []
superseded_by: []
memory_domain: pritha-self
subject:
  kind: review
  id: task-chat-release-a
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Release A implementation plan

## Evidence and alignment

The current stateIdentityHash includes provider, binary version and literal
CODEX_HOME (or the string default). This incorrectly classifies upgrades as
storage changes. The UI then replaces a blocked history request with [] and
marks it ready. Alignment: aligned with the August 28 baseline; native history,
private state, no replay and staged lifecycle remain protected. The alignment
helper currently retrieves an older Voice baseline, so the newer Control Center
baseline was also inspected directly.

## Implementation

1. Add a versioned storage identity calculated from the canonical effective
   Codex home, independent of binary version. Keep provider selection separate.
   Pin the child process CODEX_HOME to that exact effective home.
2. Preserve the old hash as migration evidence. Recognize only hashes computed
   for this same home using locally cached observed runtime versions. A legacy
   candidate is probe-required, never already bound. Missing or unrecognized
   evidence remains blocked; do not search other homes.
3. Inspect the exact native thread using read-only thread/read. Require matching
   thread ID and canonical project cwd before allowing Restore access. The
   explicit recovery endpoint repeats verification, writes a private immutable
   pre-migration registry backup and atomically changes only identity fields.
   No thread/start, resume or turn replay is part of recovery.
4. Return separate history availability metadata on detail; loading history
   always calls the history endpoint and surfaces typed failures. Distinguish
   identity mismatch, recoverable binding, missing thread, unsupported format,
   transient failure and truly empty history. Only a successful verified empty
   read may display the new-chat empty state. Preserve last loaded turns on a
   failed refresh and disable send until history is ready and binding permits it.
5. Native formats already understood by the installed Codex use its read path;
   do not rewrite native rollouts or invent a lossy generic format converter.
   Expose recovery of the known legacy binding format as a separate versioned
   conversion, preserving the original and documenting its result. Unsupported
   native formats receive an explicit error; future native converters require
   format-specific evidence and tests.

## Verification and rollback

Behavior tests: implicit vs explicit default home and symlinks; version-only
upgrade; different home; unknown old hash; wrong thread/cwd; missing/corrupt
native data; repeated recovery; preserved receipts/links and backup; no native
mutation during inspection; blocked UI versus successful empty history.
Run existing Task Chat tests, typecheck, production build and desktop/mobile
fixtures. Real history is inspected read-only, never submitted as a new turn.
Rollback uses the staged release's prior code plus the immutable private
registry backup while the service is stopped; do not restore over new turns.

## Results

Implemented storage-v2 binding recovery and truthful history failures. Targeted
unit tests: 20/20 pass. Desktop/mobile recovery fixtures: 2/2 pass. Typecheck
and isolated production build pass (existing NFT trace warning only). A
read-only check of the reported original thread verified its workspace, ID,
legacy hash evidence and six native turns. No source transcript was copied and
no turn was replayed. Production/fleet lifecycle approval is still pending.
