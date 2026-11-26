// Keeps the map's model layers in step with the user's settings.
//
//   attach(map)   on plugin enable(): load the model list (models.json and files kept on this
//                 device), add a layer for every model the user has switched on, and re-add
//                 them if CloudTAK swaps the map style (basemap change).
//   detach()      on plugin disable(): remove the layers and listeners.
//
// Layers go below the first symbol layer, so labels and CoT markers draw on top of the model.

import { watch, type WatchStopHandle } from 'vue';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { allModels, loadManifest, modelById, type ModelDefinition } from './models.ts';
import { settings, status, ensureModelState, type ModelStatus } from './settings.ts';
import { readLocalFile, restoreLocalModels, removeLocalModel, setLocalUnlit } from './local-models.ts';

type LayerModule = typeof import('./model-layer.ts');
type ModelLayer = InstanceType<LayerModule['ModelLayer']>;
type ModelSource = import('./model-layer.ts').ModelSource;

const layerId = (id: string) => `plugin-3d-models-${id}`;
const attributionId = (id: string) => `plugin-3d-models-${id}-attribution`;

let map: MapLibreMap | null = null;
let stopWatch: WatchStopHandle | null = null;
let layerModule: Promise<LayerModule> | null = null;
const layers = new Map<string, ModelLayer>();

function loadLayerModule(): Promise<LayerModule> {
    if (!layerModule) {
        layerModule = import('./model-layer.ts');
        layerModule.catch(() => { layerModule = null; });
    }
    return layerModule;
}

function setStatus(id: string, patch: Partial<ModelStatus>): void {
    const s = status[id];
    if (s) Object.assign(s, patch);
}

function beforeId(m: MapLibreMap): string | undefined {
    const style = m.getStyle();
    return style?.layers?.find((l) => l.type === 'symbol' && !l.id.startsWith('plugin-3d-models-'))?.id;
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c] as string));
}

