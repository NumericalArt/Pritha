---
id: codex-cli-primary-opencode-watch-2026-11-01
type: decision
status: accepted
created: 2026-11-01
updated: 2026-11-01
topics: [pritha, coding-agents, runtime-adapters, provider-portability, accepted-behavior]
tools: [Codex CLI, OpenCode, Pritha]
sources:
  - source-e1199486-a76d-4cdb-afd7-45296b6d1049
  - 03_reviews/2026-11-01-opencode-pritha-runtime-assessment.md
related:
  intakes: [00_inbox/texts/2026-11-01-opencode-runtime-intake.md]
  signals: [01_sources/signals/2026-11-01-opencode-runtime-signal.md]
  assessments: [03_reviews/2026-11-01-opencode-pritha-runtime-assessment.md]
  decisions: [05_decisions/2026-08-26-control-center-codex-chat-architecture.md]
  workflows:
    - 07_workflows/2026-11-01-opencode-runtime-experiment.md
    - 07_workflows/2026-11-01-pritha-provider-convergence-roadmap.md
  standards: [04_standards/pritha-good-state-alignment.md]
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-11-01
source_updated: 2026-11-01
source_version: operator runtime direction accepted 2026-11-01
retrieved: 2026-11-01
verified: 2026-11-01
valid_for: Pritha runtime priorities until an explicit reconsideration
temporal_status: current
memory_domain: governance
memory_domains: [governance, pritha-self, agent-building-knowledge]
subject: {kind: decision, id: codex-cli-primary-opencode-watch}
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Codex CLI остаётся основным транспортом Pritha

Пользователь подтвердил текущий транспорт Codex CLI как проверенный,
отработанный и подходящий для работы с подключаемыми провайдерами и моделями.
Pritha продолжает использовать этот путь.

## Решение

- OpenCode сохраняется как потенциальный проект со статусом **watch**.
- Предложенный пилот имеет статус **deferred**; активных задач по внедрению нет.
- Наличие альтернативного исполнителя само по себе не является причиной
  менять принятый транспорт, повторять уже решённую интеграцию или создавать
  дополнительную эксплуатационную нагрузку.
- Исследование и план сохраняются для справки; регулярный мониторинг,
  напоминания и автоматическое возвращение к эксперименту не назначаются.

## Принятое поведение и сверка Good State

Сохранить существующий Codex CLI транспорт, совместимость его адаптеров,
историю задач и установленные границы исполнения. Это узкая фиксация
принятого архитектурного направления, без нового Git/tag recovery point.
Good State Alignment: **aligned** с сохранением истории и instance isolation.

## Условия возвращения

Вернуться к оценке по новому запросу пользователя либо при появлении
конкретной неудовлетворённой потребности: ограничения текущего транспорта
или существенной возможности OpenCode с понятной пользой для Pritha.
Сначала заново проверить актуальность и стоимость перехода.

## Альтернативы и временной контекст

Немедленный пилот отложен; полная замена Codex CLI не выбрана.
Пересмотрена рекомендация действия из assessment от 2026-11-01,
а не его технические факты. Решение основано на выборе пользователя
от 2026-11-01 и действует до явного пересмотра; новой проверки runtime
или универсальной совместимости моделей оно не заявляет.
