---
id: bb-pritha-assessment-2026-11-06
type: assessment
status: reviewed
created: 2026-11-06
updated: 2026-11-06
topics: [pritha, agent-interface, provider-portability, git-worktrees, handoff, extensibility]
tools: [bb, Pritha, Git, Control Center]
agent_platforms: [bb, Codex, Claude Code, Pi, Cursor, Grok Build]
model_context: [provider-selected]
runtime_environment: [desktop, local-web-app, CLI, HTTP-API]
config_surfaces: [provider-plugins, plugin-SDK, skills, worktrees, delivery-ledger]
portability: adapter-needed
sources:
  - source-35e73452-631f-4b93-bda3-e4111d4550ea
  - https://github.com/get-bb/bb/releases/tag/desktop-v0.48.1
  - https://github.com/get-bb/bb/blob/e003e9510cbfd3bb6c26a28630b46ffb1c242a44/plugins/tasks/README.md
  - https://github.com/get-bb/bb/blob/e003e9510cbfd3bb6c26a28630b46ffb1c242a44/docs/provider-plugin-api.md
  - https://github.com/get-bb/bb/blob/e003e9510cbfd3bb6c26a28630b46ffb1c242a44/docs/worktrees.md
related:
  intakes: [00_inbox/texts/2026-11-06-bb-agent-workspace-intake.md]
  signals: [01_sources/signals/2026-11-06-bb-agent-workspace-signal.md]
  reviews: [03_reviews/2026-11-03-pritha-provider-convergence-review.md, 03_reviews/2026-09-07-task-chat-parallel-execution-audit.md]
  assessments: [03_reviews/2026-10-29-paddock-agent-hub-assessment.md, 03_reviews/2026-08-13-swarm-forge-repository-assessment.md]
  decisions: [05_decisions/2026-11-01-codex-cli-primary-opencode-watch.md]
  standards: [04_standards/agent-harness-evaluation.md, 04_standards/control-center-codex-chat-api-contract.md]
  workflows: [07_workflows/2026-11-06-delivery-blocker-visibility-experiment.md, 07_workflows/2026-10-29-agent-workspace-observability-experiment.md]
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-10-30
source_updated: 2026-10-30
source_version: desktop-v0.48.1 at e003e9510cbfd3bb6c26a28630b46ffb1c242a44
retrieved: 2026-11-06
verified: 2026-11-06
valid_for: inspected bb release and Pritha bd65067
temporal_status: version-bound
knowledge_relationship: refines
pritha_fit: experiment
recommendation: experiment
memory_domain: agent-building-knowledge
memory_domains: [agent-building-knowledge, pritha-self]
subject: {kind: assessment, id: bb-agent-workspace}
privacy: public
retention: durable
review_status: reviewed
confidence: high
---

# Что Прите полезно взять из bb

