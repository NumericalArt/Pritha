#!/bin/zsh
# Compatibility entrypoint; preserve argv and the selected instance.
set -euo pipefail
exec "${0:a:h}/run-pritha-web.sh" "$@"
