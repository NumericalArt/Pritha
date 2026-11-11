---
id: bb-agent-workspace-intake-2026-11-06
type: intake
status: processed
created: 2026-11-06
updated: 2026-11-06
topics: [agent-interface, provider-portability, git-worktrees, extensibility]
tools: [bb, Git, Pritha]
source_type: text
source_class: text
ingested_at: 2026-11-06
processed_at: 2026-11-06
retention_status: source-purged
usefulness: high
evidence_quality: medium
anonymous_source_id: source-35e73452-631f-4b93-bda3-e4111d4550ea
sources: [source-35e73452-631f-4b93-bda3-e4111d4550ea]
related:
  signals: [01_sources/signals/2026-11-06-bb-agent-workspace-signal.md]
  assessments: [03_reviews/2026-11-06-bb-pritha-assessment.md]
supersedes: []
superseded_by: []
memory_domain: source-material
memory_domains: [source-material]
subject: {kind: intake, id: bb-agent-workspace}
privacy: public
retention: source-purged
review_status: processed
confidence: medium
---

# Программируемая среда для нескольких coding-агентов

## Исходная гипотеза

В bb человек и агент могут работать с одной задачей через разные интерфейсы.
Для Приты это могло бы упростить разбор остановившейся сборки и передачу
результатов между исполнителями.

## Вопросы для проверки

- Как bb подключает разных исполнителей и какой контекст получает новый тред?
- Какие изменения разделяет Git worktree и что произойдёт с незаписанной работой при удалении?
- Как агент узнаёт команды нового расширения? Какие из этих механизмов уже есть у Приты?

## Результат обработки

Технические утверждения сверены с опубликованным релизом. Выводы и границы проверки
собраны в [оценке для Приты](../../03_reviews/2026-11-06-bb-pritha-assessment.md).
