// A MapLibre custom layer that draws one glTF/GLB model with three.js, sharing MapLibre's
// WebGL context and depth buffer so the model is hidden correctly behind 3D terrain.
//
// This module pulls in three.js (vendored under ../vendor/three). The controller imports it
// with a dynamic import(), so three.js is only downloaded when a user first shows a model.

import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';
import { MercatorCoordinate } from 'maplibre-gl';
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl';
import type { ModelDefinition, ModelPlacement } from './models.ts';
import type { ModelStatus } from './settings.ts';

const GLB_MAGIC = 0x46546C67; // 'glTF', little-endian

// Below this zoom the model is a few pixels wide, and on CloudTAK's globe projection MapLibre's
// mercator matrix no longer matches the globe, so do not draw it.
const MIN_ZOOM = 12;

interface LoadedModel {
    /** Wrapper whose origin is the model's ground centre (when recentred). */
    root: THREE.Object3D;
    triangles: number;
    /** Bounding-box size in model units, after recentring (x, y-up, z). */
    size: THREE.Vector3;
    /** Metres (model units) between the model's lowest point and the ground level used. */
    groundAboveLowest: number;
    bytes: number;
}

// Parsed models are cached per URL so hiding and re-showing a model, or a basemap change that
// re-adds the layer, does not download and parse the file again.
const cache = new Map<string, Promise<LoadedModel>>();

export function forget(url: string): void {
    cache.delete(url);
}

async function download(url: string, onProgress: (p: number | null) => void): Promise<ArrayBuffer> {
    let res: Response;
    try {
        res = await fetch(url, { credentials: 'same-origin' });
    } catch (err) {
        throw new Error(`Could not reach ${url} (${err instanceof Error ? err.message : String(err)}). If it is on another host, CloudTAK's content security policy blocks it; serve it from CloudTAK itself.`, { cause: err });
    }

    if (res.status === 404) throw new Error(`Model file not found at ${url}. Add the GLB to the plugin's public/ folder and rebuild CloudTAK.`);
    if (!res.ok) throw new Error(`Model download failed: HTTP ${res.status} for ${url}`);

    const total = Number(res.headers.get('content-length')) || 0;
    if (!res.body || !total) {
        onProgress(null);
        return await res.arrayBuffer();
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        onProgress(Math.min(1, received / total));
    }

    const out = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return out.buffer;
}

function makeUnlit(root: THREE.Object3D): void {
    root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const swap = (mat: THREE.Material): THREE.Material => {
            const src = mat as THREE.MeshStandardMaterial;
            const basic = new THREE.MeshBasicMaterial({
                map: src.map ?? null,
                color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
                transparent: src.transparent,
                opacity: src.opacity,
                alphaTest: src.alphaTest,
                vertexColors: src.vertexColors,
                side: THREE.DoubleSide
            });
            mat.dispose();
            return basic;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });
}

/**
 * Find the height of the ground in a photogrammetry scan. Scans include the ground around the
 * building, and usually stray points or a sunken area below it, so the lowest point is a poor
 * choice: putting it on the map leaves the real ground floating above the imagery.
 *
 * Instead, add up the area of every near-horizontal triangle by its height (0.5 m bins) and
 * take the height with the most flat area in the lower half of the model, ignoring the lowest
 * 2% of that area as noise (stray points under the scan). That is the open ground the building stands on.
 * Area, not vertex count, because decimation leaves flat ground with very few vertices.
 */
