---
id: 2026-09-06-api-process-delivery-factory-review
type: review
status: reviewed
created: 2026-09-06
updated: 2026-09-06
topics: [agents-mother, process-service, outcome-driven-delivery, runtime-compatibility]
tools: [Pritha, Node.js, Git, Codex]
sources:
  - scripts/agents-mother/scaffold/api-process.mjs
  - scripts/agents-mother/build-executors.mjs
  - tests/scaffold-api-process.test.mjs
  - tests/agents-mother-build-executors.test.mjs
  - tests/agents-mother-delivery-loop.test.mjs
  - https://learn.chatgpt.com/docs/app-server
related:
  workflows: [07_workflows/agents-mother.md, 07_workflows/agent-handoff-and-diagnostics.md]
  standards: [04_standards/pritha-good-state-alignment.md]
supersedes: []
superseded_by: []
source_published: 2026-09-06
source_updated: 2026-09-06
source_version: "factory commits a8c9ccf through c400821; Node 24.15.0; Codex CLI 0.153.0"
retrieved: 2026-09-06
verified: 2026-09-06
temporal_status: version-bound
memory_domain: agent-building-knowledge
memory_domains: [agent-building-knowledge, pritha-self]
subject: {kind: pritha, id: pritha}
privacy: public
retention: durable
review_status: reviewed
confidence: high
---

# API process scaffold и восстановление delivery

Запрос на небольшой Node HTTP service выявил отсутствие явного adapter для
`runtime_family: api` с `service_mode: process`. Пользователь одобрил минимальное
расширение фабрики и проверяемую delivery нового сервиса. Live Contract, Outcome,
research, receipts и child reports остаются в instance-local state; этот review
фиксирует только общее поведение платформы.

Adapter `api-process-v1` сохраняет принятые runtime и process isolation. Он
выбирается только для web/API, без проактивности, с disabled/optional autostart и
без repository adoption. Unsupported combinations остаются закрытыми. Scaffold
содержит структурированные managed Start/Stop, planned loopback endpoints и
явные implementation-required placeholders. Structural smoke не объявляет
неработающий продукт проверенным и не включает сервис. Explicit ephemeral
memory сохраняется даже при упоминании исключённых SQLite/embeddings в тексте.
Node HTTP evidence заменяет предположение об обязательном Agents SDK именно в
этом adapter; другие API configurations сохраняют прежние research gates.

Реальный запуск на Codex CLI 0.153.0 дополнительно выявил три ошибки пути
delivery. Архивированный thread необходимо загрузить перед чтением persisted
Goal; recovery делает это только для привязанного thread и возвращает его в
архив без повторного model dispatch. Активация Goal может сама создать turn:
полный ограниченный payload теперь передаётся заранее, charge intent сохраняется
до активации, а advisory summary не навязывает другой output schema уже
активному turn. Наконец, `add-guidance` начинает новую последовательность
проверки прогресса и передаёт guidance исполнителю; прежняя failure history и
общие бюджеты сохраняются. Эти выводы основаны на наблюдении установленного
runtime и регрессионных проверках, а не на предположении о всех версиях Codex.

Общий quality gate теперь использует тот же последовательный запуск unit tests,
что и `package.json`. Реальный набор занимает около 578 секунд, поэтому прежний
180-секундный timeout не позволял ему завершиться. Предел unit subprocess —
900 секунд, родительского self-test quality gate — 1200 секунд; проверки и
assertions сохранены. При отдельном ручном запуске необходимо исключать все
live instance variables, включая identity и Control Center port: иначе тестовый
HTTP server сравнивается с рабочим экземпляром. Сам quality gate уже делает
эту изоляцию.

Проверено: 714/714 unit tests, полный self-test pass, privacy audit, Markdown
validation, memory rebuild и smoke pass. Отдельный набор recovery/quality tests
дал 47/47. Self-test сохранил прежнее предупреждение о двух отсутствующих legacy
launchd entries; они не менялись этим запросом. Проверки adapter подтверждают
acceptance/research gates, отсутствие автоматического старта, честный scaffold
status и неизменность legacy capability selection. Recovery tests проверяют
точный thread binding, архивирование, отсутствие двойного dispatch и повторную
остановку при отсутствии прогресса после guidance.

Good State Alignment: aligned — сохранены существующие Control Center поведение,
ownership, instance isolation и host-owned verification. Production Control Center
не пересобирался и не перезапускался. Нет remote push, autostart, Tailscale или
изменения secrets. Trade-off: новый adapter намеренно узок, а полный serial
self-test занимает больше времени. Общий стандарт для иных service families
из этого одного случая не выводится; требуется отдельное решение и evidence.