function link(text: string, href: string | undefined): string {
    const t = escapeHtml(text);
    if (!href || !/^https?:\/\//i.test(href)) return t;
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${t}</a>`;
}

/** The credit line for MapLibre's attribution control. Values come from models.json. */
function attributionHtml(model: ModelDefinition): string | null {
    const a = model.attribution;
    if (!a) return null;
    let html = link(a.title, a.url);
    if (a.author) html += ` by ${escapeHtml(a.author)}`;
    if (a.license) html += `, ${link(a.license, a.licenseUrl)}`;
    return html;
}

function sourceFor(model: ModelDefinition): ModelSource {
    if (model.source === 'local') {
        return { kind: 'local', id: model.id, label: model.name, read: () => readLocalFile(model.id) };
    }
    return { kind: 'url', url: settings[model.id]?.url || model.url };
}

// Custom layers have no source, so MapLibre's attribution control would never credit the
// model. An empty source + an invisible layer that uses it puts the credit in the control
// while the model is shown, as CC BY requires.
function addAttribution(m: MapLibreMap, model: ModelDefinition): void {
    const html = attributionHtml(model);
    if (!html) return;
    const src = attributionId(model.id);
    if (!m.getSource(src)) {
        m.addSource(src, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
            attribution: html
        });
    }
    if (!m.getLayer(src)) {
        m.addLayer({ id: src, type: 'circle', source: src, paint: { 'circle-opacity': 0 } });
    }
}

function removeAttribution(m: MapLibreMap, id: string): void {
    const src = attributionId(id);
    if (m.getLayer(src)) m.removeLayer(src);
    if (m.getSource(src)) m.removeSource(src);
}

async function show(id: string): Promise<void> {
    const model = modelById(id);
    if (!model || !map) return;
    const m = map;

    if (!m.getLayer(layerId(id))) {
        let mod: LayerModule;
        try {
            mod = await loadLayerModule();
        } catch (err) {
            setStatus(id, { state: 'error', message: `Could not load the 3D renderer: ${err instanceof Error ? err.message : String(err)}` });
            return;
        }
        // Things may have changed while three.js was downloading.
        if (map !== m || !settings[id]?.visible || m.getLayer(layerId(id))) return;

        const layer = new mod.ModelLayer({
            model,
            layerId: layerId(id),
            getSource: () => sourceFor(model),
            getPlacement: () => settings[id].placement,
            setStatus: (patch) => setStatus(id, patch)
        });
        try {
            m.addLayer(layer, beforeId(m));
        } catch (err) {
            // The style is mid-swap. onStyleData() tries again once it has settled.
            console.warn('[plugin-3d-models] could not add layer yet', err);
            return;
        }
        layers.set(id, layer);
    }

    try {
        addAttribution(m, model);
    } catch (err) {
        console.warn('[plugin-3d-models] could not add attribution', err);
    }
    m.triggerRepaint();
}

function hide(id: string): void {
    layers.delete(id);
    setStatus(id, { state: 'idle', message: '', progress: null });
    if (!map) return;
    try {
        if (map.getLayer(layerId(id))) map.removeLayer(layerId(id));
        removeAttribution(map, id);
    } catch {
        // Map is tearing down.
    }
}

function sync(): void {
    const present = new Set<string>();
    for (const model of allModels()) {
        present.add(model.id);
        ensureModelState(model);
        if (settings[model.id]?.visible) {
            void show(model.id);
        } else if (layers.has(model.id) || map?.getLayer(layerId(model.id))) {
            hide(model.id);
        }
    }
    // Models that left the list: a removed local file, or a model dropped from models.json.
    for (const id of [...layers.keys()]) {
        if (!present.has(id)) hide(id);
    }
}

function onStyleData(): void {
    // A basemap change replaces the style and drops our layers. Put them back. styledata fires
    // several times during a swap; show() ignores the attempts made before the style can take
    // new layers.
    if (!map) return;
    for (const model of allModels()) {
        if (settings[model.id]?.visible && !map.getLayer(layerId(model.id))) {
            layers.delete(model.id);
            void show(model.id);
        }
    }
}

export function attach(m: MapLibreMap): void {
    if (map === m) return;
    if (map) detach();
    map = m;
    map.on('styledata', onStyleData);
    map.on('style.load', onStyleData);

    // Which models exist, and which are switched on.
    stopWatch = watch(() => allModels().map((model) => `${model.id}:${settings[model.id]?.visible ? 1 : 0}`).join(','), sync);
    // Placement edits: redraw, and refresh the size readout.
    const stopPlacement = watch(() => allModels().map((model) => ({ ...settings[model.id]?.placement })), () => {
        for (const layer of layers.values()) layer.reportInfo();
        map?.triggerRepaint();
    }, { deep: true });
    // A new file URL: drop the old layer and load the new file.
    const stopUrl = watch(() => Object.fromEntries(allModels().map((model) => [model.id, settings[model.id]?.url])), (now, before) => {
        for (const id of Object.keys(now)) {
            if (!before || !(id in before) || now[id] === before[id]) continue;
            if (!settings[id]?.visible) continue;
            hide(id);
            void show(id);
        }
    });
    const stopVisible = stopWatch;
    stopWatch = () => { stopVisible(); stopPlacement(); stopUrl(); };

    sync();
    // The list fills in as models.json and the kept local files load; the watch above shows
    // whichever of them the user had switched on.
    void loadManifest();
    void restoreLocalModels();
}

export function detach(): void {
    if (stopWatch) stopWatch();
    stopWatch = null;
    if (!map) return;
    const m = map;
    try {
        m.off('styledata', onStyleData);
        m.off('style.load', onStyleData);
    } catch { /* map gone */ }
    const ids = new Set([...allModels().map((model) => model.id), ...layers.keys()]);
    for (const id of ids) {
        try {
            if (m.getLayer(layerId(id))) m.removeLayer(layerId(id));
            removeAttribution(m, id);
        } catch {
            // Map is tearing down.
        }
        setStatus(id, { state: 'idle', message: '', progress: null });
    }
    layers.clear();
    map = null;
}

export function currentMap(): MapLibreMap | null {
    return map;
}

export function flyTo(id: string): void {
    const model = modelById(id);
    const s = settings[id];
    if (!map || !model || !s) return;
    map.flyTo({
        center: [s.placement.lon, s.placement.lat],
        zoom: model.flyToZoom,
        pitch: 60,
        bearing: map.getBearing()
    });
}

/** Retry after an error (e.g. the file was missing and has since been added). */
export async function reload(id: string): Promise<void> {
    const s = settings[id];
    const model = modelById(id);
    if (!s || !model) return;
    const mod = await loadLayerModule();
    mod.forget(mod.sourceKey(sourceFor(model)));
    hide(id);
    if (s.visible) await show(id);
}

/** Take a local model off the map and out of this browser. */
export async function removeLocal(id: string): Promise<void> {
    const model = modelById(id);
    if (model && layerModule) {
        try {
            const mod = await layerModule;
            mod.forget(mod.sourceKey(sourceFor(model)));
        } catch {
            // three.js never loaded, so nothing is cached.
        }
    }
    hide(id);
    await removeLocalModel(id);
}

/** Switch a local model between unlit (photogrammetry) and lit drawing, and redraw it. */
export async function setUnlit(id: string, unlit: boolean): Promise<void> {
    await setLocalUnlit(id, unlit);
    await reload(id);
}
