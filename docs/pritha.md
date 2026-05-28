# Using Pritha

Pritha is the preferred CLI surface.

Conceptually, Pritha is a harness for an agent that builds the harness of a new
agent. It uses a genetic lineage model: a Seed carries the specification,
Descendants inherit base policies, mutation adapts the scaffold to the task,
and trial checks decide whether the result is ready for handoff.

```sh
node scripts/pritha.mjs help
node scripts/pritha.mjs questions
node scripts/pritha.mjs create --name "agent-name" --mission "mission"
node scripts/pritha.mjs create 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md --output ../agent-name
node scripts/pritha.mjs test ../agent-name
node scripts/pritha.mjs publish ../agent-name
node scripts/pritha.mjs lineage
```

Compatibility:

```sh
node scripts/agents-mother.mjs <command>
```

`agents-mother.mjs` prints a deprecation notice and delegates to the same implementation.

## Commands

- `questions`: print interview structure.
- `create --name --mission`: create a Seed (`agent-contract`).
- `create <contract-path>`: scaffold a descendant.
- `test <project-path>`: inspect an existing or generated agent.
- `publish <project-path>`: run a no-report trial check.
- `lineage`: rebuild the registry.
- `handoff`, `operations`, `deploy`, `evolve`: lifecycle commands for generated agents.

## Contract-Selected Modules

Pritha does not copy every useful Techscope pattern into every descendant. It
builds each agent from the modules selected by the Seed/contract: harness,
memory, data, skills, MCP, tools, evals, interfaces and operations. Optional
modules remain absent unless the contract needs them.

The initial descendant scaffold is intentionally evolvable. For Codex-native
agents, the normal continuation path is to open the descendant project in Codex
App and keep refining the agent through its own `AGENTS.md`, manifests, tests
and memory. If that agent receives a resource from the internet that does not
belong to its direct domain task, it should treat the resource as
meta-improvement material: extract lessons for its own harness, memory, tools,
skills, MCP, evals, UX or operations, then save a brief/review/decision or send
the distilled lesson back to Pritha.

Setup and status commands must state module readiness. For Techscope itself:

```sh
node scripts/setup-status.mjs --json
```

reports `harness`, `memory`, `data`, `skills` and `mcp` readiness. Future
descendants should expose the same style of module-readiness result for their
selected modules.

If a Seed selects realtime voice control, the default realtime tool surface is
internet access, agent memory access and Codex CLI sidecar access. Setup must
record readiness for those tools so voice is not treated as complete when its
supporting tool surface is missing.

## Compatibility Roadmap

Pritha v0.1 is Codex-native. A Claude Code version is coming through a future
adapter path that translates selected Pritha/Codex-native project surfaces into
Claude Code-compatible guidance without replacing `AGENTS.md` as the Pritha
source of truth.
