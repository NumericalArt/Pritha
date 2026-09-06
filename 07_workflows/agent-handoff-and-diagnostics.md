---
id: agent-handoff-and-diagnostics
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
  id: agent-handoff-and-diagnostics
privacy: public
retention: durable
review_status: reviewed
confidence: medium
---

# Передача агента и ограниченная диагностика

Handoff использует собственный instance catalog и accepted contract. При первом
вызове создаёт приватный authored profile; существующий профиль сохраняется.
Повтор при тех же contract, revision, Outcome, profile и readiness возвращает
прежний отчёт. Изменившийся результат получает новый отчёт с provenance.
Статус `guide-prepared` не подменяет verification или acceptance.

Первый сценарий берётся из authored Outcome, с инструкцией для CLI, service,
job-runner, tool-server, library или interactive-agent. CLI без выбранных
operations не получает service manifest. Выбранные operations готовит scaffold
adapter по контракту; отсутствие нужного adapter видно до записи проекта.
Handoff не угадывает команды и не переписывает проект ради готовности карточки.

## Явная проверка команды

```sh
node scripts/pritha.mjs probe-plan <agent-id-or-project>
node scripts/pritha.mjs probe <agent-id-or-project> --approved-by user --plan-lock <reviewed-sha256>
```

Plan привязан к instance, accepted contract, точному project revision,
manifest, argv, cwd, timeout и output cap. При изменении плана нужен его новый
review. Это проверка запуска команды, не доказательство результата. GET не
исполняет agent-controlled команды. Private audit не меняет Trial evidence.
Источник argv — `operations/manifest.json`; у no-service CLI — существующее
поле `healthcheck_argv` в `interfaces/manifest.json` schema
`pritha-cli-interface-v1`. Shell и symlink/path traversal отвергаются.
Изоляция local probe — `none`, с ограниченным окружением; это видно в плане.

## Runtime policies

Общий источник MJS/TS — `scripts/lib/timeout-policy.mjs`. Overrides задаются
целыми миллисекундами в разрешённом диапазоне, до запуска процесса. Release
policies описаны в `control-center-staged-release.md`.

| Класс | Default | Min–max | Environment override |
| --- | ---: | ---: | --- |
| workspaceRead | 5000 | 50–30000 | PRITHA_WORKSPACE_READ_TIMEOUT_MS |
| resultReadiness | 5000 | 100–30000 | PRITHA_RESULT_READINESS_TIMEOUT_MS |
| healthCommand | 5000 | 50–30000 | PRITHA_HEALTH_COMMAND_TIMEOUT_MS |
| diagnostic | 8000 | 50–30000 | PRITHA_DIAGNOSTIC_TIMEOUT_MS |
| privateAccess | 1000 | 50–10000 | PRITHA_PRIVATE_ACCESS_TIMEOUT_MS |
| runtimeRead | 2500 | 50–30000 | PRITHA_RUNTIME_READ_TIMEOUT_MS |
| launchdAudit | 30000 | 100–60000 | PRITHA_LAUNCHD_AUDIT_TIMEOUT_MS |

Status probes выполняются асинхронно: четыре активных процесса, очередь до 64,
общий deadline включает очередь, вывод ограничен 256000 байт. Truncated output
не даёт здоровый статус. Timeout завершает только собственную process group.
Это не управление production manager. Access cache: TTL 120 секунд,
16 ключей, deduplication in-flight, explicit fresh/invalidation; старый запрос
после invalidation не восстанавливает старое значение. Identity projection
выделена из server.ts и сохраняет точную принадлежность экземпляру.

## Cleanup

Accepted/abandoned получают auto-cleanup; повторный вход terminal accepted,
failed, abandoned, cancelled также запускает ту же политику. Verified и
awaiting_acceptance сохраняют candidate. Bulk cleanup дополнительно проверяет
возраст и target claim; чужая ветка, dirty project и неизвестная ownership
сохраняются. `cleanup-status.json` приватно хранит cleaned/preserved/failed и
причину; `delivery status` показывает receipt. Retry не меняет ledger/evidence
и не создаёт новые одинаковые receipts. Ошибка удаления не отменяет уже
подтверждённый продукт.
