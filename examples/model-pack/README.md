# 3D model pack (template)

A model pack is a small git repo that holds one organization's 3D models for the
[CloudTAK 3D Models plugin](https://github.com/jpat-12/CloudTAK-Plugin-3DModels). It has no
code: CloudTAK's plugin installer copies its `public/` folder into the web app, and the plugin
reads `public/plugin-3d-models/models.json` from there when it starts.

```
public/plugin-3d-models/models.json     the list of models (edit this)
public/plugin-3d-models/<name>.glb      the model files
```

The example `models.json` lists the IU Memorial Stadium scan. Replace it with your own.

## Make your own

1. Copy this folder into a new git repo (it can be private if your CloudTAK build can clone
   it).
2. Shrink each model with the plugin's `tools/optimize-model.mjs`, and put the `.glb` in
   `public/plugin-3d-models/`. Commit GLBs with plain git, not Git LFS: CloudTAK's build clones
   with plain git.
3. Add an entry per model to `models.json`. Only `id`, `url` and `placement.lat`/`lon` are
   required. The plugin's README lists every field.
4. Add the pack to `WEB_PLUGINS` next to the plugin and rebuild CloudTAK:
   ```
   WEB_PLUGINS=https://github.com/jpat-12/CloudTAK-Plugin-3DModels.git,https://github.com/<you>/<your-model-pack>.git
   ```
   or use the plugin's `./install.sh --pack https://github.com/<you>/<your-model-pack>.git /path/to/CloudTAK`.

To line a model up, open it in CloudTAK (menu → 3D Models), use **Adjust placement**, then
**Copy placement** and paste the entry into `models.json`.

Only one pack per CloudTAK can provide `models.json`: two would collide in the build.
