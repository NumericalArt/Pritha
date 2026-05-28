---
id: 2026-05-17-youtube-hermes-agent-setup-openclaw-killer-intake
type: intake
status: processed
created: 2026-05-17
updated: 2026-05-17
topics: [hermes-agent, autonomous-agents, setup, telegram, vps, docker, gateway, skills, memory]
tools: [Hermes Agent, OpenClaw, Telegram, BotFather, Docker, OpenRouter, Anthropic, OpenAI, Hostinger]
agent_platforms: [Hermes Agent, OpenClaw, Codex]
model_context: [OpenRouter, Anthropic, OpenAI, local-models, provider-routing]
runtime_environment: [vps, docker, terminal, cli, messaging-gateway, telegram]
config_surfaces: [.env, config.yaml, hermes-setup, hermes-model, hermes-gateway, telegram-bot-token, provider-api-keys, skills]
portability: adapter-needed
source_type: video
source_url: https://youtu.be/3jNp14bJpgs?is=YtC_NS5VAiXE8-Bc
source_published: 2026-04-15
source_updated: unknown
source_version: video references Hermes Agent around v0.9.0; checked against Hermes Agent v0.14.0 docs and release observed 2026-05-17
retrieved: 2026-05-17
verified: 2026-05-17
temporal_status: version-bound
sources:
  - https://youtu.be/3jNp14bJpgs?is=YtC_NS5VAiXE8-Bc
  - 01_sources/raw/youtube-3jNp14bJpgs/3jNp14bJpgs-whisper-small.md
  - https://hermes-agent.nousresearch.com/docs/getting-started/installation/
  - https://hermes-agent.nousresearch.com/docs/getting-started/quickstart/
  - https://hermes-agent.nousresearch.com/docs/user-guide/messaging
related:
  notes:
    - 01_sources/notes/2026-05-17-hermes-agent-setup-source-note.md
  briefs:
    - 02_briefs/2026-05-17-hermes-agent-setup-brief.md
    - 02_briefs/2026-05-17-hermes-agent-architecture-brief.md
  reviews:
    - 03_reviews/2026-05-17-hermes-agent-setup-assessment.md
    - 03_reviews/2026-05-17-hermes-agent-architecture-assessment.md
  standards:
    - 04_standards/agent-environment-compatibility.md
    - 04_standards/agent-tool-integration-selection.md
---

# Intake: youtube-hermes-agent-setup-openclaw-killer

Date added: 2026-05-17
Type: video
Source: https://youtu.be/3jNp14bJpgs?is=YtC_NS5VAiXE8-Bc
Source published: 2026-04-15
Source updated: unknown
Source version: video references Hermes Agent around v0.9.0; checked against Hermes Agent v0.14.0 docs and release observed 2026-05-17
Retrieved: 2026-05-17
Verified: 2026-05-17
Temporal status: version-bound
Status: processed

## Why this may matter

The video is a practical Hermes Agent setup walkthrough with VPS, Docker, provider keys and Telegram gateway pairing. It is relevant to Techscope because we are comparing autonomous-agent runtimes and collecting deployable patterns for future agent systems.

The headline claim that Hermes is an "OpenClaw killer" is treated as marketing framing, not evidence.

## Raw material or link

- YouTube video: https://youtu.be/3jNp14bJpgs?is=YtC_NS5VAiXE8-Bc
- Local transcript: `01_sources/raw/youtube-3jNp14bJpgs/3jNp14bJpgs-whisper-small.md`
- Official installation docs: https://hermes-agent.nousresearch.com/docs/getting-started/installation/
- Official quickstart: https://hermes-agent.nousresearch.com/docs/getting-started/quickstart/
- Official messaging gateway docs: https://hermes-agent.nousresearch.com/docs/user-guide/messaging

## Initial questions

- Which parts of the setup flow are generally portable to our future agents?
- Which parts are Hostinger-specific or sponsored-platform-specific?
- What security gates are required before using a Telegram gateway with terminal access?
- Does the video add new information beyond the official Hermes docs and the existing Hermes architecture assessment?

## Expected output

brief | assessment | experiment
