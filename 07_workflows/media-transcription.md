---
id: media-transcription
type: workflow
status: active
created: 2026-05-15
updated: 2026-06-01
topics: [media, transcription, stt, local-ai, workflow]
tools: [transcribe-media, imageio-ffmpeg, mlx-whisper, whisper-small]
sources:
  - 04_standards/local-video-to-structured-text.md
related:
  standards:
    - 04_standards/local-video-to-structured-text.md
---

# Workflow: media transcription

## Goal

Получить локальную транскрибацию поддерживаемого media source без ручного извлечения аудио и запуска ASR.

## Command

```sh
node scripts/transcribe-media.mjs ./01_sources/raw/input/video.mp4 --language ru
```

Optional:

```sh
node scripts/transcribe-media.mjs <media-source> --language ru --model mlx-community/whisper-small-mlx --force
```

## Outputs

Результат сохраняется в generic layout:

```text
01_sources/raw/media/<media-id>/
```

Файлы:

- `source.json`: sanitized source metadata and artifact pointers.
- `original.<ext>`: preserved source media.
- `audio.wav`: extracted mono 16k audio.
- `transcript.json`: raw ASR output with segments.
- `transcript.txt`: plain text transcript.
- `transcript.md`: readable transcript with metadata and segments.

## Rules

- `01_sources/raw/` не индексируется как knowledge memory напрямую.
- Полный транскрипт стороннего видео хранить только как raw artifact.
- В `02_briefs/` сохранять summary, выводы и технические заметки, а не полный transcript.
- После важной транскрибации создать intake или brief, если материал полезен для проекта.

## Current implementation

The workflow is implemented by `scripts/transcribe-media.mjs`.
