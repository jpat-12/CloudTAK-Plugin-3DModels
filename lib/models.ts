// The models this plugin can place on the map, from two places:
//
//   Hosted models   listed by the organization running CloudTAK in models.json, served next to
//                   the GLB files at /plugin-3d-models/models.json (this repo's
//                   public/plugin-3d-models/). Nothing about any one organization is built in:
//                   each deployment ships its own list. See README "Hosting your own models".
//
//   Local models    files a user opens from their own device. They are read and drawn in the
//                   browser and never sent to the server (see local-models.ts).
//
// Everything under `placement` is only the default. Users can adjust each value from the panel
// and it is remembered in their browser. "Copy placement" in the panel gives the JSON to paste
// into models.json to make a placement the default for everyone.

import { reactive } from 'vue';
import { ensureModelState } from './settings.ts';

/** Where hosted models are listed. Relative model URLs resolve against this file's URL. */
export const MANIFEST_URL = '/plugin-3d-models/models.json';

export interface ModelPlacement {
    /** Anchor latitude (WGS84) of the model's ground centre. */
    lat: number;
    /** Anchor longitude (WGS84) of the model's ground centre. */
    lon: number;
    /** Rotation in degrees, clockwise from north. */
    heading: number;
    /** Multiplier on the model's own units. 1 = the file's units are metres. */
    scale: number;
    /** Metres added to the ground height. Use it to sink or raise the model. */
    altitude: number;
    /**
     * Sit the model on the 3D terrain surface using map.queryTerrainElevation(). When 3D
     * terrain is off the model sits at height 0 (the flat map plane), whatever this says.
     */
    clampToTerrain: boolean;
}

export interface ModelAttribution {
    title: string;
    author: string;
    /** Page the model came from. */
    url?: string;
    license?: string;
    licenseUrl?: string;
    /** CC BY asks you to say what was changed. */
    changes?: string;
}

export type ModelSourceKind = 'hosted' | 'local';

export interface ModelDefinition {
    /**
     * Stable id. Used for layer ids and saved settings, so do not change it once shipped.
     * Local models get a generated id starting with "local-".
     */
    id: string;
    source: ModelSourceKind;
    name: string;
    description?: string;
    /** Hosted models: URL of the .glb, same-origin (CloudTAK's CSP blocks other hosts). */
    url: string;
    placement: ModelPlacement;
    /**
     * Move the model so the centre of its bounding box sits on the anchor and its ground
     * sits on the map. Photogrammetry exports rarely have a meaningful origin.
     */
    recenter: boolean;
    /**
     * Which height of the model sits on the map when recentring:
     *   'auto'   the ground detected in the scan (most flat area in the lower half). Right for
     *            photogrammetry, which includes the surrounding ground and stray low points.
     *   'lowest' the lowest point of the model. Right for clean models with no ground.
     */
    ground: 'auto' | 'lowest';
    /**
     * Draw textures without lighting. Right for photogrammetry, whose textures already
     * contain the real-world lighting; lit shading would darken it twice.
     */
    unlit: boolean;
    /** Zoom used by "Fly to". */
    flyToZoom: number;
    attribution?: ModelAttribution;
}

export type ManifestState = 'loading' | 'ready' | 'none' | 'error';

export const catalog = reactive<{
    hosted: ModelDefinition[];
    local: ModelDefinition[];
    manifest: { state: ManifestState; message: string };
    /** Organizations can turn local files off in models.json ("allowLocalFiles": false). */
    allowLocalFiles: boolean;
}>({
    hosted: [],
    local: [],
    manifest: { state: 'loading', message: '' },
    allowLocalFiles: true
});

export function allModels(): ModelDefinition[] {
    return [...catalog.hosted, ...catalog.local];
}

export function modelById(id: string): ModelDefinition | undefined {
    return catalog.hosted.find((m) => m.id === id) ?? catalog.local.find((m) => m.id === id);
}

export function defaultPlacement(lat: number, lon: number): ModelPlacement {
    return { lat, lon, heading: 0, scale: 1, altitude: 0, clampToTerrain: true };
}

// --- models.json --------------------------------------------------------------------------

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

