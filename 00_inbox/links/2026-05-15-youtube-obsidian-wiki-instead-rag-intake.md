---
id: 2026-05-15-youtube-obsidian-wiki-instead-rag-intake
type: intake
status: processed
created: 2026-05-15
updated: 2026-05-15
topics: [youtube, obsidian, llm-wiki, rag, knowledge-base, agent-memory]
tools: [youtube, yt-dlp, mlx-whisper, obsidian, markdown, codex, claude-code]
source_type: video
source_url: https://www.youtube.com/watch?v=2ZHHzfMSeWc
sources:
  - https://www.youtube.com/watch?v=2ZHHzfMSeWc
  - 01_sources/raw/youtube-2ZHHzfMSeWc/2ZHHzfMSeWc-whisper-small.md
  - https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
related:
  briefs:
    - 02_briefs/2026-05-15-youtube-obsidian-wiki-instead-rag-brief.md
  reviews:
    - 03_reviews/2026-05-15-youtube-obsidian-wiki-instead-rag-assessment.md
  standards:
    - 04_standards/memory-structure.md
  decisions:
    - 05_decisions/2026-05-15-memory-architecture.md
---

# Intake: youtube-obsidian-wiki-instead-rag

Date added: 2026-05-15
Type: video
Source: https://www.youtube.com/watch?v=2ZHHzfMSeWc
Status: processed

## Why this may matter

- Видео разбирает LLM Wiki / Karpathy knowledge base pattern: raw sources, generated wiki, schema rules, ingest/query/lint.
- Тема напрямую совпадает с направлением Techscope: долговременная память для агента, Markdown как source of truth, Obsidian UI и индексы поверх файлов.
- Может подсказать следующий эксперимент: добавить слой agent-maintained wiki pages поверх наших intake/brief/review/decision/standard.

## Raw material or link

- YouTube: https://www.youtube.com/watch?v=2ZHHzfMSeWc
- Local raw transcript: `01_sources/raw/youtube-2ZHHzfMSeWc/2ZHHzfMSeWc-whisper-small.md`
- Local ASR output directory: `01_sources/raw/youtube-2ZHHzfMSeWc/`

## Initial questions

- Должны ли мы оставить текущую архитектуру Markdown + SQLite embeddings или добавить отдельный `wiki/` слой, который агент будет компилировать из source artifacts?
- Где граница между human-authored artifacts и agent-maintained wiki pages?
- Нужно ли вводить команды `ingest`, `query`, `lint` как формальный Techscope workflow?
- Как не размножить галлюцинации, если LLM будет переписывать производные wiki-страницы?

## Expected output

brief | review | experiment
