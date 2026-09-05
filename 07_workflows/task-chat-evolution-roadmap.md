---
id: task-chat-evolution-roadmap
type: workflow
status: delivered
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
| A | 0 | Stable storage identity, verified recovery, truthful history states | deployed |
| B1 | A | Unified Voice list and instance-local Archive / Show archived / Restore from archive | deployed |
| B2 | B1 | Complete Markdown Copy response | deployed |
| C | B2 | File selection, drop, clipboard images, all original file types and model capability checks | deployed |
| Transfer | each tested release | Pinned fleet/MacBook release and NeuralDeep adaptation instructions | ordinary fleet deployed; NeuralDeep guide delivered |

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
The operator authorized the integrated main/fleet/MacBook update on 2026-09-05 after
reviewing the lifecycle boundary. That approval covers this prepared transaction;
future unrelated lifecycle actions still use the staged-release workflow.
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

Each remains an independently reviewable implementation anchor. On 2026-09-05
the operator explicitly requested committing all pending changes and releasing
the combined result. The integrated release plan supersedes the earlier proposal
to publish three separate origin/main targets. Pin one reviewed full commit for
main, Dasha, Sasha, Marina and the running MacBook instance. Do not bypass the
updater's exact origin/main check.

## Plans, evidence and transfer

- [Release A coding plan](../03_reviews/2026-09-04-task-chat-release-a-plan.md)
- [Release B coding plan](../03_reviews/2026-09-04-task-chat-release-b-plan.md)
- [Release C coding plan](../03_reviews/2026-09-04-task-chat-release-c-plan.md)
- [Delivery evidence and next release transaction](../11_agents/reports/2026-09-05-pritha-task-chat-evolution-delivery-report.md)
- [MacBook update procedure](../docs/update-second-local-macbook.md)
- [NeuralDeep adaptation guide](../docs/neuraldeep-task-chat-adaptation.md)

The feature-stage isolated self-test passed 508 tests and 12 Task Chat browser
scenarios. The integrated release adds verified instance-memory fixes and
Settings draft/validation tests; final evidence and per-instance deployment
results are recorded in the integrated release report. The nine original memory
edits were committed as `8be310d89ce530aecbab470ba4d339295b8af40e` and merged into
the release branch. Private state remains local to each instance.

- [Integrated release plan](../03_reviews/2026-09-05-pritha-integrated-release-plan.md)

- [Integrated deployment report](../11_agents/reports/2026-09-05-pritha-integrated-fleet-release-report.md) — all five ordinary instances run the cumulative UI release `1c0ed2c42a20e02f1d1bf931001544e5eb113315`; later tooling/documentation synchronization is recorded separately. NeuralDeep implementation remains its own local task.
