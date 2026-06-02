---
id: agent-harness-evaluation
type: standard
status: draft
created: 2026-05-27
updated: 2026-06-02
last_reviewed: 2026-06-02
owner: Techscope/user
topics:
  - agent-engineering
  - harness-evaluation
  - coding-agent-benchmark
  - local-models
  - runtime-placement
tools:
  - Codex
  - OpenCode
  - Pi
  - Hermes
  - OpenClaw
  - vLLM
  - llama.cpp
  - Docker
sources:
  - 02_briefs/2026-05-27-local-harness-benchmark-brief.md
  - 03_reviews/2026-05-27-local-agent-harness-benchmark-assessment.md
  - anonymous incoming video source (purged)
  - https://github.com/Zux1U/microbench_16
  - https://docs.vllm.ai/en/latest/
  - https://github.com/ggml-org/llama.cpp
  - https://opencode.ai/docs/providers/
  - https://github.com/earendil-works/pi
  - 03_reviews/2026-06-02-agent-harness-engineering-source-batch-review.md
related:
  decisions: []
  reviews:
    - 03_reviews/2026-05-27-local-agent-harness-benchmark-assessment.md
    - 03_reviews/2026-06-02-agent-harness-engineering-source-batch-review.md
  briefs:
    - 02_briefs/2026-05-27-local-harness-benchmark-brief.md
  workflows:
    - 07_workflows/agents-mother.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-26
source_updated: 2026-06-02
source_version: Techscope draft standard v2; benchmark repo/runtime docs plus 2026 harness engineering source batch
retrieved: 2026-05-27
verified: 2026-06-02
valid_for: Agents Mother harness and runtime-family selection from 2026-05-27 onward
temporal_status: current
---

# Standard: agent-harness-evaluation

Status: draft
Owner: Techscope/user
Last reviewed: 2026-06-02

## Rule

Do not choose a coding-agent harness or local-model stack from popularity,
anecdotes or a single benchmark winner. Choose it with a small, task-relevant
eval pack that measures the exact work the new agent must do.

Exact rankings of OpenCode, Pi, Hermes, OpenClaw, Codex or any future harness
are temporal snapshots. Preserve the evaluation method, not the leaderboard.

For agent harnesses, evaluate the final state of the environment and artifacts,
not only the final model message. A useful eval captures what the agent did,
which tools it used, which state changed, how it recovered and whether the
repository, UI, memory or external system ended in the intended condition.

## Use when

- choosing a runtime family for a new agent;
- considering OpenCode, Pi, Hermes, OpenClaw or another non-Codex harness;
- deciding whether local models are good enough for coding or tool use;
- comparing vLLM, llama.cpp, LM Studio, Ollama or other local backends;
- promoting an experimental harness pattern into a standard.

## Avoid when

- the agent remains Codex-native and no external harness choice is being made;
- the task is too small to justify a benchmark;
- current harness/model versions cannot be verified;
- the eval cannot represent the actual user workflow.

## Required practices

- Define eval vocabulary before running comparisons: task, trial, agent
  harness, eval harness, grader, transcript or trace, expected outcome, failure
  class and eval suite.
- Define task classes before testing: code repair, repo diagnosis, UI build,
  tool integration, data extraction, memory query, long-running workflow or
  deployment.
- Use fresh workspaces and fresh harness state for each run.
- Keep hidden graders outside the agent-visible workspace.
- Run grading outside the agent container or process.
- Grade final environment state and produced artifacts wherever possible:
  files, tests, database state, UI behavior, generated reports, memory entries,
  external API calls or deployment status.
- Track `passed`, `failed`, `timeout`, `runner_error` and `infra_error`
  separately.
- Track failure classes: missing context, wrong tool choice, tool schema
  confusion, destructive operation, stuck loop, skipped verification, bad
  recovery, stale memory, excessive context load and prompt-injection exposure.
- Track elapsed time, token usage where available, number of repair iterations
  and manual interventions.
- Preserve traces or compact transcripts for failure mining and regression
  fixture creation. Do not preserve raw private input when the privacy standard
  requires processed knowledge only.
- Include at least one applied end-to-end task similar to the future agent's real
  work.
- Store benchmark config, model id, quantization, inference backend, harness
  version, date and hardware/runtime context.
- Keep per-model and per-harness-version baselines. A model upgrade, context
  window change, tool-call API change or prompt rewrite can invalidate old
  harness assumptions.
- For production-facing agents, separate offline evals from online operating
  metrics. Offline evals catch known regressions; online metrics catch drift in
  real usage such as retries, user corrections, keep-rate, aborted tasks,
  latency, tool errors and handoff failures.
- Recheck official docs before using any concrete harness/model ranking.
- Do not treat local model success on narrow tasks as proof that it is safe for
  planning, security review, deployment or high-risk tool use.

## Recommended minimal eval pack

For Agents Mother-created coding agents, use:

- one small hidden-grader bugfix task;
- one repo-diagnosis/root-cause task;
- one multi-file feature task;
- one task involving the intended interface or local service adapter;
- one applied product task with real completion criteria.

For non-coding agents, replace coding tasks with the agent's true workload but
keep isolation, hidden checks, timeout/error taxonomy and run metadata.

## Evaluation dimensions

| Dimension | What to record |
| --- | --- |
| Quality | pass/fail, hidden grader result, user-visible correctness |
| Time | elapsed time, timeout, stuck loops |
| Cost | token usage, local compute time, paid API calls |
| Recovery | number of repair iterations, ability to fix own mistakes |
| Integration | local endpoint, filesystem, browser, UI, API or deployment success |
| Operability | logs, healthcheck, restartability, repeatability |
| Safety | tool permissions, isolation, untrusted-input handling |
| Harness fit | prompt/tool/schema/context compatibility for the selected model |
| Learning value | whether failures are converted into docs, tests, skills or tool changes |

## Harness improvement loop

Use eval results as input to harness changes, not only model choice:

1. Reproduce the failure in a clean trial.
2. Classify whether the cause is model weakness, missing context, bad tool
   boundary, poor schema, missing feedback sensor, unsafe permission, weak
   handoff or ambiguous user workflow.
3. Prefer deterministic fixes when available: tests, scripts, schemas, lint
   rules, smoke checks, typed tool outputs or narrower tool permissions.
4. Add or update feedforward guidance only when the issue is genuinely about
   task framing, domain procedure or architectural rule.
5. Re-run the same eval plus at least one neighboring task to check for local
   overfitting.
6. Record the change in the scaffold report, post-creation review or standard
   only after it improves a representative workflow.

## Temporal validity

- Source published: 2026-05-26.
- Source updated: 2026-06-02.
- Source version: Techscope draft standard v2; benchmark repo/runtime docs plus
  2026 harness engineering source batch.
- Retrieved: 2026-05-27.
- Verified: 2026-06-02.
- Valid for: Agents Mother harness and runtime-family selection from 2026-05-27
  onward.
- Freshness status: current.
- Temporal status: current.
- Recheck when: target harnesses, local model families, vLLM, llama.cpp,
  OpenAI-compatible endpoint behavior, tool calling, pricing, context limits or
  hardware assumptions change.

## Related decisions

- `04_standards/agent-creation-harness.md`
- `04_standards/agent-runtime-placement.md`
- `04_standards/agent-tool-integration-selection.md`
