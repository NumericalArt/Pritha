---
id: server-agent-cockpit-signal-2026-10-29
type: signal
status: refined
created: 2026-10-29
updated: 2026-10-29
topics: [agent-harness, observability, web-interface, isolation, agent-communication]
tools: [Pritha, Paddock, Docker, Codex App Server]
sources: [source-226690c3-fdfe-400d-8d02-536b84a64bdb]
generated_from: [00_inbox/links/2026-10-29-server-agent-cockpit-intake.md]
related:
  intakes: [00_inbox/links/2026-10-29-server-agent-cockpit-intake.md]
  assessments: [03_reviews/2026-10-29-paddock-agent-hub-assessment.md]
  workflows: [07_workflows/2026-10-29-agent-workspace-observability-experiment.md]
supersedes: []
superseded_by: []
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
memory_domain: agent-building-knowledge
memory_domains: [agent-building-knowledge, pritha-self]
subject:
  kind: signal
  id: server-agent-cockpit
privacy: public
retention: durable
review_status: reviewed
confidence: medium
source_version: technical reference snapshot e7bd2d61817f4bb5645c781929cd17aa0d55862e
verified: 2026-10-29
temporal_status: version-bound
---

# Signal: наблюдаемое рабочее место для нескольких агентов

## Core signal

Оператору полезно видеть несколько задач, ожидаемые решения, изменения файлов
и диагностику в одном месте. Это отдельный UX-слой над существующим агентным
runtime; он не требует переписывать создание агентов или хранение истории.

## Technical details

- Браузерная раскладка и сохранённые layouts отделены от серверных сессий.
- Контейнер пользователя не изолирует конкурирующие задачи этого пользователя.
- CLI с описанием в skill даёт переносимый способ вызова, но конкретный backend
  остаётся зависимым от протокола и полномочий выбранного harness.
- Время до первого события, до текста ответа и скорость выдачи токенов имеют
  разные определения. Reachability API не доказывает доступность рабочего вызова.
- Карточке разрешения нужна защита от случайного клика после изменения layout.

## Agent design implications

Для Pritha приоритетны панель наблюдения и обзор двух задач. Общение агентов
требует разрешённых адресатов, ограниченного контекста и проверки человеческого
намерения. Сообщение другого агента не становится командой пользователя.

## Candidate rules

Сохранять независимость gateway, runtime, сессии, файлового workspace и внешнего
эффекта. Сначала read-only observability, затем ограниченный UI-эксперимент.
Для изоляции фиксировать реально проверенную границу, а не название технологии.

## Noise removed

Исключены биографические сведения, обещания отсутствия блокировок аккаунтов,
рекламное сравнение и общие утверждения о работе с любым CLI.

## Verification required

Перед adoption нужны regression Trials для draft/approval/history isolation,
проверки сети и секретов вне агентного writable scope, а также явный contract
конкретного межагентного обмена. Чужие live E2E самостоятельно не запускались.

## Codex refinement notes

Signal уточнён по pinned исходникам и существующим решениям Pritha. Runtime
и инфраструктура не изменялись. Новые стандарты не приняты.

## Source links

Технические ссылки и границы проверки сохранены в связанном assessment;
provenance исходного входящего сообщения не сохраняется.
