---
id: local-provider-offline
type: workflow
status: active
created: 2026-11-01
updated: 2026-11-01
topics: [provider-runtime, local-inference, offline, isolation]
tools: [Pritha, Codex, Seatbelt, Ollama, LM Studio, MLX]
sources:
  - https://docs.ollama.com/api/openai-compatibility
  - https://docs.ollama.com/faq
  - https://lmstudio.ai/docs/developer/core/headless
related:
  workflows: [07_workflows/2026-11-01-pritha-provider-convergence-roadmap.md]
supersedes: []
superseded_by: []
subject: {kind: pritha, id: pritha}
privacy: public
retention: durable
review_status: verified-automated
confidence: medium
---

# Local offline provider

Local uses an operator-selected installed model server in a temporary owned
process. It has an empty credential environment, read-only model/runtime files,
private scratch, one exact loopback port and no other network access. CLI and
host commands have their own narrower sandboxes. No cloud voice, search, model
download, fallback provider, login, daemon installation or existing-service
restart occurs. A real model inference acceptance remains installation-specific.

## Configure an installed server

Prepare a private JSON manifest outside tracked knowledge. This example is a
shape, not an executable installer; replace placeholders with installed paths
and the server's actual supported model/Responses/tool capabilities:

```json
{
  "schema": 1,
  "endpoint": "http://127.0.0.1:1234/v1",
  "command": "<ABSOLUTE_INSTALLED_SERVER_BINARY>",
  "args": ["--host", "127.0.0.1", "--port", "{port}", "--model", "<ABSOLUTE_MODEL_PATH>"],
  "readRoots": ["<MODEL_DIRECTORY>", "<SERVER_RUNTIME_DEPENDENCIES>"],
  "model": {
    "id": "<EXACT_MODEL_ID>",
    "tools": true,
    "responses": true,
    "contextTokens": 32768,
    "outputTokens": 4096,
    "efforts": ["default"]
  }
}
```

The command is an absolute executable, arguments are an array, and `{port}` is
substituted without a shell. Python/MLX installations also need their interpreter
and installed library directories among `readRoots`; only include files needed
by the model server. Read roots do not grant write access. Only the explicit
model/cache configuration variables accepted by the CLI may be supplied via
`environment`. Secrets and arbitrary environment variables are rejected.

```sh
node scripts/local-provider.mjs configure --file <PRIVATE_MANIFEST_JSON>
node scripts/local-provider.mjs probe --base-url http://127.0.0.1:1234/v1 --model <EXACT_MODEL_ID>
```

Configure stores a mode-0600 manifest with the executable SHA-256 in this
instance's private `local-runtime/server.json`. It starts nothing. Probe creates
a bounded metadata-only server, verifies listener process ownership, reads the
model catalog, and confirms the whole process tree exited. Then choose Local,
the same model source URL, exact model and supported effort in Settings. The
source URL identifies the reviewed configuration; tasks run its private copy
on an ephemeral port. Model/provider/config identity stays pinned on resume.
An executable change requires an explicit configure action again.

Factory delivery uses the same runner with `--executor local --model
<EXACT_MODEL_ID> --base-url http://127.0.0.1:1234/v1 --effort default` on the
existing `agents-mother deliver` command. Contract/research/Trials/worktree and
token-budget gates remain mandatory. Its source URL is pinned in the private
attempt receipt alongside the model; an unrelated loopback server cannot replace
the configured owned process.

## Existing Ollama, LM Studio and custom servers

Discovery reads available models and native capability metadata from explicitly
selected loopback endpoints. A reachable listener alone remains
`provider_offline_unverified`: its parent process can still access the network.
Do not retrofit isolation by restarting somebody else's service or by accepting
an `offline: true` field in server metadata.

The owned-process path supports a server that can run under the exact-port
policy. An engine requiring additional dynamic listener ports or a pre-existing
daemon is refused until a separately verified adapter exists. In particular,
LM Studio's daemon start command is not a substitute for a process owned by this
task. Ollama cloud models are rejected even when advertised on localhost.
This boundary is a deliberate revision of the original loopback-only proposal.

Primary documentation checked **2026-11-01**: Ollama documents stateless
Responses support; LM Studio documents its separate daemon and on-demand model
loading. Those protocol statements do not prove network isolation. The tested
runtime boundary is macOS Seatbelt, sandbox-runtime **0.0.81**, Codex **0.153.0**.

## File attachments

Local supports the shared file attachment transport with verified Codex 0.153.0:
UTF-8 reads, immutable originals and read-only binary snapshots for an approved
sandboxed command. Images remain unavailable. Initial and resumed turns were
checked against the installed CLI; no attachment or key went to a remote API.
This capability does not relax the owned model process or offline requirement.

## Recovery and checks

Stop/timeout closes inference, CLI and host-command trees. Unknown exit keeps the
private active receipt and blocks a replacement process. Never delete that
receipt to bypass process proof. A confirmed exited orphan can be reconciled
only when its original owner is also gone. Queue and resume use the common
provider runtime and original model/session binding.

```sh
node --test tests/owned-local-server.test.mjs tests/compatible-owned-runner.test.mjs tests/compatible-provider-service.test.mjs tests/provider-connector-presets.test.mjs
node --test tests/acceptance/local-stock-cli.fixture.mjs
node --test --test-name-pattern="^local:" tests/acceptance/provider-file-attachments.fixture.mjs
```

The synthetic acceptance uses the installed CLI and real OS isolation. It checks
initial/resumed tool calls, exact session/model, measured usage, no provider key,
remote and foreign-loopback denial, private-file denial, cancellation, unknown
exit fencing and full-tree shutdown. No paid inference or downloaded model is
used. Before accepting an installed model, repeat a real text/tool task and Stop
on that installation; metadata readiness is not a completed user acceptance.
