---
id: 2026-05-17-codex-mobile-desktop-remote-connection-brief
type: brief
status: draft
created: 2026-05-17
updated: 2026-05-17
topics: [codex-mobile, codex-desktop, remote-connections, ssh, mobile-agent-control, coding-agents, dx, security]
tools: [codex, codex-desktop, chatgpt-mobile, ssh, macos, iphone, telegram-bot]
sources:
  - 01_sources/notes/2026-05-17-codex-mobile-desktop-remote-connection-source-note.md
  - 01_sources/signals/2026-05-17-2026-05-17-telegram-6208460904-53-telegram-photo-signal.md
  - 01_sources/raw/telegram-media/2026-05-17-telegram-6208460904-53-telegram-photo/01-photo.jpg
  - https://openai.com/index/work-with-codex-from-anywhere/
related:
  intakes:
    - 00_inbox/telegram/2026-05-17-telegram-6208460904-53-telegram-photo.md
  notes:
    - 01_sources/notes/2026-05-17-codex-mobile-desktop-remote-connection-source-note.md
  assessments:
    - 03_reviews/2026-05-17-codex-mobile-desktop-remote-connection-assessment.md
  standards:
    - 04_standards/agent-shell-evaluation.md
---

# Brief: Codex mobile/desktop remote connection

Date: 2026-05-17
Source: https://t.me/oestick/504
Status: draft

## Summary

Скриншот показывает, что мобильный Codex/ChatGPT UI уже работает как поверхность управления подключениями: виден существующий `Codex Desktop` host и форма `Add SSH Host`. В сочетании с официальной статьей OpenAI от 2026-05-14 это подтверждает важный UX-сдвиг: Codex можно использовать не только сидя за рабочей машиной, но и как long-running agent, которым пользователь управляет с телефона.

## Key claims

- Mobile supervision становится отдельной возможностью coding-agent среды.
- Trusted execution host остается MacBook/Mac mini/devbox; телефон только управляет и подтверждает.
- Remote SSH нужно учитывать как часть Codex operating environment.
- Для Techscope это усиливает требование коротких человекочитаемых статусов: пользователь будет часто смотреть результат с телефона.
- Для будущих агентов нужно проектировать approval/checkpoint behavior, а не только "запустить задачу и ждать".

## Evidence

- Telegram screenshot, 2026-05-17, from `AI и грабли #504`.
- OpenAI official article, 2026-05-14, says Codex in ChatGPT mobile app can work across laptops/devboxes/remote environments, stream live state to phone, and keep files/credentials/permissions on host.

## Risks and caveats

- SSH credentials and host access must be scoped; avoid password sprawl and broad admin users.
- Mobile approval can create accidental approvals if summaries are vague.
- Host availability matters: Mac mini/MacBook must remain online, awake and running Codex.
- Feature is fresh; verify exact behavior on our devices before standardizing.

## Recommendation

Keep this as a significant signal for the Techscope agent environment:

- add `mobile-supervision` to the `agent-shell-evaluation` rubric;
- test a small Codex mobile control flow on Mac mini/MacBook;
- update Telegram bot responses toward concise mobile-readable summaries;
- later create a Codex remote/mobile workflow if local test succeeds.

## Next step

experiment | workflow

