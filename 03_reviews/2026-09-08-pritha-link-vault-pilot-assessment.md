---
id: 2026-09-08-pritha-link-vault-pilot-assessment
type: assessment
status: complete
created: 2026-09-08
updated: 2026-09-10
topics: [pritha, agents-mother, tool-server, mcp, untrusted-input, os-neutrality, control-center, pilot-metrics]
tools: [Pritha, Codex, Node.js, MCP, Control Center]
agent_platforms: [Codex, Cursor, Claude Desktop, Pritha Control Center]
model_context: [gpt-6-astra]
runtime_environment: [local-mac-mini, task-chat, app-server]
config_surfaces: [scripts/agents-mother/, operations/manifest.json, MCP stdio, local-web]
portability: portable
sources:
  - user-request-2026-09-07-local
  - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
  - 07_workflows/2026-09-07-pritha-minor-cleanup.md
  - private-evidence:agents/contracts/2026-09-08-link-vault-agent-contract.md
  - private-evidence:agents/contracts/2026-09-08-link-vault-agent-outcome-spec-2.md
  - private-evidence:agents/reports/2026-09-08-link-vault-final-handoff.md
related:
  workflows:
    - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
    - 07_workflows/agents-mother.md
    - 07_workflows/2026-09-07-pritha-minor-cleanup.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/agent-result-type.md
  reviews:
    - 03_reviews/2026-09-07-pritha-minor-cleanup-release-review.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-09-08
source_updated: 2026-09-08
source_version: child main 07fd09e; factory adapter 8406a53; MCP 2026-07-28 plus legacy 2025-11-25; Node 24.15.0
retrieved: 2026-09-08
verified: 2026-09-08
valid_for: third manual Pritha pilot on the primary Mac mini instance
temporal_status: version-bound
recommendation: review
memory_domain: pritha-self
memory_domains: [pritha-self, agent-building-knowledge, child-agents]
subject:
  kind: pritha
  id: pritha
privacy: public
retention: durable
review_status: reviewed
confidence: high
---

# Assessment: пилот 3 — child-агент link-vault (tool-server + MCP + UI)

Date: 2026-09-08
Status: complete
Recommendation: review

Пилот прошёл end-to-end: draft Contract → factory adapter → executable Outcome → delivery → verified 10/10 → local promotion `07fd09e` → handoff. Ручных правок кода продукта оператором не было. Живая карточка Control Center всё ещё показывает устаревший Outcome из-за бага выбора revision; UI проверялся через CLI `ui start` на loopback, без Tailscale Serve и без Funnel.

## One-paragraph read

Третий пилот открыл непроверенные поверхности `agent_kind: tool-server`, MCP stdio, untrusted fetch и OS-нейтральный Node-runtime. Pritha сама обнаружила отсутствие scaffold-адаптера и несколько host-дефектов, запросила отдельные подтверждения и довела продукт до verified без обхода Trials. Самостоятельная проверка подтвердила npm test 11/11, четыре MCP tools, deny-all allowlist, typed `HOST_NOT_ALLOWED` на loopback host-pulse, CSP/nosniff/no-store, отсутствие `innerHTML` и лишних `skills/`/`tools/`/`memory/`. Слабые места пилота: карточка Agents не отражает verified, live managed Start не задеплоен, GitHub read после UI-allowlist помечает страницу quarantine (ожидаемо), Linux/Windows unverified.

## Ход пилота по этапам

Время — UTC 2026-09-08. Чат Task Chat: новый тред, runtime gpt-6-astra / Desktop bundled / App Server.