**Пример для ближайшего эксперимента — плагин Tasks.** В bb оператор видит задачу
в панели, а агент может открыть ту же задачу по её ключу, прочитать состояние и
записать результат. У Приты уже есть панель сборки, команда чтения её состояния
и журнал выполнения. На их основе можно проверить, одинаково ли понятно
человеку и агенту, почему работа остановилась. [Tasks в bb](https://github.com/get-bb/bb/blob/e003e9510cbfd3bb6c26a28630b46ffb1c242a44/plugins/tasks/README.md)

## Что подтверждается в bb

| Тема | Что показывают документы и код | Вывод для Приты |
| --- | --- | --- |
| Несколько исполнителей | В релизе есть плагины Claude Code, Codex и Pi. Cursor и Grok Build подключаются через Agent Client Protocol (ACP). Провайдер использует свою авторизацию. При соединении адаптер сообщает, в частности, умеет ли восстанавливать сессию и кто обрабатывает запросы разрешений. | В интерфейсе полезно показывать возможности выбранного исполнителя. Условия оплаты и квоты зависят от провайдера. [Подключения](https://github.com/get-bb/bb/blob/e003e9510cbfd3bb6c26a28630b46ffb1c242a44/packages/bb-app/README.md#provider-credentials) · [ACP](https://github.com/get-bb/bb/blob/e003e9510cbfd3bb6c26a28630b46ffb1c242a44/plugins/provider-acp/README.md) · [Контракт адаптера](https://github.com/get-bb/bb/blob/e003e9510cbfd3bb6c26a28630b46ffb1c242a44/docs/provider-plugin-api.md) |
| Параллельное редактирование | Для треда можно выбрать существующую рабочую копию или создать worktree с отдельной веткой. Две ветки по-прежнему могут изменить одну строку. В релизе bb удаление последнего треда может привести к принудительной очистке дерева с незакоммиченными файлами. | В сборках Agents Mother уже есть отдельная ветка и защита незаписанной работы при очистке. Для обычного чата полезная подсказка — показать, разделяет ли он рабочую папку с другим чатом. [Правила worktree и очистки](https://github.com/get-bb/bb/blob/e003e9510cbfd3bb6c26a28630b46ffb1c242a44/docs/worktrees.md) |
| Передача задачи | В интерфейсе bb создаётся новый тред со ссылкой на исходный. Провайдер, модель и режим доступа указаны явно. Если предыдущая среда известна, её можно использовать повторно. | Например, ревьюеру можно предложить цель, проверяемый коммит и результаты проверок. Для Приты это отдельная задача с явным выбором получателя и объёма данных. [Создание handoff в bb](https://github.com/get-bb/bb/blob/e003e9510cbfd3bb6c26a28630b46ffb1c242a44/packages/client-core/src/prompt/thread-handoff-request.ts) |
| Саморасширение | Агент может создать, собрать и перезагрузить плагин. Готовый Tasks поставляет панель, CLI и инструкцию для агентов. bb также формирует справочник команд из регистраций плагинов. Качество произвольного расширения по одному запросу требует собственной проверки. | Генерировать подсказки из реально доступных инструментов и проверять, что оператор видит те же факты. В Прите уже есть такой механизм для инструкций одного из исполнителей. [История выпуска плагинов](https://github.com/get-bb/bb/blob/e003e9510cbfd3bb6c26a28630b46ffb1c242a44/CHANGELOG.md#0350) · [Генератор справочника](https://github.com/get-bb/bb/blob/e003e9510cbfd3bb6c26a28630b46ffb1c242a44/apps/server/src/services/plugins/plugin-commands-skill.ts) · [Инструкции Приты](../scripts/lib/provider-tool-instructions.mjs) |

Ещё одна идея для Agents Mother — **проверка переносимости на чистой копии**.
bb выносит перечисленные в реестре плагины из монорепозитория и проверяет типы,
тесты и сборку с публичным SDK. Аналог для ребёнка, которому контракт обещает
самостоятельную работу, — запустить его команду проверки из чистого каталога
только с заявленными зависимостями. Такой тест выявляет случайный импорт из
Приты. [Проверка отделяемых плагинов](https://github.com/get-bb/bb/blob/e003e9510cbfd3bb6c26a28630b46ffb1c242a44/docs/forkable-plugins.md)

## Что показала Прита на тестовой сборке

На ревизии `bd65067` в одноразовой локальной фикстуре создана привязанная к
тестовому чату сборка с расходом **101 из 100** синтетических токенов.
Состояние одного и того же запуска прочитано штатными функциями.

| Источник | Ответ |
| --- | --- |
| Журнал через `deliveryStatus` | Статус `blocked`, причина `token_budget_exhausted`, четыре варианта ответа. Фабричное действие `delivery_status` включает поле `blockers` из этого состояния. |
| Ответ для панели через `readTaskDelivery` | Статус `blocked`, подтверждённая привязка, расход 101/100 и отсутствие пользовательской приёмки. В базовом ответе отсутствуют код причины и массив вариантов. Панель отображает этот статус словами «Нужен контроль». |

Журнал до и после двух чтений совпал. Сравнение относится к базовым данным
панели. Операторское время и другие экраны здесь не измерялись.
Дополнительно прошли девять существующих локальных тестов Приты — шесть для
worktree и защищённых проверок, два для привязки маршрута и один для перечня
инструментов в инструкциях. [Ответ панели](../scripts/agents-mother/task-delivery.mjs) · [Панель](../interfaces/control-center/src/components/codex/DeliveryPanel.tsx) · [Ответ фабрики](../scripts/agents-mother/voice-factory-worker.mjs) · [Фикстура бюджета](../tests/agents-mother-task-delivery.test.mjs)

## Сопоставление с прежними выводами

- **Уточняет** эксперимент по наблюдаемости после разбора Paddock. Теперь известны конкретный экран, отсутствующее поле и случай для воспроизведения. [Предыдущий план](../07_workflows/2026-10-29-agent-workspace-observability-experiment.md)
- **Подтверждает** вывод разбора SwarmForge о разных границах Git и исполнения. В Прите обычные Codex-чаты могут получить общий каталог, у фабричной сборки есть собственное дерево. [Разбор SwarmForge](2026-08-13-swarm-forge-repository-assessment.md) · [Параметры обычного чата](../interfaces/control-center/src/lib/codex-chat/app-server.ts) · [Деревья сборок](../scripts/agents-mother/delivery-worktree.mjs)
- **Уточняет** работу по провайдерам. В Прите уже зафиксирован случай, когда инструкции упоминали недоступный инструмент. Справочник, построенный по регистрации команд, даёт внешний пример для проверки подсказок. Пересмотр решения о Codex CLI для этого исследования не требуется. [Текущий разбор провайдеров](2026-11-03-pritha-provider-convergence-review.md) · [Решение по исполнителю](../05_decisions/2026-11-01-codex-cli-primary-opencode-watch.md)

## Оценка и границы применения

| Угол оценки | Балл из 5 | Основание |
| --- | ---: | --- |
| Разработка и применимость к агентам | 5 | Есть конкретная пара интерфейсов, общий журнал и воспроизводимая разница в ответах. |
| Новизна | 3 | Маршрутизация и отдельные ветки уже реализованы. Новое наблюдение касается объяснения причины остановки. |
| Удобство и практичность | 4 | Случай можно повторить локально. Пользу для оператора покажет замер времени и правильности ответа. |
| Потенциальная отдача | 4 | Повторное объяснение ситуации вручную может отпасть на каждом таком блокере. |
| Доказательность и свежесть | 4 | Проверены релизный код, даты и собственная фикстура. Запуск bb с реальными провайдерами не оценивался. |
| Риск | 2 для чтения, 4 для внешних плагинов | Даже текст причины может раскрыть лишние данные. Расширения с доверенным кодом страницы получают полномочия браузерного приложения. [Модель доверия SDK](https://github.com/get-bb/bb/blob/e003e9510cbfd3bb6c26a28630b46ffb1c242a44/packages/plugin-sdk/README.md#trusted-frontend-content-scripts) |

**Pritha / Agents Mother fit — `experiment`** для показа причины в существующем
Control Center. Эксперимент ограничен чтением разрешённых полей и требует
небольшой доработки одного ответа и панели, если проверка с оператором покажет
пользу. **Вся IDE и внешние плагины — `watch`**. Их подключение добавило бы
вторую систему тредов, обновления SDK и отдельный контроль доступа. В
распространяемой сборке bb по умолчанию включена телеметрия, доступно отключение.
Отдельное внимание нужно и файлам, выбранным для копирования через
`.worktreeinclude`. [Телеметрия](https://github.com/get-bb/bb/blob/e003e9510cbfd3bb6c26a28630b46ffb1c242a44/README.md#telemetry) · [План эксперимента и критерии](../07_workflows/2026-11-06-delivery-blocker-visibility-experiment.md)

## Версия и источники

Проверено 6 ноября 2026 года. GitHub Releases вернул стабильный
`desktop-v0.48.1`, опубликованный 30 октября (UTC). Тег указывает на
`e003e9510cbfd3bb6c26a28630b46ffb1c242a44`. Семь проверенных файлов
(лицензия, Tasks, ACP, handoff, генератор справочника, worktrees и forkable
plugins) совпадали с копиями на ревизии `8cd1d1fa` ветки main от 6 ноября.
Корневая лицензия — MIT. Популярность сокращения «bb» и скорость роста звёзд
остаются за пределами технической оценки. [Официальный репозиторий](https://github.com/get-bb/bb) · [Релиз](https://github.com/get-bb/bb/releases/tag/desktop-v0.48.1) · [Лицензия](https://github.com/get-bb/bb/blob/e003e9510cbfd3bb6c26a28630b46ffb1c242a44/LICENSE)
