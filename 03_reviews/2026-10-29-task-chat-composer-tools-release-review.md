---
id: task-chat-composer-tools-release-review-2026-10-29
type: review
status: deployed
created: 2026-10-29
updated: 2026-10-29
topics: [pritha, control-center, task-chat, quote-reply, image-annotation, staged-release]
tools: [Pritha, Node.js, Next.js, Git, Playwright, Chromium, WebKit, Safari, launchd]
sources:
  - source-operator-approved-composer-tools-update-2026-10-29
  - NumericalArt/Pritha@3a3c36d897998c9d72f2044f165647183d827bea
related:
  reviews:
    - 03_reviews/2026-10-29-task-chat-composer-tools-implementation-review.md
  workflows:
    - 07_workflows/control-center-staged-release.md
    - 07_workflows/task-chat-composer-tools-compatibility.md
  standards:
    - 04_standards/pritha-good-state-alignment.md
supersedes: []
superseded_by: []
source_version: composer-tools-v1; implementation commit 3a3c36d897998c9d72f2044f165647183d827bea
verified: 2026-10-29
temporal_status: version-bound
memory_domain: pritha-self
subject:
  kind: pritha
  id: pritha
privacy: public
retention: durable
review_status: reviewed
confidence: high-for-tested-scenarios
---

# Выпуск цитирования и разметки изображений в основной Pritha

После объяснения новых функций и отдельной границы production-обновления
пользователь прямо разрешил выпуск: «давай сделаем это отдельное обновление».
Это отдельное разрешение на обновление основной Pritha, включая штатную
остановку, переключение сборки, запуск и восстановление приёма задач.
Расширение выпуска на реплики не выполнялось.

В работающем `/task-chat` доступны цитирование выделенного фрагмента
завершённого ответа и кнопка «Разметить» у подходящего изображения в черновике.
Редактор сохраняет отдельную копию; до отправки доступен возврат оригинала.
Цитирование и применение разметки сами не отправляют сообщение.
Claude Code runtime не подключён: в выпуск входят только подготовленные
контракты и проверки будущей совместимости.

## Подготовка и закреплённая версия

Good State Alignment: aligned с принятыми baseline надёжного Codex Control
Center и Voice/music. Перед выпуском основной сервис был здоров, приём задач
включён, выполняющихся задач не было. Read-only планы runtime, instance update
и fleet rollout прошли. Дерево содержало только изменения этой функции;
они сохранены отдельным коммитом `3a3c36d` и опубликованы в `origin/main` после
успешного pre-push audit.

Повторный предрелизный прогон: TypeScript pass, 40 сценариев Chromium/WebKit
без пропусков и flaky результатов, полный self-test pass без warnings и
regressions. В него входит полный unit gate. Полные 114 Chromium-сценариев
также были пройдены на окончательной реализации до запроса выпуска.

Первая проверка старой рабочей сборки получила timeout на холодной `/voice`.
Повторный bounded strict/operational health после прогрева прошёл все пять
страниц и 13 JavaScript chunks. Лимиты времени и runtime-код ради этого не
менялись. Новая сборка прошла штатную проверку updater с обычными лимитами.

## Выполненная транзакция

Использован `scripts/pritha-instance.mjs update --apply --yes` с полным
`--expected-commit`. Менеджер установил зависимости из lockfile, восстановил
локальную память и embeddings, проверил изоляцию и собрал staging отдельно
от live `.next`. Embeddings использовали локальный кэш в offline-режиме.

Предыдущая сборка сохранена в private release directory. Только после
успешной сборки менеджер остановил принадлежащий экземпляру сервис,
переключил сборку и запустил её через launchd. Итог: `deployed`, exact commit
и BUILD_ID совпали, strict health прошёл `/voice`, `/agents`, `/task-chat`,
`/codex`, `/settings` и все 13 chunks. Повторные проверки Git и fingerprints
подтвердили чистое дерево и неизменность защищённых данных. Cleanup завершён,
ошибок записи receipt нет. Откат не потребовался.

Приём задач восстановлен отдельной `execution-control activate --yes` с
проверенным BUILD_ID. Затем `--strict --operational` подтвердил не только
страницы, но и admission, runtime, каталог агентов, список чатов и существующую
страницу истории. Проверка не создавала задач и не отправляла сообщений.

Private `release.json` сохраняет точные идентификаторы сборок, полные результаты
проверок и местоположение предыдущей сборки. Этот отчёт не публикует private
пути, endpoint, содержимое истории, настройки или credentials. Его последующий
документационный коммит не является новой скомпилированной версией интерфейса.

## Проверки после переключения

- TypeScript: pass.
- Полный Chromium E2E: 114/114 pass, без пропусков, failures и flaky результатов;
  disposable state и отдельный порт, включая desktop/mobile navigation.
- Strict operational health: pass, пять страниц и 13 chunks; приём задач включён.
- Fleet status: четыре сервиса здоровы; версия изменилась только у `main`.
  Fingerprints защищённого состояния и данных агентов совпали до и после
  у всех четырёх экземпляров; реплики остались на прежних сборках.
- Полный post-release self-test: pass, без warnings и regressions; полный
  unit gate и восстановление embeddings проходят.

В настоящем Safari на основной работающей Pritha вручную проверены:

1. Выделение фразы завершённого ответа активирует «Цитировать»; фраза появляется
   в поле сообщения без отправки.
2. Синтетический PNG загружается в черновик и открывается через «Разметить».
3. Стрелка видна на холсте; «Применить» возвращает в чат с размеченной копией.
4. «Вернуть оригинал» восстанавливает исходное имя и изображение.
5. Проверочная цитата и вложение убраны из черновика; Send снова неактивен.

Проверка использовала только созданную тестовую картинку. Сообщения, новые
задачи и внешние публикации не отправлялись. Невостребованные тестовые файлы
подчиняются обычному сроку очистки вложений. Снимки реального интерфейса и
содержимое истории не добавлялись в Git или публичную память.

Физический iPhone и доступ с другого trusted peer не проверялись. Автоматические
WebKit/touch/mobile-сценарии и локальный Safari не заменяют такую проверку.
Обновлённый интерфейс открывается после перезагрузки страницы; настройки сети
и Tailscale не менялись.

## Восстановление

Для отката использовать runtime manager и сохранённую предыдущую сборку по
staged-release workflow. Новая схема сервера или миграция истории не вводилась.
Частное хранилище вложений сохраняется; оригиналы не перезаписываются. После
любого отката обязательны проверка прежнего BUILD_ID, strict/operational health
и восстановление исходного состояния admission.