| Этап | Время (UTC) | Что произошло |
| --- | --- | --- |
| Бриф | 03:56 | Первое сообщение в новый чат. Placeholder «Pritha is working…». |
| Research + draft | ~04:00–05:03 | MCP 2026-07-28 + legacy initialize 2025-11-25; Node LTS 24 / min 22; file lock; production запрещает private даже после allowlist. Compaction 1. |
| Принятие Contract | ~04:30 | Пользователь в том же треде написал «подтверждаю». Contract accepted. Outcome ещё blueprint. |
| Адаптер фабрики | после принятия | `tool-server-stdio-v1`, коммит 4caa210, затем интеграция 8406a53. 34/34 adapter tests. |
| Три доп. дефекта | до scaffold | Evidence только из checkout; `process.env` целиком вопреки env_allowlist; health на статическом порту. Пользователь: «да, согласовано». |
| Scaffold | ~05:40 | `sibling:link-vault` сначала как буквальное имя внутри Pritha; исправлено `--output` в PRITHA_AGENT_PARENT. Compaction 2. |
| Executable Outcome | ~06:06 | T1–T10 + hashes. Self-test матери 757/758, web smoke красный и до изменений. |
| Delivery | 06:07 | Принята исполняемая revision. Итерация 1 упёрлась в 15 мин, 110 554 / 500 000 токенов, автопродолжение. |
| Итерации 2–4 | 06:20–07:15 | Runtime написан; Computer Use/Safari запрошен — отказано («проверю сам»). T10 flake 503 при 32 параллельных записях — исправлен без ослабления критерия. |
| Revision 2 | ~07:15 | T7 copy-list не включал `.env.example`/`.gitignore`/`delivery/`. Принято отдельно. |
| Verified + promotion | ~07:22–07:49 | Два полных прогона 10/10 после фикса конкуренции. Main child `07fd09e`. Handoff complete. Build tokens остались 420 420 / 500 000. |
| Независимая проверка | 07:51–07:55 | npm test, MCP stdio, UI API, скриншоты. |

## Метрики roadmap (фаза 6.2 tool-server)

| Метрика | Значение |
| --- | --- |
| Completion | verified + local promotion + handoff; owner UI review pending; live card stale |
| Сообщения пользователя в треде | 6: бриф; «подтверждаю»; «да, согласовано»; принятие Outcome; revision 2; патч card-readiness |
| Ручные правки кода оператором | 0 |
| Токены build executor | 420 420 / 500 000 (4 model-итерации; host verification после revision 2 — 0 model turns) |
| Время до verified | ~3 ч 25 мин от брифа (~07:22 от 03:56) |
| Время verified → handoff | ~25 мин active host work (promotion, повтор T10, authored handoff) |
| Блокеры по типам | factory-capability (нет адаптера); host-security (env/port/evidence path); verifier copy-list; flake concurrency; card revision selection; Computer Use; отсутствие Linux/Windows runners |
| Самопочинки фабрики | адаптер tool-server; YAML `subject`; чтение evidence из state-root; очищенный env launch; resolved UI port; T7 copy; store lock/timeout; T10 contention; предложен (ещё не live) selector Outcome revision |
| Compaction контекста | 2 |
| Command failed в UI | много (research fetch, self-test smoke, отдельные CLI); delivery при этом не остановилась |

Сравнение с пилотами 1–2: release-notes застревал на Goal-бюджете и потребовал больше recovery-сообщений; host-pulse уложился в 3 сообщения и 82 353 токена. Здесь бюджет 500k не исчерпан, 15-минутный iteration cap сработал штатно и run продолжился. Число сообщений выше из-за обязательных factory gates, не из-за Goal.

## A1 и A2 — факт

Проверено на canonical `<PRITHA_AGENT_PARENT>/link-vault` @ `07fd09e`, `git ls-files`.

**A1 — лишние модули не скопированы:** каталоги `skills/`, `tools/`, `memory/` отсутствуют. Нет их manifests/status scripts. `scripts/redaction.mjs` присутствует (465 строк) как выбранный safety-модуль контракта (redaction/scanner), не как общий tools-pack. `package.json` dependencies/devDependencies пустые.

