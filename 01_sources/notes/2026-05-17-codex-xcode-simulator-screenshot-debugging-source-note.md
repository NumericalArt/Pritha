---
id: 2026-05-17-codex-xcode-simulator-screenshot-debugging-source-note
type: source-note
status: draft
created: 2026-05-17
updated: 2026-05-17
topics: [codex, xcode, ios-simulator, screenshots, ui-debugging, mobile-app-development, coding-agents, dx]
tools: [telegram-bot, codex, xcode, ios-simulator, iphone, macos]
source_type: telegram-photo
source_url: https://t.me/airanez/217
source_published: 2026-05-17
sources:
  - 00_inbox/telegram/2026-05-17-telegram-telegram-user-49-кстати-codex-умеет-сам-делать-скриншоты-приложений-на-телефо.md
  - https://t.me/airanez/217
  - 01_sources/raw/telegram-media/2026-05-17-telegram-telegram-user-49-кстати-codex-умеет-сам-делать-скриншоты-приложений-на-телефо/01-photo.jpg
  - https://openai.com/index/work-with-codex-from-anywhere/
  - https://support.apple.com/guide/simulator/take-screenshots-or-record-video-devd49e021cc/mac
related:
  signals:
    - 01_sources/signals/2026-05-17-2026-05-17-telegram-telegram-user-49-кстати-codex-умеет-сам-делать-скриншоты-приложений-на-те-signal.md
  briefs:
    - 02_briefs/2026-05-17-codex-xcode-simulator-screenshot-debugging-brief.md
---

# Source Note: Codex Xcode Simulator screenshot debugging

Date added: 2026-05-17
Source date: 2026-05-17
Source: https://t.me/airanez/217
Status: draft

## What this source is

Telegram-forwarded post from `AI RANEZ #217` claiming Codex can make screenshots of phone apps and that this helps debugging. The attached screenshot shows Codex working on a UI/onboarding task while an iPhone Simulator is open; a screenshot thumbnail appears inside the Codex thread.

## What is visible

- Codex tab is active next to `Chat` and `Claude Code`.
- Task title: `Plan UI and onboarding updates`.
- Codex references app preference state and says a stricter reset is needed.
- Codex has run commands and is inspecting local app files.
- iPhone Simulator shows a `Library` screen with onboarding/empty-state UI.
- Codex thread includes a screenshot artifact.

## Why it matters

This supports a valuable mobile-development workflow: a coding agent should be able to collect visual state from the simulator, use it as evidence, and keep iterating without manual screenshot drag-and-drop by the user.

## Caveats

- The post's claim about Claude Code is not verified.
- The exact mechanism is not proven by the screenshot. It could be Xcode Simulator support, command-line screenshot capture, app-specific tooling or Codex Desktop integration.
- Before standardizing, test locally with a minimal iOS project.

