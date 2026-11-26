// Models a user opens from their own device.
//
// The file is read with File.arrayBuffer() and parsed in the browser. It is never sent to
// CloudTAK or anywhere else: nothing in this module makes a network request. Other CloudTAK
// users never see it.
//
// By default the file is only kept for this browser session. With "Keep on this device" the
// file is also stored in this browser's IndexedDB (still local to this browser profile), so it
// is there after a reload until the user removes it.

import { reactive } from 'vue';
import { catalog, defaultPlacement, type ModelDefinition } from './models.ts';
import { ensureModelState, dropModelState } from './settings.ts';

const GLB_MAGIC = 0x46546C67; // 'glTF', little-endian
const DB_NAME = 'plugin-3d-models';
const DB_VERSION = 1;
const META = 'local-meta';
const FILES = 'local-files';

interface StoredMeta {
    id: string;
    name: string;
    fileName: string;
    size: number;
    addedAt: number;
    unlit: boolean;
    lat: number;
    lon: number;
}

export interface LocalModelInfo {
    fileName: string;
    size: number;
    /** Stored in IndexedDB, so it survives a reload. */
    kept: boolean;
}

/** Files opened this session, by model id. Persisted ones are read back from IndexedDB lazily. */
const files = new Map<string, Blob>();
export const localInfo = reactive<Record<string, LocalModelInfo>>({});

// --- IndexedDB ----------------------------------------------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
    if (!dbPromise) {
        dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
            if (typeof indexedDB === 'undefined') {
                reject(new Error('This browser has no IndexedDB'));
                return;
            }
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
                if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error ?? new Error('Could not open IndexedDB'));
        });
        dbPromise.catch(() => { dbPromise = null; });
    }
    return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write was aborted (storage full?)'));
    });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
    });
}

// --- catalog --------------------------------------------------------------------------------

function definition(meta: StoredMeta): ModelDefinition {
    return {
        id: meta.id,
        source: 'local',
        name: meta.name,
        description: `${meta.fileName} · from this device`,
        url: '',
        placement: defaultPlacement(meta.lat, meta.lon),
        recenter: true,
        ground: 'auto',
        unlit: meta.unlit,
        flyToZoom: 17
    };
}

function addToCatalog(meta: StoredMeta, kept: boolean): ModelDefinition {
    const model = definition(meta);
    localInfo[meta.id] = { fileName: meta.fileName, size: meta.size, kept };
    ensureModelState(model);
    if (!catalog.local.some((m) => m.id === model.id)) catalog.local.push(model);
    return model;
}

let restored: Promise<void> | null = null;

/** Put files kept from earlier sessions back in the list. Safe to call more than once. */
export function restoreLocalModels(): Promise<void> {
    if (!restored) {
        restored = (async () => {
            try {
                const db = await openDb();
                const metas = await request(db.transaction(META, 'readonly').objectStore(META).getAll() as IDBRequest<StoredMeta[]>);
                metas.sort((a, b) => a.addedAt - b.addedAt);
                for (const meta of metas) addToCatalog(meta, true);
            } catch (err) {
                console.warn('[plugin-3d-models] could not read models kept on this device', err);
            }
        })();
    }
    return restored;
}

async function isGlb(file: Blob): Promise<boolean> {
    if (file.size < 12) return false;
    const head = await file.slice(0, 4).arrayBuffer();
    return new DataView(head).getUint32(0, true) === GLB_MAGIC;
}

export interface OpenOptions {
    /** Store the file in this browser so it is still listed after a reload. */
    keep: boolean;
    /** Photogrammetry: draw textures without lighting. */
    unlit: boolean;
    /** Where to put it first: usually the centre of the map view. */
    lat: number;
    lon: number;
}

/** Add a .glb from the user's device. Throws a message for the user if the file is unusable. */
export async function openLocalFile(file: File, opts: OpenOptions): Promise<ModelDefinition> {
    if (!await isGlb(file)) {
        throw new Error(`${file.name} is not a GLB file. Export or convert the model to binary glTF (.glb), which keeps its textures inside the one file.`);
    }

    const meta: StoredMeta = {
        id: `local-${crypto.randomUUID()}`,
        name: file.name.replace(/\.glb$/i, '') || 'Local model',
        fileName: file.name,
        size: file.size,
        addedAt: Date.now(),
        unlit: opts.unlit,
        lat: opts.lat,
        lon: opts.lon
    };

    let kept = false;
    if (opts.keep) {
        try {
            const db = await openDb();
            const tx = db.transaction([META, FILES], 'readwrite');
            tx.objectStore(META).put(meta);
            tx.objectStore(FILES).put(file, meta.id);
            await done(tx);
            kept = true;
        } catch (err) {
            console.warn('[plugin-3d-models] could not keep the file on this device', err);
        }
    }

    files.set(meta.id, file);
    const model = addToCatalog(meta, kept);
    if (opts.keep && !kept) {
        throw Object.assign(new Error(`${file.name} is open for this session, but the browser would not store it (storage may be full or blocked), so it will be gone after a reload.`), { model });
    }
    return model;
}

/** The file's bytes, from memory or from IndexedDB. */
export async function readLocalFile(id: string): Promise<ArrayBuffer> {
    let blob = files.get(id);
    if (!blob) {
        const db = await openDb();
        const stored = await request(db.transaction(FILES, 'readonly').objectStore(FILES).get(id) as IDBRequest<Blob | undefined>);
        if (!stored) throw new Error('This model\'s file is no longer stored in this browser. Remove it and open the file again.');
        blob = stored;
        files.set(id, blob);
    }
    return await blob.arrayBuffer();
}

/** Change the lighting choice, and remember it if the file is kept. */
export async function setLocalUnlit(id: string, unlit: boolean): Promise<void> {
    const model = catalog.local.find((m) => m.id === id);
    if (!model) return;
    model.unlit = unlit;
    if (!localInfo[id]?.kept) return;
    try {
        const db = await openDb();
        const tx = db.transaction(META, 'readwrite');
        const store = tx.objectStore(META);
        const meta = await request(store.get(id) as IDBRequest<StoredMeta | undefined>);
        if (meta) store.put({ ...meta, unlit });
        await done(tx);
    } catch (err) {
        console.warn('[plugin-3d-models] could not save the lighting choice', err);
    }
}

/** Remove a local model from the list, from this browser's storage, and its settings. */
export async function removeLocalModel(id: string): Promise<void> {
    const i = catalog.local.findIndex((m) => m.id === id);
    if (i !== -1) catalog.local.splice(i, 1);
    files.delete(id);
    const wasKept = localInfo[id]?.kept;
    delete localInfo[id];
    dropModelState(id);
    if (!wasKept) return;
    try {
        const db = await openDb();
        const tx = db.transaction([META, FILES], 'readwrite');
        tx.objectStore(META).delete(id);
        tx.objectStore(FILES).delete(id);
        await done(tx);
    } catch (err) {
        console.warn('[plugin-3d-models] could not delete the stored file', err);
    }
}
