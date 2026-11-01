---
id: child-provider-setup
type: workflow
status: active
created: 2026-11-01
updated: 2026-11-01
topics: [agents-mother, child-runtime, providers, credentials]
tools: [Node.js, Anthropic, NeuralDeep, OpenRouter]
sources:
  - scripts/lib/child-provider-configuration.mjs
  - scripts/lib/child-model-client.mjs
  - scripts/agents-mother/scaffold/provider.mjs
  - https://platform.claude.com/docs/en/api/messages/create
  - https://openrouter.ai/docs/api_reference/overview
  - https://github.com/NumericalArt/Pritha-NeuralDeep/blob/2ab22aeff5f1c167c86e925ec30311942b76023b/scripts/neuraldeep/agent-provider-binding.mjs
related:
  workflows: [07_workflows/agents-mother.md, 07_workflows/agents-mother-host-research.md]
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
subject: {kind: workflow, id: child-provider-setup}
privacy: public
retention: durable
review_status: reviewed
confidence: medium
---

# Модель прикладного дочернего агента

Build executor создаёт продукт; Child model provider обслуживает запросы
готового продукта. Существующий контракт без нового выбора сохраняет прежний
scaffold без API-зависимостей и новых credentials.

1. В draft contract выбрать `Child model provider: claude | neuraldeep |
   openrouter` и точный `Child model ID`. CLI принимает `--child-provider` и
   `--child-model` при `init`, включая `--from-brief`. `none` оставляет клиент
   выключенным. Anthropic требует полный model ID; OpenRouter — `vendor/model`.
2. Выполнить memory/current-source research по выбранному API. Новый выбор
   добавляет required topic и меняет contract fingerprint. Прежние approval,
   evidence и scaffold gates сохраняются; Contract и Outcome принимаются отдельно.
3. Scaffold добавляет `runtime/provider.json`, bounded text client,
   `scripts/provider-pilot.mjs`, пустой ключ и публичные model/base URL в
   `.env.example`. Секреты Pritha не копируются. API-process, CLI и остальные
   поддержанные adapters сохраняют прежние interfaces и lifecycle.
4. В `/agents` открыть Credentials этого ребёнка. Панель показывает выбранные
   provider/model/base URL и целевой `.env.local`. Save атомарно пишет введённый
   ключ, `<PROVIDER>_BASE_URL` и `<PROVIDER>_MODEL`. Prefix: `ANTHROPIC`,
   `NEURALDEEP` или `OPENROUTER`. Nested target допустим только из manifest.
   Изменённый после открытия панели выбор вызывает `provider_configuration_changed`;
   перечитать панель. Credentials API возвращает только маску.
5. `node scripts/provider-pilot.mjs status` читает собственные config и dotenv,
   без parent env, parent dotenv или Keychain. `configured-unverified` подтверждает
   только конфигурацию, не billing, качество модели или inference.
6. Только после явного выбора оператора запускать
   `node scripts/provider-pilot.mjs request --yes` с текстом через stdin.
   Это один платный запрос. Сохранение ключа не запускает сервис, модель,
   scheduler или rollout. Автоматические tests используют synthetic fetch.

Anthropic использует fetch Messages client с API version `2026-10-21`.
ND/OpenRouter используют фиксированный HTTPS Chat Completions endpoint;
redirects, model fallback, plugins и внешние media не допускаются. OpenRouter
отключает backend fallbacks. Произвольный endpoint требует отдельного reviewed
connector; Local использует отдельный offline runtime.

Text API ограничен input 256 KiB, ответом 4096 токенов и 60 секундами; compatible
HTTP body — 2 MiB, pilot — 512 токенами ответа. Returned model обязан совпасть.
Ошибка не повторяет запрос, missing usage остаётся unknown, обрезанный ответ
не считается complete. Клиент не исполняет tools. Anthropic tools доступны
через отдельный Messages client и принятую product tool policy; подписанные
thinking blocks не попадают в публичную сериализацию.

Private reads отвергают symlinks, hardlinks, oversized files, duplicate keys и
конфликтующие model/URL. Старые сторонние children не переписываются автоматически.
Новый SDK не требуется. Исторический Claude SDK pilot проверяет offline tool
conformance; `agentLoop: pending-auth` не является live success.
