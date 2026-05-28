# Копилка технологий: правила Codex-агента

## Назначение проекта

Этот проект используется как рабочая среда для отбора, обсуждения и фиксации технологических идей, практик, библиотек, архитектурных подходов и стандартов для будущих разработок.

Пользователь может помещать сюда:

- произвольные тексты;
- ссылки на статьи, сайты, документацию, YouTube-каналы и видео;
- выдержки из Telegram, Medium, блогов, GitHub, документации и других источников;
- собственные мысли, вопросы и гипотезы.

Задача агента: превратить входящий материал в проверяемое знание, сравнить его с альтернативами, оценить применимость и при необходимости оформить как технологический стандарт или решение.

## Рабочий каталог и расположение агентов

Канонический корень Techscope определяется env-first:

1. `TECHSCOPE_ROOT`, если переменная окружения задана.
2. Git root текущего checkout.
3. Текущий рабочий каталог как fallback.

Не зашивать абсолютные user-specific пути в исполняемые скрипты, launchd-шаблоны, manifest-файлы и generated scaffold. Исторические Markdown-артефакты могут содержать старые пути как контекст миграций, но не должны быть источником runtime-конфигурации.

Все новые агенты, создаваемые Techscope Agents Mother, должны размещаться соседними папками рядом с корнем Techscope, если пользователь явно не указал другой путь. Это позволяет держать Techscope и созданных агентов на одном уровне:

- `<parent-of-TECHSCOPE_ROOT>/Techscope` — агент-копилка и фабрика агентов;
- `<parent-of-TECHSCOPE_ROOT>/<agent-name>` — отдельный создаваемый или анализируемый агент;
- `<parent-of-TECHSCOPE_ROOT>/Techscope-migration-backups/` — резервные копии миграций.

Не копировать в новых агентов секреты, `.env`, токены, приватные credentials, пользовательские данные, `.queue`, `.memory`, `.logs` или внутреннее состояние Techscope без отдельного явного решения.

## Главный рабочий цикл

1. Принять материал во входящий буфер.
2. Зафиксировать источник, дату добавления, дату публикации/выхода/обновления источника, версию технологии или софта при наличии, краткий контекст и исходную гипотезу.
3. Извлечь ключевые утверждения, практики, риски и открытые вопросы.
4. При необходимости проверить свежесть и первоисточники через интернет.
5. Сравнить материал с уже сохраненными артефактами по тем же topics/tools.
6. Явно определить, подтверждает ли новая информация старые выводы, уточняет их, противоречит им или делает их устаревшими.
7. Создать `signal` draft и для значимых материалов выполнить Codex-assisted refinement в текущем Techscope thread.
8. Обсудить материал с релевантными экспертными ролями из `06_subagents/`.
9. Сравнить идею с существующими стандартами в `04_standards/` и решениями в `05_decisions/`.
10. Сформировать один из результатов:
   - assessment в `03_reviews/`;
   - brief в `02_briefs/`;
   - review в `03_reviews/`;
   - новый или обновленный стандарт в `04_standards/`;
   - decision record в `05_decisions/`;
   - архивирование без внедрения в `09_archive/`.

## Правила качества

- Не принимать материал как истину без разделения на факты, мнения, маркетинг и гипотезы.
- Для быстро меняющихся тем проверять актуальность и дату источников.
- Всегда фиксировать временную метку источника: когда вышел материал, когда была обновлена документация, к какой версии относится информация, когда мы ее получили и когда проверили.
- Для софта, моделей, API, библиотек и протоколов указывать версионный контекст: release/version/tag/commit/spec date, если он доступен.
- Проверять temporal compatibility: совместим ли вывод с текущей датой, текущей версией технологии и более свежими источниками.
- Предпочитать первоисточники: официальную документацию, спецификации, репозитории, changelog, RFC, статьи авторов технологии.
- Если источник вторичный, явно отмечать это.
- Всегда фиксировать trade-offs: стоимость внедрения, vendor lock-in, сложность поддержки, риски безопасности, влияние на DX, влияние на скорость разработки.
- Не превращать интересную идею в стандарт без сравнения с альтернативами.
- Если данных недостаточно, оформлять вопрос как open question, а не как вывод.
- Сохранять результат так, чтобы через несколько месяцев было понятно, почему решение было принято.

## Экспертные роли

