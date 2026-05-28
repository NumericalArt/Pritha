---
id: youtube-transcription
type: workflow
status: active
created: 2026-05-15
updated: 2026-05-15
topics: [youtube, transcription, stt, local-ai, workflow]
tools: [yt-dlp, imageio-ffmpeg, mlx-whisper, whisper-small]
sources:
  - 02_briefs/2026-05-15-youtube-local-transcription-test-brief.md
related:
  briefs:
    - 02_briefs/2026-05-15-youtube-local-transcription-test-brief.md
  standards:
    - 04_standards/local-video-to-structured-text.md
---

# Workflow: youtube transcription

## Goal

Получить локальную транскрибацию YouTube-видео без ручного скачивания, извлечения аудио и запуска ASR.

## Command

```sh
node scripts/transcribe-youtube.mjs https://www.youtube.com/watch?v=bT7aKIwiFjE
```

Optional:

```sh
node scripts/transcribe-youtube.mjs <youtube-url> --language ru --model mlx-community/whisper-small-mlx --force
```

## Outputs

Для видео `https://www.youtube.com/watch?v=<id>` результат сохраняется в:

```text
01_sources/raw/youtube-<id>/
```

Файлы:

- `<id>.mp4`: скачанное видео.
- `<id>.wav`: извлеченное mono 16k audio.
- `<id>-whisper-small.json`: raw ASR output with segments.
- `<id>-whisper-small.txt`: plain text transcript.
- `<id>-whisper-small.md`: readable transcript with metadata and segments.

## Rules

- `01_sources/raw/` не индексируется как knowledge memory напрямую.
- Полный транскрипт стороннего видео хранить только как raw artifact.
- В `02_briefs/` сохранять summary, выводы и технические заметки, а не полный transcript.
- После важной транскрибации создать intake или brief, если материал полезен для проекта.

## Current implementation

The workflow is implemented by `scripts/transcribe-youtube.mjs`.

