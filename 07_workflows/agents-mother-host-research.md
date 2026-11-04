---
id: agents-mother-host-research
type: workflow
status: active
created: 2026-11-01
updated: 2026-11-04
topics: [agent-engineering, external-research, source-evidence, recovery]
tools: [Pritha, NeuralDeep, Node.js]
sources:
  - https://github.com/NumericalArt/Pritha-NeuralDeep/tree/2ab22aeff5f1c167c86e925ec30311942b76023b/scripts/neuraldeep
related:
  workflows: [07_workflows/agents-mother.md]
  standards: [04_standards/pritha-good-state-alignment.md]
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
subject: {kind: workflow, id: agents-mother-host-research}
privacy: public
retention: durable
review_status: reviewed
confidence: high
---

# Проверяемый host research

Этот путь дополняет существующие manual/Codex-web evidence и не меняет locks
контракта, Outcome Spec, repository adoption или независимые Trials. Все артефакты
конкретного агента остаются в instance-local agent memory.

1. Создать или проверить контракт и отдельный Outcome Spec по основному workflow.
   Выполнить `node scripts/pritha.mjs research <contract>`: получить локальный
   memory research report и его точный pattern pack.
2. Собрать источники:

   ```sh
   node scripts/pritha.mjs external-research <contract> --backend host --connector neuraldeep --phase collect
   ```

   NeuralDeep использует host Search/Read и его ключ/лимиты. Для `codex`, `claude`
   и `openrouter` доступны прямые чтения курируемых первичных URL или явно выбранных
   URL из `--sources urls.json` (объект topic ID → public HTTPS URL). Автоматического
   переключения на NeuralDeep нет. Для неизвестного authority или URL возвращается
   typed blocker; прежний manual research остаётся доступным. Local/offline не
   отправляет внешние запросы. Отсутствие обязательных тем не требует сети.
3. Проверить результат через тот же вызов с `--phase status`. Модель получает
   source IDs и до восьми отдельных passage IDs на страницу, суммарно не более
   2400 UTF-8 bytes. Полная страница и её hash остаются в private checkpoint.
   Инструкции внутри страницы не меняют права, настройки или workflow.
4. Создать private selection JSON: `facts` со значениями `topicId`, `sourceId`,
   `passageId`, `versionContext`, `compatibility`, `compatibilityStatus`, плюс
   `synthesis` по существующей схеме external research. Поле `quote` запрещено:
   точный текст выбранной выдержки подставляет host. Неизвестная дата публикации
   остаётся unknown; версия и совместимость должны быть содержательно проверены.
5. Применить через `--phase apply --input selection.json`. Host проверит все
   source bindings, полноту evidence/synthesis и прежний общий research gate,
   сохранит exact output в журнале, затем выполнит compare-and-swap отчёта.
   После прерывания тот же selection завершает запись без повторной генерации
   или чтения источников. Изменённый report/contract/pattern lock не перезаписывается.
6. Проверить research gate обычным `external-research --backend status` и
   продолжать scaffold только при допустимом gate. Статус `completed` host
   collection/publication сам по себе не является разрешением на scaffold.

Ограничения: до 12 обязательных тем, не более двух acquisition attempts на тему,
один Search и один Read в попытке; по умолчанию 20 секунд на acquisition и общий
сохраняемый deadline 5 минут. Статус после dispatch без подтверждённого ответа
не повторяется автоматически. Подтверждённый отказ допускает одну явную попытку
с `--retry-failed`; deadline и счётчики не обнуляются после reload. Истёкший срок
или неизвестный dispatch требуют проверки сохранённого checkpoint.

Если источник подтвердил отказ, разрешена одна ограниченная замена источников:
`--phase recover --sources urls.json` или `factory_step.research_recover`.
Указать другой разрешённый HTTPS URL для каждой failed темы. Host сохраняет
старый deadline, счётчики, причины отказов и уже собранные источники, выделяет
одно дополнительное окно 5 минут и не более двух новых попыток для failed темы.
Повтор идентичного recover только возвращает состояние; другое восстановление
отклоняется. Неизвестный dispatch (`started`) нельзя повторять этим способом.
Принятые Contract, Outcome и бюджет сборки не меняются и не требуют нового
согласования. Обычный `--retry-failed` не продлевает ни одно окно.

Прямой reader ограничивает страницу 2 MiB и возвращает
`source_page_too_large` при превышении. Вместо многократного чтения слишком
большой страницы выбрать соответствующую версии продукта страницу из того же
первичного домена. DNS, redirects и прежние source/evidence gates сохраняются.

Проверки: `node --test tests/agents-mother-host-research.test.mjs` покрывает
replay, crash, timeout/cancel, source authority, exact passages, несовместимость,
подмену отчёта и восстановление публикации. Общие external/repository gates
проверяются существующими suites.
