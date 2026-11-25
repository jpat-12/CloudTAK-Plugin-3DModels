# CloudTAK Plugin — 3D Models

Puts real 3D models (glTF/GLB) on the CloudTAK map. The first model is a photogrammetry scan
of **IU Memorial Stadium** by [IU3D](https://sketchfab.com/3d-models/iu-memorial-stadium-37bd3ddfc39941bda2c8550087b6387f).

CloudTAK itself can't load 3D model files; it only has 3D terrain and `fill-extrusion`
shapes. This plugin draws the model with [three.js](https://threejs.org) inside a MapLibre
custom layer that shares the map's WebGL context and depth buffer, so the model tilts and
rotates with the map and is hidden correctly behind 3D terrain.

Only CloudTAK web users see the model. ATAK, WinTAK and iTAK clients do not.

## What it does

- Adds **3D Models** to the right-side menu. The panel has a show/hide switch per model,
  **Fly to**, and an **Adjust placement** editor.
- Places each model by an anchor latitude/longitude, a heading (degrees clockwise from north),
  a scale and a height offset. When 3D terrain is on, the model sits on the ground using
  `map.queryTerrainElevation()`.
- Placement edits apply live and are saved per user in the browser. **Copy placement** gives
  you the values to paste into `lib/models.ts`, which makes them the default for everyone.
- Credits the model in the map's attribution control while it is shown (required by CC BY),
  and in the panel.
- three.js loads only when a user first shows a model (a separate ~160 kB gzipped chunk), so
  CloudTAK's startup is unaffected.

## Layout

The repo root is the plugin folder, so CloudTAK's built-in `WEB_PLUGINS` can install it as is.

```
index.ts                    entry: install / enable / disable
components/ModelsPanel.vue  the menu panel
lib/models.ts               model list: file URL, default placement, attribution  ← edit this
lib/settings.ts             per-user show/placement settings (localStorage)
lib/controller.ts           adds/removes map layers; re-adds them after a basemap change
lib/model-layer.ts          the three.js custom layer and GLB loading
lib/cloudtak-ui.ts          the one reach into CloudTAK internals (MenuTemplate)
vendor/three/               vendored three.js r187 + hand-written .d.ts (see its README)
public/plugin-3d-models/    model files; served at /plugin-3d-models/<file>
tools/optimize-model.mjs    shrink a GLB for the web (gltf-transform)
tools/check.sh              lint + type-check inside a CloudTAK checkout
install.sh                  add to a CloudTAK deployment and rebuild
```

## Adding the IU Memorial Stadium model

The GLB is not in the repo yet: Sketchfab requires a signed-in account to download.

1. On the [model page](https://sketchfab.com/3d-models/iu-memorial-stadium-37bd3ddfc39941bda2c8550087b6387f),
   sign in, click **Download 3D Model**, and pick **glTF → GLB**.
2. Shrink it. The download is about 600k triangles, too heavy for a tablet.
   ```sh
   cd tools && npm install
   node optimize-model.mjs ~/Downloads/iu-memorial-stadium.glb ../public/plugin-3d-models/iu-memorial-stadium.glb
   ```
   Defaults: 150k triangles, textures ≤ 4096 px as WebP, quantized geometry. Expect a few
   MB. Use `--faces 100000` or `--texture-size 2048` to go smaller. `--help` lists options.
3. Commit the optimized GLB (plain git, not LFS) and install/rebuild (below).
4. In CloudTAK: menu → **3D Models** → switch it on → **Fly to** → **Adjust placement**.
   Line it up with the imagery using the arrows, heading and scale, then **Copy placement**
   and paste it over `placement` in `lib/models.ts`.

The panel shows the model's size in metres at the current scale. Memorial Stadium's playing
field is about 110 m long including end zones, which is a good check for the scale.

### Adding another model

Add an entry to `MODELS` in `lib/models.ts` with a new `id`, put its GLB in
`public/plugin-3d-models/`, and rebuild. A model can also point at any same-origin URL; the
panel's **Model file URL** field overrides it per user.

## Install

### Current CloudTAK (`app/` layout)

Add this repo to `WEB_PLUGINS`. The image build clones it into `app/plugins/` and copies
`public/` into the web app:

```sh
./install.sh /path/to/CloudTAK          # adds the URL to <CloudTAK>/.env WEB_PLUGINS and rebuilds
./install.sh --remove /path/to/CloudTAK
./install.sh --url https://github.com/jpat-12/CloudTAK-Plugin_3d-Models.git#v0.1.0 /path/to/CloudTAK   # pin a version
```

The build clones from GitHub, so push changes (and the GLB) before rebuilding. Copying the
folder into `app/plugins/` by hand does not work: CloudTAK's `.dockerignore` leaves plugin
folders out of the image build.

### Older CloudTAK (`api/web/` layout)

`./install.sh /path/to/CloudTAK` detects it and copies the plugin into
`api/web/plugins/3d-models/` and the model into `api/web/public/plugin-3d-models/`.

After any rebuild: **Settings → Refresh App** in CloudTAK. A hard refresh is not enough, because
the service worker serves the old bundle.

## Things to know

- **Content security policy.** CloudTAK only allows same-origin downloads (`connect-src 'self'`),
  so serve the model from CloudTAK itself, which `public/` does. CloudTAK also blocks
  WebAssembly, so the default optimizer output avoids Draco, KTX2 and meshopt, which all need a
  WebAssembly decoder. `--compress meshopt` makes a file 2–4× smaller, but only loads if the
  admin adds `'wasm-unsafe-eval'` via `NGINX_CSP_DEFAULT_SRC`. Draco and KTX2 are not supported.
- **Zoom.** The model is drawn from zoom 12 up. Below that it is a few pixels wide, and on
  the globe projection MapLibre's mercator matrix no longer lines up.
- **Offline.** CloudTAK's service worker doesn't cache files outside `/assets/`, so the model
  downloads again (subject to the browser's HTTP cache) and won't load with no network.
- **Ground level.** Scans include the ground around the building, plus stray points or a sunken
  field below it. The plugin finds the scan's ground (the height with the most flat area in the
  lower half of the model) and puts that on the map, not the lowest point. The panel shows how
  far above the lowest point it found the ground. With 3D terrain on, the terrain height is the
  median of nine samples around the footprint, so a bowl or stands in the elevation data don't
  skew it. Set `ground: 'lowest'` in `lib/models.ts` for a clean model with no ground. Untick
  **Follow 3D terrain height** to ignore elevation entirely (height 0, right when 3D terrain is
  off), and use the height offset arrows for fine adjustment.
- **Lighting.** Photogrammetry textures already contain real-world light, so models are drawn
  unlit by default (`unlit: true` in `lib/models.ts`).
- **Draw order.** Models go below the first symbol layer, so labels and CoT markers stay on top.

## Develop

The plugin compiles inside CloudTAK's build, which runs CloudTAK's eslint and `vue-tsc` over it
and fails the whole image if they fail. To run the same checks:

```sh
cd /path/to/CloudTAK/app && npm install
/path/to/this/repo/tools/check.sh /path/to/CloudTAK
```

Tested against CloudTAK 14.1.1 (`dfpc-coe/CloudTAK@71e1886`, 2026-11-24) with MapLibre GL JS
6.19. The older `api/web/` layout is supported by `install.sh` but was not tested.

## Credits and licenses

- **IU Memorial Stadium** model by [IU3D](https://sketchfab.com/3d-models/iu-memorial-stadium-37bd3ddfc39941bda2c8550087b6387f),
  licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changes: decimated,
  quantized and texture-compressed for web use.
- **three.js** r187, MIT, vendored in `vendor/three/`.
