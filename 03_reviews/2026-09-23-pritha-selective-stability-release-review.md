---
id: 2026-09-23-pritha-selective-stability-release-review
type: review
status: accepted
created: 2026-09-23
updated: 2026-09-23
topics: [pritha, control-center, history, staged-release, regression-prevention]
tools: [Node.js, React, Playwright, Git]
sources:
  - source-operator-approved-selective-stability-release-2026-09-23
  - NumericalArt/Pritha@8aeec27f6359965cd7ac206b1c9f77278b6b43e9
  - NumericalArt/Pritha-NeuralDeep@2fcaa4c5be6d580265fa3867a830f775ec8c0767
  - NumericalArt/Pritha-NeuralDeep@e8ebc7b882d78e6bde8e7b79502c276c803e0b95
related:
  standards: [04_standards/pritha-good-state-alignment.md]
  workflows: [07_workflows/control-center-staged-release.md]
supersedes: []
superseded_by: []
source_published: 2026-09-19 through 2026-09-20
source_updated: 2026-09-23
source_version: canonical base 8aeec27; selected history and release-receipt adaptations
retrieved: 2026-09-22
verified: 2026-09-23
temporal_status: compatible-with-inspected-canonical-base
memory_domain: pritha-self
subject:
  kind: project
  id: pritha
privacy: public
retention: durable
review_status: accepted
confidence: high-for-tested-scenarios
---

# Два согласованных улучшения устойчивости Pritha

Пользователь принял два ограниченных исправления после отдельного сравнения
с NeuralDeep и разрешил обычный последовательный выпуск канонической Pritha
и её реплик с публикацией на GitHub. Исправление статуса metadata отклонено;
оно, увеличение timeout, процесс создания агентов NeuralDeep, альтернативные
провайдеры и автоматическое продолжение после provider outage не включены.

## Изменения

История действий объединяет фоновые обновления, отдаёт приоритет явной загрузке
предыдущей страницы и сохраняет уже пройденный cursor. Обновление turn больше
не отменяет выбранную пользователем страницу. Исчерпанная пагинация остаётся
исчерпанной; существующее восстановление устаревших позиций сохраняется.

Updater атомарно записывает проверенный deployment до удаления предыдущей
сборки. Ошибка уборки сохраняется отдельно с `cleanup.pending`; ошибка второй
записи не повреждает первоначальный receipt. Strict health, проверка commit и
BUILD_ID, изоляция экземпляров, подтверждение остановки и rollback сохранены.

## Проверки перед публикацией

- Полный self-test: 869/869 unit tests, без regressions и warnings; environment,
  privacy audit, Markdown validation, memory rebuild, smoke и Telegram dry-run
  проходят. Embeddings восстановлены.
- 28/28 Playwright сценариев полного Task Chat проходят без пропусков и flaky
  результатов. Новые проверки гонки background refresh/pagination выполнены
  на ширинах 390 и 1280 px; существующие cursor recovery, clipboard, attachments,
  длинные ответы, медленная история и JavaScript chunks также проходят.
- Production build для изолированного E2E экземпляра и отдельный TypeScript
  `--noEmit --incremental false` проходят; live `.next` не использовался для
  тестовой сборки.
- Набор updater включает 21 сценарий, в том числе искусственные ENOTEMPTY при
  уборке и ENOSPC при повторной записи receipt; все проходят в полном self-test.
- Pre-push audit и `git diff --check` проходят. Секреты, private state и данные
  дочерних агентов в публикацию не входят.

Good State Alignment: `aligned`. Native история, voice/music/settings,
принадлежность процессов, rollback и границы отдельных экземпляров сохранены.
Проверки пограничных ситуаций не означают, что пользователь сталкивался с ними
в обычной работе; переход на архитектуру NeuralDeep не требуется.

## Выпуск и операционные доказательства

Развёртывание выполняется по staged-release workflow на одном закреплённом
commit: main, Dasha, Sasha, Marina, затем обычная установка на втором Mac.
NeuralDeep и отдельные исследовательские checkout исключены. Каждому экземпляру
принадлежат собственные память, настройки, credentials и child-agent данные.

После переключения обязательны совпадение release identity, strict health
пяти страниц и chunks, явная активация приёма задач по проверенному BUILD_ID
с сохранением намеренных пауз и operational health. При ошибке дальнейший
выпуск останавливается. Частные receipts содержат фактические пути, build IDs,
проверки изоляции и результаты выполнения; они не публикуются.

Этот review фиксирует состав и проверку кандидата. Фактическое завершение
развёртывания подтверждается отдельными private release receipts и итоговым
операционным отчётом. Доступ с другого доверенного устройства проверяется
отдельно от loopback health.
