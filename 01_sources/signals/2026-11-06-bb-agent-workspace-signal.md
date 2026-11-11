---
id: bb-agent-workspace-signal-2026-11-06
type: signal
status: refined
created: 2026-11-06
updated: 2026-11-06
topics: [agent-interface, agent-harness, handoff, git-worktrees, extensibility]
tools: [bb, Git, Pritha]
agent_platforms: [bb, Codex, Claude Code, Pi, Cursor, Grok Build]
model_context: [provider-selected]
runtime_environment: [desktop, local-web-app, CLI]
config_surfaces: [provider-plugins, plugin-CLI, skills, worktrees]
portability: adapter-needed
sources: [source-35e73452-631f-4b93-bda3-e4111d4550ea]
related:
  intakes: [00_inbox/texts/2026-11-06-bb-agent-workspace-intake.md]
  assessments: [03_reviews/2026-11-06-bb-pritha-assessment.md]
  workflows: [07_workflows/2026-11-06-delivery-blocker-visibility-experiment.md]
generated_from: [00_inbox/texts/2026-11-06-bb-agent-workspace-intake.md]
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
source_class: text
anonymous_source_id: source-35e73452-631f-4b93-bda3-e4111d4550ea
processed_at: 2026-11-06
retention_status: source-purged
usefulness: high
evidence_quality: high
supersedes: []
superseded_by: []
source_published: 2026-10-30
source_updated: 2026-10-30
source_version: bb desktop-v0.48.1
retrieved: 2026-11-06
verified: 2026-11-06
temporal_status: version-bound
memory_domain: source-material
memory_domains: [source-material, agent-building-knowledge]
subject: {kind: signal, id: bb-agent-workspace}
privacy: public
retention: source-purged
review_status: reviewed
confidence: high
---

# Одна задача в интерфейсе оператора и агента

## Core signal

В bb плагин Tasks связывает задачу с тредами исполнителей. Оператор открывает
её в панели, агент читает ту же задачу через CLI и получает инструкцию,
как сообщить о ходе работы. Список команд расширений можно собирать из их
фактических регистраций. Для Приты качество такого интерфейса можно проверить,
попросив человека и агента объяснить одну и ту же остановку сборки.

## Technical details

- При передаче задачи интерфейс bb формирует запрос на новый тред со ссылкой на исходный, выбранным провайдером, моделью и режимом доступа. Среду можно использовать повторно.
- Git worktree отделяет изменяемые файлы и ветку. Доступ процесса к файлам и сети, а также объединение правок требуют отдельных правил.
- Для части встроенных плагинов bb проверяет сборку копии вне монорепозитория. Так выявляются зависимости от внутренних пакетов.

## Agent design implications

Для объяснения остановки Прита уже хранит в журнале сборки код причины,
вопрос и варианты решения. Показ этих сведений можно проверять отдельно от
права отвечать, выдавать бюджет и продолжать работу.

## Candidate rules

На синтетической сборке сравнивать статус, причину и состояние приёмки по всем
разрешённым интерфейсам. Проверять привязку к конкретной сборке до показа
подробностей.

## Noise removed

Суждения о популярности сокращения и скорости роста звёзд исключены из оценки.

## Verification required

Время до правильного ответа оператора на вопрос о причине остановки предстоит измерить.

## Codex refinement notes

Сверены релизные документы и исходники bb, текущие интерфейсы Приты и ответы
локальной тестовой сборки с исчерпанным бюджетом.

## Source links

Версия, первоисточники и наблюдение по тестовой сборке собраны в [оценке применимости](../../03_reviews/2026-11-06-bb-pritha-assessment.md).
