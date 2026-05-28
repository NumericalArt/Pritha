# Architecture

Pritha is a Codex-native agent factory inside Techscope.

Another useful shorthand: Pritha is a harness for an agent that builds the
harness of a new agent. The lineage language is deliberately genetic: a Seed
is transformed into a Descendant through inherited policies, task-specific
mutation and trial checks before handoff.

## Layers

- Intake: raw text, links, media and source notes.
- Curation: briefs, reviews, assessments, standards and decisions.
- Memory: Markdown source of truth plus rebuildable SQLite/embeddings indexes.
- Pritha: seed interview, validation, research, scaffold, test, handoff, operations and lineage.
- Generated descendants: sibling agent projects with their own manifests and scripts.

## Lineage Vocabulary

- Parent agent: Pritha.
- Seed: agent specification.
- Descendant: generated child agent.
- Lineage: contract and lifecycle reports.
- Traits: reusable capabilities.
- Inheritance: base policies and safety rules.
- Mutation: task-specific adaptation.
- Trial: tests before handoff or release.

## Safety Model

Pritha keeps raw input away from direct tool control. Standards and decisions must be based on curated artifacts, not raw transcripts or unchecked links.

## Self-Knowledge And Product Identity

Pritha's product identity is part of the Markdown knowledge base. Public claims,
positioning, slogans and release copy should be backed by curated artifacts such
as `02_briefs/2026-05-28-pritha-product-identity-self-knowledge-brief.md`.
Those claims evolve through the same intake, review, decision and supersession
rules as technical knowledge.

Descendant agents use the same idea locally. If a descendant receives material
that is not directly about its task domain, the material can still be useful as
self-improvement evidence. It should be routed into the agent's own
harness/memory/tooling review path instead of being merged into domain memory
without context.

The public v0.1 implementation is Codex-native. A Claude Code adapter/version
is tracked as a future compatibility path, not as an implemented runtime in
this release candidate.
