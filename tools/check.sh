#!/usr/bin/env bash
# Lint and type-check this plugin the way CloudTAK's image build does, inside a CloudTAK
# checkout whose app/ has had `npm install` run.
#
#   tools/check.sh /path/to/CloudTAK
#
# Copies the plugin to app/plugins/3d-models-check/, runs CloudTAK's own eslint and vue-tsc,
# then removes the copy.
set -euo pipefail
CT="${1:-$HOME/CloudTAK}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$CT/app/plugin.ts" ] || { echo "ERROR: $CT is not a CloudTAK checkout with app/plugin.ts" >&2; exit 1; }
[ -d "$CT/app/node_modules" ] || { echo "ERROR: run 'npm install' in $CT/app first" >&2; exit 1; }
DEST="$CT/app/plugins/3d-models-check"
rm -rf "$DEST"; mkdir -p "$DEST"
trap 'rm -rf "$DEST"' EXIT
( cd "$REPO" && tar cf - --exclude=node_modules --exclude=.git . ) | tar xf - -C "$DEST"
cd "$CT/app"
echo "== eslint";  npx eslint --config eslint.config.js "./plugins/3d-models-check/"
echo "== vue-tsc"; npx vue-tsc
echo "✓ lint and type-check passed"
