---
id: 2026-11-13-model-led-local-agent-creation
type: decision
status: accepted
created: 2026-11-13
updated: 2026-11-15
topics: [pritha, agents-mother, autonomous-delivery, agent-evals]
tools: [Pritha, Node.js]
sources:
  - scripts/agents-mother/factory-creation-authority.mjs
  - scripts/agents-mother/factory-continuation.mjs
  - scripts/agents-mother/voice-factory-worker.mjs
  - tests/factory-model-led.test.mjs
related:
  decisions:
    - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
    - 05_decisions/2026-09-05-delivery-budget-continuation.md
  workflows:
    - 07_workflows/agents-mother.md
supersedes: []
superseded_by: []
memory_domain: governance
memory_domains: [governance, pritha-self, agent-building-knowledge]
subject:
  kind: decision
  id: model-led-local-agent-creation
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Decision: model-led local agent creation

The operator requested that the factory prioritize a working agent, minimize
user decisions and replace routine deterministic blockers with model judgment.
This changes the standard local creation policy; it does not claim that a new
candidate has been deployed or accepted as a finished product.

## Production flow

The host-bound creation request delegates routine preparation to Pritha. For a
new structured local API proposal the host stores a request receipt bound to the
chat, provider and target. Contract and Outcome remain separate versioned
artifacts, but neither requires an extra user click. Evidence says that Pritha
made the decision. The user has not voted on documents implicitly.

The model reviews available memory and decides what additional research would
resolve a concrete uncertainty. It can record its rationale with `research_decide`, or choose `scaffold` directly; the host records that implementation decision without another form.
Mandatory coverage of every external research topic is removed for this scope.
Missing source evidence remains missing in the report. It does not become a
successful citation because the model chose to proceed with implementation.

Product examples need to express the intended behavior. Enum-only LLM outputs,
a single useful success example and unmapped descriptive requirements no longer
prevent construction. Uncovered requirements remain visible in the compiled
coverage record. The verifier still executes the selected interfaces, observes
model requests through a local responder, checks the requested outputs and
exercises process ownership and Stop. A local responder is never described as a
live provider call. Randomized text markers remain useful where the product
actually returns free text, but are not a mandatory product feature.

Failed behavior checks enter the build/repair loop. Repeated signatures retain
their history and instruct the builder to reconsider its approach, without
requiring the user to supply a debugging hint. The agreed time, token and
iteration limits still bound the work. A loop with no useful progress cannot
run indefinitely.

The checked commit is applied only to the unchanged local project. The user can
launch it from its card, try it and request improvements. Verification, real
provider verification and user acceptance remain separate observations.

## Boundaries and compatibility

The initial profile is `model-led-local-v1`: the existing API process adapter,
no repository adoption, no autostart, and deterministic behavior or an existing
Pritha model connection. The provider, target and measured budgets stay bound.
Model output cannot mint the host authority receipt or give it to another chat.
Unknown process completion, altered protected files, unavailable credentials,
changed spending limits and unrelated user work still require reconciliation
or a genuine authorization decision.

Existing sessions and custom runtime profiles retain their saved approvals and
research policy. New `propose` calls enter the new route only when the host
created the bound workflow; adding a field to model arguments cannot opt in.
The native Codex and provider-backed Claude/NeuralDeep paths share this logic.
There is no weaker-model-only branch on the strong-model path.

The alternative of removing all tests would make completion claims less useful.
The selected approach removes preparation gates and routine questions while
retaining observable behavior as repair feedback. Remaining limitations include
unsupported adapters, custom integration permissions and revision after child
construction has begun. They must be reported honestly rather than hidden
behind a successful controller turn.

## Preparation corrections

Before scaffold, Pritha may correct its own proposal in the same host-bound
conversation by resubmitting the complete brief and examples. This includes a
Contract or Outcome it already finalized under the creation request. The host
creates successor artifacts with the same agent identity, records the prior
state and approvals, and keeps the old documents and verifier files unchanged.
It then performs the ordinary document and product preparation steps on the new
version. No user document vote is invented and no second creation task is needed.

