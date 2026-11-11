---
id: agent-workspace-observability-experiment-2026-10-29
type: workflow
status: proposed
created: 2026-10-29
updated: 2026-10-29
topics: [pritha, control-center, observability, multi-session, experiment, regression-testing]
tools: [Pritha, Codex, Playwright]
sources: [03_reviews/2026-10-29-paddock-agent-hub-assessment.md]
related:
  assessments: [03_reviews/2026-10-29-paddock-agent-hub-assessment.md]
  decisions: [05_decisions/2026-08-26-control-center-codex-chat-architecture.md]
  workflows: [07_workflows/control-center-staged-release.md]
  standards: [04_standards/pritha-good-state-alignment.md]
supersedes: []
superseded_by: []
memory_domain: pritha-self
memory_domains: [pritha-self, agent-building-knowledge]
subject:
  kind: workflow
  id: agent-workspace-observability-experiment
privacy: public
retention: durable
review_status: proposed
confidence: medium
---

# Предложение: понятный обзор работы агентов

План подготовлен по research, реализация не запрошена и не выполнялась.
Цель — сократить время поиска задачи, которая ждёт решения пользователя,
и показать, что уже изменилось в создаваемом агенте.

## Этап 1: read-only панель существующей задачи

Использовать существующие gateway/activity, server-owned project binding и
approved paths. Сначала показать состояния «выполняется», «нужно ваше решение»,
«завершено», «ошибка», а рядом — последние действия и изменённые файлы.
Отличать «выполнение завершено» от «результат принят пользователем».

Панель не запускает команды и не даёт новую возможность читать произвольный
файл. Диагностика различает transport, auth, quota и server errors; рабочий
модельный запрос ради зелёного индикатора не выполняется автоматически.

## Этап 2: две задачи рядом

Только после проверки первой панели предложить desktop view двух выбранных
чатов. На узком экране — одна активная задача и явное переключение. Держать
отдельными draft, attachments, quote selection, approvals, scroll и focus.
Сохранить существующие server concurrency limits и native thread identity.
Раскладка не должна создавать новые task executions или дублировать отправку.

## Обязательные Trials

1. Две задачи с одинаковыми заголовками различаются по project/session binding.
2. Approval относится к точному request и задаче; смена активного окна,
   устаревший request и layout shift не могут подтвердить чужое действие.
3. Навигация между задачами не переносит текст, цитату или изображение соседу.
4. Reconnect и неизвестная доставка не создают повторного turn.
5. При network/auth/quota failure виден соответствующий честный статус.
6. Блокировка UI или offline состояние не превращается в «всё готово».
7. История, текущие Voice/Agents/Settings и 320–390 px navigation сохраняются.
8. Изменённые файлы ограничены разрешённым project root и instance.

Измерить на заранее выбранных сценариях время до обнаружения ожидающего
approval и число лишних переходов. Критерий успеха — наблюдаемое улучшение
этих показателей при сохранении существующих regression gates.

## Границы

В эксперимент не входят Docker/VPS/proxy migration, public exposure, новый
provider, свободная переписка всех агентов, изменение credentials или фоновые
службы. Межагентный сценарий требует отдельного contract-selected review.
Production rollout остаётся отдельной согласованной staged-release транзакцией.
