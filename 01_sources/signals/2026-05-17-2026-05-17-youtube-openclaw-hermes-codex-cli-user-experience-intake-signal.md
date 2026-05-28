---
id: 2026-05-17-2026-05-17-youtube-openclaw-hermes-codex-cli-user-experience-intake-signal
type: signal
status: extracted
created: 2026-05-17
updated: 2026-05-17
topics:
  - youtube
  - openclaw
  - hermes
  - codex-cli
  - user-experience
  - non-professional-users
  - ai-agents
  - signal-extraction
tools:
  - youtube
  - yt-dlp
  - mlx-whisper
  - codex
  - openclaw
  - hermes
  - agent
  - agents
  - workflow
  - memory
  - review
  - source
  - standard
sources:
  - 00_inbox/links/2026-05-17-youtube-openclaw-hermes-codex-cli-user-experience-intake.md
  - https://www.youtube.com/watch?v=L-HAzfFWSto
related:
  sources:
    - 00_inbox/links/2026-05-17-youtube-openclaw-hermes-codex-cli-user-experience-intake.md
generated_from:
  - 00_inbox/links/2026-05-17-youtube-openclaw-hermes-codex-cli-user-experience-intake.md
signal_quality: high
extraction_mode: heuristic-draft
refinement_status: needs-codex-refinement
harness: 07_workflows/prompts/signal-extraction-harness.md
---

# Signal: youtube-openclaw-hermes-codex-cli-user-experience

Date: 2026-05-17
Status: extracted
Signal quality: high
Extraction mode: heuristic-draft
Refinement status: needs-codex-refinement

## Core signal

- Какие agent-design выводы переносимы в Techscope: memory, Telegram control, Obsidian/wiki, business workflows, autonomy boundaries?
- Такой источник полезен для понимания adoption friction: что понятно, что ломается, что кажется практичным, где не-кодеры упираются в настройку, память, Telegram/CRM/business workflows.
- Title: OpenClaw, Hermes и Codex CLI: какой AI-агент выбрать сейчас
- Что из этого может стать recommendation для будущих agents или standards?
- # Intake: youtube-openclaw-hermes-codex-cli-user-experience
- Source: https://www.youtube.com/watch?v=L-HAzfFWSto
- Это не взгляд профессионального разработчика, а опыт продвинутого пользователя AI-агентов.
- Channel: ALEKSEI ULIANOV | AI-АГЕНТЫ
- Какие реальные pain points у продвинутого не-IT пользователя при выборе OpenClaw/Hermes/Codex CLI?
- source-note | brief | assessment | review | experiment | archive

## Technical details

- URL: https://www.youtube.com/watch?v=L-HAzfFWSto

## Agent design implications

- Проверить, можно ли превратить signal в правила для `AGENTS.md`, skills, MCP tools, reviewer agents, evals или workflows.
- Использовать этот signal как сжатый вход для assessment/review, но возвращаться к sources для финальных решений.

## Candidate rules

- Candidate rules require manual review.

## Noise removed

- Вступления, повторы, рекламные блоки, stage banter and generic motivation are intentionally excluded.
- Full source text/transcript is not copied into this signal.

## Verification required

- Проверить первоисточники и даты публикации внешних ссылок.
- Сверить claims с official OpenAI docs/source materials.

## Codex refinement required

- Пройти harness `07_workflows/prompts/signal-extraction-harness.md` в этом Techscope thread.
- Удалить случайные фразы, вопросы без пользы и source metadata, если они не являются technical signal.
- Добавить missing technical details, agent-design implications, risks, verification tasks and candidate rules.
- После ручного Codex-pass обновить `status: refined`, `extraction_mode: codex-assisted`, `refinement_status: codex-refined`.

## Source links

- 00_inbox/links/2026-05-17-youtube-openclaw-hermes-codex-cli-user-experience-intake.md
- https://www.youtube.com/watch?v=L-HAzfFWSto
