---
id: agent-credential-storage
type: brief
status: active
created: 2026-09-21
updated: 2026-09-21
topics: [control-center, agent-operations, credentials]
tools: [Pritha, Node.js]
sources: [scripts/lib/credential-store.mjs, tests/agent-credential-store.test.mjs]
related: {workflows: [07_workflows/control-center-staged-release.md]}
supersedes: []
superseded_by: []
memory_domain: pritha-self
subject: {kind: workflow, id: agent-credentials}
privacy: public
retention: durable
review_status: reviewed
confidence: high
---

# Credentials in a nested application

A child project may keep its application in a subdirectory. Declare each secret's existing dotenv store in `operations/manifest.json`:

```json
{
  "credentials": [{
    "name": "PROVIDER_API_KEY",
    "label": "Provider API key",
    "provider": "generic",
    "required": true,
    "validation": "none",
    "storage_target": "mvp/.env.local",
    "browser_exposure": "server_only"
  }]
}
```

The default remains `.env.local`. A nested target must consist of ordinary relative directory names and end in `.env.local`. Parent traversal, absolute paths, symlink directories, symlink files and nonregular files are rejected. The application directory must already exist. Only manifest-declared stores are read; nested example files are not scanned to expose unrelated database or authentication credentials.

The card reads readiness and a masked suffix from the selected store. Save, Remove and Validate use the same target. Updates preserve other variables, use atomic replacement with mode 0600, retain up to five private backups, and refuse an observed concurrent modification. Backups use a 0700 directory with their own ignore rule. Browser input clears after saving; full values and configuration content are never returned by the credential API.

Saving is configuration only. The application must reload or restart to consume the change. Provider identity, subscription/billing requirements, feature flags and actual model checks remain application-specific. Generic Validate only checks local presence/format and does not contact a provider. Do not describe the configured key indicator as a successful model response.

Verification: production credential projection and CRUD tests, bounded metadata worker tests, and a real isolated HTTP/browser test saving and removing a synthetic nested key on desktop and mobile. Test data never targets an operator's application or provider account.
