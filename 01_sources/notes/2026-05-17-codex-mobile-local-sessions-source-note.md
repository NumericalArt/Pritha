---
id: 2026-05-17-codex-mobile-local-sessions-source-note
type: source-note
status: processed
created: 2026-05-17
updated: 2026-05-17
topics: [codex, mobile-codex, local-sessions, remote-access, agent-operations, mac-mini, telegram-bridge-replacement]
tools: [Codex, ChatGPT mobile app, Codex desktop app, secure relay, Mac mini, Telegram]
source_type: telegram
source_url: https://t.me/llm_under_hood/835
sources:
  - 00_inbox/telegram/2026-05-17-telegram-6208460904-36-говорят-что-вышел-новый-codex-который-позволяет-подключаться.md
  - 01_sources/raw/telegram-media/2026-05-17-telegram-6208460904-36-говорят-что-вышел-новый-codex-который-позволяет-подключаться/01-photo.jpg
  - https://openai.com/index/work-with-codex-from-anywhere/
related:
  briefs:
    - 02_briefs/2026-05-17-codex-mobile-local-sessions-brief.md
  reviews:
    - 03_reviews/2026-05-17-codex-mobile-local-sessions-assessment.md
  standards:
    - 04_standards/agent-environment-compatibility.md
source_published: 2026-05-14
source_updated: 2026-05-17
source_version: OpenAI Codex mobile preview article observed 2026-05-17; Telegram post observed 2026-05-17
retrieved: 2026-05-17
verified: 2026-05-17
valid_for: Codex mobile/local session workflow as of 2026-05-17
temporal_status: current
---

# Source Note: Codex mobile access to local sessions

Date: 2026-05-17
Status: processed

## Source snapshot

- Telegram source: `llm_under_hood/835`, forwarded 2026-05-17.
- Media: screenshot of Codex desktop/local session UI.
- Official source checked: OpenAI article `Work with Codex from anywhere`, published 2026-05-14.
- Claim type: product capability and workflow change.

## What the screenshot shows

- Codex is running a local project/session titled `Add ClickHouse events pipeline`.
- Left sidebar shows projects and active tasks, including `bitgn_platform`.
- Session is actively working on analytics infrastructure: ClickHouse schema/rollups, Vector ingest and Grafana dashboard.
- Bottom bar shows `Work locally`, branch `main`, permission mode `Full access`, model selector `5.5 High`, and an active stop button.
- The blue icon highlighted in the screenshot appears to be the mobile/remote connection affordance referenced by the Telegram post.

## Official-source check

OpenAI describes Codex in the ChatGPT mobile app as a way to stay connected to work running across laptops, devboxes or remote environments. The official article says the mobile app can load live state from machines where Codex is running, including a laptop, Mac mini or managed remote environment.

The same official source says files, credentials, permissions and local setup stay on the machine where Codex operates, while the phone receives live updates such as terminal output, diffs, screenshots, test results and approvals. It also describes a secure relay layer so trusted machines can remain reachable without direct public exposure.

## Technical signal

- This may reduce the need for a custom Telegram bridge when the user needs to monitor or steer local Codex sessions from a phone.
- It does not replace Telegram intake into Techscope. Telegram remains useful for forwarding external posts, links and media into the knowledge base.
- It changes our operating model for long-running Mac mini Codex work: the preferred control surface may become official Codex mobile rather than custom bot commands.
- Sleep prevention matters. Local work only remains reachable while the host machine is awake and Codex is running.
- For server-style use, Mac mini or VM is likely better than a laptop.

## Verification caveats

- The Telegram post is secondary evidence; official OpenAI article confirms the broad capability.
- Exact UI controls and availability are preview/current-product details and should be rechecked before writing a standard.
- Security model needs separate review: relay, account auth, device trust, local permission mode and host availability.
