#!/bin/zsh
set -euo pipefail

cd /Users/jkl/Techscope
exec /usr/bin/env node scripts/telegram-bot.mjs poll
