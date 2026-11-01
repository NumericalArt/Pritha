---
id: task-chat-composer-tools-compatibility
type: workflow
status: active
created: 2026-10-28
updated: 2026-11-01
topics: [control-center, task-chat, quote-reply, image-annotation, claude-code, compatibility]
tools: [Pritha, Codex, NeuralDeep, Claude Code, OpenRouter, Playwright, Canvas]
sources:
  - interfaces/control-center/src/lib/codex-chat/quote-reply.ts
  - interfaces/control-center/src/lib/codex-chat/image-annotation.ts
  - tests/fixtures/composer-tools/claude-compatibility.json
  - scripts/lib/provider-file-attachments.mjs
  - tests/acceptance/provider-file-attachments.fixture.mjs
related:
  contracts:
    - 11_agents/contracts/2026-05-28-pritha-claude-code-adapter-agent-contract.md
  standards:
    - 04_standards/agent-environment-compatibility.md
    - 04_standards/pritha-good-state-alignment.md
  workflows:
    - 07_workflows/control-center-staged-release.md
supersedes: []
superseded_by: []
memory_domain: pritha-self
subject:
  kind: workflow
  id: task-chat-composer-tools-compatibility
privacy: public
retention: durable
review_status: reviewed
confidence: medium
source_version: paste-preview-0.2.0-d1550099; quote-reply-0.1.0-e99bc062; pritha-host-files-v1; claude-2.1.296; codex-0.153.0
verified: 2026-11-01
---

# Task Chat composer tools and future Claude Code compatibility

## Current implementation

The Task Chat route is `/task-chat`; `/codex` preserves query parameters when
redirecting. Quote an already completed Pritha answer by selecting text inside
one message and pressing **Цитировать**. The editable Markdown is appended to
the current draft, never submitted automatically. The 64,000 character limit
includes the quote heading and prefixes. It cannot quote user messages,
commentary, controls or text spanning multiple messages. Selection does not
request additional history pages.

Use **Разметить** on a ready image attachment. The editor has arrow, rectangle,
pen, text, seven colours, three line widths, three font sizes, undo and redo.
It accepts static PNG, JPEG and WebP up to 16 megapixels, 8192 pixels per side
and the existing 100 MiB attachment limit. Animated/unsupported/oversized images
can remain attached unchanged; dispatch still requires the selected runtime's
image capability. Export produces a PNG at the decoded image's
original resolution, with orientation and alpha preserved. No external editor,
model, SDK, service or graphics dependency is introduced.

Applying uploads an immutable copy under a new UUID and replaces one draft
attachment only after success. A failed upload leaves the prior attachment
and permits an exact-byte, exact-ID retry. Reopening edits the flattened copy;
editable layers last only for one editor opening. **Вернуть оригинал** restores
the initial source after checking that it remains available and fits the total
message limit. Originals follow existing unreferenced storage expiry (24 hours),
not a new permanent retention promise. No manual server deletion is performed.

Only attachment metadata and an optional original reference enter tab-local
sessionStorage. PNG bytes, layers and base64 do not. Reload during apply restores
the previous confirmed attachment. Sending/queueing snapshots cannot be changed
by subsequent annotation. Stop and native approval/input controls keep their
existing semantics.

## Boundaries for a future adapter

Canonical Task Chat now has a shared host-tool file path for NeuralDeep, the
Claude API lane and OpenRouter. This is independent of the future terminal UI integration
described below. Files are accepted only with ready model/tool metadata and the
exact verified CLI version (Claude Code 2.1.296; Codex 0.153.0 for NeuralDeep and OpenRouter).
The runner checks the installed version again before dispatch. A CLI upgrade
keeps text execution available while file readiness requires re-verification.

NeuralDeep task tools use the same host approval broker and OS sandbox as the
other external task providers. The provider receives only the host's approved
MCP definitions. Responses must match the selected model and exact tool
namespace. Unsupported historic tool namespaces stop resume with a typed error;
the saved session and transcript remain intact. They are never silently rewritten
or replayed with different permissions. Voice metadata checks do not require a
CLI or tool sandbox; a voice task still passes normal task admission.

`read_file` accepts `attachment:<id>` only for originals already recorded in
that exact private chat. It verifies stored hashes and metadata, creates a
bounded read-only copy and returns UTF-8 text or a processing path for a binary
or large file. Processing commands retain the existing exact operator approval,
network restriction and workspace write policy. Archives and executables are
never opened or run automatically. Images remain unavailable on these paths
until their separate modality/transport gate passes.

Copies are removed only after all owned processes have exited. Unknown exit
preserves copies and the execution claim; recovery verifies exit before cleanup.
A modified copy is preserved for inspection. Cleanup can resume after a partial
deletion. Originals and their immutable history references remain available on
later turns; the attachment URI obtains a new copy after resume. At most ten
files and 250 MiB can be materialized in one turn, including historical files.

The explicit offline check is:

