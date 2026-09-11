---
id: 2026-09-11-pritha-live-voice-migration
type: review
status: deployed-awaiting-voice-feedback
created: 2026-09-11
updated: 2026-09-11
topics: [pritha, voice-control, model-migration, live-api, realtime, settings]
tools: [OpenAI Live API, OpenAI Realtime API, GPT-Live 1, GPT-Realtime-2, GPT-5.6 Terra, WebRTC]
sources:
  - https://developers.openai.com/api/docs/models/gpt-live-1
  - https://developers.openai.com/api/docs/guides/live-migration
  - https://developers.openai.com/api/docs/guides/voice-webrtc?api=live
  - https://developers.openai.com/api/docs/guides/live-delegation
  - https://developers.openai.com/api/docs/guides/live-conversations
related:
  standards:
    - 04_standards/realtime-voice-control-for-codex-agents.md
    - 04_standards/pritha-good-state-alignment.md
  workflows:
    - 07_workflows/control-center-staged-release.md
supersedes: []
superseded_by: []
source_published: unknown
source_updated: unknown
source_version: gpt-live-1; Live sessions API contract retrieved 2026-09-11
retrieved: 2026-09-11
verified: 2026-09-11
temporal_status: version-bound
memory_domain: pritha-self
memory_domains: [pritha-self, agent-building-knowledge]
subject:
  kind: pritha
  id: pritha
privacy: public
retention: durable
review_status: reviewed
confidence: medium
---

# GPT Live 1 и переключение голосовой модели

Запрос: перевести голос канонической Pritha на GPT Live 1 и сохранить выбор
между GPT Realtime 2 и GPT Live 1 в Settings. Другие экземпляры не обновляются.

## Проверенные отличия API

`gpt-live-1` использует Live API; его нельзя подставлять в прежний
`/realtime/client_secrets` / `/realtime/calls` transport. Browser handshake
требует серверного JSON POST `/live/sessions`, SDP offer в `transport.sdp`,
ответа из `transport.sdp` и ожидания `session.started` на data channel.

Речь и reasoning разделены. Для текущего набора локально исполняемых tools
используется Responses delegation с `gpt-5.6-terra` — рекомендованным в
документации вариантом. Backend можно изменить через
`TECHSCOPE_VOICE_BACKEND_MODEL`. Его расход оплачивается отдельно от времени
Live-сессии. Возможности самой Codex-модели и deep-task transport не заменяются.

## Реализация

- Settings → Voice → Voice Model сохраняет `voiceModel` в instance-local
  runtime settings. Допустимы только `gpt-realtime-2` и `gpt-live-1`.
- Сохранённый выбор имеет приоритет над env-default. Новые конфигурации получают
  Live 1; существующий явный env-default сохраняется до выбора в Settings.
- Выбор применяется к следующему подключению. Смена настройки посреди handshake
  завершает попытку понятной ошибкой, а не соединяет разные протоколы.
- Realtime сохраняет прежние handshake и события. Live получает отдельную
  конфигурацию, короткую разговорную инструкцию и прежние tool/workflow rules
  в backend instructions. Выбранный голос, включая Marin, сохраняется.
- Вложенные `response.event` связываются с delegation и response ID. Calls
  собираются из `response.output_item.done`; пустой terminal `output` не теряет
  pending calls. Результаты отправляются до continuation. Повторный call ID
  использует сохранённый результат, не повторяет локальное действие.
- Permission checks, UI approvals, memory tools, Codex task state и opt-in
  управления музыкой остаются в приложении. Live не получает новые полномочия.
- Субтитры пользователя и ассистента группируются отдельно по времени;
  фрагмент не считается подтверждением полного пользовательского хода.
  UI речи и music ducking опираются на аудиопотоки, а не backend completion.
- Прогресс Codex и sticky context передаются через Live context appends;
  приватное содержимое остаётся в существующем instance-local контуре.
- `store: false` сохраняет отсутствие записи сессии у провайдера. Duration
  учитывается как cumulative snapshots. Graceful close ожидает `session.closed`
  с ограниченным timeout и сообщает о неподтверждённой финализации при сбое.

## Проверки и границы результата

Реальный API-проект подтвердил доступ к `gpt-live-1`. Проверены запуск с Marin
и Terra и корректное закрытие. Отдельный bounded API probe проверил один
безопасный тестовый function call: получение вызова, возврат результата,
второй завершённый backend response и `session.closed`. Ни один production
инструмент в этих probes не исполнялся; микрофон пользователя не использовался.

