---
id: protected-trial-verifier-preflight
type: workflow
status: active
created: 2026-09-06
updated: 2026-09-06
topics: [agents-mother, outcome-spec, trials, cli, verifier-provenance]
tools: [Pritha, Node.js, Git]
sources:
  - scripts/agents-mother/outcome-spec.mjs
  - scripts/agents-mother/delivery-worktree.mjs
  - scripts/agents-mother/trial-runner.mjs
  - tests/agents-mother-trial-inputs.test.mjs
related:
  workflows:
    - 07_workflows/scaffold-capability-preflight.md
    - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
  standards:
    - 04_standards/agent-creation-harness.md
supersedes: []
superseded_by: []
source_version: Trial plan v1 with optional reviewed input declarations; legacy absent fields unchanged
verified: 2026-09-06
temporal_status: version-bound
memory_domain: agent-building-knowledge
memory_domains: [agent-building-knowledge, pritha-self]
subject:
  kind: workflow
  id: protected-trial-verifier-preflight
privacy: public
retention: durable
review_status: reviewed
confidence: high
---

# Подготовка независимых Trials

Файл продукта может ещё отсутствовать. Проверяющий код и его fixture должны
быть подготовлены и проверены host до одобрения Outcome. Build executor
реализует продукт; он не создаёт собственный критерий успешности. Успешные
help, structural smoke и healthcheck сами по себе не доказывают результат.

Сначала host готовит verifier с конкретными утверждениями о входах и выходах
из Outcome. Нужно прочитать его код и зависимости, проверить на заведомо
неверном продукте, затем проверить правильный пример. Запись host-reviewed
является происхождением подготовленного материала; доверие возникает из
review и отдельного approval всей Outcome revision, а не из одного префикса.
Если подходящего проверенного verifier нет, preflight возвращает typed issue.
Автоматическая заглушка, всегда завершающаяся успешно, не является исправлением.

В автоматическом Trial можно добавить project-relative declarations:

```text
- Product target: scripts/agent-cli.mjs
- Verifier input: verification/check-result.mjs :: sha256:<64 lowercase hex> :: host-reviewed:result-check-v1
- Verifier input: verification/cases.json :: sha256:<64 lowercase hex> :: host-reviewed:result-cases-v1
- Fixture: verification/cases.json
```

Каждый хеш вычисляется по фактическим байтам файла. Все зависимости verifier,
влияющие на критерий успешности, также должны быть перечислены и проверены.
`host-template:<id/version>` допустим только для отдельно проверенного host
template. Префикс не скачивает и не исполняет шаблон. Product target не может
одновременно быть verifier, fixture или защищённым входом другого Trial.
При прямом вызове продукта через argv без отдельного verifier нужны
наблюдаемые stdout/stderr/artifact assertions; одного exit 0 недостаточно.

```sh
node scripts/pritha.mjs outcome preflight <outcome-spec> --project <agent-folder>
node scripts/pritha.mjs outcome approve <outcome-spec> --approved-by user --project <agent-folder>
```

Первая команда только читает Spec и файлы: показывает provenance/hash,
изменяемые product targets и диагностирует недостающие protected inputs.
Она не запускает команды и не создаёт approval. Вторая команда допустима
после отдельного пользовательского одобрения конкретной Outcome revision.
Она повторно проверяет входы до записи locks и host approval receipt.

Delivery ещё раз сравнивает файлы с одобренными хешами до build probe/turn
и сохраняет protected-input baseline в собственном private run-root. CLI
`trial run` также проверяет declarations до backend execution и после Trials.
Hash mismatch не переписывается новым baseline. После изменения verifier
semantics нужны новая Spec revision и отдельное approval; точное восстановление
прежнего verifier допускает продолжение того же run. Host-only verification
не требует нового модельного хода. История старого blocker сохраняется.

Paths не пересекают symlink и не выходят из project. Cwd применяется к argv;
declarations остаются project-relative. Пределы: 64 declarations каждого вида
на Trial, 256 protected files на план, 16 MiB на файл и 64 MiB суммарно.
Отсутствующие Product targets не входят в frozen baseline. Старые планы без
новых labels сохраняют прежнюю wire shape и semantic/document locks; legacy
argv entrypoints и fixture остаются защищёнными, пока новая approved revision
явно не разделит их назначение.

## Исключение для ручной оценки

Используется существующее поле `automated_trial_waiver`, без второго policy:

```yaml
automated_trial_waiver:
  actor: user
  reason: Результат оценивается оператором по согласованной визуальной рубрике.
  scope:
    - visual-review
```

Scope перечисляет существующие operator-judged Trial IDs. Новое исключение
требует actor user, содержательную причину и непустую область. Эти данные
входят в semantic lock и compiled plan. Прежние approved scalar waivers
читаются как legacy evidence; новый или пересматриваемый waiver использует
структуру выше. Отсутствующее поле и none сохраняют прежний смысл.

Waiver не отменяет failed automated Trial, protected inputs или отдельную
приёмку. При действующем waiver успешные автоматические проверки оставляют
`awaiting_acceptance`; они не дают autonomous verified. Это относится также
к legacy scalar waiver. Окончательный acceptance остаётся отдельным host event.

Синтетические проверки выполняют реальные CLI/Trial/worktree действия:
preflight без записи, approval с хешами, negative controls, реализацию
отсутствующего продукта и проверку его результата, отказ до model probe при
отсутствии verifier, symlink/ownership checks, сохранение legacy locks и waiver
semantics. Они подтверждают механизм, но не заменяют ручные пилоты и калибровку.
