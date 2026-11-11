---
id: opencode-runtime-signal-2026-11-01
type: signal
status: refined
created: 2026-11-01
updated: 2026-11-01
topics: [coding-agents, runtime-adapters, provider-portability, execution-boundary]
tools: [OpenCode, Codex CLI, Pritha]
agent_platforms: [OpenCode, Codex]
model_context: [provider-selected]
runtime_environment: [CLI, local-server, API]
config_surfaces: [AGENTS.md, SKILL.md, MCP, permissions]
portability: adapter-needed
sources: [source-4468a160-9328-443e-965a-1a6528d51733]
related:
  intakes: [00_inbox/texts/2026-11-01-opencode-runtime-intake.md]
  assessments: [03_reviews/2026-11-01-opencode-pritha-runtime-assessment.md]
  workflows: [07_workflows/2026-11-01-opencode-runtime-experiment.md]
  decisions: [05_decisions/2026-11-01-codex-cli-primary-opencode-watch.md]
generated_from: [00_inbox/texts/2026-11-01-opencode-runtime-intake.md]
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
supersedes: []
superseded_by: []
source_published: unknown
source_updated: unknown
source_version: OpenCode V2 documentation with v2.2.5 release context
retrieved: 2026-11-01
verified: 2026-11-01
temporal_status: version-bound
memory_domain: source-material
memory_domains: [source-material, agent-building-knowledge]
subject: {kind: signal, id: independent-coding-runtime}
privacy: public
retention: source-purged
review_status: reviewed
confidence: medium
pritha_fit: watch
---

# Signal: независимый coding runtime

## Core signal

Выбор нескольких поставщиков моделей не обеспечивает независимость от
исполнителя, если все подключения используют один и тот же agent loop.
Для Pritha это сохранено как архитектурное знание. Текущий Codex CLI
транспорт принят как проверенный; OpenCode имеет статус watch без активного пилота.

## Technical details

- OpenCode предоставляет отдельный исполнитель с CLI и API.
- Общие инструкции проекта переносимы частично; события, права и история
  требуют адаптера.
- В Pritha некоторые внешние провайдеры уже используют Codex как исполнитель;
  именно здесь независимый runtime меняет архитектурную зависимость.

## Agent design implications

Host должен сохранять ответственность за доступ, бюджет, состояние задачи
и проверку результата при смене исполнителя.
Общий сервер, разрешения tools и поток событий не заменяют доказанную
изоляцию экземпляров и восстановление состояния.

## Candidate rules

Сравнивать модели и исполнители отдельно, на одинаковых заданиях.

## Noise removed

Не переносить популярность продукта в оценку качества выполнения задач.

## Verification required

При будущем возвращении к теме понадобятся проверки остановки,
восстановления, изоляции и стоимости результата.

## Codex refinement notes

В текущем Codex thread сопоставлены официальные документы V2, локальные
drivers и прежние решения об истории и execution control plane.
Превосходство в качестве или цене и готовность к полной замене не установлены.
По решению пользователя первоначальное предложение эксперимента отложено;
основным транспортом остаётся Codex CLI.

## Source links

Проверенные технические ссылки находятся в связанном assessment.
