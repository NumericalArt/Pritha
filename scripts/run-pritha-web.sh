#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:a:h}"
PRITHA_ROOT="$(node "$SCRIPT_DIR/pritha-root.mjs" --cwd "${SCRIPT_DIR:h}")"
export PRITHA_ROOT TECHSCOPE_ROOT="$PRITHA_ROOT"
cd "$PRITHA_ROOT"

export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-3000}"
export PATH="/Applications/Codex.app/Contents/Resources:${HOME}/Library/Python/3.9/bin:${HOME}/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

echo "$(date '+%Y-%m-%dT%H:%M:%S%z') starting Pritha Web"
exec /usr/bin/python3 scripts/pritha_web.py
