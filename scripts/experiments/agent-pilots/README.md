---
id: isolated-agent-pilots
type: workflow
status: experimental
created: 2026-10-21
updated: 2026-10-21
topics: [agent-runtime, mcp-apps, sdk-conformance, recovery]
tools: [Codex CLI, OpenAI Agents SDK, Claude Agent SDK, MCP Apps]
sources:
  - 03_reviews/2026-10-21-pritha-retrieval-and-runtime-verification.md
related:
  workflows:
    - 07_workflows/memory-indexing.md
supersedes: []
superseded_by: []
memory_domain: pritha-self
subject:
  kind: workflow
  id: isolated-agent-pilots
privacy: public
retention: durable
review_status: reviewed
confidence: high
---

# Изолированные local pilots

Это воспроизводимые research probes, не scaffold и не production service. Dependencies фиксируются в этом package-lock, устанавливаются отдельно в instance state, lifecycle scripts пакетов отключены. Требуются Node ≥20, Python и подготовленный Pritha memory index.

```sh
pilot_workspace="${PRITHA_STATE_ROOT:?}/experiments/agent-pilots"
pilot_run="${PRITHA_STATE_ROOT}/memory/evals/manual-agent-pilots"
mkdir -p "$pilot_workspace" "$pilot_run"
chmod 700 "$pilot_workspace" "$pilot_run"
cp scripts/experiments/agent-pilots/package.json scripts/experiments/agent-pilots/package-lock.json "$pilot_workspace/"
npm ci --prefix "$pilot_workspace" --ignore-scripts --no-audit --no-fund
npm audit --prefix "$pilot_workspace" --omit=dev
node scripts/experiments/sdk-state-pilot.mjs --workspace "$pilot_workspace" --run-dir "$pilot_run/sdk"
node scripts/experiments/claude-tools-pilot.mjs --workspace "$pilot_workspace" --run-dir "$pilot_run/sdk"
node scripts/experiments/mcp-memory-view.mjs --workspace "$pilot_workspace" --run-dir "$pilot_run/mcp-view"
```

MCP View открывает один временный loopback listener на свободном порту; процесс сообщает URL, принимает только local host/origin и закрывается через 15 минут или Ctrl-C. Не использовать как always-on host. Browser checks выполнять через доступный browser automation с настоящим App/AppBridge. До deployment требуется отдельный review принимающего host.

Live Codex recovery отдельно использует существующую native authorization и оплачиваемые/лимитируемые model turns. Для каждого запуска нужен новый private run directory; повторное использование старого fixture receipt намеренно не сбрасывает effect count. Нельзя копировать auth.json, .env или credentials в этот workspace.

```sh
python3 scripts/experiments/codex-recovery-pilot.py --run-dir "$pilot_run/codex-new-run" --codex-bin "$pilot_workspace/node_modules/.bin/codex"
python3 scripts/experiments/memory-answer-audit.py --run-dir "$pilot_run/answers-new-run" --database "${PRITHA_STATE_ROOT}/memory/techscope.sqlite" --codex-bin "$pilot_workspace/node_modules/.bin/codex"
node scripts/experiments/sdk-live-comparison.mjs --workspace "$pilot_workspace" --run-dir "$pilot_run/sdk-live-new-run"
```

Recovery fixture допускает только fixed synthetic receipt и wait. Host accepts только exact fixture approval; остальные запросы отклоняются. Model берётся из model/list и закрепляется при cold resume. Не применять fixture server или его approval code к production tools.

OpenAI SDK pilot использует scripted model и synthetic usage; это проверка runtime state, не качество/стоимость provider. Claude pilot проверяет custom-tool surface без model call. `sdk-live-comparison.mjs` отдельно выполняет оплачиваемый OpenAI API comparison с тем же fixed Outcome и ограничением maxTurns/maxOutput; ключ загружается штатным host env loader, не пишется в workspace/state. Для live SDK comparison нужны собственные API credentials через нормальный credential UI; private values не вводить в tracked файлы или chat. Claude TS SDK регулируется Commercial Terms; component licenses и общие runtime terms различаются. Ни один package не vendored как selected-module в child agent.
