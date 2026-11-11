---
id: paddock-agent-hub-assessment-2026-10-29
type: assessment
status: reviewed
created: 2026-10-29
updated: 2026-10-29
topics: [agent-harness, github-repository-review, server-runtime, isolation, observability, agent-communication]
tools: [Paddock, Pritha, Codex App Server, Docker, gost, Next.js, better-auth, SQLite]
agent_platforms: [Codex, Pritha]
model_context: [Codex runtime; external model execution not performed]
runtime_environment: [server, container, browser, CLI]
config_surfaces: [Docker Compose, config.toml, execpolicy, skills, WebSocket bridge]
portability: adapter-needed
sources:
  - source-226690c3-fdfe-400d-8d02-536b84a64bdb
  - https://github.com/vakovalskii/paddock/tree/e7bd2d61817f4bb5645c781929cd17aa0d55862e
  - https://github.com/vakovalskii/paddock/blob/e7bd2d61817f4bb5645c781929cd17aa0d55862e/docs/reference/architecture.md
  - https://github.com/vakovalskii/paddock/blob/e7bd2d61817f4bb5645c781929cd17aa0d55862e/docs/reference/harness-protocol.md
  - https://github.com/vakovalskii/paddock/blob/e7bd2d61817f4bb5645c781929cd17aa0d55862e/docs/plans/roadmap.md
  - https://github.com/vakovalskii/paddock/actions/runs/40933904885
related:
  intakes: [00_inbox/links/2026-10-29-server-agent-cockpit-intake.md]
  signals: [01_sources/signals/2026-10-29-server-agent-cockpit-signal.md]
  reviews: [03_reviews/2026-10-29-task-chat-composer-tools-release-review.md]
  workflows: [07_workflows/2026-10-29-agent-workspace-observability-experiment.md]
  decisions:
    - 05_decisions/2026-08-26-control-center-codex-chat-architecture.md
    - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
    - 05_decisions/2026-07-02-a2a-optional-child-agent-communication-layer.md
  briefs: [02_briefs/2026-10-21-agent-recovery-boundaries.md]
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-10-29
source_updated: 2026-10-29
source_version: commit e7bd2d61817f4bb5645c781929cd17aa0d55862e; tree f71d5d97540989cf4d6cd82f5ca39ac828aa408c; Codex image default 0.165.0
retrieved: 2026-10-29
verified: 2026-10-29
valid_for: pinned source review; no runtime or security certification
temporal_status: version-bound
recommendation: experiment
memory_domain: agent-building-knowledge
memory_domains: [agent-building-knowledge, pritha-self]
subject:
  kind: assessment
  id: paddock-agent-hub
privacy: public
retention: durable
review_status: reviewed
confidence: medium
---

# Assessment: серверный хаб Paddock и применимость к Pritha

Paddock объединяет готовый Codex harness, браузер с несколькими чатами,
контейнеры пользователей и управляемый сетевой выход. Для Pritha это полезный
reference по наблюдаемости и рабочему месту оператора. Полная замена текущего
Control Center и перенос на его инфраструктуру не обоснованы.

## Объём и версия проверки

Проверены README, architecture, harness protocol, roadmap, Compose и шаблон
пользователя; Dockerfile/config/execpolicy; WS bridge и auth; proxy diagnostics;
агентный CLI; обработка событий, метрик и approvals в UI; tools registry;
supervisor; описание и часть E2E; CI workflow и LICENSE. Все code references
относятся к одному полному commit выше. GitHub подтвердил полный tree без
truncation. MIT проверена в корневом LICENSE.

Публичный repository создан 29 октября 2026; выбранный commit опубликован
29 октября в 18:46 UTC. Это не устанавливает дату начала предыдущей частной
разработки. На момент проверки Releases API вернул пустой список. CI этого
commit завершился success: typecheck, build, i18n, parse checks. Live E2E
настроены отдельно и в CI не выполняются. Их наличие подтверждено исходниками,
успешный самостоятельный прогон не заявляется. Clone, install, execution,
перенос кода и изменение production в исследование не входили.

## Проверенные возможности и ограничения

| Область | Что подтверждено исходниками | Граница |
| --- | --- | --- |
| Несколько окон | 1/2/4 panes, переключение, resize, snapshots | Это окна сессий; task queue и worktree на каждую задачу остаются планом. |
| Наблюдаемость | Files/Actions/Network/Sessions, статусы, diff | Полезный сбор существующих сигналов; сам по себе не доказывает готовность результата. |
| Другие harness | Документирован целевой adapter contract | UI и CLI взаимодействия агентов пока вызывают методы Codex напрямую. OpenCode/Hermes/pi/Claude не проверены как работающие адаптеры. |
| Общение сессий | `paddock-agents` list/read/send, steer/start, wait, hop limit 5 | Один пользователь и его harness. Общий CLI не означает поддержку любого backend; это не реализация A2A. |
| Контейнеры | Non-root harness, capabilities dropped, no-new-privileges, resource limits, internal core | Пользователи имеют отдельные volumes/tokens, но одну core network. Отдельная сеть на пользователя — roadmap 3.9. |
| Секреты | Browser не получает harness token; WS проверяет session и production Origin | Агент читает свой home и settings; roadmap 3.13 прямо фиксирует попадание API key из config в session log и незавершённое сокрытие ключей. |
| Подтверждения | Prefix rules для rm/rmdir/shred/truncate и git reset/clean/push; UI Allow/Deny/session | Это выбранные формы команд, не доказательство запрета любого разрушительного эффекта. Config/rules находятся в writable home, sandbox — danger-full-access. |
| 2FA | better-auth TOTP, backup codes, trusted browser | Включается в настройках пользователем. Само наличие plugin не доказывает обязательное enrollment всех пользователей. |
| Сеть | gost nodes с fifo/failover и probes по API | Для чтения цепочки используются преимущественно альтернативные узлы одного hop, не обязательно последовательный проход через все прокси. |
| Метрики | turn metadata сохранены в SQLite с user key | TTFT фиксируется и по первому non-user item/reasoning event; tok/s — производная оценка клиента, не независимый benchmark модели. |
| Deploy | Отдельная build directory и rollback при неудачном старте | Health supervisor проверяет `/login`; полный core smoke перед успехом пока roadmap 5.4. Это слабее release gates Pritha. |

