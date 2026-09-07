# Pritha

[Первый CLI-агент: русская инструкция](docs/getting-started.ru.md) — подготовка,
контракт и Outcome, проверки, продолжение работы и handoff.

[канонический README](README.md) описывает Pritha, Control Center, Voice и
опциональные интерфейсы. Полная публичная документация также доступна на английском.

## Назначение

Pritha сохраняет проверяемые знания и создаёт отдельных агентов по задаче пользователя.
Материалы проходят intake, проверку источников и сопоставление с памятью; полезные
результаты оформляются как brief, review, standard или decision. Markdown — источник
знаний, SQLite и embeddings — восстанавливаемые локальные индексы.

## Создание агента и Outcome

Начните с наблюдаемого результата: кому нужен агент, что он получает на входе,
что выдаёт и по каким примерам будет проверяться. Pritha предлагает архитектуру
и оформляет два документа: Contract описывает устройство и права, Outcome Spec —
пользовательский результат. Их подтверждения раздельны.

```sh
node scripts/pritha.mjs interview
node scripts/pritha.mjs outcome init <accepted-contract-path>
node scripts/pritha.mjs outcome approve <outcome-spec-path> --approved-by user
node scripts/pritha.mjs deliver <outcome-spec-path> --project <clean-git-project>
node scripts/pritha.mjs delivery accept <run-id> --accepted-by user
```

Сначала нужны accepted Contract и необходимый research. Scaffold сохраняет выбранный
runtime: Codex workspace, headless CLI или явный API process. Невыбранные модули
памяти, tools и skills не добавляются. API process scaffold содержит заглушки до
реализации Outcome; успешная проверка структуры не означает готовность сервиса.

Delivery работает в отдельном Git worktree, сохраняет расход и результаты попыток.
Продление бюджета продолжает тот же run; неизвестный расход не считается нулевым.
Независимые Trials проверяют конкретную ревизию. `verified` означает машинную
проверку, `accepted` — отдельную приёмку пользователем.

## Тесты и передача

У новых детей есть `npm test`. Структурные и инженерные тесты ребёнка дополняют
защищённые Outcome Trials. Handoff сохраняет текущий результат тестов, первый
сценарий и ограничения; ошибки тестов видны как warning и не блокируют подготовку
руководства. Для запуска npm-скриптов используется точный reviewed plan:

```sh
node scripts/pritha.mjs probe-plan <agent-id-or-project> --purpose test
node scripts/pritha.mjs handoff <project> --run-tests --approved-by user --plan-lock <reviewed-plan-lock>
```

Повторный handoff использует результат для той же ревизии. Изменение проекта
требует свежей проверки. Передача, приёмка, Git publication и запуск постоянного
сервиса — отдельные действия.

## Локальная работа и Control Center

```sh
node scripts/bootstrap.mjs prepare --profile local
node scripts/self-test.mjs
node scripts/control-center-runtime.mjs status --json
```

Control Center объединяет Voice, Agents, Task Chat и Settings. История Codex и
состояние экземпляров сохраняются раздельно. `PRITHA_STATE_ROOT` определяет приватную
память, очереди, отчёты и логи; `PRITHA_AGENT_PARENT` — каталог детей этого экземпляра.
Credentials и runtime-состояние не копируются в создаваемых агентов или GitHub.

Обновление работающего Control Center выполняется через
[staged release](07_workflows/control-center-staged-release.md), с проверкой страниц,
JavaScript chunks, идентичности экземпляра и возможностью отката. Постоянный запуск
и Tailscale Serve требуют явного операторского действия.

Для NeuralDeep действует [отдельный roadmap](07_workflows/2026-09-05-pritha-neuraldeep-improvement-roadmap.md):
Codex CLI executor, собственный provider и учёт расхода; совместимость с native
App Server/Goal RPC матери не подразумевается.
