# CloudTAK Plugin — 3D Models

Puts real 3D models (glTF/GLB) on the CloudTAK map, for any organization running CloudTAK.
Models come from two places:

- **Hosted by your organization.** The CloudTAK admin publishes a `models.json` and the model
  files. Every user of that CloudTAK sees them in the panel. Nothing about any one organization
  is built into the plugin.
- **From the user's own device.** A user opens a `.glb` from their computer. It is read and
  drawn in their browser only: it is **never uploaded** to CloudTAK, and other users can't see
  it. They can choose to keep it in that browser so it is still there next time.

CloudTAK itself can't load 3D model files; it only has 3D terrain and `fill-extrusion`
shapes. This plugin draws the model with [three.js](https://threejs.org) inside a MapLibre
custom layer that shares the map's WebGL context and depth buffer, so the model tilts and
rotates with the map and is hidden correctly behind 3D terrain.

Only CloudTAK web users see the models. ATAK, WinTAK and iTAK clients do not.

## What it does

- Adds **3D Models** to the right-side menu. The panel lists your organization's models, then
  any models opened from this device. Each has a show/hide switch, **Fly to**, and an **Adjust
  placement** editor.
- Places each model by an anchor latitude/longitude, a heading (degrees clockwise from north),
  a scale and a height offset. When 3D terrain is on, the model sits on the ground using
  `map.queryTerrainElevation()`.
- Placement edits apply live and are saved per user in the browser. **Copy placement** gives
  you a `models.json` entry with those values, which makes them the default for everyone.
- Credits each hosted model in the map's attribution control while it is shown (needed for
  CC BY models), and in the panel.
- three.js loads only when a user first shows a model (a separate ~160 kB gzipped chunk), so
  CloudTAK's startup is unaffected.

## Layout

The repo root is the plugin folder, so CloudTAK's built-in `WEB_PLUGINS` can install it as is.

```
index.ts                    entry: install / enable / disable
components/ModelsPanel.vue  the menu panel: model lists and "Open a model file"
components/ModelCard.vue    one model: switch, status, placement editor, credit
lib/models.ts               model types, and loading models.json
lib/local-models.ts         models opened from the user's device (memory / IndexedDB)
lib/settings.ts             per-user show/placement settings (localStorage)
lib/controller.ts           adds/removes map layers; re-adds them after a basemap change
lib/model-layer.ts          the three.js custom layer and GLB loading
lib/cloudtak-ui.ts          the one reach into CloudTAK internals (MenuTemplate)
vendor/three/               vendored three.js r187 + hand-written .d.ts (see its README)
examples/model-pack/        template for an organization's model pack
tools/optimize-model.mjs    shrink a GLB for the web (gltf-transform)
tools/check.sh              lint + type-check inside a CloudTAK checkout
install.sh                  add to a CloudTAK deployment and rebuild
```

## Hosting your own models

The plugin reads the list of models from `/plugin-3d-models/models.json` on the CloudTAK
server when a user opens the map. The plugin ships no models of its own: each organization
supplies its list and files in a **model pack**, a small git repo with no code:

```
public/plugin-3d-models/models.json
public/plugin-3d-models/<name>.glb
```

CloudTAK's plugin installer copies every `WEB_PLUGINS` repo's `public/` folder into the web
app, so a pack listed next to the plugin is served at `/plugin-3d-models/`. You don't need to
fork the plugin.

1. Copy [`examples/model-pack/`](examples/model-pack/) into a new repo. Its `models.json` lists
   the IU Memorial Stadium scan as an example; replace it with your models.
