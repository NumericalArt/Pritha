---
id: 2026-05-17-mimiclaw-source-note
type: source-note
status: processed
created: 2026-05-17
updated: 2026-05-17
topics: [mimiclaw, mimiclaw, openclaw, embedded-agents, edge-ai-agents, esp32-s3, freertos, telegram, memory, tool-use]
tools: [MimiClaw, OpenClaw, ESP32-S3, ESP-IDF, FreeRTOS, Telegram, Anthropic, OpenAI, SPIFFS, NVS, WebSocket]
agent_platforms: [MimiClaw, OpenClaw]
model_context: [Anthropic, OpenAI, cloud-llm, no-local-model-out-of-box]
runtime_environment: [esp32-s3, bare-metal, freertos, microcontroller, telegram, websocket, serial-cli, ota]
config_surfaces: [mimi_secrets.h, serial-cli, nvs, spiffs, SOUL.md, USER.md, MEMORY.md, HEARTBEAT.md, cron.json, SKILL.md]
portability: adapter-needed
sources:
  - https://mimiclaw.io
  - https://github.com/memovai/mimiclaw
  - https://api.github.com/repos/memovai/mimiclaw
  - https://github.com/memovai/mimiclaw/releases/tag/v0.1.1
  - https://api.github.com/repos/memovai/mimiclaw/releases/latest
  - https://raw.githubusercontent.com/memovai/mimiclaw/main/docs/ARCHITECTURE.md
  - https://raw.githubusercontent.com/memovai/mimiclaw/main/docs/TODO.md
  - https://youtu.be/eXErSrxDnq0?is=M3IysyG8iPM9M_LI
  - 01_sources/raw/youtube-eXErSrxDnq0/eXErSrxDnq0-whisper-small.md
related:
  intakes:
    - 00_inbox/links/2026-05-17-mimiclaw-embedded-openclaw-intake.md
  briefs:
    - 02_briefs/2026-05-17-mimiclaw-embedded-agent-brief.md
  reviews:
    - 03_reviews/2026-05-17-mimiclaw-embedded-agent-assessment.md
    - 03_reviews/2026-05-17-openclaw-agent-architecture-assessment.md
  standards:
    - 04_standards/agent-environment-compatibility.md
    - 04_standards/agent-tool-integration-selection.md
source_published: 2026-02-04
source_updated: 2026-04-21
source_version: GitHub main observed 2026-05-17; latest release v0.1.1 published 2026-03-17; video published 2026-02-22
retrieved: 2026-05-17
verified: 2026-05-17
valid_for: MimiClaw architecture snapshot as of 2026-05-17
temporal_status: version-bound
---

# Source Note: MimiClaw embedded agent architecture

Date: 2026-05-17
Status: processed

## Source snapshot

- Project: `memovai/mimiclaw`
- Public site: `mimiclaw.io`
- Positioning: OpenClaw-inspired AI assistant on ESP32-S3 microcontroller hardware.
- Repository created: 2026-02-04 via GitHub API.
- GitHub API observed 2026-05-17:
  - stars: 5,412
  - forks: 791
  - open issues: 96
  - license: MIT
  - primary language: C
  - latest push: 2026-04-21T17:37:01Z
- Latest release observed: `v0.1.1`, published 2026-03-17.
- YouTube video: `MimiClaw: Run this OpenClaw Variant on a $5 Chip`, Fahd Mirza, published 2026-02-22, duration 9:13.

## Primary-source findings

- MimiClaw targets ESP32-S3 boards with 16 MB flash and 8 MB PSRAM.
- The runtime removes the normal server/OS layer: no Linux and no Node.js; the implementation is C on ESP-IDF/FreeRTOS.
- User interaction is mainly through Telegram; LAN access is also exposed through a WebSocket gateway on port 18789.
- The architecture uses separate queues/tasks for Telegram polling, agent loop, outbound dispatch and serial CLI.
- The agent loop builds context from files such as `SOUL.md`, `USER.md`, `MEMORY.md`, daily notes and tool guidance.
- Session history is stored as JSONL-like files in SPIFFS.
- It implements a ReAct-style tool loop with tool calling and web search through Tavily or Brave.
- It supports Anthropic and OpenAI/GPT-style providers, but the LLM itself runs in the cloud out of the box.
- Flash storage is used for firmware, OTA partitions, SPIFFS memory/session/config files and coredumps.
- The README describes runtime configuration via serial CLI stored in NVS, while `docs/ARCHITECTURE.md` still says configuration is build-time only. Treat the README/release/TODO as fresher than that architecture detail.

## Video findings

- The video frames MimiClaw as the most extreme OpenClaw-family shrink: from Mac mini/server agents down to microcontroller hardware.
- It emphasizes the two-core split: networking and Telegram on one side, agent processing on the other.
- It correctly stresses the board requirement: ESP32-S3, not generic ESP32, with 16 MB flash and 8 MB PSRAM.
- It flags a practical hardware issue: ESP32-S3 boards may expose different USB/JTAG/UART ports, and flashing through the wrong port can fail.
- It highlights the honest caveat: the board is cheap and low-power, but API calls still go to cloud LLM providers.

## Feature gaps and caveats from TODO

- The project TODO says Telegram user allowlist is not implemented yet; this is security-critical because anyone who can message the bot may consume API credits or trigger agent behavior.
- Agent-driven memory persistence appears partially incomplete or evolving; memory files exist, but implementation status differs across docs.
- More file tools, subagents/background tasks, media handling, richer skills, bootstrap alignment and full cron/heartbeat behavior are still listed as gaps or staged work.
- The project is moving quickly, and documentation is not fully synchronized.

## What is useful for Techscope

- Embedded agents are a separate environment class, not just a smaller server runtime.
- Severe constraints force a clean separation of:
  - channel adapters;
  - message queues;
  - agent loop;
  - memory/session storage;
  - tool registry;
  - configuration surface;
  - OTA/update path.
- Plain files for identity/memory/tasks are still useful even on tiny hardware.
- Always-on agent design can be extremely cheap and low power, but autonomy shifts risk toward physical-device security, token leakage, firmware update safety and channel authorization.

## Source-quality notes

- GitHub/README/release/TODO are primary sources.
- The website is project-owned but marketing-heavy.
- The video is useful secondary explanation, but not authoritative for implementation state.
- The project is early: latest release is `v0.1.1`, open issues are nontrivial, and docs conflict on some details.
