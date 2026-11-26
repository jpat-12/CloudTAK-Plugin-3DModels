// Per-user, per-model settings: whether a model is shown, its placement and (hosted models) its
// file URL. Kept in a reactive object and saved to localStorage, so each user's tweaks survive a
// reload. Entries are created as models appear in the catalog (models.json loads at runtime, and
// local files are added by the user), so call ensureModelState() before reading them.

import { reactive, watch } from 'vue';
import type { ModelDefinition, ModelPlacement } from './models.ts';

const STORAGE_KEY = 'plugin-3d-models:settings:v1';

export interface ModelSettings {
    visible: boolean;
    url: string;
    placement: ModelPlacement;
}

export type ModelStatusState = 'idle' | 'loading' | 'ready' | 'error';

export interface ModelStatus {
    state: ModelStatusState;
    message: string;
    /** 0–1 while downloading, when the server sends a Content-Length. */
    progress: number | null;
    /** Filled once loaded. */
    info: {
        triangles: number;
        /** Bounding-box size in metres at the current scale: east-west, north-south, height. */
        sizeMeters: [number, number, number];
        /** How far above the model's lowest point the detected ground is, in metres. */
        groundAboveLowest: number;
        bytes: number;
    } | null;
}

function readSaved(): Record<string, Partial<ModelSettings>> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as unknown;
            if (parsed && typeof parsed === 'object') return parsed as Record<string, Partial<ModelSettings>>;
        }
    } catch {
        // Unreadable: start fresh.
    }
    return {};
}

function sanitizePlacement(p: unknown): Partial<ModelPlacement> {
    if (!p || typeof p !== 'object') return {};
    const src = p as Record<string, unknown>;
    const out: Partial<ModelPlacement> = {};
    for (const key of ['lat', 'lon', 'heading', 'scale', 'altitude'] as const) {
        const v = src[key];
        if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
    }
    if (typeof src.clampToTerrain === 'boolean') out.clampToTerrain = src.clampToTerrain;
    return out;
}

// Saved settings for models that are not in the catalog (yet) are kept as they are, so a model
// list that fails to load once does not wipe everyone's placements.
const saved = readSaved();

export const settings = reactive<Record<string, ModelSettings>>({});
export const status = reactive<Record<string, ModelStatus>>({});

/** Create the settings and status entries for a model, from saved values or its defaults. */
export function ensureModelState(model: ModelDefinition): void {
    if (!settings[model.id]) {
        const s = saved[model.id] || {};
        settings[model.id] = {
            visible: typeof s.visible === 'boolean' ? s.visible : false,
            // A local model has no URL; only hosted models can point at another file.
            url: model.source === 'hosted' && typeof s.url === 'string' && s.url.trim() ? s.url : model.url,
            placement: { ...model.placement, ...sanitizePlacement(s.placement) }
        };
    }
    if (!status[model.id]) {
        status[model.id] = { state: 'idle', message: '', progress: null, info: null };
    }
}

/** Forget a model's settings for good (a local file the user removed). */
export function dropModelState(id: string): void {
    delete settings[id];
    delete status[id];
    delete saved[id];
}

watch(settings, (value) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, ...value }));
    } catch {
        // Private mode or storage full: settings just won't persist.
    }
}, { deep: true });

export function resetPlacement(model: ModelDefinition): void {
    const s = settings[model.id];
    if (!s) return;
    s.placement = { ...model.placement };
    s.url = model.url;
}
