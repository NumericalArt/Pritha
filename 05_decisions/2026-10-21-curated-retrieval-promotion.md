---
id: 2026-10-21-curated-retrieval-promotion
type: decision
status: active
created: 2026-10-21
updated: 2026-10-21
topics: [pritha-memory, retrieval, evidence-verification, runtime-recovery]
tools: [Pritha, SQLite, FTS5, MiniLM, Codex App Server]
sources:
  - 03_reviews/2026-10-21-pritha-retrieval-and-runtime-verification.md
  - tests/fixtures/memory/retrieval-acceptance-cases.json
related:
  workflows:
    - 07_workflows/memory-indexing.md
    - 07_workflows/agent-failure-to-trial.md
  decisions:
    - 05_decisions/2026-10-21-curated-agent-knowledge-and-retrieval.md
supersedes:
  - 05_decisions/2026-10-21-curated-agent-knowledge-and-retrieval.md
superseded_by: []
memory_domain: pritha-self
memory_domains: [pritha-self, governance]
subject:
  kind: decision
  id: curated-retrieval-promotion
privacy: public
retention: durable
review_status: reviewed
confidence: high
source_published: 2026-10-21
source_updated: 2026-10-21
source_version: content evaluation v2; locked 60-case fixture; scoped FTS v2
retrieved: 2026-10-21
verified: 2026-10-21
temporal_status: version-bound
---

# Применение проверенного curated поиска в Pritha

Curated FTS v2 принят для ручного поиска и `agent-building-knowledge` части factory research. Основание — отдельный content evaluation, новый holdout до настройки, отсутствие потерь прежних успешных top-10 и synthetic privacy leaks. Исходные отрицательные filename-proxy measurements сохранены как история.

Контекст возвращает source IDs, statuses и разделы. Russian lightweight normalization, симметричный engineering glossary и BM25 работают только на разрешённом корпусе текущего instance. Generic memory, child/profile research и provider embedding model этим решением не мигрируются. Semantic/hybrid доступны явно, но не выбраны default для этого scope.

Нахождение источника не разрешает действие и не доказывает правильность ответа. Для неподтверждённой версии или private запроса нужны отказ/insufficient evidence, для module adoption — существующий contract-specific gate. Generated wiki не является approval.

Cold Codex recovery сохраняет observed model прежнего attempt. Восстановление не создаёт второй `turn/start`; readback и cancellation/ambiguous receipt остаются обязанностью host. Успешный synthetic idempotency run не доказывает exactly-once произвольного внешнего API.

MCP Apps и SDK имеют конкретные воспроизводимые local pilots. MCP View не становится production host; SDK offline conformance не является live provider benchmark. Промоция новых provider executors, production host или управляемого сервиса требует доказанной задачи, live auth/cost/quality evidence и соответствующего deployment workflow.

Откат scoped research: вернуть прежний public domain search в factory и убрать использование команды `curated`; authored knowledge и оба набора измерений сохранить. Откат model pin не нужен для изменения default модели новой задачи: pin относится к восстановлению уже существующего attempt.

Good State Alignment: aligned. Native history, approvals, voice/music, protected verifier, instance roots и staged production lifecycle сохраняются. Machine verified и user accepted различаются; Git/tag recovery baseline фиксируется отдельным workflow после принятия пользователем.