This applies only before a child folder, scaffold or delivery run exists, with
unchanged build limits and the original creation authority. Actual user-reviewed
decisions and custom workflows cannot be silently superseded. Unknown technical
steps remain subject to reconciliation. The accumulated workflow usage,
including uncertain reservations, is retained. A corrected proposal grants no
new service, secret, repository adoption or publication permission.

Host-owned target paths do not participate as model choices in proposal
identity. Existing receipts compare their saved bound brief and actual limits;
they are not rewritten. Explicit requested ports and response limits belong in
the model's structured brief. Omitted repository research defaults to local
implementation for this profile. Status exposes the effective settings and
whether proposal revision is available, so assumptions can be corrected without
adding a second review step to complete proposals.

Small draft patches still require the exact source hash and unambiguous literal
edits. The host computes the result hash; a caller may optionally supply one as
an additional check. Protected or accepted files cannot be patched directly.

## First-use corrections (2026-11-14)

A UI-only run on release `9379a50` produced agents that passed their protected
Trials and still could not be used from their own card. The causes were
established from the generated projects and the host code, not inferred:

- **Result link.** The factory names an agent by the authored `agent_id` of its
  Contract; the Agents route accepted only the instance-scoped catalog ID, so
  the link returned 404. The route now also resolves an authored ID when
  exactly one agent without an identity conflict owns it.
- **Card form.** The documented managed-process protocol and the managed Stop
  Trial require `/health` to return the launch `instance_id`. The card form
  additionally required a `pid`, which a builder following the protocol did
  not return. The form now requires the `instance_id`, rejects a reported
  `pid` that differs from the service record, and checks the recorded process
  with the operating system.
- **Child model identity.** A provider reports a dated ID for a documented
  alias (`claude-sonnet-4-5` → `claude-sonnet-4-5-20250929`), which the strict
  identity check refused on every live request. The child model client and its
  configuration are copied into each child and hash-bound into its verifier,
  so they stay unchanged; the Pritha side of the connection asks the provider
  for the exact ID (`scripts/lib/child-model-aliases.mjs`). Any other reported
  model is still refused. A new proposal cannot pin a model whose announced
  retirement is within 90 days.
- **Ports.** A proposal is rejected when its local API port (3000 when none is
  named) is declared by another agent of the instance or used by the Control
  Center; status offers an unused port before the first proposal.
- **Builder feedback.** Every product-example rule names the example and what
  to correct instead of one generic sentence; the proposal schema lists the
  permitted `model_error` values; a creation request that is still open to
  revision is pointed back to `factory_propose` rather than the low-level
  product Trial tool.

These corrections do not change approvals, budgets, verifier templates or
existing agents' accepted documents.

## Interruption and status corrections (2026-11-14)

The same run stopped a NeuralDeep build with Stop. The chat then showed
"Implementing" indefinitely and refused every later factory action. The saved
state showed why: the build worker was ended before it wrote a receipt, so the
session kept its running marker, receipt recovery had nothing to restore, and
the delivery ledger was never asked to reconcile the attempt.

- **Interrupted build step.** When the worker of a build step (`deliver`,
  `delivery_resume`, `delivery_extend`, `verify`) has provably exited, its
  earlier turn no longer holds a lease and no receipt exists, the next admitted
  turn releases the marker and records the step as interrupted. Nothing is
  inferred about its effect or usage: the delivery ledger remains the record
  and the SAME run is resumed from it. A run identity that was saved before any
  ledger existed is dropped so the build can start normally. Document, research
  and scaffold steps are not released this way and stay unconfirmed for review.
  A read never does this; only an execution owner does.
- **Presentation.** A saved running marker in a chat with no active turn is
  shown as a paused build with the instruction to send a message, not as work
  in progress. Status tells the builder to call `factory_continue` instead of
  naming a later step it cannot take.
