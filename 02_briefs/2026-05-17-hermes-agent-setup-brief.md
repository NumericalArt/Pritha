---
id: 2026-05-17-hermes-agent-setup-brief
type: brief
status: draft
created: 2026-05-17
updated: 2026-05-17
topics: [hermes-agent, setup, deployment, telegram, gateway, vps, docker, security, skills, memory]
tools: [Hermes Agent, OpenClaw, Telegram, BotFather, Docker, OpenRouter, Anthropic, OpenAI, Hostinger]
agent_platforms: [Hermes Agent, OpenClaw, Codex]
model_context: [OpenRouter, Anthropic, OpenAI, local-models, provider-routing]
runtime_environment: [vps, docker, terminal, cli, messaging-gateway, telegram, mac-mini]
config_surfaces: [.env, config.yaml, hermes-setup, hermes-model, hermes-gateway, telegram-bot-token, provider-api-keys, skills]
portability: adapter-needed
sources:
  - 00_inbox/links/2026-05-17-youtube-hermes-agent-setup-openclaw-killer-intake.md
  - 01_sources/notes/2026-05-17-hermes-agent-setup-source-note.md
  - 01_sources/raw/youtube-3jNp14bJpgs/3jNp14bJpgs-whisper-small.md
  - https://hermes-agent.nousresearch.com/docs/getting-started/installation/
  - https://hermes-agent.nousresearch.com/docs/getting-started/quickstart/
  - https://hermes-agent.nousresearch.com/docs/user-guide/messaging
  - https://hermes-agent.nousresearch.com/docs/user-guide/configuration/
  - https://hermes-agent.nousresearch.com/docs/user-guide/security
related:
  intakes:
    - 00_inbox/links/2026-05-17-youtube-hermes-agent-setup-openclaw-killer-intake.md
  reviews:
    - 03_reviews/2026-05-17-hermes-agent-setup-assessment.md
    - 03_reviews/2026-05-17-hermes-agent-architecture-assessment.md
  decisions: []
  standards:
    - 04_standards/agent-environment-compatibility.md
    - 04_standards/agent-tool-integration-selection.md
supersedes: []
superseded_by: []
freshness_status: changed
source_published: 2026-04-15
source_updated: unknown
source_version: video references Hermes Agent around v0.9.0; checked against Hermes Agent v0.14.0 docs and release observed 2026-05-17
retrieved: 2026-05-17
verified: 2026-05-17
valid_for: deployment pattern and setup checklist; exact commands require current official docs
temporal_status: version-bound
---

# Brief: Hermes Agent setup and Telegram gateway

Date: 2026-05-17
Source: Wes Roth video, local transcript, official Hermes docs
Status: draft

## Summary

The video is useful as a hands-on setup walkthrough for Hermes Agent as an always-on personal agent: VPS or Mac mini, Docker/service persistence, provider keys, Telegram bot, gateway pairing and command approvals. It does not replace official docs and should not be treated as proof that Hermes supersedes OpenClaw.

For Techscope, the main value is not the Hostinger path itself. The value is the deployment pattern: start with a working CLI agent, add provider configuration, then expose it through a controlled messaging gateway, with persistent storage and explicit authorization.

## Key claims

- Always-on autonomous agents benefit from a server-like runtime rather than being tied to a laptop session.
- Persistent Docker volumes or equivalent service storage are important because memory, skills, session history and config are part of the agent's accumulated capability.
- Telegram is a practical control surface for a personal agent, but it must be paired/authorized and guarded.
- Provider routing via OpenRouter and direct provider keys can make model choice flexible, but it increases secret-management and cost-control requirements.
- Hermes' self-improving skills and memory loop are the core reason to study it, but exact skill counts, model defaults and install details change quickly.
- The safest setup order is: working CLI chat, model/provider check, gateway setup, Telegram pairing, command approval checks, then automation.

## Agent environment profile

- Agent platforms: Hermes Agent as source platform; Codex as adaptation target; OpenClaw as comparison target.
- Model context: OpenRouter, direct provider keys, local/self-hosted models as future path.
- Runtime environment: VPS, Docker, terminal, CLI, messaging gateway, Telegram; Mac mini is a plausible Techscope-hosted analog.
- Config surfaces: `.env`, `config.yaml`, `hermes setup`, `hermes model`, `hermes gateway`, provider keys, Telegram bot token, skills.
- Portability: adapter-needed.

## Evidence

- The local transcript captures an end-to-end walkthrough: VPS provisioning, Docker entry, virtualenv activation, Hermes CLI use, model selection, setup wizard, Telegram bot token, gateway start, pairing approval and `.env` troubleshooting.
- Official installation docs currently describe one-line installation and configuration commands including `hermes`, `hermes model`, `hermes tools`, `hermes gateway setup`, `hermes config set` and `hermes setup`.
- Official quickstart recommends validating a clean chat before adding gateway, cron, skills, voice or routing.
- Official messaging docs describe the gateway as a long-running process for Telegram and other platforms, with per-chat sessions and cron dispatch.
- Official security docs from the prior Hermes assessment require authorization, command approvals, isolation and credential filtering.

## Existing knowledge and freshness

- Related existing artifacts:
  - `02_briefs/2026-05-17-hermes-agent-architecture-brief.md`
  - `03_reviews/2026-05-17-hermes-agent-architecture-assessment.md`
  - `03_reviews/2026-05-17-openclaw-agent-architecture-assessment.md`
  - `04_standards/agent-environment-compatibility.md`
  - `04_standards/agent-tool-integration-selection.md`
- Relationship to existing knowledge: refines
- Official/current sources checked:
  - Hermes installation docs
  - Hermes quickstart
  - Hermes messaging gateway docs
  - Hermes configuration docs
  - Hermes security docs
  - Hermes latest release
- Freshness status: changed
- Source published: 2026-04-15
- Source updated: unknown
- Source version: video references Hermes Agent around v0.9.0; checked against Hermes Agent v0.14.0 docs and release observed 2026-05-17
- Retrieved: 2026-05-17
- Verified: 2026-05-17
- Valid for: deployment pattern and setup checklist; exact commands require current official docs
- Temporal status: version-bound
- Artifacts to mark outdated or superseded: none

## Risks and caveats

- A Telegram gateway attached to terminal tools can execute high-impact actions from a chat interface.
- Provider API keys and Telegram bot tokens must be treated as secrets; never store them in Techscope Markdown.
- Hosted one-click setup is convenient but vendor-specific and partly sponsored content.
- Running as root inside a VPS walkthrough is convenient for demos but not a good default for production.
- The video predates the current official Hermes release, so exact setup details may already have changed.

## Recommendation

Use this video as an operational scenario for a future Hermes experiment, not as an installation standard.

Adopt the pattern:

- verify CLI operation first;
- add gateway only after a clean local/server chat works;
- use a throwaway Telegram bot and low-limit provider keys for experiments;
- require user allowlists/pairing and command approvals;
- keep memory, skills, session history and config in persistent storage;
- document every setup step in a project-specific runbook;
- compare Hermes gateway behavior against our existing Techscope Telegram bot before adopting anything.

## Next step

Create a controlled Hermes experiment plan for Mac mini or disposable VPS with no production secrets, no broad filesystem access and a clear success/failure checklist.