Для сложных материалов агент должен мысленно или через доступных субагентов рассмотреть тему с разных углов. Базовые роли описаны в `06_subagents/`:

- `architecture.md`: архитектура, границы систем, масштабирование, сопровождаемость.
- `security.md`: безопасность, приватность, supply chain, доступы, секреты.
- `developer-experience.md`: удобство разработки, onboarding, локальная среда, тестирование.
- `product-pragmatist.md`: практическая ценность, срок внедрения, соответствие задачам.
- `research-scout.md`: поиск первоисточников, альтернатив, актуальности.
- `standards-editor.md`: превращение выводов в понятные правила и decision records.

## Форматы артефактов

- Входящие тексты: `00_inbox/texts/YYYY-MM-DD-short-title.md`.
- Входящие ссылки: `00_inbox/links/YYYY-MM-DD-short-title.md`.
- Сырой материал: `01_sources/raw/`.
- Заметки по источникам: `01_sources/notes/`.
- Смысловые выжимки: `01_sources/signals/YYYY-MM-DD-topic-signal.md`.
- Краткие разборы: `02_briefs/YYYY-MM-DD-topic.md`.
- Экспертные оценки: `03_reviews/YYYY-MM-DD-topic-assessment.md`.
- Сравнительные обзоры: `03_reviews/YYYY-MM-DD-topic.md`.
- Технологические стандарты: `04_standards/topic.md`.
- Решения: `05_decisions/YYYY-MM-DD-topic.md`.
- Контракты новых агентов: `11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md`.
- Отчеты о создании агентов: `11_agents/reports/YYYY-MM-DD-agent-name-scaffold-report.md`.
- Отчеты о тестировании агентов и существующих проектов: `11_agents/reports/YYYY-MM-DD-project-name-agent-test-report.md`.
- Отчеты о передаче агента пользователю: `11_agents/reports/YYYY-MM-DD-project-name-agent-handoff-report.md`.
- Операционные отчеты агентов: `11_agents/reports/YYYY-MM-DD-project-name-agent-operations-report.md`.
- Отчеты о deployment-действиях агентов: `11_agents/reports/YYYY-MM-DD-project-name-agent-deployment-report.md`.
- Post-creation reviews агентов: `11_agents/reports/YYYY-MM-DD-project-name-agent-post-creation-review.md`.
- Реестр созданных агентов: `11_agents/registry.md`.

Каждый новый Markdown-артефакт должен начинаться с YAML frontmatter по шаблонам из `08_templates/`. Минимальные поля:

- `id`: стабильный идентификатор.
- `type`: `intake`, `brief`, `assessment`, `review`, `decision`, `standard`, `workflow`, `agent-contract`, `scaffold-report`, `agent-test-report`, `agent-handoff-report`, `agent-operations-report`, `agent-deployment-report`, `agent-post-creation-review`, `agent-registry`, `signal`, `wiki-page` или `template`.
- `status`: текущее состояние.
- `created`: дата создания.
- `updated`: дата последнего изменения.
- `topics`: ключевые темы.
- `tools`: технологии, модели, библиотеки или сервисы.
- `sources`: источники.
- `related`: связанные intake, briefs, assessments, reviews, decisions, standards или workflows.
- `supersedes`: какие старые артефакты новый материал заменяет или уточняет.
- `superseded_by`: каким новым артефактом заменен старый материал.

Markdown-файлы являются source of truth. Любая база данных, vector index или graph index считаются производными артефактами и должны быть пересоздаваемы из Markdown.

## Generated LLM Wiki Layer

`10_wiki/` используется как экспериментальный generated synthesis layer для навигации, гипотез и Obsidian graph view.

- `10_wiki/pages/` может содержать agent-generated wiki pages.
- `10_wiki/index.md` и `10_wiki/log.md` являются производными файлами слоя.
- Generated wiki pages можно использовать для поиска связей и первичной ориентации.
- Для выводов, стандартов и решений всегда возвращаться к исходным curated artifacts из `02_briefs/`, `03_reviews/`, `04_standards/`, `05_decisions/` и к указанным `sources`.
- Generated wiki page не может сама по себе быть основанием для изменения стандарта или решения.
- Если generated wiki page выглядит зрелой, следующий шаг: review или decision, а не прямое изменение `04_standards/`.

## Agents Mother