- **Usage that was never measured.** A request cut off before the provider
  reported usage can never be measured afterwards, so "reconcile usage" could
  not end the block and the build could only be verified as it stood or
  abandoned. Recovery now states what the host reserved for the attempt: every
  measured request plus the full reservation of each unmeasured one. The
  blocker offers `count-reserved`, which records that amount under the source
  `host-reservation-upper-bound` and continues the run. In a reviewed or
  custom build it is applied only by an explicit user decision; the builder
  cannot select it for itself. In a build that Pritha leads herself (the
  Outcome carries her decision, so the compiled plan is model-led) it is
  applied without a separate answer: the user decided this on 2026-11-15
  because the recorded amount can only overstate the real charge. The receipt
  and the ledger event name who decided, and the build status says that the
  total includes a reservation. An attempt that has not provably ended, or
  whose reservation is not fully known, is never counted this way and blocks
  as before. This amends
  `05_decisions/2026-09-05-delivery-budget-continuation.md` for model-led
  builds only; elsewhere unknown usage still does not permit another model
  step.
- **Returned model identity.** A refused NeuralDeep identity now keeps the
  public model ID the provider answered with and shows it in the error, so a
  new exact equivalence can be reviewed. No equivalence was added; the default
  preset `qwen3.8-27b` remains unusable until its returned ID is observed.
- **Stopped service.** A managed service that this Control Center can start and
  that is not running is reported as stopped, not blocked or failed. A runtime
  it cannot start, and a scaffold, remain blocked with a readable reason.
- **Built agent.** Every factory step refused a change to a built agent while
  the result text invited one. Status now says whether and how the agent can
  be revised; the mechanism is described in the next section.

## Revision of a built agent (2026-11-15)

The policy lets the user try the checked result and request improvements
before final acceptance. The factory had no step for it: after scaffold a
proposal could not be corrected and a second build could not be started.

`factory_improve` revises an agent that is built and applied to its project.
The accepted Contract stays as it is, so the identity, interfaces, port, model
connection and limits do not change. The request is expressed as the complete
revised product examples plus a short note. The host then does the following.

1. It records the earlier state and creates a successor Outcome for the same
   Contract. The draft names the approved Outcome it is meant to replace, and
   its verifier files are prepared in their own directory, so the applied
   version's protected files are never overwritten.
2. The Outcome is decided as at creation: by Pritha under the creation request
   for a model-led agent, by the user in a reviewed workflow. The Contract's
   build limits apply to the new run, and the shared workflow limits continue.
3. A new delivery run builds in its own worktree from the applied commit. The
   revised verifier is installed there by a host commit before the protected
   baseline is captured; the builder is told what it is revising. The project
   is not touched.
4. When the Trials pass, the project is fast-forwarded to the verified commit
   and the replaced Outcome is marked superseded. If the agent is running, the
   revision waits: the user stops the agent and `finish` applies it without a
   rebuild.

Until step 4 the applied version stays the agent. Two Outcomes of the Contract
are approved during that time, so "the Outcome" is no longer chosen by file
name: a successor precedes the document it replaces, result readiness reports
the newest approved Outcome that has a verified result in the project and
names the pending run, the card's form uses the Outcome whose verifier is the
file in the project, and the approval of the applied Outcome stays verifiable
because the session binds both. A revision that ends without a verified result
changes nothing; its Outcome is withdrawn when another revision starts.

A revision is available only for an agent created through the structured
proposal, with a verified build applied to its project and not yet accepted by
the user. Changing the name, interfaces, port, model, limits or the list of
functions is not a revision and still needs a new agent. The alternative of a
successor Contract for every change was rejected for this step: the card, the
model connection and the verification of the running version are all bound to
the current Contract and would have lost their footing for the whole build.

Still open: a revision that changes the Contract; revising an accepted agent;
live verification against the selected paid model; and the approval lifetime
of read-only commands. The native Codex chat keeps its earlier presentation of
a running marker.

