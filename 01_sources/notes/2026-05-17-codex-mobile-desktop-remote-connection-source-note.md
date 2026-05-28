---
id: 2026-05-17-codex-mobile-desktop-remote-connection-source-note
type: source-note
status: draft
created: 2026-05-17
updated: 2026-05-17
topics: [codex-mobile, codex-desktop, remote-connections, ssh, mobile-agent-control, coding-agents, dx, security]
tools: [telegram-bot, codex, codex-desktop, chatgpt-mobile, ssh, macos, iphone]
source_type: telegram-photo
source_url: https://t.me/oestick/504
source_published: 2026-05-17
sources:
  - 00_inbox/telegram/2026-05-17-telegram-6208460904-53-telegram-photo.md
  - https://t.me/oestick/504
  - 01_sources/raw/telegram/2026-05-17-telegram-6208460904-53-telegram-photo.json
  - 01_sources/raw/telegram-media/2026-05-17-telegram-6208460904-53-telegram-photo/01-photo.jpg
  - https://openai.com/index/work-with-codex-from-anywhere/
related:
  signals:
    - 01_sources/signals/2026-05-17-2026-05-17-telegram-6208460904-53-telegram-photo-signal.md
  briefs:
    - 02_briefs/2026-05-17-codex-mobile-desktop-remote-connection-brief.md
---

# Source Note: Codex mobile/desktop remote connection screenshot

Date added: 2026-05-17
Source date: 2026-05-17
Source: https://t.me/oestick/504
Status: draft

## What this source is

Telegram-forwarded screenshot from `AI и грабли #504` showing a mobile `Connections` screen with an existing `Codex Desktop` connection to `Nikolays-MacBook-Pro.local` and an `Add SSH Host` form.

This is a screenshot-based source. It is useful for spotting UI/workflow changes, but official behavior must be checked against OpenAI documentation.

## Verified context

OpenAI's `Work with Codex from anywhere` article, dated 2026-05-14, says Codex is available in the ChatGPT mobile app preview and can connect to machines where Codex is running. It also says files, credentials, permissions and local setup stay on the host machine while updates flow to the phone.

## Useful interpretation

The screenshot is highly relevant to Techscope's Mac mini direction:

- keep execution on a trusted local machine;
- use mobile as steering/approval UI;
- support long-running work away from the desk;
- treat SSH host setup as part of the Codex operating environment;
- produce mobile-readable summaries from Telegram/Techscope queues.

## Caveats

- The Telegram image had no caption; do not infer more than visible UI plus official docs.
- SSH host setup has security implications: credentials, host naming, port exposure, local network reachability and remote permission scope.
- The feature is fresh; record dates and re-check docs before turning this into an active standard.

