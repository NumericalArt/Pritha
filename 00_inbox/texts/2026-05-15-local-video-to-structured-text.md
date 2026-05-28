---
id: 2026-05-15-local-video-to-structured-text-intake
type: intake
status: processed
created: 2026-05-15
updated: 2026-05-15
topics: [audio, stt, local-ai, workflow, video-processing]
tools: [ffmpeg, ai-studio, kesha, parakeet, codex]
source_type: text
source_url:
sources: []
related:
  briefs:
    - 02_briefs/2026-05-15-local-video-to-structured-text.md
  standards:
    - 04_standards/local-video-to-structured-text.md
---

# Intake: local-video-to-structured-text

Date added: 2026-05-15
Type: text
Source: user note in Codex thread
Status: processed

## Why this may matter

- Повторяемая задача: извлечь аудио из видео и получить структурированный текст.
- Раньше workflow требовал ручного шага: извлечь mp3 через ffmpeg, затем загрузить в AI Studio и промптить.
- Новый подход может стать локальным агентным workflow для автоматической обработки видео на Mac.

## Raw material or link

Появилась задача вытащить аудио из видео и сделать структурированный текст по этому аудио.

Обычно, я просил агента использовать ffpmeg для извлечения аудио и далее полученный mp3 я руками кидал в ai.studio и промптил. 
Это хорошо работало, но требовало делать это руками

Вчера я решил сделать это полностью с помощью агентов локально на Маке.

Я помнил что существует некая модель parakeet и якобы она хорошо работает с ру аудио. Ок, пошёл разбираться, как запустить её локально.
В одном чатике мне подсказали использовать kesha cli - это обёртка над тулами для работы с llm которые работают с аудио.
Попросил codex установить это и дал задачу превратить видео в структурированный текст. 
За пару минут без каких-либо проблем codex справился и отдал мне отлично структурированный документ.

## Initial questions

- Насколько стабилен и воспроизводим workflow через kesha cli?
- Что именно делает kesha cli: извлечение аудио, ASR, diarization, summarization, structured output?
- Какая модель Parakeet использовалась и каково качество для русского аудио?
- Нужно ли оформить это как стандартный локальный pipeline для обработки видео?

## Expected output

brief