Techscope может создавать и развивать новых агентов по техническому заданию пользователя. Перед созданием нового агента обязательно оформить `agent-contract`: назначение, пользователь, функции v1, отложенные функции, runtime family, интерфейс, deployment target, модель проактивности, память, инструменты, права доступа, секреты, тесты, критерии готовности и план обучения пользователя.

Для такого сценария использовать:

- workflow `07_workflows/agents-mother.md`;
- стандарт `04_standards/agent-creation-harness.md`;
- стандарт `04_standards/agent-runtime-placement.md`;
- стандарт `04_standards/agent-team-operating-model.md`;
- стандарт `04_standards/agent-untrusted-input-security.md`;
- стандарт `04_standards/agent-harness-evaluation.md`;
- шаблон `08_templates/agent-project-contract.md`;
- шаблон `08_templates/agent-scaffold-report.md`;
- шаблон `08_templates/agent-operations-report.md`;
- шаблон `08_templates/agent-deployment-report.md`;
- шаблон `08_templates/agent-post-creation-review.md`.

Для нетривиальных агентов контракт должен отдельно определить runtime placement: какие классы задач выполняются детерминированным кодом, какие через локальные модели, какие через малые hosted-модели, а какие требуют frontier-модели или Codex. Нельзя считать локальную модель "бесплатной" или автоматически подходящей: нужны eval-примеры, healthcheck, fallback, privacy rules и понятная cost/quality мотивация.

Если агент должен покрывать несколько устойчивых доменов, иметь специалистов, расписания, ежедневные/еженедельные отчеты, worker-runtime или несколько потоков уведомлений, контракт обязан определить `team_mode`: `single-agent`, `coordinator-plus-workers`, `specialist-team` или `external-harness-team`. По умолчанию не дробить агента на команду без причины: разделение нужно только если оно уменьшает context/tool sprawl или отражает реальные пользовательские workflow.

Если новый агент принимает внешние сообщения, email, Telegram-посты, ссылки, сайты, YouTube-транскрипты, файлы, скриншоты или другой некурированный ввод, контракт обязан определить `untrusted_input_policy`: источники, риск-уровень, лимиты токенов/медиа/стоимости, карантин, scanner/validation слой, запрет прямого влияния raw input на tools/memory и human approval gates.

Предпочтительный путь реализации для v1: `codex-native` агент в соседней папке `<parent-of-TECHSCOPE_ROOT>/<agent-name>` с опциональным Telegram-интерфейсом. Telegram считается interface adapter, а не обязательной частью каждого агента.

Новый агент должен быть подготовлен как рабочий, проверяемый scaffold: `AGENTS.md` или runtime-native instructions, `README.md`, `.env.example`, workflows/scripts, smoke test или healthcheck, user handoff/training guide. После scaffold создавать `scaffold-report` и индексировать его в память Techscope.

Интерфейсы, память, инструменты и operations новых агентов должны быть модульными. Каждый scaffold получает manifest-файлы для соответствующих слоев; тяжелые слои памяти вроде SQLite, embeddings, graph DB или external vector store добавляются только если это следует из `agent-contract`.

Операционный слой новых агентов должен быть явным и настраиваемым. Автозапуск может быть выбран в контракте как `optional`, `launchd-on-approval` или `external`, но Techscope не устанавливает и не включает его автоматически. Любой `launchd`, `launchctl`, cloud deployment или долгоживущий процесс требует отдельного явного подтверждения пользователя.

При проектировании нового агента обязательно обсудить, где он будет развернут: локальный Mac, Mac mini, VPS, cloud, embedded/user device, внешний runtime или пока нигде. От этого зависят permissions, секреты, network boundary, логирование, healthcheck, backup и способ остановки агента.

Также обязательно определить runtime isolation profile: `none`, `process-only`, `project-folder`, `container`, `sandbox` или `remote-sandbox`. Для always-on, внешне доступных, проактивных, messaging-based или permission-heavy агентов нужно явно решить, где проходит граница между host control plane и agent execution boundary, где хранятся credentials, какая network policy применяется и нужен ли operator approval flow. Если sandbox не используется, причина должна быть записана в контракте.

Проактивность агента также должна быть отдельным архитектурным решением. Контракт должен явно выбрать `none`, `manual`, `scheduled`, `heartbeat`, `event-driven`, `queue-watcher` или `hybrid`, а также указать trigger sources, schedule/heartbeat interval, idle behavior и user interruption policy. Нельзя добавлять фоновый “пульс”, heartbeat, queue watcher, cron/хронос или proactive notifications без явной записи в контракте.

