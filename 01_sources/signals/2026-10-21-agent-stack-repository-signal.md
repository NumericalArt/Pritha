---
id: 2026-10-21-agent-stack-repository-signal
type: signal
status: refined
created: 2026-10-21
updated: 2026-10-21
topics: [agent-engineering, agent-sdk, extension-surface, agent-interface, runtime-compatibility]
tools: [Pritha, Codex, MCP, TypeScript, Python]
sources: [source-9e75c076-d73b-42cf-a96f-c3d9c3c5082c]
related:
  intakes:
    - 00_inbox/texts/2026-10-21-agent-stack-repository-intake.md
  assessments:
    - 03_reviews/2026-10-21-agent-stack-repository-assessment.md
  reviews:
    - 03_reviews/2026-10-21-pritha-retrieval-and-runtime-verification.md
  standards:
    - 04_standards/agent-minimal-core-extension-surface.md
    - 04_standards/agent-interface-experience.md
    - 04_standards/agent-runtime-placement.md
generated_from:
  - 00_inbox/texts/2026-10-21-agent-stack-repository-intake.md
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
supersedes: []
superseded_by: []
memory_domain: source-material
memory_domains: [source-material, agent-building-knowledge]
subject:
  kind: signal
  id: agent-stack-repository-review
privacy: public
retention: source-purged
review_status: reviewed
confidence: medium
---

# Signal: выбирать агентный слой по выполняемой работе

Date: 2026-10-21
Status: refined
Signal quality: high
Extraction mode: codex-assisted
Refinement status: codex-refined

## Core signal

UI extension, API client, библиотека agent loop и coding runtime решают
разные задачи. Их нельзя складывать в один стек без явного распределения
владения состоянием, контекстом, approvals и результатом.

## Technical details

- MCP-виджет связывает tool с интерактивным ресурсом; отображение и
  полномочия зависят от host, а не только от наличия сервера.
- SDK собственного agent loop полезен приложению, которое владеет storage,
  tools и approvals. SDK готового coding agent имеет другую границу.
- Плагины с явным lifecycle, scoped services и reversible registrations
  позволяют уменьшить связность. Разгрузка policy plugin не должна снимать
  обязательную защиту внешнего control plane.
- Durable session facts и live process events следует различать: одно
  нужно для восстановления, другое — для наблюдения и расширений.
- Старое руководство по transport нельзя переносить на новый CLI без
  проверки текущей документации и установленной версии.

## Agent design implications

Pritha уже использует coding runtime через собственный adapter. Первичный schema/paused probe не делал model turn; последующая verification включает реальные native model turns, recovery и interrupt. Успешные call/result receipts проверены, но отменённый in-flight tool wait не даёт полной завершённой native history и требует host audit/reconcile. Curated FTS v2 принят для agent-building research. MCP View проверен на отдельном локальном host, OpenAI SDK — на одном live API сравнении; production UI integration и альтернативный executor требуют своего contract-specific решения. Замена ядра новым harness не обоснована. Результаты и ограничения: `03_reviews/2026-10-21-pritha-retrieval-and-runtime-verification.md`.

## Candidate rules

Выбирать один слой под подтвержденный пробел; фиксировать версии; сохранять
host-owned verifier и approvals; отделять наличие механизма от доказанной
пользы; подтверждать host support и plugin lifecycle на малом сценарии.

## Noise removed

Install-команды, рекламные обещания универсальной совместимости, чужие
схемы конфигурации и предположение о необходимости массовой миграции.

## Verification required

Перед пилотом подтвердить exact dependency/runtime pin, host capabilities,
выбранный contract, permissions, license scope и одинаковые Trials.

## Codex refinement notes

В текущем Codex thread прочитаны официальные docs и repository snapshots,
проверены релизы, ограничения и текущие adapters. Разделены готовая
возможность, reference pattern и гипотеза пользы. Исправляется устаревшая
transport-рекомендация; runtime и dependency defaults сохраняются.

## Source links

В этом слое сохранен анонимный источник. Технические references находятся
в связанном assessment.