**A2 — npm test есть и проходит:** `package.json` script `"test": "node scripts/run-tests.mjs"`. Независимый прогон 2026-09-08T07:51Z: **11/11 pass**, 0 skipped, duration ~6.7 s. Набор включает structure, MCP handshake, SSRF, untrusted text, store contention, UI HTTP/lifecycle/token.

## Самостоятельная проверка продукта

### Карточка Agents

Карточка `link-vault` есть. Миссия совпадает с контрактом. Нет пометки Unclassified. Есть Open URL и Start (UI в live CC не считался запущенным). Результат карточки: «Нет подтверждения» / «Требуется актуальное одобрение Outcome Spec» — это воспроизведённый баг выбора superseded Outcome того же дня; actual receipt revision 2 и T1–T10 валидны. Health OK на карточке не получен, потому что live Control Center не обновлялся и CLI-процесс UI ему не принадлежит. Скриншот: `link-vault-agents-card.png`.

Registry: `handoff:2` у link-vault (два handoff-отчёта, включая final complete).

### UI агента

Запуск: `node scripts/link-vault.mjs ui start` → port 3432, `/health` 200. Скриншоты desktop и 390 px. Визуально: тёмная тема, фиолетовая кнопка Add host, карточки, зелёная точка Local UI, типографика близка к Control Center и host-pulse; на 390 px секции складываются в одну колонку, Connect уезжает в кнопку. Не хватает: явного «Health MCP-клиента» (честно написано, что его знает только клиент); отдельной мобильной нижней навигации; визуального равенства с host-pulse в плотности отступов.

API с той же страницы:

| Запрос | Факт |
| --- | --- |
| GET /health | 200 |
| GET /api/status | 200, `link_count` 2 |
| GET /api/links | 200, GitHub + loopback записи из MCP |
| GET /api/allowlist | 200, hosts сначала `[]` |
| GET /nope | 404 `NOT_FOUND` |
| POST /api/links | 405 `METHOD_NOT_ALLOWED` |
| POST /api/allowlist без токена | 403 `FORBIDDEN` |
| CSP | `default-src 'none'` + hash для inline script/style, `connect-src 'self'` |
| nosniff / no-referrer / no-store | да |
| innerHTML / eval в inline | нет; в `lib/` тоже нет |
| внешние asset URL | нет |
| title | `link-vault` |

### MCP stdio

Initialize legacy `2025-11-25` → tools/list: ровно `save_link`, `list_links`, `read_link`, `delete_link`.

`save_link` `https://github.com/NumericalArt/Pritha` → детерминированный id, запись в Links и Activity.

`read_link` до allowlist → `HOST_NOT_ALLOWED`. После добавления `github.com` через UI: `untrusted: true`, HTTP 200, `truncated: true` при max_chars 2000, quarantine.flagged=true с reasons `secret_disclosure` и `tool_or_configuration_manipulation`, redactions 0, первые 300 символов — обычный GitHub chrome-текст. Страница не исполняется как HTML.

`save_link` + `read_link` `http://127.0.0.1:3431/` без allowlist → `HOST_NOT_ALLOWED` (после save; до save было `LINK_NOT_FOUND`). Activity показывает тот же typed код.

### Дерево и operations

Tracked дерево компактное (~60 файлов, без `.git`). `operations/manifest.json`: `agent_kind: tool-server`, `service_mode: process`, `autostart: disabled`, `ui_port` 3432, structured start/stop argv, `env_allowlist` LINK_VAULT_STATE/PORT/PRITHA_STATE_ROOT, `health_url` loopback:3432/health, `mcp.transport: stdio`. `outcome_status: verified`. Linux/Windows в manifest честно `unverified-no-runner`.

## Оценка кода (SSRF, лимиты, quarantine, OS-нейтральность, UI)

