// Keeps the map's model layers in step with the user's settings.
//
//   attach(map)   on plugin enable(): add a layer for every model the user has switched on,
//                 and re-add them if CloudTAK swaps the map style (basemap change).
//   detach()      on plugin disable(): remove the layers and listeners.
//
// Layers go below the first symbol layer, so labels and CoT markers draw on top of the model.

import { watch, type WatchStopHandle } from 'vue';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { MODELS, modelById, type ModelDefinition } from './models.ts';
import { settings, status, type ModelStatus } from './settings.ts';

type LayerModule = typeof import('./model-layer.ts');
type ModelLayer = InstanceType<LayerModule['ModelLayer']>;

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

function attributionHtml(model: ModelDefinition): string {
    const a = model.attribution;
    return `<a href="${a.url}" target="_blank" rel="noopener">${a.title}</a> by ${a.author}, `
        + `<a href="${a.licenseUrl}" target="_blank" rel="noopener">${a.license}</a>`;
}

// Custom layers have no source, so MapLibre's attribution control would never credit the
// model. An empty source + an invisible layer that uses it puts the credit in the control
// while the model is shown, as CC BY requires.
function addAttribution(m: MapLibreMap, model: ModelDefinition): void {
    const src = attributionId(model.id);
    if (!m.getSource(src)) {
        m.addSource(src, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
            attribution: attributionHtml(model)
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
            getUrl: () => settings[id].url,
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
    for (const model of MODELS) {
        if (settings[model.id]?.visible) {
            void show(model.id);
        } else if (layers.has(model.id) || map?.getLayer(layerId(model.id))) {
            hide(model.id);
        }
    }
}

function onStyleData(): void {
    // A basemap change replaces the style and drops our layers. Put them back. styledata fires
    // several times during a swap; show() ignores the attempts made before the style can take
    // new layers.
    if (!map) return;
    for (const model of MODELS) {
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

    stopWatch = watch(() => MODELS.map((model) => settings[model.id]?.visible), sync);
    // Placement edits: redraw, and refresh the size readout.
    const stopPlacement = watch(() => MODELS.map((model) => ({ ...settings[model.id]?.placement })), () => {
        for (const layer of layers.values()) layer.reportInfo();
        map?.triggerRepaint();
    }, { deep: true });
    // A new file URL: drop the old layer and load the new file.
    const stopUrl = watch(() => MODELS.map((model) => settings[model.id]?.url), (now, before) => {
        MODELS.forEach((model, i) => {
            if (now[i] === before?.[i]) return;
            if (!settings[model.id]?.visible) return;
            hide(model.id);
            void show(model.id);
        });
    });
    const stopVisible = stopWatch;
    stopWatch = () => { stopVisible(); stopPlacement(); stopUrl(); };

    sync();
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
    for (const model of MODELS) {
        try {
            if (m.getLayer(layerId(model.id))) m.removeLayer(layerId(model.id));
            removeAttribution(m, model.id);
        } catch {
            // Map is tearing down.
        }
        setStatus(model.id, { state: 'idle', message: '', progress: null });
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
    if (!s) return;
    const mod = await loadLayerModule();
    mod.forget(s.url);
    hide(id);
    if (s.visible) await show(id);
}
