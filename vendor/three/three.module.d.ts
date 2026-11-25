// Minimal hand-written types for the parts of three.js this plugin uses.
// Vendored three.js ships without types, and @types/three cannot be installed inside a
// CloudTAK build, so only what lib/model-layer.ts touches is declared here. Add members as
// needed; they match three@0.187.0.

export const REVISION: string;
export const DoubleSide: number;
export const FrontSide: number;

export class EventDispatcher {}

export class Vector3 {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
    add(v: Vector3): this;
    sub(v: Vector3): this;
    copy(v: Vector3): this;
    clone(): Vector3;
}

export class Matrix4 {
    elements: number[];
    fromArray(array: ArrayLike<number>, offset?: number): this;
    copy(m: Matrix4): this;
    multiply(m: Matrix4): this;
    invert(): this;
    scale(v: Vector3): this;
    makeTranslation(x: number, y: number, z: number): this;
    makeRotationX(theta: number): this;
    makeRotationY(theta: number): this;
    makeRotationZ(theta: number): this;
    determinant(): number;
}

export class Color {
    constructor(color?: number | string);
    clone(): Color;
}

export namespace MathUtils {
    function degToRad(degrees: number): number;
    function radToDeg(radians: number): number;
}

export class Object3D extends EventDispatcher {
    name: string;
    position: Vector3;
    frustumCulled: boolean;
    visible: boolean;
    children: Object3D[];
    add(...objects: Object3D[]): this;
    remove(...objects: Object3D[]): this;
    traverse(callback: (object: Object3D) => void): void;
    updateMatrixWorld(force?: boolean): void;
}

export class Group extends Object3D {}
export class Scene extends Object3D {}

export class Camera extends Object3D {
    projectionMatrix: Matrix4;
    projectionMatrixInverse: Matrix4;
}

export class Light extends Object3D {}
export class HemisphereLight extends Light {
    constructor(skyColor?: number, groundColor?: number, intensity?: number);
}
export class DirectionalLight extends Light {
    constructor(color?: number, intensity?: number);
}

export class Texture extends EventDispatcher {
    dispose(): void;
}

export class BufferAttribute {
    count: number;
}

export class BufferGeometry extends EventDispatcher {
    getIndex(): BufferAttribute | null;
    getAttribute(name: string): BufferAttribute | undefined;
    dispose(): void;
}

export class Material extends EventDispatcher {
    transparent: boolean;
    opacity: number;
    alphaTest: number;
    vertexColors: boolean;
    side: number;
    dispose(): void;
}

export interface MeshBasicMaterialParameters {
    map?: Texture | null;
    color?: Color | number;
    transparent?: boolean;
    opacity?: number;
    alphaTest?: number;
    vertexColors?: boolean;
    side?: number;
}

export class MeshBasicMaterial extends Material {
    constructor(parameters?: MeshBasicMaterialParameters);
    map: Texture | null;
    color: Color;
}

export class MeshStandardMaterial extends Material {
    map: Texture | null;
    color: Color;
}

export class Mesh extends Object3D {
    readonly isMesh: true;
    geometry: BufferGeometry;
    material: Material | Material[];
}

export class Box3 {
    min: Vector3;
    max: Vector3;
    setFromObject(object: Object3D, precise?: boolean): this;
    getSize(target: Vector3): Vector3;
    getCenter(target: Vector3): Vector3;
    isEmpty(): boolean;
}

export class LoadingManager {}

export class Loader {
    constructor(manager?: LoadingManager);
    manager: LoadingManager;
    setCrossOrigin(crossOrigin: string): this;
}

export class TextureLoader extends Loader {}

export interface WebGLRendererParameters {
    canvas?: HTMLCanvasElement | OffscreenCanvas;
    context?: WebGLRenderingContext | WebGL2RenderingContext;
    antialias?: boolean;
    alpha?: boolean;
    premultipliedAlpha?: boolean;
}

export class WebGLRenderer {
    constructor(parameters?: WebGLRendererParameters);
    autoClear: boolean;
    resetState(): void;
    render(scene: Object3D, camera: Camera): void;
    dispose(): void;
}
