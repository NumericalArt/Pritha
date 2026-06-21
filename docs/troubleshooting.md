# Troubleshooting

## Bootstrap Fails

Start with a read-only plan:

```sh
node scripts/bootstrap.mjs plan --profile minimal
```

Then run the smallest verification profile:

```sh
node scripts/bootstrap.mjs verify --profile minimal
```

Use `--json` when you need machine-readable output:

```sh
node scripts/bootstrap.mjs verify --profile control-center --json
```

Bootstrap does not install launchd, cron, Tailscale, durable services or
credentials. If a task appears to require one of those, stop and use the
operator-approved plan/status flow for that feature.

## Control Center Dependencies

Install the UI dependencies from the committed lockfile:

```sh
npm --prefix interfaces/control-center ci --ignore-scripts
npm --prefix interfaces/control-center run typecheck
npm --prefix interfaces/control-center run build
```

To start locally in the foreground:

```sh
node scripts/bootstrap.mjs --profile local --start control-center
```

The default local URL is:

```text
http://127.0.0.1:3420/agents
```

## Python Dependencies

Portable packages:

```sh
python3 -m pip install --user -r requirements-core.txt
```

macOS transcription helper:

```sh
python3 -m pip install --user -r requirements-macos.txt
```

## Deprecated Agents Mother CLI

Use:

```sh
node scripts/pritha.mjs <command>
```

The old path still works and prints a deprecation notice.

## SQLite Missing

Check the environment first:

```sh
node scripts/env-doctor.mjs --profile minimal
```

Then rebuild memory:

```sh
node scripts/rebuild-memory.mjs
```

## Telegram Fetch Failed

Check `.env`, network access and token validity. Queue health can be inspected without real polling:

```sh
node scripts/telegram-bot.mjs queue-status
node scripts/queue-health.mjs
```

## Path Mismatch

Use `TECHSCOPE_ROOT=/path/to/repo` if scripts are launched from another directory.

New public docs use the Pritha name, but `TECHSCOPE_ROOT` remains the compatible
runtime environment variable until a separate migration removes it.

## Embeddings Not Available

Semantic search requires embeddings. Run:

```sh
python3 scripts/embed-memory.py
node scripts/query-memory.mjs semantic "agent factory"
```

## Optional Credentials

Fresh clone setup does not require secrets. Add credentials only for the feature
that needs them:

- hosted model API calls and Realtime voice;
- Telegram or other messaging adapters;
- GitHub publishing;
- Tailscale private access;
- service deployment.

Do not put real secret values in Markdown, `.techscope-setup.json`, reports or
Git history. Use `.env.local`, the Control Center credential UI or the child
agent's documented private secret store.

## Tailscale Private Access

Read the current plan/status first:

```sh
node scripts/tailscale-setup.mjs plan --app control-center --port 3420
node scripts/tailscale-setup.mjs status --json
```

Serve and stop commands require explicit approval:

```sh
node scripts/tailscale-setup.mjs serve --app control-center --port 3420 --yes
node scripts/tailscale-setup.mjs off --app control-center --port 3420 --yes
```

Pritha setup never enables Tailscale Funnel. Funnel is public exposure and must
be handled as a separate deployment/security decision.