```sh
node --test tests/acceptance/provider-file-attachments.fixture.mjs
```

It uses installed CLIs, the real macOS sandbox, synthetic upstream responses and
synthetic file contents; no account key or paid inference is used. Both initial
and resumed MCP requests must carry the exact text/hash, process unchanged binary
bytes through an approved command, reject writes and direct original access,
and retain originals after cleanup. This verifies transport and permissions;
live model usefulness and the full operator journey remain manual R12 tests.

| Layer | Responsibility | Current status |
| --- | --- | --- |
| Portable logic | Quote formatting, annotation coordinates/history/rendering and exported PNG | Implemented independently of provider |
| Browser binding | DOM selection, composer, modal, immutable attachment upload | Control Center implementation |
| Claude Code binding | Native selection/prompt/UI hooks, image delivery, terminal capabilities | Not implemented; not verified |

These boundaries do not add a Claude runtime provider, install plugins, generate
CLAUDE.md, change auth, read Claude transcripts or approve the historical draft
adapter contract. The older contract concerns scaffold portability; it is not
evidence that an execution or UI adapter exists.

Reference snapshots read during research:

- [paste-preview](https://github.com/alan890104/claude-code-paste-preview/tree/d1550099cb69eeb92c7c70b5b86d1ca3a0a3074c),
  plugin 0.2.0, commit dated 2026-10-18. Its README requires Claude Code 2.1.291+
  and Kitty graphics for thumbnails; those are reference requirements, not a
  Pritha-verified compatibility range.
- [quote-reply](https://github.com/vakovalskii/quote-reply/tree/e99bc062fe19ed6fb66cbafcb95f8f5ef51ed5fc),
  plugin 0.1.0, commit dated 2026-10-28. The source reads `ui.selection`, appends
  through `prompt.fill`, and renders `AbovePrompt`.

No third-party source was vendored. The browser implementation does not depend
on Claude's internal temporary image directory. In the reference paste-preview,
`prompt.submit` context plus `session.append` are used to point Claude at the
edit and omit the original; that workaround requires a fresh live trial before
adoption, including proof that the model actually consumes the edited bytes.

## Manual recheck gate

Recheck on changes to Claude Code version, either plugin, UI hooks, attachment
layout or terminal graphics protocol. This is an operator-run checklist;
no timer, heartbeat, auto-update or installation runs.

1. Record CLI version, plugin versions and exact commits, terminal/OS versions,
   source dates, verification date and current official documentation.
2. Check selection and append APIs without changing the existing prompt or
   sending it. Test empty selection, Unicode, multiline text, composer focus,
   existing draft and plugin coexistence in `AbovePrompt`.
3. Inspect image hooks and payload APIs. Test original/copy identity, cancellation,
   multiple attachments, permission denial, inaccessible edits, reload, and
   changed internal file layout. Verify the model reads the edited image in a
   separately authorized live trial; a thumbnail is insufficient evidence.
4. Test supported graphics, a terminal without graphics, and tmux. Missing
   capabilities disable the relevant enhancement while preserving input/files.
5. Never bypass permissions, mutate host settings or install anything as part
   of a compatibility probe. Use an isolated project and synthetic attachments.
6. Report per capability: `verified`, `unsupported`, or `not-verified`, plus
   evidence and version limits. Do not infer compatibility from a version
   number or an offline fixture alone.

`tests/fixtures/composer-tools/claude-compatibility.json` deliberately remains
`not-verified`, with `runtimeEnabled: false`. Its tests validate only the portable
outputs and the future gate's declared boundaries. A future implementation
requires its own accepted scope and live integration checks.

## Verification and release

Run composer unit tests, typecheck, the isolated composer browser spec and the
existing chat concurrency/history/attachment suites. Before release run the full
unit/browser suites and self-test. Browser screenshots supplement pixel checks;
they do not establish export correctness. Check real Safari selection, touch,
orientation and export separately; a narrow Chromium viewport is not Safari.

```sh
node --test tests/control-center-composer-tools.test.mjs
npm --prefix interfaces/control-center run typecheck
npm --prefix interfaces/control-center run test:e2e -- task-chat-composer-tools.spec.ts
```

The optional installed-WebKit project is enabled only for a manual test run:

```sh
PRITHA_E2E_WEBKIT=1 npm --prefix interfaces/control-center run test:e2e -- task-chat-composer-tools.spec.ts --project=webkit
```

The default browser suite remains Chromium. Both use disposable state, ports
and the E2E build directory. The composer spec also runs strict page/chunk
health against that candidate, including `/codex` and `/task-chat`. Native
Safari/iPhone verification remains a separate manual check. WebKit's intercepted
Blob bodies are captured from the actual synthetic upload before fetch because
its Playwright request metadata can omit those bytes; no substitute image data
is used in export assertions.

Follow staged release and strict operational page/chunk health checks. Keep
candidate builds separate from live `.next`. Reverting these UI changes needs
no attachment storage migration and must not remove the private attachment store.
