---
id: 2026-10-21-agent-retrieval-evaluation
type: brief
status: reviewed
created: 2026-10-21
updated: 2026-10-21
topics: [agent-memory, retrieval, semantic-search, hybrid, evaluation]
tools: [SQLite, FTS5, MiniLM, EmbeddingGemma 2]
agent_platforms: [Pritha, Codex, OpenAI, Anthropic, Google, DeepSeek, LangChain, Microsoft]
model_context: [version-bound; no provider performance claim adopted]
runtime_environment: [local research, API, CLI, browser]
config_surfaces: [agent-contract, agent-outcome-spec, memory, tools, permissions]
portability: adapter-needed
sources:
  - 03_reviews/2026-10-21-agent-repository-deep-review.md
  - 03_reviews/2026-10-21-agent-updates-for-pritha-assessment.md
  - 03_reviews/2026-10-21-pritha-retrieval-and-runtime-verification.md
  - 05_decisions/2026-10-21-curated-retrieval-promotion.md
related:
  decisions:
    - 05_decisions/2026-10-21-curated-retrieval-promotion.md
  workflows:
    - 07_workflows/2026-10-21-pritha-agent-knowledge-enrichment-plan.md
  standards:
    - 04_standards/agent-minimal-core-extension-surface.md
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
memory_domains: [agent-building-knowledge, pritha-self]
subject:
  kind: brief
  id: 2026-10-21-agent-retrieval-evaluation
privacy: public
retention: durable
review_status: reviewed
confidence: high
freshness_status: current
source_published: 2026-09-10 to 2026-10-21
source_updated: unknown
source_version: pinned October 2026 corpus; historical filename proxy v1 and accepted content evaluation v2
retrieved: 2026-10-21
verified: 2026-10-21
valid_for: reviewed source versions; runtime adoption requires contract-specific evidence
temporal_status: version-bound
---

# Проверка поиска по памяти Pritha

Русский вопрос может не содержать API name, а точный запрос с несколькими словами в legacy FTS требует их одновременного присутствия. Unscoped semantic search возвращает похожие chunks, включая старые рекомендации и материалы конкретных child agents. Поэтому качество поиска проверяется отдельно от числа проиндексированных документов.

Текущее решение: **curated FTS v2 принят** для ручного поиска и `agent-building-knowledge` части factory research. Semantic/hybrid остаются явными альтернативами, EmbeddingGemma не внедрялась. Ниже отдельно сохранены первоначальный неудачный этап и последующая content verification; их результаты не взаимозаменяемы.

## Исходное измерение

Набор из 30 вопросов зафиксирован до настройки ranker: 8 exact, 10 semantic, 6 version/status и 6 negative. Среди первых 24 baseline FTS hit@5 составил **6/24**, semantic **12/24**. Gold набор допускает несколько curated references; автоматическая проверка измеряет нахождение источника, а содержание ответа оценивается отдельно.

Текущая модель — paraphrase-multilingual-MiniLM-L12-v2, **384 dimensions**. Сохранение existing model уменьшает migration cost; embeddings другой модели и размерности нельзя смешивать.

## Исходный scoped поиск v1 — исторический этап

Первоначальная опциональная команда memory-retrieve.py использовала explicit domain, curated paths/types, исключение outdated/superseded/archived/rejected по умолчанию и document deduplication. В v1 default был scoped FTS с OR по безопасно quoted tokens. Semantic и reciprocal-rank hybrid были доступны только как явно выбранные режимы. Включение history возвращало исторический status. Старые query-memory.mjs search и semantic-search.py сохранили поведение.

Public research не проходит в instance-local agent paths, .private, user-model или sibling state. Фильтр в retrieval дополняет корректный intake/indexing; он не очищает ошибочно публично сохранённый секрет.

Фиксированный eval сравнивает top-5/top-10, holdout, latency, footprint и forbidden markers. Similarity score не является вероятностью истинности. Найденный draft нельзя объявлять implemented; для утверждения нужно прочесть section, версию и code/test evidence.

Первый обогащённый snapshot дал scoped FTS 20/24 hit@5, 22/24 hit@10 и holdout 6/8. Повтор после заключительных authored updates дал 19/24, 22/24 и holdout 5/8: первоначальный gate не был пройден. Hybrid также не прошёл исходные пороги 80%/75%. На этом этапе оба пути были оставлены experimental, основной поиск не переключался. Frozen questions и ranking formula не подгонялись. Эти исторические числа измеряют нахождение reference в небольшом наборе, а не accuracy сгенерированных ответов; текущее решение основано на content v2 ниже.

## EmbeddingGemma 2

[Официальный guide от 6 октября](https://developers.googleblog.com/embeddinggemma-2-the-developer-guide/) описывает text/code encoder 270M, 8192 tokens и 768-dimensional space с MRL. Query/document используют разные task prompts. Это provider claims, не замер на русской памяти Pritha.

Для candidate нужны отдельный index/model namespace, pinned weights, license/access review, compatible dependencies и полный rebuild. Текущий sentence-transformers **5.1.2** ниже указанного guide baseline **6.1.0**. **watch** миграцию модели; **adopt** воспроизводимый retrieval eval. Curated FTS v2 уже принят в ограниченном scope без смены embedding model. Для будущей замены модели сначала доказать дефект текущего поиска, затем сравнивать более тяжёлую модель.

## Content verification и promotion 21 октября

Filename proxy v1 не является проверкой содержания: корректная module-local license evidence возвращалась из другого источника и считалась miss, а совпадение имени файла не гарантировало нужный раздел. Исходные fixture и measurements сохранены. Новая frozen content fixture v2 содержит 60 cases, включая 30 новых holdout; source IDs и существенные утверждения проверяются в одном выданном разделе.

Curated FTS v2 дал 45/48 positive @5, 46/48 @10 и 23/24 нового positive holdout @5, без synthetic privacy leaks и потерь прежних успешных @10. Russian lightweight normalization и симметричный engineering glossary работают на source и query; BM25 corpus ограничен разрешённым domain. Полный доступ к private/sibling данным не используется даже для статистики ранжирования. Контекст ограничен шестью разделами и 6000 символами на раздел; approximate stemming может давать коллизии.

Ручной curated command и factory agent-building domain используют этот путь. Semantic/hybrid остаются явными альтернативами с прежней MiniLM; EmbeddingGemma не внедрялась. Это выбор по локальному corpus, а не универсальная победа FTS. После раскрытия holdout его нельзя использовать для следующей настройки. Три misses @5 сохранены, без ослабления thresholds.

Дополнительно выполнен отдельный source-answer audit из 10 вопросов: 6 подтверждённых ответов, 4 корректных недостатка данных; citations проверены содержательно. Он включает неизвестный release, private request и вредоносную wiki instruction. Это ограниченная проверка ответов, не calibrated judge и не user acceptance. Устойчивость и окончательная верификация: `03_reviews/2026-10-21-pritha-retrieval-and-runtime-verification.md`.
