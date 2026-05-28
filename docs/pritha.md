# Using Pritha

Pritha is the preferred CLI surface.

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

Setup and status commands must state module readiness. For Techscope itself:

```sh
node scripts/setup-status.mjs --json
```

reports `harness`, `memory`, `data`, `skills` and `mcp` readiness. Future
descendants should expose the same style of module-readiness result for their
selected modules.