## Builder effort and stalled builds (2026-11-15)

An external UI test built three agents at once, one per transport. Codex and
Claude Code produced working agents on their first iteration. The NeuralDeep
chat ran on `gpt-oss-120b`, and two problems appeared:

- **Effort.** The chat kept `xhigh` from the NeuralDeep preset, which was saved
  for another model. The build inherited that value, which `gpt-oss-120b` does
  not document, and stopped for a separate `configure_build` approval. Now an
  inherited level that a NeuralDeep builder does not document becomes the
  strongest documented level that does not exceed it, or the lowest one if none
  does. An explicit `configure_build` decision still overrides this. The new
  chat selector applies the same rule once the model's levels are known, so the
  draft no longer shows a level marked "unsupported".
- **Stalled build.** None of the six builder turns finished. Four ended when the
  turn's token reservation ran out and two when the model called a tool that
  does not exist. The same two checks failed after every verification. Three
  approved extensions of 200,000 tokens each bought one more unfinished turn
  apiece. Now, when the latest two or more builder turns were interrupted and
  the latest failure has repeated at least three times, two things happen:
  - factory status gives the model this evidence at the budget decision,
    together with the instruction to tell the user before suggesting more
    budget;
  - the budget card shows the same facts: how many turns, which models, how
    many tokens and how many repeated failures.

  On NeuralDeep, Pritha offers `configure_build_model` for the same run. That
  is still the user's decision.

This is evidence, not a gate. Builds that later succeeded have had the same
streak (an interrupted turn can still leave working code; verify-only exists
for that). The user keeps every option, including more budget.

Still open: when the builder calls an unavailable tool, its turn still ends,
and work continues only on the next iteration.

## Managed Stop guidance and budget refusals (2026-11-15)

The same NeuralDeep build continued with `kimi-k3.1-pro` as its builder. In one
turn, kimi fixed the product check that `gpt-oss-120b` had failed six times.
The managed Stop check still failed: both models made Stop require
`PRITHA_MANAGED_STOP_TOKEN` in its own environment. The host verifier never
supplies it there. Stop has to read the token from its record and present it
to the server. The old AGENTS.md text said the token "can authenticate" a stop
request and asked to "validate" it, which both models read the same wrong way.

- **One description, two readers.** `host-trial-guidance.mjs` holds what the
  managed Stop verifier does and expects, case by case. New API children get it
  in AGENTS.md. When a Trial whose verifier comes from that host template
  fails, the delivery loop adds the same text to the builder's failure list.
  This also reaches runs scaffolded before the change. A test pins the
  description to the verifier template: if the template ever passes the token
  to Stop, the test fails and the text must change with it. On a copy of the
  stalled build, removing the environment-token check alone passed all nine
  Stop cases.
- **Budget refusals name what is missing.** The run's time window had ended,
  so every extension needed `add_elapsed_ms`. The chat model sent only
  `add_tokens` three times and got back a bare `factory_budget_insufficient`.
  Twice it then told the user the budget had grown. Now status at a budget
  decision lists the fields an extension must carry and when the time window
  ends. A refusal returns the same list with a hint to resend every required
  field and not to report the extension as done before the tool confirms it.
  Status and the refusal use one function, so they cannot disagree.

The Berth Call chat itself ran on `gpt-oss-120b` because the external tester
chose that model. The saved NeuralDeep preset is `kimi-k3.1-pro`. With
`gpt-oss-120b` as the chat model, tool calls were unreliable: fields were
dropped, and arguments of other actions were sent. A strong chat model matters
for the factory as much as a strong builder does.

## Verification

The isolated Task Chat regression exercises all three builders with synthetic
provider I/O, zero document questions and a real generated child process. It
also exercises three consecutive Stop defects followed by a successful fourth
build, optional research failure, enum-only output, retained coverage gaps,
request-binding tampering and continuation without duplicate builds. The older
two-review path remains under its existing regression tests. These checks do
not measure paid provider quality or latency.
