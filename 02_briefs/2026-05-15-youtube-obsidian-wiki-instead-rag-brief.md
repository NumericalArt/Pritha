---
id: 2026-05-15-youtube-obsidian-wiki-instead-rag-brief
type: brief
status: draft
created: 2026-05-15
updated: 2026-05-15
topics: [youtube, obsidian, llm-wiki, rag, knowledge-base, agent-memory, markdown]
tools: [yt-dlp, mlx-whisper, obsidian, markdown, codex, claude-code]
sources:
  - 00_inbox/links/2026-05-15-youtube-obsidian-wiki-instead-rag-intake.md
  - 01_sources/raw/youtube-2ZHHzfMSeWc/2ZHHzfMSeWc-whisper-small.md
  - https://www.youtube.com/watch?v=2ZHHzfMSeWc
  - https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
  - https://community.obsidian.md/plugins/karpathywiki
related:
  intakes:
    - 00_inbox/links/2026-05-15-youtube-obsidian-wiki-instead-rag-intake.md
  reviews:
    - 03_reviews/2026-05-15-youtube-obsidian-wiki-instead-rag-assessment.md
  decisions:
    - 05_decisions/2026-05-15-memory-architecture.md
  standards:
    - 04_standards/memory-structure.md
    - 04_standards/expert-information-assessment.md
---

# Brief: youtube-obsidian-wiki-instead-rag

Date: 2026-05-15
Source: https://www.youtube.com/watch?v=2ZHHzfMSeWc
Status: draft

## Summary

Видео показывает практический Obsidian setup по мотивам LLM Wiki / Karpathy knowledge base pattern: вместо того чтобы каждый раз делать RAG по сырым chunk-ам, агент постепенно компилирует из raw sources связанную Markdown wiki, поддерживает `index.md` и `log.md`, а затем отвечает на запросы через чтение индекса и релевантных страниц. Автор демонстрирует три операции: `ingest` для добавления источников, `query` для ответов по wiki и `lint` для поиска дубликатов, пропущенных страниц, слабых связей и противоречий.

## Key claims

- Для умеренного объема знаний LLM Wiki может быть проще и точнее классического RAG: агент работает не с разрозненными chunk-ами, а с уже скомпилированными смысловыми страницами и ссылками.
- Базовая структура состоит из трех частей: raw sources, generated wiki и schema/rules file.
- Человек выбирает источники и проверяет качество, а LLM создает и поддерживает wiki pages, cross-links, index и log.
- `index.md` становится входной картой для agent query: агент сначала читает индекс, затем рекурсивно подтягивает нужные связанные страницы.
- `lint` нужен как регулярная операция обслуживания: выявлять orphan pages, missing concept pages, broken links, дубликаты, устаревшие или конфликтующие записи.
- Под каждый крупный проект или исследовательский контекст лучше заводить отдельную wiki, чтобы индекс помещался в контекст и не смешивал разные домены.

## Evidence

- Видео является вторичным практическим пересказом и демонстрацией.
- Паттерн подтверждается актуальным первоисточником Karpathy gist: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- На момент обработки уже есть Obsidian community plugin, реализующий похожий подход: https://community.obsidian.md/plugins/karpathywiki
- В нашем проекте уже есть близкая архитектура: Markdown source of truth, raw artifacts outside index, SQLite sidecar index, semantic search and Obsidian UI.

## Risks and caveats

- LLM Wiki не отменяет RAG и vector search. Скорее это другой слой: curated synthesis and relations before retrieval.
- Главный риск: hallucination propagation. Если агент ошибся при ingest и wiki-страница стала производным "источником", ошибка может закрепиться.
- Нужно явно различать raw source, human-reviewed artifact и agent-maintained derivative page.
- При росте базы `index.md` может стать слишком большим или слишком грубым. Тогда потребуются sub-indexes, search tools или hybrid retrieval.
- Автоматическое переписывание wiki без review опасно для решений и стандартов.

## Recommendation

Считать материал сильным кандидатом на эксперимент для Techscope. Не менять текущую архитектуру на "только LLM Wiki", а добавить поверх нее экспериментальный workflow:

```text
raw source -> intake/brief/review -> agent-maintained concept wiki -> index/log -> query/lint
```

Markdown остается source of truth для решений и стандартов. Agent-maintained wiki pages должны быть производным слоем, пока не пройдут human review.

## Next step

Создать экспериментальный workflow `llm-wiki-layer`:

- определить папку для agent-maintained pages;
- завести `index.md` и `log.md`;
- описать команды `ingest`, `query`, `lint`;
- прогнать эксперимент на уже обработанных YouTube-видео и наших memory architecture документах;
- сравнить качество ответов с текущим semantic search.