function num(v: unknown, fallback: number): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown): string | undefined {
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * Turn one models.json entry into a ModelDefinition, filling in defaults. Throws a message
 * naming the problem, which the panel shows to whoever is setting the file up.
 */
export function parseManifestEntry(raw: unknown, baseUrl: string, index: number): ModelDefinition {
    const where = `models.json model #${index + 1}`;
    if (!raw || typeof raw !== 'object') throw new Error(`${where} is not an object`);
    const e = raw as Record<string, unknown>;

    const id = str(e.id);
    if (!id || !ID_RE.test(id) || id.startsWith('local-')) {
        throw new Error(`${where}: "id" must be letters, digits, "-" or "_" (and not start with "local-")`);
    }
    const url = str(e.url);
    if (!url) throw new Error(`${where} (${id}): "url" is missing`);

    const p = (e.placement && typeof e.placement === 'object' ? e.placement : {}) as Record<string, unknown>;
    if (typeof p.lat !== 'number' || typeof p.lon !== 'number') {
        throw new Error(`${where} (${id}): "placement" needs numeric "lat" and "lon"`);
    }

    let attribution: ModelAttribution | undefined;
    if (e.attribution && typeof e.attribution === 'object') {
        const a = e.attribution as Record<string, unknown>;
        attribution = {
            title: str(a.title) ?? str(e.name) ?? id,
            author: str(a.author) ?? '',
            url: str(a.url),
            license: str(a.license),
            licenseUrl: str(a.licenseUrl),
            changes: str(a.changes)
        };
    }

    return {
        id,
        source: 'hosted',
        name: str(e.name) ?? id,
        description: str(e.description),
        url: new URL(url, baseUrl).href,
        placement: {
            lat: p.lat,
            lon: p.lon,
            heading: num(p.heading, 0),
            scale: num(p.scale, 1),
            altitude: num(p.altitude, 0),
            clampToTerrain: typeof p.clampToTerrain === 'boolean' ? p.clampToTerrain : true
        },
        recenter: typeof e.recenter === 'boolean' ? e.recenter : true,
        ground: e.ground === 'lowest' ? 'lowest' : 'auto',
        unlit: typeof e.unlit === 'boolean' ? e.unlit : true,
        flyToZoom: num(e.flyToZoom, 16.5),
        attribution
    };
}

let manifestLoad: Promise<void> | null = null;

/** Fetch models.json once (again with force). Never throws: problems go to catalog.manifest. */
export function loadManifest(force = false): Promise<void> {
    if (manifestLoad && !force) return manifestLoad;
    manifestLoad = (async () => {
        catalog.manifest = { state: 'loading', message: '' };
        const base = new URL(MANIFEST_URL, window.location.href).href;
        let text: string;
        try {
            // no-cache: revalidate, so an updated list shows up without clearing the browser cache.
            const res = await fetch(base, { credentials: 'same-origin', cache: 'no-cache' });
            if (res.status === 404) {
                catalog.hosted = [];
                catalog.manifest = { state: 'none', message: '' };
                return;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            text = await res.text();
        } catch (err) {
            catalog.manifest = { state: 'error', message: `Could not load the model list (${err instanceof Error ? err.message : String(err)}).` };
            return;
        }

        // CloudTAK's web server answers unknown paths with its own index.html: no list deployed.
        if (text.trimStart().startsWith('<')) {
            catalog.hosted = [];
            catalog.manifest = { state: 'none', message: '' };
            return;
        }

        let json: unknown;
        try {
            json = JSON.parse(text);
        } catch (err) {
            catalog.manifest = { state: 'error', message: `models.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}` };
            return;
        }

        const doc = (Array.isArray(json) ? { models: json } : json) as Record<string, unknown>;
        catalog.allowLocalFiles = doc.allowLocalFiles !== false;
        const entries = Array.isArray(doc.models) ? doc.models : [];

        const models: ModelDefinition[] = [];
        const problems: string[] = [];
        const seen = new Set<string>();
        entries.forEach((raw, i) => {
            try {
                const model = parseManifestEntry(raw, base, i);
                if (seen.has(model.id)) throw new Error(`models.json: id "${model.id}" is used twice`);
                seen.add(model.id);
                models.push(model);
            } catch (err) {
                problems.push(err instanceof Error ? err.message : String(err));
            }
        });
        // Settings first, so every card has them by the time it renders.
        for (const model of models) ensureModelState(model);
        catalog.hosted = models;
        catalog.manifest = problems.length
            ? { state: 'error', message: `Skipped ${problems.length} model(s): ${problems.join('; ')}` }
            : { state: models.length ? 'ready' : 'none', message: '' };
    })();
    return manifestLoad;
}
