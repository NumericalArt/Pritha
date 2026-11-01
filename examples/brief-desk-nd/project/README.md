---
id: brief-desk-nd-example-project-readme
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

A local briefing editor: **topic → sources → draft → edit → approve → Telegram**.
A complete example agent included with Pritha NeuralDeep. Node.js 24+, no npm
runtime dependencies, localhost only, manual startup.

NeuralDeep supplies search and drafting. This agent uses its own credentials;
Pritha does not share its keys, environment or Keychain access.

## Start

Use Start on its Pritha agent card, or run `node server.mjs` from this folder.
Open the local address shown in the terminal. **Open demo** needs no keys and
contains a synthetic brief, not somebody else's history.

## Settings

Enter this agent’s own NeuralDeep key in Settings. It is saved privately in
`.env.local`. An empty installation makes no provider request. Explicit
`BRIEF_DESK_ND_API_KEY` and `BRIEF_DESK_ND_TELEGRAM_BOT_TOKEN` environment
variables are supported for manual startup; generic parent keys are ignored.
Own local files take precedence for secrets. Process-managed startup uses local
files and strips inherited provider credentials. Non-secret environment settings
take precedence and must be changed there.

Telegram is optional for creating and editing briefs. Configure its bot token
and destination in Settings, check access, then explicitly approve publication.
[Connect Telegram](docs/telegram.md). No incoming bot command loop is started.

Secrets live only in `.env.local` or the server environment; state lives in
`.data`. Both are ignored by Git. Keep these files when updating your agent.

Run `npm test` for isolated tests with temporary data and mocked providers.
No real Telegram message is sent by the test suite.
