#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:a:h}"
PRITHA_ROOT="$(node "$SCRIPT_DIR/pritha-root.mjs" --cwd "${SCRIPT_DIR:h}")"
export PRITHA_ROOT TECHSCOPE_ROOT="$PRITHA_ROOT"
cd "$PRITHA_ROOT"

exec /usr/bin/env node scripts/telegram-bot.mjs poll
