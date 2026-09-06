---
id: getting-started.ru
type: workflow
status: active
created: 2026-09-06
updated: 2026-09-06
topics: [pritha, agents-mother, readiness, verification]
tools: [Pritha, Codex, Node.js, Git]
sources:
  - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
related:
  workflows:
    - 07_workflows/2026-09-05-pritha-roadmap-completion-tracker.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-09-06
source_updated: 2026-09-06
source_version: roadmap completion candidate based on 8a26775
retrieved: 2026-09-06
verified: 2026-09-06
valid_for: preparation for manual mother CLI pilots
temporal_status: version-bound
memory_domain: pritha-self
memory_domains: [pritha-self, agent-building-knowledge]
subject:
  kind: workflow
  id: getting-started.ru
privacy: public
retention: durable
review_status: reviewed
confidence: medium
---

# Первый CLI-агент в Pritha

Откройте Pritha в Codex и скажите: «Подготовь Pritha, затем создай небольшой
CLI-агент, который складывает два числа и возвращает JSON». Pritha предлагает
контракт и Outcome Spec; вы подтверждаете их отдельно. Установщик использует
реальный профиль `local`. Профиля `contract-only` нет.

## Подготовка

Нужны Git, Node.js/npm, Python и SQLite из [Prerequisites](prerequisites.md).
Для автономной реализации также нужен установленный и авторизованный Codex;
обычный детерминированный CLI после создания работает без модели.
Проверка CLI-авторизации: `codex login status`. Не копируйте credentials матери
в проект агента. Проверенная здесь среда: Node 24.15.0 и Codex CLI 0.153.0.

```sh
git clone https://github.com/NumericalArt/Pritha.git Pritha
cd Pritha
export TECHSCOPE_ROOT="$PWD"
export PRITHA_STATE_ROOT="$PWD/../Pritha-state"
export PRITHA_AGENT_PARENT="$PWD/../Pritha-agents"
mkdir -p "$PRITHA_STATE_ROOT" "$PRITHA_AGENT_PARENT"
node scripts/bootstrap.mjs prepare --profile local
node scripts/self-test.mjs
node scripts/pritha.mjs help
node scripts/pritha.mjs interview --runtime cli --interface CLI --service none --autostart disabled
```

Core bootstrap восстанавливает память. Control Center, Telegram, Voice,
Tailscale, service и расписание выбираются отдельно. Для существующего
канонического экземпляра используйте его сохранённое окружение, не меняйте
его state-root на пример выше.

## Контракт, scaffold и проверяемый результат

В контракте выберите `agent_kind: one-shot-cli`, schema v2, `runtime: cli`,
CLI-интерфейс, `service: none`, `autostart: disabled`, `proactivity: none`.
Зафиксируйте ввод, JSON-вывод, exit codes, границы v1 и выбранный бюджет.
Число по умолчанию не является калиброванным обещанием стоимости.
После review архитектурный контракт получает `accepted`.

Следующие placeholders замените путями, которые сообщила Pritha:

```sh
node scripts/pritha.mjs validate <contract-path>
node scripts/pritha.mjs research <contract-path>
node scripts/pritha.mjs external-research <contract-path> --backend status
node scripts/pritha.mjs scaffold-plan <contract-path>
node scripts/pritha.mjs scaffold <contract-path>
node scripts/pritha.mjs outcome init <contract-path> --interaction-mode headless
```

Research должен быть complete. Для стабильного локального алгоритма контракт
может обосновать неприменимость внешнего research; выбранные изменчивые модели,
API или зависимости требуют актуальных первичных источников и synthesis.
Research overrides из экспериментальных тестов не являются штатным рецептом.
Scaffold создаёт каркас; его `run` до реализации возвращает exit 78.

В Outcome Spec укажите реальный первый сценарий, например
`node scripts/agent-cli.mjs 2 3` → `{"sum":5}`, и ошибку ввода с exit 64.
Pritha готовит независимый verifier до approval: `Product target` обозначает
изменяемый продукт, `Verifier input` — host-reviewed файл с SHA-256 и provenance.
Проверка с заведомо неверным продуктом обязана провалиться. См.
[preflight защищённых Trials](../07_workflows/protected-trial-verifier-preflight.md).

```sh
node scripts/pritha.mjs outcome preflight <outcome-path> --project <agent-path>
node scripts/pritha.mjs outcome approve <outcome-path> --approved-by user --project <agent-path>
node scripts/pritha.mjs deliver <outcome-path> --project <agent-path>
node scripts/pritha.mjs delivery status <run-id>
node scripts/pritha.mjs delivery usage <run-id>
```

Approval-флаги означают уже полученное решение пользователя. Сначала читают
и согласуют документ; команда фиксирует это решение. Product implementation
идёт в отдельной ветке. После verification Codex показывает diff и demo,
переносит согласованный результат в чистый основной каталог через проверенный
fast-forward, затем фиксирует приёмку и готовит handoff. Сам `accept` не делает
merge.

```sh
node scripts/pritha.mjs delivery verify <run-id>
node scripts/pritha.mjs delivery accept <run-id> --accepted-by user
node scripts/pritha.mjs handoff <agent-path>
```

Если бюджета недостаточно, продолжайте тот же run: панель и `delivery budget`
позволяют добавить токены, итерации и время; `delivery resume` продолжает работу.
`delivery verify` выполняет host-проверки без новой модельной итерации.
Unknown usage сохраняется явно. Создание не нужно начинать заново.

## Воспроизводимый пример

```sh
node --test tests/agents-mother-cli-readiness.test.mjs
```

Это отдельный синтетический путь: исследование по curated fixture, accepted
contract, scaffold без overrides, отдельная Outcome approval, защищённый
verifier, реализация, Trials, fast-forward и handoff. Исполнитель в нём
детерминированный тестовый; это не измерение модели и не ручная приёмка пилота.
Обещание «30 минут» появится только после реального измеренного прохождения.
