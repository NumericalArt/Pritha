// Non-root option aliases. Root identity has its own conflict-aware resolver.
const names = [
  'ENV_DOCTOR_STRICT', 'GOLDEN_EMBEDDINGS', 'HEALTHCHECK_PLATFORM', 'KEEP_PROXY',
  'REALTIME_MODE', 'REALTIME_TOOLS', 'SETUP_STATE',
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALLOWED_USER_IDS', 'TELEGRAM_OFFSET',
  'TELEGRAM_RETRY_INITIAL_MS', 'TELEGRAM_RETRY_MAX_MS', 'TELEGRAM_RETRY_JITTER_RATIO', 'TELEGRAM_ERROR_LOG_INTERVAL_MS',
  'VOICE_MODEL', 'VOICE_BACKEND_MODEL', 'VOICE_TRANSCRIPTION_MODEL', 'VOICE_HOST', 'VOICE_PORT', 'VOICE_PRIVATE_ROOT',
];
export const PRITHA_ENV_LEGACY_ALIASES = Object.freeze(Object.fromEntries([
  ...names.map(name => [`PRITHA_${name}`, `TECHSCOPE_${name}`]),
  ...['AUTO_EMBEDDINGS', 'BEHAVIOR_PROFILE', 'CODEX_BIN', 'CODEX_CLI_BIN', 'CODEX_MODE', 'CODEX_MODEL',
    'CODEX_SANDBOX', 'CODEX_TIMEOUT_MS', 'CODEX_USE_PROXY', 'CODEX_WRITE_ENABLED'].map(name => [`PRITHA_REALTIME_${name}`, `TECHSCOPE_VOICE_${name}`]),
  ['PRITHA_REALTIME_VOICE', 'TECHSCOPE_VOICE_REALTIME_VOICE'],
]));

/** An explicitly supplied primary value, including empty/0, wins over its alias. */
export function prithaEnvValue(name, fallback = '', environment = process.env) {
  const canonical = Object.entries(PRITHA_ENV_LEGACY_ALIASES).find(([, legacy]) => legacy === name)?.[0] || name;
  const legacy = PRITHA_ENV_LEGACY_ALIASES[canonical];
  const value = environment[canonical] !== undefined ? environment[canonical] : legacy ? environment[legacy] : undefined;
  return value === undefined || value === '' ? fallback : value;
}
