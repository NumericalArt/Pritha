---
id: 2026-11-13-model-led-local-agent-creation
type: decision
status: accepted
created: 2026-11-13
updated: 2026-11-14
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

## Verification

The isolated Task Chat regression exercises all three builders with synthetic
provider I/O, zero document questions and a real generated child process. It
also exercises three consecutive Stop defects followed by a successful fourth
build, optional research failure, enum-only output, retained coverage gaps,
request-binding tampering and continuation without duplicate builds. The older
two-review path remains under its existing regression tests. These checks do
not measure paid provider quality or latency.