function detectGroundY(root: THREE.Object3D, box: THREE.Box3): number {
    const BIN = 0.5;
    const bins = new Map<number, number>();
    let total = 0;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();

    root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        const pos = mesh.geometry.getAttribute('position');
        if (!pos) return;
        const index = mesh.geometry.getIndex();
        const count = index ? index.count : pos.count;
        const vertex = (i: number, out: THREE.Vector3) => {
            const n = index ? index.getX(i) : i;
            return out.set(pos.getX(n), pos.getY(n), pos.getZ(n)).applyMatrix4(mesh.matrixWorld);
        };
        for (let i = 0; i + 2 < count; i += 3) {
            vertex(i, a); vertex(i + 1, b); vertex(i + 2, c);
            // Cross product of the two edges: its length is twice the area, its y part twice
            // the area seen from above.
            const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
            const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
            const nx = uy * vz - uz * vy;
            const ny = uz * vx - ux * vz;
            const nz = ux * vy - uy * vx;
            const len = Math.hypot(nx, ny, nz);
            if (!(len > 0) || Math.abs(ny) / len < 0.95) continue; // not flat
            const area = len / 2;
            const bin = Math.floor(((a.y + b.y + c.y) / 3 - box.min.y) / BIN);
            bins.set(bin, (bins.get(bin) ?? 0) + area);
            total += area;
        }
    });
    if (!(total > 0)) return box.min.y;

    const sorted = [...bins.entries()].sort((x, y) => x[0] - y[0]);
    const percentile = (q: number) => {
        let acc = 0;
        for (const [bin, area] of sorted) {
            acc += area;
            if (acc >= total * q) return bin;
        }
        return sorted[sorted.length - 1][0];
    };
    const lo = percentile(0.02);
    const top = Math.floor((box.max.y - box.min.y) / BIN);
    const limit = lo + (top - lo) / 2;

    let best = lo;
    let bestArea = -1;
    for (const [bin, area] of sorted) {
        if (bin < lo || bin > limit) continue;
        if (area > bestArea) { best = bin; bestArea = area; }
    }
    return box.min.y + (best + 0.5) * BIN;
}

/** Read the extensionsUsed list from a GLB's JSON chunk. */
function glbExtensions(buffer: ArrayBuffer): string[] {
    try {
        const view = new DataView(buffer);
        const jsonLength = view.getUint32(12, true);
        const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength))) as { extensionsUsed?: string[] };
        return json.extensionsUsed ?? [];
    } catch {
        return [];
    }
}

async function loadModel(model: ModelDefinition, url: string, onProgress: (p: number | null) => void): Promise<LoadedModel> {
    const buffer = await download(url, onProgress);

    if (buffer.byteLength < 12 || new DataView(buffer).getUint32(0, true) !== GLB_MAGIC) {
        throw new Error(`${url} is not a GLB file. If CloudTAK returned its web page instead, the file is missing from the build: add it to the plugin's public/ folder and rebuild.`);
    }

    const loader = new GLTFLoader();

    const extensions = glbExtensions(buffer);
    for (const unsupported of ['KHR_draco_mesh_compression', 'KHR_texture_basisu']) {
        if (extensions.includes(unsupported)) {
            throw new Error(`${url} uses ${unsupported}, which this plugin does not decode. Re-run tools/optimize-model.mjs with the default options (quantize + WebP).`);
        }
    }
    if (extensions.includes('EXT_meshopt_compression')) {
        // The decoder compiles WebAssembly as soon as it is imported, which CloudTAK's default
        // CSP forbids, so only import it for files that need it.
        const { MeshoptDecoder } = await import('../vendor/three/meshopt_decoder.module.js');
        try {
            await MeshoptDecoder.ready;
        } catch (err) {
            throw new Error(`${url} is meshopt-compressed, and this CloudTAK's content security policy blocks the WebAssembly decoder. Either add 'wasm-unsafe-eval' via NGINX_CSP_DEFAULT_SRC, or re-run tools/optimize-model.mjs with --compress quantize.`, { cause: err });
        }
        loader.setMeshoptDecoder(MeshoptDecoder);
    }
    // GLTFLoader decodes embedded textures with fetch(blob:...) via ImageBitmapLoader, which
    // CloudTAK's CSP (connect-src 'self') blocks. Image elements are allowed blob: URLs
    // (img-src blob:), so force the <img>-based TextureLoader.
    loader.register((parser) => {
        parser.textureLoader = new THREE.TextureLoader(parser.options.manager);
        parser.textureLoader.setCrossOrigin(parser.options.crossOrigin);
        return { name: 'CLOUDTAK_3D_MODELS_img_textures' };
    });

    const base = new URL(url, window.location.href);
    const resourcePath = base.href.slice(0, base.href.lastIndexOf('/') + 1);
    const gltf = await loader.parseAsync(buffer, resourcePath);

    const scene = gltf.scene;
    if (model.unlit) makeUnlit(scene);

    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());

    const root = new THREE.Group();
    root.name = `plugin-3d-models:${model.id}`;
    let groundAboveLowest = 0;
    if (model.recenter && !box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        const groundY = model.ground === 'lowest' ? box.min.y : detectGroundY(scene, box);
        groundAboveLowest = groundY - box.min.y;
        scene.position.sub(new THREE.Vector3(center.x, groundY, center.z));
    }
    root.add(scene);
    // The camera here is MapLibre's combined matrix, not a normal three.js camera, and the
    // model is a single object anyway: skip per-mesh frustum tests.
    root.traverse((obj) => { obj.frustumCulled = false; });

    let triangles = 0;
    root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        const index = mesh.geometry.getIndex();
        const position = mesh.geometry.getAttribute('position');
        triangles += Math.floor((index ? index.count : position ? position.count : 0) / 3);
    });

    return { root, triangles, size, groundAboveLowest, bytes: buffer.byteLength };
}

