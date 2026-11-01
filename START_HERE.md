---
id: pritha-start-here
type: workflow
status: active
created: 2026-11-01
updated: 2026-11-01
topics: [pritha, setup, providers, distribution]
tools: [Pritha, Node.js, Python, Codex, NeuralDeep, Claude Code, OpenRouter]
sources:
  - https://github.com/NumericalArt/Pritha-NeuralDeep/blob/2ab22aeff5f1c167c86e925ec30311942b76023b/START_HERE.md
related:
  workflows: [07_workflows/first-run-setup.md, 07_workflows/local-provider-offline.md]
supersedes: []
superseded_by: []
subject: {kind: pritha, id: pritha}
privacy: public
retention: durable
review_status: verified-automated
confidence: medium
---

# Start Pritha

One checkout supports Codex, NeuralDeep, Claude Code, OpenRouter and an owned
offline Local model process. Provider selection does not move existing task
history or change the provider/model of an existing conversation.

## Prepare an instance

Use Node.js 24+, Git, SQLite CLI and Python 3.10+ for new installations (3.9 is a
transitional compatibility floor). The reviewed external CLI isolation currently
requires macOS. NeuralDeep/OpenRouter/Local need the compatible installed Codex
CLI; Claude requires the compatible Claude Code CLI. Readiness reports an
unsupported version instead of executing with weaker isolation.

From the repository root, inspect a plan and select one preparation profile:

```sh
node scripts/bootstrap.mjs plan --profile neuraldeep --json
node scripts/bootstrap.mjs prepare --profile neuraldeep
```

| Profile | Purpose |
| --- | --- |
| `minimal` | Setup metadata and SQLite index; embeddings deferred |
| `local` | Existing native Codex installation with semantic memory |
| `control-center` | Native installation plus Control Center |
| `control-center-tailscale` | Same with read-only private-access checks |
| `neuraldeep`, `claude`, `openrouter` | Provider-specific Control Center setup |
| `local-model` | Control Center for strict offline Local execution |

`--provider-profile codex|neuraldeep|claude|openrouter|local` selects a connector
independently of the installation size. The established `local` installation
profile keeps its meaning. Preparation creates an instance-local Python venv,
installs declared dependencies, rebuilds local indexes and verifies the chosen
components. It stops after a required failure; fix the cause and repeat.

Fresh instances keep state and sibling agents outside the checkout. The private,
gitignored `.pritha-instance.json` binds those locations to this code root. A
copied pointer cannot silently select another installation's state. Explicit
environment settings keep their established precedence. An occupied legacy
checkout retains its existing data layout; migration is a separate operation.

Preparation does not initialize Git, commit the directory, copy runtime data,
provision credentials, install a background service or expose a network endpoint.
Dependency/model downloads needed for semantic memory require connectivity;
Local inference itself remains offline. ZIP users who need Git-based delivery
should review the directory and initialize their own repository explicitly.

## Connect the selected provider

Use Settings to save this instance's API key and choose an exact supported model.
NeuralDeep and OpenRouter use their own credentials; Claude's implemented lane
uses an Anthropic API key. The optional local Claude session lane remains
unavailable until separately verified; no OAuth token extraction occurs.
Codex keeps its native account/history. A missing key, exhausted budget,
unverified runtime or model does not fall back to another provider.

Local needs an installed model and the private process configuration described
in [Local offline setup](07_workflows/local-provider-offline.md). An existing
Ollama/LM Studio listener can be discovered without being declared offline.
Cloud speech and Search are disabled for Local. For online connectors, choose
Voice Auto or an explicitly configured voice engine in Settings.

## Run and check

For an explicitly requested standalone development instance, `bootstrap start`
runs the Control Center in the foreground. Stop it with Ctrl+C. Keep occupied
ports intact. Production and private-access instances use the staged runtime
workflow in `07_workflows/control-center-staged-release.md`, including its
separate activation approval and rollback. Do not start a second development
server over an existing managed instance.

Run `node scripts/bootstrap.mjs verify --profile <PROFILE>` for checks and
`node scripts/self-test.mjs` for operational verification. `prepare` restores
generated memory from authored Markdown; it never supplies private user data
from another checkout. A fresh setup does not prove a real provider call, audio
session or child-agent outcome has passed its manual acceptance.

Keep `.pritha-instance.json`, state directories, keys and child data out of
distributions. On upgrade, preserve the existing private roots and recovery
point. If a pointer, model process or migration has ambiguous ownership, use
the reported recovery path instead of deleting state or killing a listener.
Tailscale, Telegram, background startup and publication remain explicit opt-ins.
