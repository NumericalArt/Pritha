---
id: media-intake-processing
type: workflow
status: active
created: 2026-05-15
updated: 2026-05-17
topics: [media-intake, assessment, telegram, youtube, source-verification, agents, queue]
tools: [telegram-bot, process-intake, extract-signal, codex, yt-dlp, mlx-whisper, markdown]
sources:
  - AGENTS.md
  - 04_standards/expert-information-assessment.md
related:
  workflows:
    - 07_workflows/expert-information-assessment.md
    - 07_workflows/telegram-intake-bot.md
    - 07_workflows/youtube-transcription.md
    - 07_workflows/codex-assisted-signal-extraction.md
    - 07_workflows/codex-assisted-media-review.md
  standards:
    - 04_standards/expert-information-assessment.md
---

# Workflow: media-intake-processing

## Goal

Любой входящий материал из Telegram, YouTube, ссылок, файлов, текстов или другого медиа должен проходить не только сохранение и индексацию, но и первичную экспертную оценку относительно миссии Techscope.

## Rule

После создания intake нужно сразу:

1. Сохранить intake and raw source.
2. Поставить intake в persistent queue, если источник пришел через Telegram или другой автоматический канал.
3. Извлечь ссылки.
4. Проверить доступность ссылок, если это возможно.
5. Для YouTube запустить локальную транскрибацию, если видео доступно.
6. Для Telegram media скачать доступные файлы в `01_sources/raw/telegram-media/`.
7. Создать heuristic `signal` draft в `01_sources/signals/`.
8. Пометить signal как `needs-codex-refinement`.
9. Создать `assessment` в `03_reviews/`.
10. Связать signal and assessment с исходным intake and raw/media artifacts.
11. Пересобрать memory index and embeddings.
12. Для Telegram media, которые требуют содержательного понимания, создать или обновить Codex media-review queue.
13. Не считать intake полностью обработанным, пока закрыт не только автоматический pass, но и обязательный Codex-assisted review.
14. Для полезных материалов выполнить Codex-assisted refinement в этом Techscope thread.
15. Перед любым стандартом или решением провести консилиум expert lenses.

## Command

```sh
node scripts/process-intake.mjs <intake-path> --transcribe-youtube --reindex
```

Telegram queue worker:

```sh
node scripts/telegram-bot.mjs worker
```

Codex media-review queue:

```sh
node scripts/telegram-bot.mjs full-status
node scripts/telegram-bot.mjs codex-review-report
node scripts/telegram-bot.mjs codex-review-done <job-id>
```

## Expert council

Консилиум в Techscope v1 - это обязательный проход по expert lenses:

- Programming;
- Agent Engineering;
- DX;
- Security;
- Evidence;
- Product Pragmatism.

Для сложных материалов дополнительно использовать роли из `06_subagents/`: architecture, security, developer-experience, product-pragmatist, research-scout, standards-editor.

## Output

Primary output:

```text
01_sources/signals/YYYY-MM-DD-topic-signal.md
```

Assessment output:

```text
03_reviews/YYYY-MM-DD-topic-assessment.md
```

The assessment may recommend:

- `archive`;
- `brief`;
- `review`;
- `experiment`;
- `decision`;
- `standard`.

## Completion semantics

`auto_completed_at` means that scripts saved the material, inspected links, downloaded available media, processed YouTube links where possible, created assessment/signal drafts and rebuilt the index.

`completed_at` means the full required pipeline is closed. For media intakes this requires Codex-assisted interpretation, verification and artifact refinement first.

Telegram replies must reflect this distinction. "Готово" is allowed only for a fully completed intake.

## Safety

- Автоматический assessment является draft, не финальным решением.
- Автоматический signal является heuristic draft, не финальной экспертной выжимкой.
- Содержательный refinement выполняется Codex-агентом в Techscope thread по `07_workflows/prompts/signal-extraction-harness.md`, без внешних LLM-сервисов.
- Media с потенциальной пользой проходят Codex-assisted media review по `07_workflows/codex-assisted-media-review.md`.
- Внешние claims не принимать без первоисточника.
- Полные transcripts и raw artifacts хранить только в `01_sources/raw/`.
- Telegram media хранить как raw artifacts; signal/assessment должны ссылаться на них, но не встраивать бинарные данные или длинные raw fragments.
- Если материал может повлиять на настройку агентов, зафиксировать это как recommendation для будущего agent standard, prompt rule, workflow или decision.
