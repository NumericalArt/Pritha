---
id: pritha-state-filename-migration
type: workflow
status: implemented
created: 2026-11-01
updated: 2026-11-01
topics: [pritha-rebranding, state-migration, sqlite, recovery]
tools: [Pritha, Node.js, Python, SQLite]
sources:
  - https://sqlite.org/backup.html
  - https://sqlite.org/wal.html
  - source-operator-pritha-rebranding-addendum-2026-11-01
related:
  workflows:
    - docs/instance-isolation.md
    - 07_workflows/control-center-staged-release.md
    - 07_workflows/2026-11-01-pritha-provider-convergence-roadmap.md
supersedes: []
superseded_by: []
source_version: SQLite backup API and WAL documentation; implementation tested with SQLite 3.51.0
retrieved: 2026-11-01
verified: 2026-11-01
memory_domain: pritha-self
subject: {kind: workflow, id: pritha-state-filename-migration}
privacy: public
retention: durable
review_status: tested-fixtures
confidence: high
---

# Переход к именам файлов Pritha

Новые установки используют `pritha.sqlite` и `.pritha-setup.json`. Уже
существующие `techscope.sqlite` и `.techscope-setup.json` остаются пригодными:
обычное чтение, health, setup и bootstrap не переименовывают их. Внешний
state-root сохраняет нейтральный `setup/setup.json`. Schema IDs, document IDs,
FTS, relations, embedding values и поля setup не меняются ради названия.

Этот workflow переносит имена **внутри выбранного state-root**. Для переноса в
другой каталог существует отдельный `pritha-instance migrate`.

## 1. План без изменений

```sh
node scripts/pritha-state-migrate.mjs plan --json
```

Выбор экземпляра следует общему контракту: explicit `--root`, `PRITHA_ROOT`,
совместимый `TECHSCOPE_ROOT`, Git root, cwd. `--state-root` явно выбирает состояние;
без него читается штатная конфигурация экземпляра. План содержит действия,
fingerprints файлов, `plan_hash`, конфликты и `runtime_blockers`. План не создаёт
каталоги, резервные копии или SQLite-соединения. Реальный output с локальными
путями хранить только приватно, не в tracked report.

При двух файлах нужно явно выбрать источник и заново получить план:

```sh
node scripts/pritha-state-migrate.mjs plan --memory-source legacy --setup-source legacy --json
```

Допустимы `legacy` и `canonical` отдельно для памяти/setup. Выбор нельзя
подменять mtime или предположением об одинаковых bytes. Обе исходные версии
сохраняются для отката; автоматического объединения данных нет.

## 2. Подготовить остановленный экземпляр

Для apply и rollback нужны отсутствие активных/неопределённых task leases,
подтверждённо незагруженная managed service, отсутствие listener/живых runtime
PIDs и открытых исходных файлов. Неизвестный результат launchctl/lsof блокирует
изменения. Команда миграции не останавливает процессы, не снимает task leases и
не меняет admission. Согласовать остановку по staged-release workflow;
необходимое непосредственное разрешение на lifecycle action относится именно
к остановке/запуску службы, а не к read-only плану.

После остановки получить свежий план. Изменение исходника между plan/apply
делает старый hash недействительным. Нельзя запускать новые writers до
завершения apply либо rollback. Переход на предыдущую версию кода допускается
только после rollback; старый код не знает migration barrier и новых имён.

## 3. Применить конкретный план

```sh
node scripts/pritha-state-migrate.mjs apply --plan-hash <plan-hash> --yes --json
```

Если план требовал выбор источников, повторить те же `--memory-source` /
`--setup-source`. При повторе уже начатой операции используется закреплённый
private manifest. `--yes` не отменяет проверок готовности или hash.

Транзакция получает OS lock и записывает private barrier. Общие readers
останавливаются, пока barrier не снят. Затем создаются проверенные резервные
копии исходных файлов, включая SQLite WAL/SHM/journal. Из копии выбранной семьи
SQLite backup API создаёт самостоятельный snapshot; проверяются integrity,
foreign keys, schema, содержимое всех таблиц и их counts. Исходная база не
открывается на запись. WAL нельзя терять при копировании: он может содержать
последние committed данные ([SQLite WAL](https://sqlite.org/wal.html));
согласованный snapshot создаётся через [backup API](https://sqlite.org/backup.html).

Исходные файлы переходят в private retired storage; публикация нового файла
не перезаписывает существующий destination. Private directories имеют mode
0700, manifests/backups/candidates — 0600. При падении процесса остаются
manifest и barrier. Финальный receipt содержит id, hash и проверку SQLite.
Barrier снимается последним. При успешном повторе возвращается `already_complete`.

## 4. Восстановление и откат

```sh
node scripts/pritha-state-migrate.mjs status --json
node scripts/pritha-state-migrate.mjs status --id <migration-id> --json
node scripts/pritha-state-migrate.mjs apply --plan-hash <original-plan-hash> --yes --json
node scripts/pritha-state-migrate.mjs rollback --id <migration-id> --yes --json
```

Выбрать продолжение apply **или** rollback. Manifest находится в
`<state-root>/private/state-migration/<id>/manifest.json`, а для checkout layout —
в `.private/state-migration/`. Резервные копии, новые snapshots и retired originals
сохраняются; автоматической очистки после этой операции нет. Не удалять barrier
вручную и не копировать файлы поверх частично завершённой миграции.

Rollback восстанавливает исходные имена, bytes, inode, permissions и mtime.
Повторный rollback возвращает `already_rolled_back`. Изменённый после переноса
canonical файл блокирует откат: новые записи нельзя молча заменить старой копией.
В этом случае нужен отдельный план переноса новых данных. Symlink redirects,
чужие hardlinks, повреждённый manifest и несовпадение выбранного экземпляра также
блокируют операцию.

## 5. Проверки перед возвращением в работу

1. Проверить status: нет pending recovery; память/setup выбирают новые имена.
2. Прочитать memory-status и setup-status, сравнить counts и поля с исходными.
3. Выполнить FTS/semantic regression gate по существующему holdout без изменения
   ожидаемых ответов или порогов; проверить document/citation identities.
4. Выполнить self-test и strict candidate health с `/codex` и JavaScript chunks.
5. Согласовать managed start по staged-release workflow и провести ручные
   проверки памяти, чатов и Settings. Только затем принимать обновлённое состояние.

Изолированный automated suite включает 29 transaction cases: все границы
retire/publish/commit/rollback, аварийное завершение процесса с publication link,
повтор SQLite snapshot после прерывания, WAL, разные layouts, dual-file choice,
повреждённые данные, изменённую destination, locks и redirects. CLI tests отдельно
проверяют отказ при работающей/неопределённой службе и active execution lease.
Это не заменяет ручную приёмку установленного экземпляра.
