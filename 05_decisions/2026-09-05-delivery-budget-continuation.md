---
id: 2026-09-05-delivery-budget-continuation
type: decision
status: implementation-selected
created: 2026-09-05
updated: 2026-09-05
topics: [agents-mother, delivery-continuation, goal-budget, host-verification, control-center]
tools: [Pritha, Codex App Server, Node.js, Next.js]
sources:
  - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
  - 05_decisions/2026-09-05-delivery-goal-lifecycle-and-accounting.md
  - https://learn.chatgpt.com/docs/app-server
  - https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex
related:
  reviews:
    - 03_reviews/2026-09-05-pritha-budget-continuation-implementation-review.md
  standards:
    - 04_standards/pritha-good-state-alignment.md
    - 04_standards/agent-trajectory-control-and-evidence.md
  workflows:
    - 07_workflows/2026-09-05-pritha-pilot-roadmap-execution-preparation.md
supersedes: []
superseded_by: []
refines: [05_decisions/2026-09-05-delivery-goal-lifecycle-and-accounting.md]
freshness_status: current
source_published: 2026-09-05
source_updated: 2026-09-05
source_version: Pritha 43baa16 plus local continuation packet; Codex CLI 0.153.0 and App 0.153.4
retrieved: 2026-09-05
verified: 2026-09-05
temporal_status: version-bound
memory_domain: agent-building-knowledge
memory_domains: [agent-building-knowledge, pritha-self, governance]
subject:
  kind: pritha
  id: pritha
privacy: public
retention: durable
review_status: reviewed
confidence: medium
---

# Decision: лимиты сохраняют путь к завершению агента

Уточнение пользователя от 2026-09-05: ограничения по токенам, времени и шагам
не должны создавать тупик при создании агента. Если нужен дополнительный
контроль, Pritha сохраняет работу и предлагает конкретное продолжение.

Лимит регулирует следующий модельный шаг. Исчерпание бюджета само по себе
не требует нового run, нового Contract/Outcome Spec или ручного переноса кода.
Разрешённые проверки уже созданного результата проходят независимо от
остатка модельного бюджета; ещё не готовый результат получает путь продления.
Само достижение лимита не означает готовность, отказ от цели или разрешение
неограниченного расхода.

## Дополнительное разрешение в том же delivery run

Host ledger хранит отдельные budget amendments: кто разрешил изменение,
идентификатор запроса, точные добавления, значения до/после и дату.
Разрешение Contract/Outcome Spec, locked Trial plan, worktree и измеренный
расход сохраняются. Token/iteration/time extensions независимы; продление
одного ограничения не повышает остальные автоматически. При исчерпанном
времени новая длительность отсчитывается от момента разрешения.

Повтор того же запроса не увеличивает бюджет второй раз. Другие значения
под тем же ID отклоняются; устаревшая ожидаемая версия требует обновления
состояния. Один run одновременно исполняет один host controller. Preflight
показывает observed, reserved, available и полноту учёта.
Количество прежних продлений само по себе не запрещает следующее разрешение
и не вынуждает создавать новую задачу; прежние receipts сохраняются.

Альтернативы — создание нового run при каждом лимите или автоматическое
бесконечное расширение — теряют связность работы либо контроль стоимости.
Выбранная схема добавляет небольшой private журнал разрешений и recovery,
но позволяет продолжать с уже полученным результатом.

## Завершение существующего результата

После завершённого, failed или interrupted build turn подтверждённый overshoot
сохраняется полностью. Host сначала выполняет согласованные Trials. Если
результат готов, формируется verified/awaiting_acceptance и delivery report.
Если нужна реализация, новый model turn требует достаточного разрешённого
остатка и нормального состояния учёта.

Явный `delivery verify` запускает только этот путь проверки. При unknown usage
он допустим лишь для точно завершённых и архивированных native попыток.
Неясное исполнение или legacy-unknown сначала требуют recovery. Статус
готовности результата и полнота учёта независимы: verified не скрывает
оставшийся unknown расход и не разрешает следующий модельный шаг.

Host-only означает отсутствие build `turn/start` со стороны оркестратора.
Trials по-прежнему используют одобренные cwd/argv, timeout, output limits,
backend/isolation и защищённые verifier inputs. Произвольный subprocess может
обращаться к сети или модели; его расход не объявляется нулевым и не входит
автоматически в метрику build executor. Acceptance, promotion и deployment
сохраняют свои отдельные условия.

## Goal конкретной задачи в Task Chat

Панель использует существующие native task bindings и защищённый API.
Она показывает objective, used/cap/status и различает «добавить N» и
«установить общий лимит N». Продолжение Goal выбирается явно вместе с
изменением бюджета. Объект Goal, бюджет delivery run и квота аккаунта
показываются как разные сущности; увеличение Goal не меняет другие два.

Private receipt записывается до Goal RPC и содержит абсолютный итоговый лимит.
Readback сверяет thread, objective identity, createdAt, cap и отсутствие
сброса usage. После потери ответа применяется тот же запрос; подтверждённое
изменение повторно не отправляется. Обновление не передаёт новый objective,
не вызывает clear и не создаёт пользовательскую задачу или `turn/start`.
Native engine может продолжить активированный Goal согласно своим правилам.
Устаревшее неисполненное продление получает `superseded`, если цель завершена,
заменена или её расход уже достиг предложенного лимита. Receipt сохраняется,
а пользователь может выбрать новый бюджет по текущему состоянию.

Обновление недоступно при незавершённом шаге/ожидающем approval, неверном
storage binding, archived chat или неразрешённом voice continuation.
Сетевой сбой Goal API не блокирует загрузку истории. Legacy capability cache
перечитывает поддержку Goal из схемы установленного runtime.

Native Goal RPC не предоставляет compare-and-set по revision. Lease
сериализует локальные операции Task Chat для provider/thread; внешние клиенты
этот lease не разделяют. Проверка revision/readback обнаруживает конфликт,
но не доказывает атомарность нескольких независимых клиентов. Этот предел
нужно учитывать в дальнейшем native pilot.

Семантика Goal и сохранения usage сверена с
[App Server](https://learn.chatgpt.com/docs/app-server#manage-a-thread-goal)
и [описанием Goals](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex).
Дата обновления документации не указана; вывод привязан к установленным
версиям и протокольным проверкам в implementation review.
