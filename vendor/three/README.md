# Vendored three.js

Unmodified copies from the `three@0.187.0` npm package (MIT, see `LICENSE`):

| File | Source in the package |
|---|---|
| `three.core.js`, `three.module.js` | `build/` |
| `GLTFLoader.js` | `examples/jsm/loaders/` |
| `BufferGeometryUtils.js`, `SkeletonUtils.js` | `examples/jsm/utils/` |
| `meshopt_decoder.module.js` | `examples/jsm/libs/` |

The only edits: an `/* eslint-disable */` header on each file (CloudTAK's build lints every
file under `app/plugins/`), and the addons' `from 'three'` / `../utils/...` imports rewritten
to the sibling files here.

**Why vendored:** CloudTAK compiles plugins inside its own build, with only CloudTAK's
`node_modules`. three.js is not one of its dependencies, and nothing runs `npm install` for a
plugin, so the plugin has to carry it. Vite tree-shakes and minifies it, and the plugin loads
it with a dynamic `import()`, so it is only downloaded when a user first shows a model.

The `.d.ts` files are hand-written and cover only what `lib/model-layer.ts` uses.

To upgrade: download the new `three` tarball, copy the same files, re-apply the header and
import rewrites (see `tools/vendor-three.sh`), and check the `.d.ts` files still match.
