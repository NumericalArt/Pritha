---
id: task-chat-evolution-roadmap
type: workflow
status: in-progress
created: 2026-09-04
updated: 2026-09-05
topics: [task-chat, native-history, attachments, fleet, neuraldeep]
tools: [Pritha, Codex, Next.js]
sources: [operator-approved-task-chat-roadmap-2026-09-04]
related:
  standards: [04_standards/control-center-codex-chat-api-contract.md, 04_standards/pritha-good-state-alignment.md]
  workflows: [07_workflows/control-center-staged-release.md]
supersedes: []
superseded_by: []
memory_domain: pritha-self
subject:
  kind: workflow
  id: task-chat-evolution
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Task Chat evolution roadmap

The operator approved this roadmap on 2026-09-04. All product text is English.
Native history remains canonical. Never infer obsolete format from a runtime
version change. Preserve unavailable chats until the operator archives them.

| Stage | Dependency | Delivery | Status |
| --- | --- | --- | --- |
| 0 | none | Roadmap and per-stage implementation plans | recorded |
| A | 0 | Stable storage identity, verified recovery, truthful history states | implemented; release pending |
| B1 | A | Unified Voice list and instance-local Archive / Show archived / Restore from archive | implemented; release pending |
| B2 | B1 | Complete Markdown Copy response | implemented; release pending |
| C | B2 | File selection, drop, clipboard images, all original file types and model capability checks | implemented; release pending |
| Transfer | each tested release | Pinned fleet/MacBook release and NeuralDeep adaptation instructions | instructions prepared; rollout pending |

Before each stage, author a coding plan under `03_reviews/` describing behavior,
data/API changes, migration, acceptance tests and rollback. Update its evidence
after testing. Keep releases A, B and C independently identifiable in Git.

## Acceptance

- A: an existing chat opens or explains why; Codex upgrades preserve access to
  the same storage; a different storage never passes merely because IDs look
  alike. Recovery preserves native IDs, task links and delivery receipts.
- B: Legacy disappears into one deduplicated Voice list. Local archiving can
  hide an active task without stopping it or moving a Codex rollout. Restore
  survives reload; new events never undo the operator's archive choice.
  Copy response preserves all assistant Markdown and excludes tool logs.
- C: all file types can be delivered as originals; images use a verified
  multimodal path. Media processing happens on request, not on upload. Files
  remain available from history. A failed upload or uncertain send retains the
  draft and never duplicates a turn. No silent file discard or model switch.

## Delivery boundaries

Use the 2026-08-28 reliable Control Center baseline, plus the Voice baseline.
Preserve unrelated work and instance isolation. Run focused tests, typecheck,
production build, desktop/mobile UI, privacy audit, self-test and strict page
and chunk health. Commit and push tested code. Prepare staged releases in order
main, dasha, sasha, marina; stop on failure and roll back the affected instance.
Immediate lifecycle approval remains required before modifying running services.
The MacBook updates locally to the same pinned commit without copying private data.

NeuralDeep receives a behavior/contract/test porting guide tied to actual
release commits. Preserve its CLI runner, Voice routing, isolated storage,
credentials and provider errors. Validate each provider/model's attachment
capabilities, including model changes in existing conversations. Unknown
multimodality must be explained, never assumed.

## Release anchors

- A: `79ee5a4` — verified history binding recovery.
- B: `a1fd2fa` — unified local archive and complete response copy.
- C: `71f5be8` — original attachments, capability checks and earlier history pages.
- C cumulative candidate: `854a420` — includes transfer documentation and the
  typed history fixture correction; standalone typecheck passes at this pin.

Each is an implementation anchor. No production deployment is claimed. Keep
these releases sequential and publish the next main target only after the
previous release passes its staged rollout. The updater pins exact origin/main;
do not bypass that check to deploy an arbitrary ancestor or newer commit.

## Plans, evidence and transfer

- [Release A coding plan](../03_reviews/2026-09-04-task-chat-release-a-plan.md)
- [Release B coding plan](../03_reviews/2026-09-04-task-chat-release-b-plan.md)
- [Release C coding plan](../03_reviews/2026-09-04-task-chat-release-c-plan.md)
- [Delivery evidence and next release transaction](../11_agents/reports/2026-09-05-pritha-task-chat-evolution-delivery-report.md)
- [MacBook update procedure](../docs/update-second-local-macbook.md)
- [NeuralDeep adaptation guide](../docs/neuraldeep-task-chat-adaptation.md)

Final isolated self-test passed: 508 unit tests, no critical regressions.
Desktop/mobile Task Chat verification passed 12 scenarios; strict /codex and
/task-chat health passed including 11 JavaScript chunks. A local legacy-service
audit warning is recorded in the delivery report. Production rollout is held
by pre-existing uncommitted memory work in the primary checkout, plus the
workflow's immediate lifecycle approval boundary. No private state was copied
to replicas and no running production service was changed.
