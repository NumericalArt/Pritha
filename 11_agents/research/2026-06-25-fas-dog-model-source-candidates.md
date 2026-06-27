---
id: 2026-06-25-fas-dog-model-source-candidates
type: review
status: draft
created: 2026-06-25
updated: 2026-06-25
topics:
  - agent-engineering
  - agent-improvement
  - child-agent
  - fas
  - threejs
  - gltf
  - model-loading
  - asset-licensing
tools:
  - Codex
  - Pritha Voice Control
  - Sketchfab API
  - Creative Commons
  - Three.js
sources:
  - 11_agents/research/2026-06-25-fas-dog-natural-animation-replacement-development-task.md
  - 11_agents/research/2026-06-25-fas-dog-natural-animation-replacement-pattern-pack.md
  - https://sketchfab.com/3d-models/husky-animated-59858d6442e1482a8205e6b94704aeb0
  - https://api.sketchfab.com/v3/models/59858d6442e1482a8205e6b94704aeb0
  - https://sketchfab.com/3d-models/wolf-with-animations-f3769a474a714ebbbaca0d97f9b0a5a0
  - https://api.sketchfab.com/v3/models/f3769a474a714ebbbaca0d97f9b0a5a0
  - https://sketchfab.com/3d-models/animated-pitbull-dog-2a403e6e80c346f0a1f8d6dcdc58882c
  - https://api.sketchfab.com/v3/models/2a403e6e80c346f0a1f8d6dcdc58882c
  - https://creativecommons.org/licenses/by-nc-sa/4.0/
  - https://creativecommons.org/licenses/by-nc/4.0/
related:
  development_tasks:
    - 11_agents/research/2026-06-25-fas-dog-natural-animation-replacement-development-task.md
  pattern_packs:
    - 11_agents/research/2026-06-25-fas-dog-natural-animation-replacement-pattern-pack.md
supersedes: []
superseded_by: []
memory_domain: child-agents
memory_domains:
  - agent-building-knowledge
  - pritha-self
  - child-agents
subject:
  kind: agent
  id: fas
privacy: internal
retention: durable
review_status: draft
confidence: medium
external_research_status: complete-for-step
license_gate_status: pending
verified: source-research-only
---

# FAS Dog Model Source Candidates

Date retrieved: 2026-06-25

## Research Scope

Find a local-importable dog model or animation resource for FAS that has:

- a clear noncommercial license suitable for research/local demo use;
- attribution requirements that can be documented in FAS metadata;
- enough natural quadruped motion to improve current commands;
- a practical path into the current Three.js/GLTFLoader surface.

No model was downloaded or imported in this step. Source pages, Sketchfab API
model metadata and Creative Commons license deeds were inspected only as
current-source evidence.

## License Baseline

- CC BY-NC-SA 4.0 allows sharing/adaptation under attribution, no commercial
  use and same-license redistribution for adaptations.
- CC BY-NC 4.0 allows sharing/adaptation under attribution and no commercial
  use, without ShareAlike.
- Either can satisfy the operator's noncommercial requirement only if the
  uploader is a credible rights holder or the source provenance is otherwise
  clear enough for FAS.

## Shortlisted Candidates

### 1. Husky Animated

- Candidate role: best exact dog with clear noncommercial license metadata.
- Source URL:
  `https://sketchfab.com/3d-models/husky-animated-59858d6442e1482a8205e6b94704aeb0`
- API URL:
  `https://api.sketchfab.com/v3/models/59858d6442e1482a8205e6b94704aeb0`
- Source/author: Kastle (`https://sketchfab.com/kastle`)
- Asset format: Sketchfab downloadable model; final archive contents and GLB
  availability still need authenticated/browser download verification.
- Downloadable in API: yes.
- Mesh budget: 468 faces, 312 vertices.
- Animation metadata: 1 animation.
- Listed animation names: not provided; description says only that the husky is
  animated.
- License: CC Attribution-NonCommercial-ShareAlike 4.0.
- License URL: `http://creativecommons.org/licenses/by-nc-sa/4.0/`
- Attribution: required.
- Noncommercial restriction: yes.
- ShareAlike restriction: yes, modified versions must use the same license.
- Fit: species and license fit FAS well; animation coverage is too thin for
  natural command mapping without retaining FAS procedural overlays.
- Gate recommendation: acceptable only if step 4 accepts a one-clip exact dog
  with code-level motion overlays for commands.

### 2. Wolf with Animations

- Candidate role: best noncommercial animation coverage among credible
  low-poly canine resources found.
- Source URL:
  `https://sketchfab.com/3d-models/wolf-with-animations-f3769a474a714ebbbaca0d97f9b0a5a0`
- API URL:
  `https://api.sketchfab.com/v3/models/f3769a474a714ebbbaca0d97f9b0a5a0`
- Source/author: 3DHaupt / Dennis Haupt (`https://sketchfab.com/dennish2010`)
- Asset format: Sketchfab downloadable model; source page also references
  Google Drive, TF3dm and ShareCG downloads. Final archive contents and GLB
  availability still need authenticated/browser download verification.