Опорные code paths: `web/components/chat.tsx`, `pane.tsx`, `messages.tsx`,
`side-panel.tsx`; `web/lib/proxy.ts`, `auth.ts`, `turn-meta.ts`, `tools.ts`;
`web/server.ts`, `supervisor.sh`; `web/tools/agents/paddock-agents.mjs`;
`codex/config.toml`, `entrypoint.sh`, `paddock.rules`; `users/_template.yml`.

## Security и evidence: что нельзя заключать

Статический анализ не является penetration test. Shared network не означает,
что чужие данные уже доступны: отдельные токены остаются барьером, но полной
проверенной сетевой изоляции пользователей здесь нет. Egress ACL лежит в
непубликуемом gost configuration; её фактическую работу по репозиторию не
воспроизвести. Нужны проверки DNS, private ranges, IPv6 и user-to-user reachability.

В `proxy.ts` почти любой HTTP status, кроме 403, превращается в `ok`. Поэтому
401/429/5xx могут дать сигнал достижимости, но не успешного модельного вызова.
Для Pritha следует разделять сеть, авторизацию, квоты и service errors.

Правила команд и строковый hop limit полезны против ошибок, но не являются
внешней защищённой policy boundary. По прочитанному коду нельзя обещать
необходимость approval при любом способе удаления, неизменяемость policy или
неподделываемость строки отправителя. Это вывод о границах, не выполненный exploit.

Утверждение об отсутствии блокировок аккаунтов через прокси не проверяется
репозиторием и не принято как гарантия. Сравнение конкурентов в README —
позиционирование автора. Их первичные README показывают самостоятельные
remote/mobile/worktree возможности; преимущества нельзя сводить к наличию веба.

## Сравнение с существующей Pritha

Pritha уже имеет управляемый service lifecycle, частный доступ, Task Chat,
независимую историю, координацию выполнения, approvals и строгий staged release.
Цитирование и разметка картинок выпущены отдельно. Для работающей на постоянно
включённом хосте Pritha закрытие браузера или ноутбука-клиента не равно остановке
сервера. Контейнер на спящем ноутбуке эту проблему не исправляет.

| Кандидат | Pritha fit | Решение |
| --- | --- | --- |
| Единая панель действий/изменений/ожиданий | experiment | Самая прямая продуктовая польза; использовать существующий gateway и activity. |
| Два чата рядом | experiment | После read-only панели; desktop, на телефоне одна активная задача. |
| Защита approval от случайного клика | experiment | Источник добавил задержку 700 ms после появления; для Pritha выбрать и проверить своё доступное keyboard/touch поведение. |
| TTFT, context, tokens | watch | Сначала определить метрику, источник и unavailable state; не выдавать оценку за точное измерение провайдера. |
| Общение агентов | watch | Только конкретный workflow с разрешёнными peers, минимальным контекстом, budgets и receipts; не давать чтение всех чатов по умолчанию. |
| Server/Docker/proxy migration | watch | Возможна для отдельного multi-user продукта; не нужна ради улучшения текущего интерфейса. |
| Прямая замена gateway/self-deploy | skip | Потеря независимого API и ослабление release/policy границ. |

Отношение к памяти: **confirms** разделение session/environment/run/effect и
contract-selected коммуникации; **refines** операторский UX и диагностику.
Ни одно принятое решение не заменяется; supersedes/outdated — none.
Good State Alignment: aligned для knowledge-only review; runtime не меняется.

## Экспертные оценки

| Lens | Оценка | Смысл |
| --- | --- | --- |
| Programming | 4/5 | Небольшой разборчивый источник нескольких UI/infra паттернов. |
| Agent Engineering | 5/5 | Наглядное разделение harness и рабочего места; полезны границы policy и adapters. |
| DX | 4/5 | Меньше переключений между задачами и журналами. |
| Evidence | 3/5 | Pinned code и зелёный CI есть, независимых live/security Trials нет. |
| Product Pragmatism | 3/5 | Прицельный UX-эксперимент оправдан, полный перенос дорог. |
| Reuse | 4/5 | Переносимы UI contracts и тестовые сценарии. |
| Risk, отдельно | 4/5 | Runtime/credentials/network/self-deploy требуют другого уровня доказательств. |

## Решение и следующий шаг

**Pritha/Agents Mother fit: experiment**, без adoption внешнего кода. Стоимость
read-only панели — medium; полного переноса — high, как и operational complexity.
План ограниченного эксперимента сохранён отдельно. Это предложение для следующей
задачи, а не разрешение на реализацию, запуск Paddock или изменение deployment.