- SSRF: deny-all по умолчанию; loopback без allowlist не читается; контракт запрещает private даже после allowlist в production; T4 покрывает redirect/file/metadata. Независимый негатив на URL host-pulse подтверждён.
- Лимиты: 2 MiB / 10 s / max_chars / JSON-RPC oversized line заявлены в контракте и инженерных тестах.
- Quarantine warning-only: GitHub read вернул текст + flagged, allowlist и файлы агента не сброшены.
- OS-нейтральность: в product `lib/` нет osascript/launchctl/statfs/`/System/Volumes`/shell:true; T7 static check + Unicode/spaced temp paths. Реальные Linux/Windows не гонялись.
- UI security: CSP hash-only, DOM API, untrusted metadata, token gate 403 без сессии.

Замечание: GitHub README/навигация легко триггерит injection scanner — это скорее чувствительность, чем ложный блок данных.

## Интерфейс

Соответствие стилю Pritha достаточное для v1: те же тёмные поверхности, фиолетовый акцент, мягкие карточки, статусные точки. Удобство: одна страница, поиск, Activity раскрывает safe args, Connect даёт Codex TOML / Cursor JSON / Desktop JSON. Не хватает: live Health MCP, индикатора «карточка CC vs локальный UI», русской копии UI (консоль на английском при русском пилоте), явного confirm-dialog в a11y-дереве (после Add host запись появилась; отдельная кнопка Confirm в snapshot не попала).

Tailscale Serve для UI-порта **не включался**. Funnel не запрашивался.

## Лучше / хуже пилотов 1–2; сравнение с «просто модель»

Лучше: Pritha не подменила tool-server на service; отдельно спросила factory changes; независимые verifiers существовали до product pass; iteration timeout не уничтожил run; T10 flake не «починили» ослаблением Trial; A1/A2 на child соблюдены.

Хуже: live card врёт про Outcome; self-test матери остался красным из-за web smoke timeout; Computer Use запрос лишний; `sibling:` path bug; два compaction; много Command failed в ленте; card-readiness патч не доехал до running CC, поэтому критерий «нет Outcome Spec missing» на живой странице не выполнен.

«Просто модель» написала бы MCP+HTML быстрее, но с высокой вероятностью без file lock, без dual protocol 2026-07-28/2025-11-25, без независимого verifier, без env_allowlist enforcement и без fail-closed allowlist. Ценность пилота — именно в этих gates и в том, что фабрика чинилась явно.

## Открытые вопросы и предложения

1. Задеплоить (отдельным staged release) selector активной Outcome revision, иначе tool-server карточки с `-2` в тот же день всегда «не подтверждены».
2. Live managed Start должен видеть CLI-запущенный same-identity процесс или честно говорить «не managed».
3. 15-минутный iteration cap — не Goal-бюджет; в пилотных инструкциях стоит называть оба лимита.
4. Не помечать Linux/Windows verified без runners — уже сделано, сохранить.
5. Scanner на GitHub-страницах: зафиксировать, что flagged на маркетинговом chrome допустим.
6. Не копировать knowledge-repo path с другого Mac в инструкции пилота без проверки, что каталог существует на mini.
7. Generic operations inspector всё ещё ждёт невыбранные deploy-service scripts — не чинить копированием модулей в child.

## Ручные вмешательства оператора

- Текст «подтверждаю» и «да, согласовано» введены в UI человеком, не пилот-агентом.
- Принятие Outcome revision 1 и 2, отказ от Computer Use, разрешение узкого card-readiness патча без restart CC.
- CLI `ui start` и независимые npm test / MCP / API вместо ожидания managed Start.
- Добавление `github.com` через UI агента для read_link.
- На момент пилота отчёт не коммитился. Knowledge-repo с другого компьютера на этой машине отсутствовал; файл был записан untracked в checkout Pritha. При подготовке к публикации 2026-09-10 машинные пути заменены placeholders; результаты пилота повторно не проверялись.

Скриншоты (private, placeholders в публикации): Agents card, UI desktop, UI 390 px — `<PRITHA_STATE_ROOT>/pilot-artifacts/link-vault/`.