- Downloadable in API: yes.
- Mesh budget: 2760 faces, 1691 vertices.
- Animation metadata: 5 animations.
- Listed animation names: walk cycle, run cycle, sit, creep animation, idle
  animation.
- License: CC Attribution-NonCommercial-ShareAlike 4.0.
- License URL: `http://creativecommons.org/licenses/by-nc-sa/4.0/`
- Attribution: required.
- Noncommercial restriction: yes.
- ShareAlike restriction: yes, modified versions must use the same license.
- Fit: natural quadruped command coverage is much stronger than the husky
  candidate, especially for idle, walk, run/circle and sit/squat equivalents.
- Gate recommendation: do not import as the dog replacement unless step 4
  explicitly accepts a wolf/canine model in place of a literal dog.

### 3. Animated Pitbull dog

- Candidate role: exact dog with high animation count but high source-provenance
  risk.
- Source URL:
  `https://sketchfab.com/3d-models/animated-pitbull-dog-2a403e6e80c346f0a1f8d6dcdc58882c`
- API URL:
  `https://api.sketchfab.com/v3/models/2a403e6e80c346f0a1f8d6dcdc58882c`
- Source/author: Game-animal ripper (`https://sketchfab.com/game-ripper`)
- Asset format: Sketchfab downloadable model; final archive contents and GLB
  availability still need authenticated/browser download verification.
- Downloadable in API: yes.
- Mesh budget: 33316 faces, 16932 vertices.
- Animation metadata: 119 animations.
- Listed animation names: not provided in the inspected metadata.
- License: CC Attribution-NonCommercial 4.0.
- License URL: `http://creativecommons.org/licenses/by-nc/4.0/`
- Attribution: required.
- Noncommercial restriction: yes.
- Source risk: the uploader profile says it shares game animal models, and
  related model titles identify assets as coming from COTW/game sources. No
  original creator permission or clean provenance was visible in inspected
  metadata.
- Gate recommendation: reject for FAS unless a later source gate can verify
  credible rights/provenance. The license label alone is not enough for this
  operator requirement.

## Rejected Or Unsuitable Candidates

- Low-Poly Animated Dog by LenikArt:
  - URL:
    `https://sketchfab.com/3d-models/low-poly-animated-dog-05d51ba4e27043bab498b085d64195a3`
  - Strong animation list: walk, running, idle, sitting, sitdown, standingup,
    scratching, stretching, swimming, shake, jump variants.
  - Rejection reason: API reports not downloadable and no clear license object.
- Dog Monster by Ploobert:
  - URL:
    `https://sketchfab.com/3d-models/dog-monster-47b79fc751c642c6922fdaecf6de4170`
  - Rejection reason: monster/horror style, 1 animation, heavy mesh, not a
    natural FAS dog.
- Labrador dog from COTW game by Game-animal ripper:
  - URL:
    `https://sketchfab.com/3d-models/labrador-dog-from-cotw-game-e2e5d0c611fb40cbb2b4883e38916cac`
  - Rejection reason: strong technical metadata but explicit game-source
    provenance risk with no inspected rights evidence.
- Cotw game German Shorthaired Pointer by Game-animal ripper:
  - URL:
    `https://sketchfab.com/3d-models/cotw-game-german-shorthaired-pointer-0d00ebf652d142d28dd413f3e2be253a`
  - Rejection reason: strong technical metadata but explicit game-source
    provenance risk with no inspected rights evidence.
- Snoopy by Daz:
  - URL:
    `https://sketchfab.com/3d-models/snoopy-df94fc680c404ffeb0a7b864958600a5`
  - Rejection reason: recognizable third-party character/IP risk, high mesh
    budget and only one animation.
- Animated Dog Walking Loop (FREE):
  - URL:
    `https://sketchfab.com/3d-models/animated-dog-walking-loop-free-c840198bd1e4428f9aec397aae94b2bd`
  - Rejection reason: CC BY rather than noncommercial and only one walk loop.
- Low poly Black dog by Nulla:
  - URL:
    `https://sketchfab.com/3d-models/low-poly-black-dog-ccb46d74399f442aad3f70341fd823ac`
  - Rejection reason: useful low-poly dog motion, but CC BY rather than
    noncommercial.

## Step-4 Gate Options

1. Strict dog requirement:
   - Proceed with `Husky Animated` only if one animation plus existing FAS
     procedural overlays is acceptable.
   - Otherwise continue research; no current candidate fully satisfies exact
     dog, clear provenance, noncommercial license and broad natural animations.
2. Natural movement priority:
   - Proceed with `Wolf with Animations` only if the operator accepts a wolf as
     a canine replacement for FAS.
3. Do not use Game-animal-ripper candidates unless rights/provenance are
   independently verified.

## Integration Notes For Later Steps

- Do not hotlink remote assets. Import only a locally stored file after the
  license/source gate passes.
- The unauthenticated Sketchfab download endpoint returned an authentication
  requirement during research, so later integration may need browser/operator
  download or another approved download path without exposing credentials.
- Add the selected dog model to FAS asset metadata and healthcheck expectations.
- Preserve the current FAS command vocabulary. Map unavailable clips to natural
  nearest equivalents or explicit stable overlays.
