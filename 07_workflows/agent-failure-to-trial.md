---
id: agent-failure-to-trial
type: workflow
status: active
created: 2026-10-21
updated: 2026-10-21
topics: [agent-evals, failure-analysis, evidence-verification, protected-trials]
tools: [Pritha, Codex, Git, Trials]
agent_platforms: [Pritha, Codex, portable agents]
model_context: [task-specific; judge is inferential]
runtime_environment: [manual review, local tests]
config_surfaces: [agent-outcome-spec, protected verifier, approvals, ledger]
portability: adapter-needed
sources:
  - 03_reviews/2026-10-21-agent-repository-deep-review.md
  - 07_workflows/agent-sensor-and-eval-design.md
related:
  standards:
    - 04_standards/agent-feedback-sensors-and-evaluation-loops.md
    - 04_standards/agent-harness-evaluation.md
  templates:
    - 08_templates/agent-failure-evidence.md
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
memory_domains: [agent-building-knowledge, pritha-self, governance]
subject:
  kind: workflow
  id: failure-to-trial
privacy: public
retention: durable
review_status: reviewed
confidence: high
freshness_status: current
source_published: 2026-10-08
source_updated: 2026-10-21
source_version: manual workflow v1; existing protected Trial API
retrieved: 2026-10-21
verified: 2026-10-21
temporal_status: version-bound
---

# Превращение сбоя агента в защищённый Trial

Ручной разбор должен установить, какое требование нарушено, на какой версии это произошло и какой независимый тест обнаружит повторение. Generic sensor runtime, scheduled collection и calibrated LLM judge этим workflow не создаются.

## Evidence и воспроизведение

1. Зафиксировать expected/actual, время, model/runtime/tool versions, exact code revision, intent и разрешённые effects. Raw transcript/credentials хранить только в instance-private workspace с retention; в authored knowledge переносить обезличенную выжимку.
2. Проверить outcome requirement и authoritative source. HTTP 200, успешный exit code и похожий embedding не доказывают выполнение задачи.
3. Разнести наблюдения и cause hypotheses: model, harness, tool/schema, retrieval, instructions, external dependency или infrastructure. Root cause на другой revision маркировать uncertain.
4. Независимо воспроизвести сбой минимальным synthetic fixture. Нужны negative control со старым поведением, positive control с исправлением и контрпример, где предполагаемая причина отсутствует.
5. Если воспроизведение невозможно, оставить candidate finding с open question. Model judge может предлагать случаи, но не подтверждает причину или acceptance самостоятельно.

## Защищённая проверка

Привязать assertion к видимому Outcome, определить product target и отдельные verifier inputs. Записать hash и host-reviewed provenance через существующие Outcome/Trial declarations; новый JSON plan вручную не создавать. Compiler и host-owned approval остаются единственным путём запуска delivery.

Executor не меняет approved Outcome, verifier, gold fixtures, approval store, budgets или ledger. Проверка должна отвергать stub/wrong product и mutation verifier, а не только искать строку PASS. Local backend честно указывает isolation none; sandbox-required Trial проходит подтверждённый backend или останавливается.

## Классы сбоев и готовые probes

| Сбой | Минимальная проверка |
| --- | --- |
| Неполная история параллельных tools | Все call IDs имеют соответствующие results после restore; порядок и project isolation сохранены. |
| Повтор внешнего эффекта после timeout | Один idempotency key, authoritative readback и ambiguous state до reconcile. |
| Старое знание выдано за текущее | Curated domain, document status, exact release/source date, supersedes link. |
| Поиск уводит в private или sibling memory | Synthetic canary, запрет unsafe paths/user-model, instance-only DB resolver. |
| Поздний голосовой результат | Session/delegation/intent revision совпадают с активным намерением. |
| Ошибка самого evaluator | Отдельные infrastructure-error/unknown, таймаут и integrity check; не pass. |

## Завершение

Выполнить relevant tests, затем требуемый self-test для code scope. Сохранить outcome metric, регрессионные случаи, false positives/negatives, бюджет, ограничения и rollback. Обновить review/workflow, rebuild и embeddings, strict privacy audit. Publication и production lifecycle проходят собственные gates.

Состояния reproduced, Pritha-tested, verified и user-accepted различаются. Разбор без воспроизведения не становится подтверждённой причиной. Ссылка на этот workflow дополняет существующий sensor design и не объявляет generic sensors реализованными.
