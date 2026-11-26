#!/usr/bin/env bash
# Re-vendor three.js into ../vendor/three. Usage: tools/vendor-three.sh 0.187.0
set -euo pipefail
VERSION="${1:?usage: $0 <three version>}"
DEST="$(cd "$(dirname "${BASH_SOURCE[0]}")/../vendor/three" && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
( cd "$TMP" && npm pack "three@$VERSION" --silent >/dev/null && tar xzf "three-$VERSION.tgz" )
P="$TMP/package"
HEADER="/* eslint-disable */
// Vendored from three@$VERSION (MIT, https://threejs.org). See ./LICENSE and ./README.md.
"
for f in build/three.core.js build/three.module.js examples/jsm/loaders/GLTFLoader.js \
         examples/jsm/utils/BufferGeometryUtils.js examples/jsm/utils/SkeletonUtils.js \
         examples/jsm/libs/meshopt_decoder.module.js; do
    { printf '%s' "$HEADER"; cat "$P/$f"; } > "$DEST/$(basename "$f")"
done
cp "$P/LICENSE" "$DEST/LICENSE"
sed -i.bak \
    -e "s#from 'three';#from './three.module.js';#" \
    -e "s#from '../utils/BufferGeometryUtils.js'#from './BufferGeometryUtils.js'#" \
    -e "s#from '../utils/SkeletonUtils.js'#from './SkeletonUtils.js'#" \
    "$DEST/GLTFLoader.js" "$DEST/BufferGeometryUtils.js" "$DEST/SkeletonUtils.js"
rm -f "$DEST"/*.bak
echo "Vendored three@$VERSION into $DEST. Check the .d.ts files and README version still match."
