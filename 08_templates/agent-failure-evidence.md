---
id: template-agent-failure-evidence
type: template
status: active
created: 2026-10-21
updated: 2026-10-21
template_for: review
topics: [agent-evals, failure-analysis, protected-trials]
tools: [Pritha, Trials]
sources:
  - 07_workflows/agent-failure-to-trial.md
related:
  workflows:
    - 07_workflows/agent-failure-to-trial.md
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
subject:
  kind: template
  id: agent-failure-evidence
privacy: public
retention: durable
review_status: reviewed
confidence: high
---

# Evidence сбоя и регрессионный Trial

При создании review добавить frontmatter по assessment/review template. Private transcript и реальные identifiers в этот шаблон не переносить.

## Нарушенное требование

- Outcome requirement и authoritative owner:
- Expected и actual:
- Время события и наблюдения:
- Code commit, runtime/model/tool pins:
- Evidence level: candidate / source-inspected / reproduced / Pritha-tested / user-accepted.

## Причина и альтернативы

- Наблюдаемые факты:
- Candidate cause:
- Независимое подтверждение на той же revision:
- Контрпример и отвергнутые объяснения:
- Unknown и infrastructure limitations:

## Trial

- Product target:
- Protected verifier inputs, hashes и host-reviewed provenance:
- Synthetic fixture и retention:
- Negative control, positive control и counterexample:
- Effect/idempotency/readback, permissions и isolation:
- Budget, timeout и fail/unknown semantics:
- Relevant tests и результат:

## Применение и откат

- Изменение, причина выбора и альтернатива:
- Проверенная revision и оставшиеся риски:
- Rollback и user acceptance отдельно:
- Knowledge relationship: confirms / refines / contradicts / supersedes / uncertain.
