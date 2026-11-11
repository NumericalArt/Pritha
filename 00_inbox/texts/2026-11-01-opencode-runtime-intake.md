---
id: opencode-runtime-intake-2026-11-01
type: intake
status: processed
created: 2026-11-01
updated: 2026-11-01
topics: [coding-agents, runtime-adapters, provider-portability, pritha]
tools: [OpenCode, Codex CLI, Pritha]
source_type: text
source_class: text
ingested_at: 2026-11-01
processed_at: 2026-11-01
retention_status: source-purged
usefulness: high
evidence_quality: medium
anonymous_source_id: source-4468a160-9328-443e-965a-1a6528d51733
sources: [source-4468a160-9328-443e-965a-1a6528d51733]
related:
  signals: [01_sources/signals/2026-11-01-opencode-runtime-signal.md]
  assessments: [03_reviews/2026-11-01-opencode-pritha-runtime-assessment.md]
  decisions: [05_decisions/2026-11-01-codex-cli-primary-opencode-watch.md]
supersedes: []
superseded_by: []
memory_domain: source-material
subject: {kind: intake, id: opencode-runtime}
privacy: public
retention: source-purged
review_status: processed
confidence: medium
---

# Intake: альтернативный исполнитель для Pritha

Проверить пользу OpenCode для разработки и выполнения задач Pritha,
разделив смену модели, смену исполнителя и замену пользовательского интерфейса.
Исходная гипотеза: независимый coding runtime может уменьшить зависимость
адаптеров моделей от поведения Codex CLI.

## Processed status

Сохранена техническая постановка без исходной переписки и личных данных.
Результат — assessment и принятое решение сохранить OpenCode со статусом
watch. Первоначальный план эксперимента отложен. Основным транспортом
Pritha остаётся проверенный Codex CLI.

## Initial questions

- Какие возможности уже существуют в Pritha?
- Какие гарантии истории, прав доступа и остановки потребуют нового адаптера?
- Есть ли измеримая польза сверх простого выбора другой модели?
