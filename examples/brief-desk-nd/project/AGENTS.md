---
id: brief-desk-nd-example-project-agents
type: template
status: draft
created: 2026-11-01
updated: 2026-11-01
topics: [brief-desk, neuraldeep, example]
tools: [Node.js, NeuralDeep]
sources: [bundled-brief-desk-source]
related: {}
supersedes: []
superseded_by: []
privacy: public
---

# Brief Desk ND

Brief Desk is the bundled Pritha NeuralDeep example: research a topic, review and
edit a draft, then explicitly approve publication to one Telegram destination.
Its runtime is a local Node.js service with a bounded NeuralDeep editor.

Read README.md and docs/telegram.md for setup. Use the web Settings form for keys;
never ask users to paste credentials into a coding conversation. Use only this
agent’s own key. Parent credentials and Keychain references are not supported.
Local settings and history stay in ignored .env.local and .data. No key belongs
in a manifest, test, log or Git commit.

Commands: `npm start`, `npm test`, `npm run check`, `npm run status`.
Service lifecycle commands live under scripts; starting is explicit, with no
background autostart installation. The offline demo needs no credentials.

Keep research deterministic around a bounded LLM drafting step. Validate public
source URLs, quarantine hostile text, retain visible errors and never invent
provider results. A failed generation stays unavailable; a Telegram timeout
stays delivery_unknown and must not automatically retry.

Check connection only reads provider status. Send test message needs its own
confirmation. Draft publication requires approval of its current revision.
Legacy inbound webhook support is disabled unless manually configured; it is
not part of the first-run Telegram setup.

Before changing behavior, inspect the project and contract, read relevant Pritha
engineering knowledge, implement focused tests, and run the trial suite.