Unit tests покрывают protocol gates, дубликаты, late results, неуспешный backend,
пустой terminal output, подтверждение session update, Unicode и graceful close.
Browser tests проверяют оба transport paths с synthetic WebRTC, сохранение
выбора и отклонение неизвестной модели на desktop/mobile. Эти тесты не доказывают
качество русского голоса или фактически услышанную речь.

Good State Alignment: aligned при сохранении legacy path, music controls,
приватности, permissions и отдельного deployment gate. Tracked история старых
моделей не переписывается; шаблоны других агентов и экспериментальный voice
server остаются самостоятельными поверхностями.

Staged release выполнен после отдельного разрешения пользователя. Живой
пользовательский smoke речи, перебиваний, памяти, музыки и Codex handoff остаётся
проверкой качества взаимодействия, отдельной от автоматических release gates.

## Deployment основной Pritha — 2026-09-11

- Runtime commit: `a9b6095fe92be59e3572909ebbeed2f7d035375b`.
- Обновлён только instance `main` через pinned `pritha-instance update`;
  остальные экземпляры и устройства не обновлялись.
- Перед update: admission enabled, active tasks 0. После managed restart
  admission повторно активирован для проверенного BUILD_ID, capacity 3.
- В instance-local Settings сохранён `voiceModel: gpt-live-1`; выбранный ранее
  голос Shimmer сохранён, backend — `gpt-5.6-terra`.
- Strict health: 5 страниц и 13 JavaScript chunks проходят проверку.
  Operational admission, runtime, agent catalog, chat list и history — pass.
  Первая operational проверка не подтвердила agent catalog; последующее прямое
  чтение вернуло 12 карточек без конфликтов/ошибок метаданных, повторный gate
  прошёл. Дополнительных рестартов или изменений каталога не выполнялось.
- На живой сборке desktop/mobile Settings показывают выбранный Live 1 и
  доступный Realtime 2; Voice page показывает `gpt-live-1`.
- Дополнительный реальный WebSocket probe подтвердил Shimmer + Live 1.
  Production WebRTC broker проверен с полным настроенным набором tools:
  `session.started` и `session.closed` получены, final usage — 15 секунд
  (WebRTC initialization). Пользовательский микрофон и production tools в
  проверке не использовались; звучание этим тестом не оценивается.
- Послерелизный self-test — pass; failed/stale queue items 0, live UI pass.
- Полный private release receipt хранится в instance-local `releases/`;
  идентификаторы устройств, endpoints, SDP и приватные runtime values в Git
  не публикуются. Этот отчёт фиксирует runtime pin отдельно от documentation
  commit; обновление отчёта не требует пересборки сервиса.

## Исправление ограничения function results

После первого использования обнаружен регрессионный сценарий: запрос
возможностей музыки приводил к чтению дерева файлов и остановке ответа.
Read-only воспроизведение на реальном Live API 2026-09-11 подтвердило
`response_input_buffer_full`: API сообщил лимит 128 appended input items и
32768 UTF-8 bytes за сессию. Следующий `response.create` возвращал
`function_call_outputs_required`, поскольку предыдущий результат отвергнут.
Сам инструмент завершался успешно; исходный tree result занимал около 43 КБ.
Это runtime evidence текущей версии API, а не предполагаемая причина.

Live transport теперь учитывает общий бюджет typed input и function results:
30000 bytes / 120 items с запасом к наблюдаемому лимиту. Каждый большой
результат сокращается до JSON preview с явным `truncated`, исходным размером
и указанием запрашивать более узкое чтение. Бюджет учитывает UTF-8 и JSON
escaping. Исчерпание бюджета останавливает следующий tool до исполнения;
неопределенная доставка не запускает повторное действие. Ошибка получения
результата переводит workflow в понятное состояние с просьбой переподключиться,
а не оставляет очередь в ожидании. Private diagnostic events сохраняют коды
и счетчики без аргументов, содержимого результатов или стенограмм.

Регрессионная проверка: 12 unit tests покрывают большую Unicode-выдачу,
последовательность функций, общий byte/item budget, ошибки провайдера,
transport send failure и отсутствие повторного исполнения. Реальный WebRTC
probe с исправленным клиентом получил тот же большой tree result, успешно
передал сокращенный результат, выполнил следующий search и получил третий
`response.completed` без ошибок. Пользовательский микрофон и mutating tools
в probe не использовались. Полные receipts остаются только в локальных
временных файлах.

Дополнительно прошли TypeScript typecheck, отдельная production-сборка и
четыре isolated browser tests: сохранение выбора на desktop/mobile и
подключение/отключение Live и Realtime. Production build не изменялся во время
этой проверки.
