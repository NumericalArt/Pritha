---
id: 2026-09-05-pilot-driven-improvement-signal
type: signal
status: refined
created: 2026-09-05
updated: 2026-09-05
topics: [agents-mother, outcome-delivery, goal-budget, evidence, pilot-metrics]
tools: [Pritha, Codex, Markdown]
sources: [source-e8152359-342c-4fb6-849d-ccf490fe47a2]
related:
  intakes: [00_inbox/texts/2026-09-05-pilot-driven-improvement-planning.md]
  reviews: [03_reviews/2026-09-05-pritha-pilot-roadmap-current-state-assessment.md]
generated_from: [2026-09-05-pilot-driven-improvement-planning-intake]
supersedes: []
superseded_by: []
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
source_published: 2026-09-05
source_updated: 2026-09-05
source_version: current-checkout comparison
retrieved: 2026-09-05
verified: 2026-09-05
temporal_status: version-bound
memory_domain: source-material
subject:
  kind: signal
  id: pilot-driven-improvement
privacy: public
retention: source-purged
review_status: reviewed
confidence: medium
---

# Signal: завершение агента требует согласованного управления выполнением

## Core signal

Готовый результат пилота и успешный автономный run — разные доказательства.
Развитие фабрики следует планировать по проверяемым переходам между
реализацией, независимой проверкой, принятием и передачей пользователю.

## Technical details

- Существование Goal API в схеме не доказывает его поддержку для выбранного
  типа сессии. Capability probe должен воспроизводить реальную конфигурацию.
- Бюджет пользовательского диалога, бюджет сборки и расход отдельного
  исполнителя требуют раздельного учёта. Неизвестный расход не равен нулю.
- Для CLI применимость операций, проверенность результата и живой процесс
  являются разными свойствами; HTTP health не универсален.
- Сопоставление отчётов должно использовать устойчивую идентичность и
  актуальность evidence, а не только имя файла или порядок отчётов.

## Agent design implications

Начинать с воспроизводимых ошибок и наблюдаемости на одном материнском
экземпляре. Сохранять контракт, отдельное одобрение результата, приватность
экземпляров и независимость проверяющего кода.

## Candidate rules

Не считать stub доверенной проверкой, отсутствие ошибки — подтверждением
публикации, успешный health — принятием результата, а один пилот — основанием
для универсального бюджета. Это кандидаты для дальнейшей проверки, не новые
автоматически принятые стандарты.

## Noise removed

Убраны частные идентификаторы, исходные формулировки, непроверенные обещания
автономности, календарная точность и смешение разных классов бюджета.

## Verification required

Проверить поведение бюджета во время активного turn, безопасное продолжение
после лимита и полный повторный пилот с телеметрией. Старые неполные числовые
данные не восстанавливать предположениями.

## Codex refinement notes

Материал сопоставлен в текущей сессии с кодом, локальными проверками,
официальной документацией и экспертными ракурсами; конкретные доказательства
и ограничения приведены в связанном assessment.

## Source links

Прямая provenance и содержимое частных отчётов в signal не сохраняются.
