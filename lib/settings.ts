// Per-user, per-model settings: whether a model is shown, its placement and its file URL.
// Kept in a reactive object and saved to localStorage, so each user's tweaks survive a reload.

import { reactive, watch } from 'vue';
import { MODELS, type ModelDefinition, type ModelPlacement } from './models.ts';

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

function defaults(model: ModelDefinition): ModelSettings {
    return {
        visible: false,
        url: model.url,
        placement: { ...model.placement }
    };
}

function load(): Record<string, ModelSettings> {
    let saved: Record<string, Partial<ModelSettings>> = {};
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) saved = JSON.parse(raw) as Record<string, Partial<ModelSettings>>;
    } catch {
        saved = {};
    }

    const out: Record<string, ModelSettings> = {};
    for (const model of MODELS) {
        const base = defaults(model);
        const s = saved[model.id] || {};
        out[model.id] = {
            visible: typeof s.visible === 'boolean' ? s.visible : base.visible,
            url: typeof s.url === 'string' && s.url.trim() ? s.url : base.url,
            placement: { ...base.placement, ...sanitizePlacement(s.placement) }
        };
    }
    return out;
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

export const settings = reactive<Record<string, ModelSettings>>(load());

export const status = reactive<Record<string, ModelStatus>>(Object.fromEntries(MODELS.map((m) => [m.id, {
    state: 'idle',
    message: '',
    progress: null,
    info: null
} satisfies ModelStatus])));

watch(settings, (value) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
        // Private mode or storage full: settings just won't persist.
    }
}, { deep: true });

export function resetPlacement(id: string): void {
    const model = MODELS.find((m) => m.id === id);
    if (!model || !settings[id]) return;
    settings[id].placement = { ...model.placement };
    settings[id].url = model.url;
}
