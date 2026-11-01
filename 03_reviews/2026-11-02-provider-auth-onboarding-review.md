---
id: provider-auth-onboarding-review-2026-11-02
type: review
status: verified-with-limitations
created: 2026-11-02
updated: 2026-11-02
topics: [pritha, provider-convergence, authentication, sandbox, onboarding]
tools: [Claude Code, macOS Keychain, sandbox-runtime, NeuralDeep]
sources:
  - https://code.claude.com/docs/en/authentication
  - https://code.claude.com/docs/en/setup
  - https://github.com/anthropics/sandbox-runtime/pull/431
related:
  workflows: [07_workflows/2026-11-01-pritha-provider-convergence-roadmap.md, docs/claude-connection.md]
  reviews: [03_reviews/2026-11-01-provider-convergence-dependency-audit.md]
  reports: [11_agents/reports/2026-11-01-pritha-provider-convergence-deployment-report.md]
supersedes: []
superseded_by: []
source_version: Claude Code 2.1.296; sandbox-runtime 0.0.81; deployed base 3853e0a
retrieved: 2026-11-02
verified: 2026-11-02
subject: {kind: pritha, id: pritha}
memory_domain: pritha-self
privacy: public
retention: durable
review_status: verified-automated-pending-live
confidence: medium
---

# Provider authentication and onboarding review

The candidate fixes two observed integration failures after the approved local
activation of `3853e0a`. It does not establish successful native Claude login,
fresh-account acceptance, Local recovery or complete factory acceptance. Those
gates remain explicit in the roadmap. No GitHub or other-computer rollout is
part of this change.

## Claude sign-in and isolation

The interactive native CLI inherited a synthetic `HOME`. On macOS, the same
read-only default-Keychain query succeeded with the OS account home and failed
with the synthetic home. This explains one reproducible cause of the observed
failure to save login; a subsequently locked login Keychain is a separate
operator-local condition. A real successful login is still required.

`scripts/claude/native-auth.mjs` now resolves the OS account home from `userInfo`,
while preserving this instance's private `CLAUDE_CONFIG_DIR`. The copied command
pins the code and state roots through the existing root-alias helper and quotes
paths safely. `scripts/claude-auth.mjs` resolves its own installation when invoked
from another directory and verifies saved authentication after a successful
interactive login. The host accepts bounded status metadata, never OAuth tokens.
The per-directory account design follows
[Anthropic's authentication guidance](https://code.claude.com/docs/en/authentication).

The trusted, unmodified native CLI receives read access to the current OS user's
Keychain directory; native task execution also permits its atomic credential
refresh writes. This is a directory-level grant, **not per-item Keychain
isolation**. The Keychain service and the CLI's dedicated configuration select
the account. Built-in model tools, user hooks, connectors and ambient API/OAuth
environment variables remain disabled. Model-requested commands execute through
separate host tool sandboxes and never receive the Keychain roots. API mode
continues to use a private home and the host API proxy without that grant.

The pinned sandbox runtime lacks one read-only sysctl permission needed by
Security.framework to name atomic Keychain files. The native runtime adds only
`security.mac.sandbox.sentinel` after checking the expected profile shape. This
matches the issue documented in the upstream
[sandbox-runtime change proposal](https://github.com/anthropics/sandbox-runtime/pull/431).
The proposal was reviewed as source evidence; it is not an installed upstream
release. No broader networking, Mach service lookup, user-home filesystem grant
or weaker nested sandbox is enabled.

A fresh disposable Keychain containing only a synthetic value proves the
permission's effect: write/read fails without it and succeeds with it. Other
tests cover the wrong ambient HOME, foreign session files, model-tool denial,
unsafe linked state, uncertain process exits, separate API credentials and a
copied command launched from another directory containing an apostrophe.
These automated tests do not perform browser account login or prove entitlement.

## NeuralDeep model identity

The live gateway can emit an incorrect model in an otherwise empty
`response.created` prelude. Such metadata now quarantines the complete bounded
response until an exact terminal model, valid stream and durable accounting
receipt have been verified. Every later prelude must remain empty and in
progress while quarantined. No text or tool is released on a provisional
identity. Invalid or missing terminal identity, foreign tool names, truncated
streams and failed accounting remain errors.

The sole added model equivalence is requested `gpt-oss-20b` and terminal
`openai/gpt-oss-20b`, verified in a live run. Another publisher, model size or
repeated prefix is rejected. `qwen3.8-flash-next` is not an alias for
`qwen3.8-27b`; a terminal substitution still fails. No user preset was silently
changed. A live synthetic host-file read and same-session continuation through
gpt-oss-20b succeeded and both process trees exited. This source-level evidence
does not yet attest to the next compiled production release.

## User-facing setup

Settings, bootstrap guidance, Start Here and the new
[Claude connection guide](../docs/claude-connection.md) describe the same path:
save native mode, copy one complete command, finish browser sign-in, wait for
verified status and run a first task. API setup remains a separate option.
CLI installation is an explicit prerequisite, using the
[official installation instructions](https://code.claude.com/docs/en/setup).
The documentation no longer describes all external task adapters as future work.

New-installation acceptance must use a fresh private state directory, verify
that an unrelated existing login is not imported, test the copy/paste command
from outside the checkout, finish a real sign-in and run/resume a real task.
No developer-only path editing, copied OAuth token or silent API fallback is an
acceptable substitute. Browser and first-task acceptance remain pending.

## Evidence and outstanding gates

- Initial full quality run: 1450/1452 tests passed; seven other groups passed.
  Failures were a new unreviewed legacy-name literal and a changed README slogan.
  The command now uses the common root-alias helper and the original core slogan
  is retained. No naming allowlist or guard was weakened.
- Corrected focused suite: 43/43 passed, no skips. It covers native auth, owned
  runner, NeuralDeep projection, bootstrap, naming and public installation docs.
- The next full run passed 1451/1452 cases and the other seven groups. Its one
  failure was a service fixture using a nonexistent root; the shared root helper
  correctly rejects that path. The fixture now supplies an existing root, with
  all credential/catalog operations still mocked. Service/auth verification
  passed 13/13. Production path validation was not weakened.
- Updated offline boundary audits passed: network 85/85, secrets 26/26, zero
  skips. The recovery copy of `3853e0a` passed five pages and twelve JavaScript
  chunks in a separate instance, with confirmed process-tree exit.
- The updated isolated production browser checks passed 12/12, with zero skips
  or flaky results. They cover native/API mode selection at 390px and 1440px,
  independent provider presets, stale updates and the actual settings routes.
- Final full quality: 1452/1452 tests, zero skips, all eight groups passed.
  Only pre-existing commit-prefix formatting warnings remain. The production
  staging build and exact candidate identity are recorded in the private release
  receipt. A prepared build requires the normal managed activation approval.
- The existing dependency audit's transitive Zod finding remains mitigated,
  not resolved. The sandbox dependency and lockfile did not change here.
- Manual Voice answer/interrupt acceptance applies to deployed `3853e0a` only.
  Native Claude, complete external-provider factory and Local runtime recovery
  remain open; OpenRouter live acceptance is explicitly deferred by the user.

Raw account diagnostics, synthetic acceptance transcripts, local state paths
and recovery receipts remain outside tracked knowledge. The initial failed
verification and later evidence are both preserved; a successful retry does not
erase the earlier failure.