2. Shrink each model (see [Preparing a model](#preparing-a-model)) and put the `.glb` in
   `public/plugin-3d-models/`. Commit it with plain git, not Git LFS: CloudTAK's build clones
   with plain git.
3. Add the pack to `WEB_PLUGINS` with the plugin and rebuild:
   `./install.sh --pack https://github.com/<you>/<your-model-pack>.git /path/to/CloudTAK`.
4. In CloudTAK: menu → **3D Models** → switch a model on → **Fly to** → **Adjust placement**.
   Line it up with the imagery, then **Copy placement** and paste the entry into `models.json`.

A quick way to place a new model: open the file from your own computer first (it stays in
your browser), line it up, and **Copy placement**. The copied entry already has the file name
as its `url`.

If no `models.json` is deployed, the panel says so and users can still open their own files.

### models.json

```json
{
    "allowLocalFiles": true,
    "models": [
        {
            "id": "hq-building",
            "name": "HQ building",
            "description": "Shown to everyone on this CloudTAK",
            "url": "hq-building.glb",
            "placement": { "lat": 39.1808, "lon": -86.5256, "heading": 0, "scale": 1, "altitude": 0, "clampToTerrain": true },
            "ground": "auto",
            "unlit": true,
            "flyToZoom": 16.5,
            "attribution": { "title": "HQ scan", "author": "Survey team", "url": "https://…", "license": "CC BY 4.0", "licenseUrl": "https://creativecommons.org/licenses/by/4.0/" }
        }
    ]
}
```

| Field | Required | Default | Meaning |
|---|---|---|---|
| `allowLocalFiles` | no | `true` | `false` hides "Open a model file" for everyone on this CloudTAK. |
| `id` | yes | | Stable id: letters, digits, `-`, `_`. Users' saved placements are keyed by it, so don't change it once shipped. |
| `name`, `description` | no | the id | Shown in the panel. |
| `url` | yes | | The `.glb`, relative to `models.json` or an absolute path on the same server. |
| `placement.lat`, `placement.lon` | yes | | Where the model's ground centre goes. |
| `placement.heading` | no | `0` | Degrees clockwise from north. |
| `placement.scale` | no | `1` | Multiplier on the file's units (1 = metres). |
| `placement.altitude` | no | `0` | Metres added to the ground height. |
| `placement.clampToTerrain` | no | `true` | Sit on 3D terrain when it is on. |
| `recenter` | no | `true` | Move the model's centre to the anchor. Turn off if the file's origin is already the anchor. |
| `ground` | no | `"auto"` | `"auto"` finds a scan's ground; `"lowest"` uses the lowest point (clean models). |
| `unlit` | no | `true` | Draw without lighting. Right for photogrammetry; use `false` for CAD or hand-made models. |
| `flyToZoom` | no | `16.5` | Zoom for **Fly to**. |
| `attribution` | no | | `title`, `author`, `url`, `license`, `licenseUrl`, `changes`. Shown in the panel and the map credits. |

Entries with a problem are skipped and the panel names the problem; the rest still load. The
list is fetched with revalidation, so an updated `models.json` shows up on the next page load.

## Models from the user's device

**Open a model file** in the panel takes a `.glb` (binary glTF with its textures embedded). The
file is read with the browser's File API and drawn locally: the plugin makes no network
request for it, and nothing is stored on the server. It starts at the centre of the map view,
and the user places it with the same editor as hosted models.

- **Keep it in this browser** (on by default) stores the file in the browser's IndexedDB, so
  it is listed again after a reload, on that browser profile only. Untick it to keep the file
  for this session only. **Remove** deletes the stored copy.
- **Photogrammetry scan** chooses unlit drawing; it can be changed later in the placement
  editor.
- A `.gltf` with separate `.bin`/texture files is refused, because resolving those would mean
  requesting them from the server. Convert it to `.glb` first (for example with
  `npx @gltf-transform/cli copy model.gltf model.glb`).
- Large files are fine for the browser but slow on tablets; `tools/optimize-model.mjs` shrinks
  them.

An admin who doesn't want this can set `"allowLocalFiles": false` in `models.json`.

## Preparing a model

Photogrammetry exports are usually far too heavy for a tablet (the IU Memorial Stadium scan is
about 600k triangles). Shrink them first:

```sh
cd tools && npm install
node optimize-model.mjs ~/Downloads/model.glb ../examples/model-pack/public/plugin-3d-models/model.glb
```

Defaults: 150k triangles, textures ≤ 4096 px as WebP, quantized geometry. Expect a few MB. Use
`--faces 100000` or `--texture-size 2048` to go smaller. `--help` lists options. The panel shows
the model's size in metres at the current scale, which is a good check for the scale (an
American football field is about 110 m long including end zones).

## Install

### Current CloudTAK (`app/` layout)

Add this repo, and your model pack if you have one, to `WEB_PLUGINS`. The image build clones
each into `app/plugins/` and copies its `public/` into the web app:

```sh
./install.sh --pack https://github.com/<you>/<your-model-pack>.git /path/to/CloudTAK
./install.sh /path/to/CloudTAK          # plugin only: users can still open their own files
./install.sh --remove --pack https://github.com/<you>/<your-model-pack>.git /path/to/CloudTAK
./install.sh --url https://github.com/jpat-12/CloudTAK-Plugin-3DModels.git#v0.2.0 /path/to/CloudTAK   # pin a version
```

The build clones from GitHub, so push changes (and the GLBs) before rebuilding. Copying the
folder into `app/plugins/` by hand does not work: CloudTAK's `.dockerignore` leaves plugin
folders out of the image build.

### Older CloudTAK (`api/web/` layout)

`./install.sh --pack /path/to/your-model-pack /path/to/CloudTAK` detects it and copies the
plugin into `api/web/plugins/3d-models/` and the pack's models into
`api/web/public/plugin-3d-models/`. Here `--pack` is a local folder, not a URL.

After any rebuild: **Settings → Refresh App** in CloudTAK. A hard refresh is not enough, because
the service worker serves the old bundle.

## Things to know

- **Content security policy.** CloudTAK only allows same-origin downloads (`connect-src 'self'`),
  so serve hosted models from CloudTAK itself, which a model pack's `public/` does. Files
  opened from the user's device are not downloaded at all, so this doesn't apply to them. CloudTAK also blocks
  WebAssembly, so the default optimizer output avoids Draco, KTX2 and meshopt, which all need a
  WebAssembly decoder. `--compress meshopt` makes a file 2–4× smaller, but only loads if the
  admin adds `'wasm-unsafe-eval'` via `NGINX_CSP_DEFAULT_SRC`. Draco and KTX2 are not supported.
- **Zoom.** The model is drawn from zoom 12 up. Below that it is a few pixels wide, and on
  the globe projection MapLibre's mercator matrix no longer lines up.
- **Offline.** CloudTAK's service worker doesn't cache files outside `/assets/`, so a hosted
  model downloads again (subject to the browser's HTTP cache) and won't load with no network.
  A local file kept in the browser does load offline.
- **Ground level.** Scans include the ground around the building, plus stray points or a sunken
  field below it. The plugin finds the scan's ground (the height with the most flat area in the
  lower half of the model) and puts that on the map, not the lowest point. The panel shows how
  far above the lowest point it found the ground. With 3D terrain on, the terrain height is the
  median of nine samples around the footprint, so a bowl or stands in the elevation data don't
  skew it. Set `"ground": "lowest"` in `models.json` for a clean model with no ground. Untick
  **Follow 3D terrain height** to ignore elevation entirely (height 0, right when 3D terrain is
  off), and use the height offset arrows for fine adjustment.
- **Lighting.** Photogrammetry textures already contain real-world light, so models are drawn
  unlit by default (`"unlit": true` in `models.json`, or the photogrammetry tick box for a
  local file).
- **Draw order.** Models go below the first symbol layer, so labels and CoT markers stay on top.

## Develop

The plugin compiles inside CloudTAK's build, which runs CloudTAK's eslint and `vue-tsc` over it
and fails the whole image if they fail. To run the same checks:

```sh
cd /path/to/CloudTAK/app && npm install
/path/to/this/repo/tools/check.sh /path/to/CloudTAK
```

Lint and type-check pass against CloudTAK 14.3.0 (`dfpc-coe/CloudTAK@23ce6fc`, 2026-11-26);
rendering was first tested against 14.1.1 with MapLibre GL JS 6.19. The older `api/web/` layout is supported by `install.sh` but was not tested.

## Credits and licenses

- The example model pack lists the **IU Memorial Stadium** model by [IU3D](https://sketchfab.com/3d-models/iu-memorial-stadium-37bd3ddfc39941bda2c8550087b6387f),
  licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changes: decimated,
  quantized and texture-compressed for web use.
- **three.js** r187, MIT, vendored in `vendor/three/`.