export interface ModelLayerOptions {
    model: ModelDefinition;
    layerId: string;
    getUrl: () => string;
    getPlacement: () => ModelPlacement;
    setStatus: (patch: Partial<ModelStatus>) => void;
}

export class ModelLayer implements CustomLayerInterface {
    id: string;
    type = 'custom' as const;
    renderingMode = '3d' as const;

    private opts: ModelLayerOptions;
    private map: MapLibreMap | null = null;
    private renderer: THREE.WebGLRenderer | null = null;
    private scene: THREE.Scene | null = null;
    private camera: THREE.Camera | null = null;
    private loaded: LoadedModel | null = null;
    private removed = false;

    // Reused every frame.
    private readonly mProj = new THREE.Matrix4();
    private readonly mModel = new THREE.Matrix4();
    private readonly mRotZ = new THREE.Matrix4();
    private readonly mRotX = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    private readonly vScale = new THREE.Vector3();

    constructor(opts: ModelLayerOptions) {
        this.opts = opts;
        this.id = opts.layerId;
    }

    onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
        this.map = map;
        this.removed = false;

        this.camera = new THREE.Camera();
        this.scene = new THREE.Scene();
        // Only used when a model is drawn lit (unlit: false).
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2));
        const sun = new THREE.DirectionalLight(0xffffff, 1.4);
        sun.position.set(0.5, 1, 0.3);
        this.scene.add(sun);

        this.renderer = new THREE.WebGLRenderer({
            canvas: map.getCanvas(),
            context: gl,
            antialias: true
        });
        this.renderer.autoClear = false;

        void this.load();
    }

    private async load(): Promise<void> {
        const { model, setStatus } = this.opts;
        const url = this.opts.getUrl();

        let pending = cache.get(url);
        if (!pending) {
            setStatus({ state: 'loading', message: 'Downloading model…', progress: 0, info: null });
            pending = loadModel(model, url, (progress) => {
                setStatus({ state: 'loading', message: 'Downloading model…', progress });
            });
            cache.set(url, pending);
            pending.catch(() => cache.delete(url));
        } else {
            setStatus({ state: 'loading', message: 'Preparing model…', progress: null });
        }

        try {
            const loaded = await pending;
            if (this.removed || !this.scene) return;
            this.loaded = loaded;
            this.scene.add(loaded.root);
            setStatus({ state: 'ready', message: 'Shown on the map', progress: null });
            this.reportInfo();
            this.map?.triggerRepaint();
        } catch (err) {
            if (this.removed) return;
            console.error('[plugin-3d-models]', err);
            setStatus({ state: 'error', message: err instanceof Error ? err.message : String(err), progress: null, info: null });
        }
    }

    /** Push the model's size at the current scale to the panel. */
    reportInfo(): void {
        if (!this.loaded) return;
        const s = this.opts.getPlacement().scale;
        const { x, y, z } = this.loaded.size;
        this.opts.setStatus({
            info: {
                triangles: this.loaded.triangles,
                // glTF is y-up; with heading 0, model x is east and model z is north-south.
                sizeMeters: [x * s, z * s, y * s],
                groundAboveLowest: this.loaded.groundAboveLowest * s,
                bytes: this.loaded.bytes
            }
        });
    }

    render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput): void {
        if (!this.loaded || !this.renderer || !this.scene || !this.camera || !this.map) return;
        if (this.map.getZoom() < MIN_ZOOM) return;

        const p = this.opts.getPlacement();
        const ground = p.clampToTerrain ? this.terrainGround(p) : 0;

        const origin = MercatorCoordinate.fromLngLat([p.lon, p.lat], ground + p.altitude);
        const s = origin.meterInMercatorCoordinateUnits() * p.scale;

        // Mercator world: x east, y south, z up. Flipping y gives east/north/up metres; then
        // turn clockwise by the heading and stand the y-up glTF model upright.
        this.mRotZ.makeRotationZ(-THREE.MathUtils.degToRad(p.heading));
        this.mModel
            .makeTranslation(origin.x, origin.y, origin.z)
            .scale(this.vScale.set(s, -s, s))
            .multiply(this.mRotZ)
            .multiply(this.mRotX);

        this.mProj.fromArray(args.defaultProjectionData.mainMatrix as ArrayLike<number>);
        this.camera.projectionMatrix.copy(this.mProj).multiply(this.mModel);
        this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

        this.renderer.resetState();
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Terrain height for the model's ground. Sampling only the anchor would read the bottom of
     * a stadium bowl (or the top of the stands, on a surface model) when the elevation data
     * includes the building. Take the median of the anchor and eight points around the edge
     * of the model's footprint, which is the surrounding ground the scan's ground matches.
     */
    private terrainGround(p: ModelPlacement): number {
        if (!this.map || !this.loaded) return 0;
        const centre = this.map.queryTerrainElevation([p.lon, p.lat]);
        if (centre === null) return 0; // 3D terrain is off: the map is flat at height 0.

        const halfEW = (this.loaded.size.x * p.scale) / 2 * 0.9;
        const halfNS = (this.loaded.size.z * p.scale) / 2 * 0.9;
        const h = THREE.MathUtils.degToRad(p.heading);
        const mPerDegLat = 111320;
        const mPerDegLon = mPerDegLat * Math.cos(p.lat * Math.PI / 180);
        const samples = [centre];
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const ex = Math.cos(a) * halfEW;
            const ny = Math.sin(a) * halfNS;
            // Rotate clockwise by the heading.
            const east = ex * Math.cos(h) + ny * Math.sin(h);
            const north = -ex * Math.sin(h) + ny * Math.cos(h);
            const e = this.map.queryTerrainElevation([p.lon + east / mPerDegLon, p.lat + north / mPerDegLat]);
            if (e !== null) samples.push(e);
        }
        samples.sort((a, b) => a - b);
        return samples[Math.floor(samples.length / 2)];
    }

    onRemove(): void {
        this.removed = true;
        if (this.scene && this.loaded) {
            this.scene.remove(this.loaded.root);
            // Free the GPU copies. The parsed model stays cached in memory, so showing it again
            // only re-uploads it.
            this.loaded.root.traverse((obj) => {
                const mesh = obj as THREE.Mesh;
                if (!mesh.isMesh) return;
                mesh.geometry?.dispose();
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                for (const mat of mats) {
                    const tex = (mat as THREE.MeshBasicMaterial).map;
                    if (tex) tex.dispose();
                    mat.dispose();
                }
            });
        }
        this.renderer?.dispose();
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.loaded = null;
        this.map = null;
    }
}
