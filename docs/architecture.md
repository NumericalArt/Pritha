# Architecture

Pritha is a Codex-native agent factory inside Techscope.

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
