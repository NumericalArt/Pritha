# Troubleshooting

## Deprecated Agents Mother CLI

Use:

```sh
node scripts/pritha.mjs <command>
```

The old path still works and prints a deprecation notice.

## SQLite Missing

Run:

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

## Embeddings Not Available

Semantic search requires embeddings. Run:

```sh
python3 scripts/embed-memory.py
node scripts/query-memory.mjs semantic "agent factory"
```
