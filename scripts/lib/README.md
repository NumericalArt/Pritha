# Pritha scripts library

Shared helpers for local CLI scripts. Keep these modules small and dependency-free.

- `root-resolution.mjs` resolves explicit root → `PRITHA_ROOT` → compatible
  `TECHSCOPE_ROOT` → Git root → cwd, with conflict and invalid-root errors.
  `resolveTechscopeRoot` is an alias of `resolvePrithaRoot`.
- `paths.mjs` shares that root identity with state and sibling agent paths.
  `prithaRootEnvironment(root)` pins both names at subprocess boundaries.
- `frontmatter.mjs` parses the project frontmatter subset used before Phase 3.
- `env.mjs` loads `.env` and `.env.local` without overriding existing env vars.
- `pritha-env.mjs` selects current option names with explicit legacy aliases.
  An explicit primary value (including empty or `0`) wins. It never writes env
  files or copies credentials into a new process.
- `pritha-name-guard.mjs` checks runtime references against the reviewed line
  hashes in `config/pritha-name-compatibility.json`; history is outside its scope.
- `state-files.mjs` selects the existing memory/setup file or a fresh Pritha
  filename without creating directories, renaming files, or choosing between
  conflicting legacy/current copies. Python uses the same tested contract.
- `slug.mjs` provides slug/transliteration helpers with options for legacy Cyrillic slugs.
- `date.mjs` provides ISO `today()` and `now()`.

Do not broaden parser semantics silently. If YAML/frontmatter behavior changes,
add tests first and record it in a phase report.
