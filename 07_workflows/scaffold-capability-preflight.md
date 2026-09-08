---
id: scaffold-capability-preflight
type: workflow
status: active
created: 2026-09-06
updated: 2026-09-08
topics: [agents-mother, scaffold, runtime-capability, headless-cli, operations]
tools: [Pritha, Node.js, Git]
sources:
  - scripts/agents-mother/scaffold/capabilities.mjs
  - scripts/agents-mother/scaffold/headless-cli.mjs
  - tests/scaffold-capabilities.test.mjs
related:
  standards: [04_standards/agent-creation-harness.md, 04_standards/agent-result-type.md]
  workflows:
    - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
    - 07_workflows/agent-result-readiness.md
supersedes: []
superseded_by: []
source_version: scaffold capability v1 with narrow hybrid editor process adapter
verified: 2026-09-06
temporal_status: version-bound
memory_domain: agent-building-knowledge
subject:
  kind: workflow
  id: scaffold-capability-preflight
privacy: public
retention: durable
review_status: reviewed
confidence: medium
---

# Совместимость контракта и scaffold

```sh
node scripts/pritha.mjs scaffold-plan <contract-path>
node scripts/pritha.mjs scaffold <contract-path>
```

Первый вызов только читает контракт: validation issues, исходный fingerprint,
status и runtime/interface/operations capability. Он не создаёт папку агента
или reports, не меняет контракт и не предоставляет research/Outcome approval.
Scope результата — scaffold-capability-only.

Scaffold повторяет capability preflight до создания каталогов. Затем применяет
прежние contract acceptance, research, external evidence и synthesis gates.
Экспериментальные overrides остаются явными и попадают в report; preflight
не заменяет их разрешением.

| Выбранная комбинация | Adapter |
| --- | --- |
| Runtime cli или codex-native, только CLI/headless, service none, autostart disabled/optional, proactivity none/manual | headless-cli-v1 |
| Codex-native с поддерживаемыми workspace/interface слоями | Существующий codex-workspace-v1; placeholders не становятся готовым интерфейсом |
| API, service process, только web/API, proactivity none, autostart disabled/optional, adoption none | api-process-v1: HTTP/operations заготовки без запуска; независимые Outcome Trials обязательны |
| Explicit service, hybrid, web + Telegram operator-control, deterministic-first, high untrusted input, bounded atomic JSON state, no skills/MCP/adoption, proactivity none/manual, autostart disabled/optional | hybrid-editor-process-v1: Node process и tool-free editor placeholders; Telegram выключен, secrets пустые, независимые input/approval/fallback Trials обязательны |
| Явный tool-server, runtime cli, primary MCP stdio, optional web/CLI, UI service process (без UI service none), proactivity none, autostart disabled/optional, adoption none | tool-server-stdio-v1: provider и вспомогательный UI с отдельной readiness; Node-only test runner, no runtime start |
| CLI с сервером, расписанием или вторым интерфейсом | Конкретный дополнительный adapter требуется до записи файлов |
| Остальные API/local-model/hybrid/environment-specific сочетания, неизвестный custom interface | Runtime/interface adapter требуется до записи файлов |
| Headless CLI с selected-module adoption | Отдельный проверенный module-install adapter требуется до записи файлов |

Unsupported сообщает недостающую комбинацию и следующий шаг. Принятый runtime
не переписывается в codex-native ради обхода проверки. Для другого решения
нужна отдельная явная revision контракта и соответствующий research.

Hybrid editor adapter переносит только manifest pattern API process. Runtime,
данные или секреты существующего child не копируются. Он сохраняет hybrid в
артефактах, даёт только bounded child-owned JSON state и требует текущего
Node HTTP, Codex editor isolation, Telegram, input security и process lifecycle
evidence. Упоминание исключённых MCP/embeddings не включает их в этот узкий
adapter. Host env для Start/Stop ограничен выбранной port variable; постоянный
Start, Telegram activation и private Serve остаются отдельными UI-решениями.
Scaffold entrypoints возвращают implementation-required, редактор unavailable;
прохождение structural tests не означает готовность продукта.

Headless adapter сохраняет выбранные memory/tools/skills/data и lineage модули.
Он создаёт инструкции с harness evolution protocol, README, training guide,
CLI manifest, command entrypoint, structural smoke и healthcheck. Service,
Control Center server, deployment scripts и scheduler не генерируются.
Успешные structural checks позволяют создать чистый локальный Git baseline
для обычного disposable-worktree delivery; remote/push не выполняются.

Начальный CLI поддерживает help/status. Run возвращает exit 78 с явным
implementation-required, неизвестная команда — 64. Это готовность harness,
а не пользовательского результата. Следующая работа реализует approved
input/output и независимые Trials, после чего handoff дополняется реальным
первым сценарием и ревизией. Structural smoke/help не дают Outcome verified.

Scaffold report содержит фактический adapter и scaffold-only scope. У CLI нет
фиктивного URL, обещания управляемого процесса или ссылки на отсутствующий
service script. Authored lineage видна общему identity catalog без ручного
registry rebuild; live card и Outcome проверяются отдельно. Исправлено также
вычисление project_path: оно относится к code-root ровно один раз.

Тесты исполняют CLI команды и structural checks, проверяют чистый Git baseline,
сохранение runtime/контракта, отсутствие service файлов, identity catalog и
остановку unsupported до записи. End-to-end scaffold fixture намеренно
использует отмеченные research overrides: она доказывает adapter wiring,
а не production research approval. Полный approved clean path и проверенные
product Trials относятся к 4.1/7.1 и ручным пилотам после подготовки mother.
