---
id: 2026-09-05-delivery-goal-lifecycle-and-accounting
type: decision
status: implementation-selected
created: 2026-09-05
updated: 2026-09-05
topics: [agents-mother, goal-budget, delivery-ledger, runtime-lifecycle]
tools: [Pritha, Codex App Server, Node.js]
sources:
  - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
  - 03_reviews/2026-09-05-pritha-pilot-roadmap-current-state-assessment.md
  - https://learn.chatgpt.com/docs/app-server
related:
  reviews:
    - 03_reviews/2026-09-05-pritha-goal-lifecycle-accounting-implementation-review.md
  standards:
    - 04_standards/agent-trajectory-control-and-evidence.md
    - 04_standards/pritha-good-state-alignment.md
  workflows:
    - 07_workflows/2026-09-05-pritha-pilot-roadmap-execution-preparation.md
supersedes: []
superseded_by: []
source_published: 2026-09-05
source_updated: 2026-09-05
source_version: Pritha 43baa16 plus local guardrails; protocol probes Codex CLI 0.153.0 and App 0.153.4
retrieved: 2026-09-05
verified: 2026-09-05
freshness_status: current
temporal_status: version-bound
memory_domain: agent-building-knowledge
memory_domains: [agent-building-knowledge, pritha-self]
subject:
  kind: pritha
  id: pritha
privacy: public
retention: durable
review_status: reviewed
confidence: medium
---

# Decision: persisted попытки и независимый учёт delivery run

Для пакета 1.0/1.5 выбран persisted native thread на каждую build-попытку.
Thread привязан к run, iteration и identity disposable worktree. Host ledger
остаётся владельцем общего бюджета; Goal этой попытки получает только
подтверждённый остаток. Новый thread начинает с нулевого usage. История другой
попытки не replay'ится, существующие пользовательские threads не меняются.

Реализация и границы проверки зафиксированы в связанном implementation review.
Пустой probe использует paused Goal для материализации rollout; повторный
archive проверяется через native archived listing, без unarchive. Эта
особенность воспроизведена на обеих установленных версиях.

Протокольные fixtures на CLI 0.153.0 и App 0.153.4 подтвердили start с
`ephemeral: false`, Goal get/set/readback, reconnect через новый sidecar,
resume и сохранение Goal, clear и archive. Все семь checks на каждом runtime
прошли. Fixture Goal был paused; ни одного model turn не запускалось.

Альтернатива с одним thread на весь run усложняет привязку накопительных
счётчиков, очистку контекста и восстановление после смены worktree. Сохранённый
ephemeral вариант несовместим с Goal на обеих установленных версиях. Выбранная
проекция сохраняет отдельные iteration contexts существующего executor.

Перед отправкой turn host сохраняет receipt со статусом dispatching; после
ответа — native turn ID. При неясном исходе receipt и неизвестный расход
сохраняются. Recovery читает только связанную попытку и не повторяет dispatch.
Подтверждённую остановленную попытку архивируют; history остаётся в native
private storage. Ошибка остановки/архивирования видна в receipt и блокирует
следующий model turn. Секреты и копии native transcript в ledger не добавляются.

Расход завершённых, failed и interrupted turns сохраняется до решения о
повторе. Goal usage имеет приоритет; при его отсутствии можно использовать
подтверждённый cumulative thread token usage единственного turn. Эти источники
не складываются. Waiver снимает только Goal enforcement на одну попытку и не
доказывает нулевую стоимость. Unknown usage блокирует дальнейший model dispatch.

Ledger v2 сохраняется с версионированным дополнительным учётом и списком
неразрешённых попыток. Старые locks и identity сохраняются; legacy ноль не
становится измерением. Overshoot допустим как факт, сохраняется полностью и
останавливает следующие model turns. Метрика относится к build executor;
parent Task Chat, Trials и другие фазы автоматически в неё не включаются.

Host iteration/time gates, Goal RPC, preflight и mid-turn поведение проверяются
раздельно. Локальные protocol fixtures подтверждают lifecycle, но не hard cap
во время модели. Live model verification требует отдельного выбранного бюджета;
до него mid-turn enforcement остаётся runtime-unverified.

Семантика обновления Goal сверена с
[официальной документацией App Server](https://learn.chatgpt.com/docs/app-server#manage-a-thread-goal).
Дата обновления страницы не указана; версия установленного runtime и дата
настоящей проверки фиксируются отдельно от даты получения документации.
