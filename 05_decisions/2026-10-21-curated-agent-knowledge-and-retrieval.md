---
id: 2026-10-21-curated-agent-knowledge-and-retrieval
type: decision
status: superseded
created: 2026-10-21
updated: 2026-10-21
topics: [agent-building-knowledge, agent-memory, retrieval, sdk-selection, protected-trials]
tools: [Pritha, SQLite, FTS5, MiniLM]
sources:
  - 03_reviews/2026-10-21-agent-repository-deep-review.md
  - 02_briefs/2026-10-21-agent-retrieval-evaluation.md
  - tests/fixtures/memory/retrieval-baseline.json
  - tests/fixtures/memory/retrieval-cases.json
related:
  workflows:
    - 07_workflows/memory-indexing.md
    - 07_workflows/agent-failure-to-trial.md
    - 07_workflows/agents-mother.md
  standards:
    - 04_standards/agent-minimal-core-extension-surface.md
    - 04_standards/memory-domains.md
supersedes: []
superseded_by:
  - 05_decisions/2026-10-21-curated-retrieval-promotion.md
memory_domain: pritha-self
memory_domains: [pritha-self, governance]
subject:
  kind: decision
  id: curated-agent-knowledge-retrieval
privacy: public
retention: durable
review_status: reviewed
confidence: high
freshness_status: current
source_published: 2026-10-21
source_updated: 2026-10-21
source_version: frozen retrieval fixture v1; installed MiniLM 384d
retrieved: 2026-10-21
verified: 2026-10-21
temporal_status: version-bound
---

# Отбор агентных знаний и scoped retrieval Pritha

Исторический первый прогон. Последующая content verification и реальные pilots зафиксированы в `05_decisions/2026-10-21-curated-retrieval-promotion.md`; отрицательные исходные measurements ниже сохранены.

Принято в рамках разрешённого пользователем enrichment: сохранить проверенные references, manual Failure-to-Trial и воспроизводимый retrieval eval. Read-only retriever остаётся experimental после отрицательного final gate. Текущие runtime, provider dependencies и legacy memory commands сохраняют поведение.

## Проблема и выбранный путь

На frozen 24 positive questions начальный strict FTS находил reference в top-5 в 6 случаях, unscoped semantic в 12. Новые briefs сами повысили legacy результаты до 7 и 15. Первый scoped FTS snapshot дал 20/24 и holdout 6/8; заключительный — 19/24 и 5/8, при top-10 22/24 и отсутствии потерь относительно initial semantic top-10. Candidate не выдержал gate после authored updates.

Исследовательская команда использует FTS без ML imports; semantic и hybrid доступны явно. Promotion всех новых retrieval paths в основной research flow отклонена до нового независимого eval, без изменения frozen gold ради pass. EmbeddingGemma 2, второй SDK executor и managed runtime также остаются watch до contract-specific pilot.

## Knowledge и factory

Десять reviewed GitHub candidates добавлены в единственный canonical registry с pins и caveats. API client, Agents SDK, coding SDK/App Server и managed runtime выбираются по Outcome и state ownership. Public repository и accepted-for-review не дают разрешения на module adoption.

Manual Failure-to-Trial workflow связывает actual/expected с exact revision, проверяет cause альтернативами и требует host-protected verifier. Generic sensors и calibrated judges остаются planned.

## Последствия и ограничения

Дополнительная команда требует поддержки filters и frozen eval corpus, но сохраняет rollback: перестать использовать её и вернуться к прежним commands. Generated indexes восстанавливаются из authored knowledge.

Набор мал и тематически ограничен. Нахождение reference не доказывает правильность ответа. Negative cases проверяют отсутствие private markers и небезопасных источников; semantic similarity не является механизмом отказа на неподтверждённый вопрос. Source/status/version reading и human acceptance остаются отдельными.

Good State Alignment: aligned с baselines 2026-07-02 и 2026-08-28. Native history, voice/music, grants, protected verifier, instance state и managed production lifecycle сохраняются.