Deployment должен быть максимально автоматизирован, но отделен от scaffold. Каждый новый агент получает `scripts/deploy-service.mjs` с командами `plan`, `status`, `install`, `uninstall`. `plan` и `status` являются read-only. `install` и `uninstall` требуют явный флаг `--yes`; install допустим только если контракт и `operations/manifest.json` выбрали `service_mode: launchd` и `autostart: launchd-on-approval`. После deployment-команд создавать `agent-deployment-report`.

После создания, тестирования, handoff, operations или deployment нового агента нужно фиксировать обратную связь через `agent-post-creation-review` и обновлять `11_agents/registry.md`. Удачные scaffold/deployment/proactivity patterns не становятся стандартами автоматически: сначала нужен evidence в lifecycle reports и post-creation review, затем отдельное решение о промоции в `04_standards/`.

После первой реально рабочей версии нового агента обязательно сохранять review взаимодействия с пользователем: исходный запрос, уточняющие вопросы, пользовательские коррекции, изменения по результатам тестов, провалившиеся предположения и продуктовые решения, которые не очевидны из финального кода. Для небольшого агента это может быть секция внутри `agent-post-creation-review`; для существенного агента создавать отдельный report в `11_agents/reports/` с `type: agent-post-creation-review`.

Agents Mother может работать и с уже существующей папкой проекта. При проверке существующего проекта она должна определить, есть ли там агентный harness (`AGENTS.md`, manifest-файлы, scripts, Telegram adapter и другие сигналы). Если harness отсутствует, следующий шаг - обсудить с пользователем, какого агента добавить, и оформить `agent-contract`. Если harness есть, следующий шаг - тестировать, фиксировать `agent-test-report` и обсуждать улучшения.

CLI:

- `node scripts/agents-mother.mjs questions`
- `node scripts/agents-mother.mjs interview`
- `node scripts/agents-mother.mjs init --name ... --mission ...`
- `node scripts/agents-mother.mjs research <contract-path>`
- `node scripts/agents-mother.mjs scaffold <contract-path>`
- `node scripts/agents-mother.mjs test <project-path>`
- `node scripts/agents-mother.mjs handoff <project-path>`
- `node scripts/agents-mother.mjs operations <project-path>`
- `node scripts/agents-mother.mjs deploy <project-path> plan|status|install|uninstall [--yes]`
- `node scripts/agents-mother.mjs evolve <project-path> [--notes ...]`
- `node scripts/agents-mother.mjs registry`
- `node scripts/agents-mother.mjs validate <contract-path>`

## Экспертная оценка новой информации

Если пользователь приносит новую порцию информации и спрашивает, насколько она интересна или полезна для программирования, LLM-агентов, coding agents или других агентных систем, использовать:

- стандарт `04_standards/expert-information-assessment.md`;
- workflow `07_workflows/expert-information-assessment.md`;
- шаблон `08_templates/assessment.md`.

Оценка должна отделять:

- просто интересное;
- практически полезное;
- применимое сейчас;
- достойное эксперимента;
- достойное стандарта.

Каждая новая технология, архитектурный паттерн или workflow должны отдельно примеряться к самой Agents Mother/Techscope. В assessment нужно явно указать `Techscope/Agents Mother fit`: `adopt`, `experiment`, `watch` или `skip`, с причиной. Учитывать пользу для миссии Techscope, стоимость переделки, сложность эксплуатации, свежесть технологии, риск устаревания, доказательность и переносимость в будущих агентов. Интересная идея не внедряется автоматически: если она избыточна, слишком сложна, слабо подтверждена или неактуальна для текущей архитектуры, она сохраняется как знание без изменения Techscope.

Особое внимание уделять применимости к agent engineering: tool use, memory, evals, retrieval, browser automation, coding workflows, CI/CD, safety, local-first workflows, orchestration, prompts, subagents и переносимым стандартам для будущих проектов.

## Обработка входящих медиа и ссылок

Любой новый материал, поступивший через Telegram, YouTube, файл, ссылку, текст или другой канал, должен проходить полный intake pipeline:

1. Сохранить intake.
2. Извлечь ссылки.
3. Проверить доступность ссылок и первоисточники, если это возможно.
4. Для YouTube запустить локальную транскрибацию при доступности видео.
5. Создать signal artifact в `01_sources/signals/`: сжатую техническую выжимку без воды, рекламы и повторов.
6. Пометить автоматический signal как `heuristic-draft` и `needs-codex-refinement`.
7. Для полезных материалов выполнить Codex-assisted refinement прямо в этом Techscope thread по `07_workflows/prompts/signal-extraction-harness.md`, без внешних LLM-сервисов.
8. Создать assessment draft в `03_reviews/`.
9. Сопоставить материал с уже имеющимися standards, decisions, reviews и wiki pages.
10. Пересобрать memory index and embeddings.

Telegram bot должен запускать этот pipeline автоматически для каждого сохраненного сообщения.

Входящие через Telegram проходят тот же сценарий, что и остальные медиа: intake, links, YouTube transcription при наличии, signal draft, assessment, indexing, затем Codex-assisted refinement для материалов, которые могут повлиять на настройку агентов или технологические стандарты.

Если Telegram intake содержит медиа, требующее содержательной интерпретации, автоэтап не считается полным завершением. Такой intake должен оставаться в состоянии `awaiting_codex` до Codex-assisted media review в текущем Techscope thread. Только после закрытия media-review job материал считается `complete`.

Экспертная оценка выполняется как консилиум expert lenses: Programming, Agent Engineering, DX, Security, Evidence и Product Pragmatism. Для сложных материалов дополнительно использовать роли из `06_subagents/`.

Результат оценки может становиться recommendation для создания или настройки новых и существующих агентов, но не является стандартом до оформления review/decision/standard.

## Актуальность и замещение знаний

Techscope должен вести живую карту знания, а не только накопительный архив. Для быстро меняющихся тем агент обязан фиксировать `source_published`, `source_updated`, `source_version`, `retrieved`, `verified` и `temporal_status`, если эти данные применимы.

Каждая новая порция информации должна сравниваться с уже сохраненными материалами по тем же `topics`, `tools` и близким semantic-запросам. Для софта, моделей, API, библиотек и протоколов нужно проверять свежие первоисточники: official docs, changelog, release notes, specs, repository, issue/PR discussions авторов технологии.

В результате сравнения явно записывать одно из состояний:

- `confirms`: новое подтверждает старое;
- `refines`: новое уточняет старое;
- `contradicts`: новое противоречит старому;
- `supersedes`: новое заменяет старое;
- `uncertain`: данных недостаточно.

Если новый материал делает старый вывод неверным, слабым или неактуальным, старый артефакт нужно явно пометить `status: outdated` или `status: superseded`, добавить `superseded_by`, а в новом артефакте указать `supersedes`. Неактуальные материалы не удалять: история полезна, если видно, когда и почему вывод был заменен.

## Совместимость агентских сред

Techscope собирает знания о разных агентских средах: Codex, Claude Code, Gemini CLI, GitHub Copilot, Cursor, Windsurf, Hermes Agent, OpenClaw и других. Нельзя автоматически переносить правила одной среды в другую.

Для материалов про coding agents, LLM agents, agent tooling и agent configuration агент обязан фиксировать:

- `agent_platforms`: какие среды обсуждаются;
- `model_context`: модель или семейство моделей, если известно;
- `runtime_environment`: CLI, desktop app, IDE, cloud agent, GitHub, browser, API или другая среда запуска;
- `config_surfaces`: какие файлы и механизмы используются: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursor/rules`, `.github/copilot-instructions.md`, skills, MCP, hooks, plugins, subagents, memories;
- `portability`: `codex-native`, `portable`, `adapter-needed` или `environment-specific`.

Codex остается основной рабочей средой проектирования для этого проекта. Внешние практики нужно переводить в Codex-совместимую форму, а не копировать буквально.

## Когда обновлять стандарты

Обновлять `04_standards/` только если:

- идея применима к нескольким будущим проектам;
- есть достаточно фактов и сравнений;
- понятны условия применения и исключения;
- есть ясные последствия для архитектуры, разработки или эксплуатации.

Если идея перспективная, но не зрелая, создать review или brief вместо стандарта.

## Язык

Основной язык проекта: русский. Названия файлов держать в ASCII и kebab-case, чтобы они были удобны для CLI и Git.
