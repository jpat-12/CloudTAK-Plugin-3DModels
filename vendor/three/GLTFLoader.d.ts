// Minimal hand-written types for the vendored GLTFLoader (three@0.187.0). See three.module.d.ts.
import type { Group, Loader, LoadingManager } from './three.module.js';

export interface GLTF {
    scene: Group;
    scenes: Group[];
}

export interface GLTFParserOptions {
    manager: LoadingManager;
    crossOrigin: string;
    path: string;
}

export interface GLTFParser {
    options: GLTFParserOptions;
    textureLoader: Loader;
}

export interface GLTFLoaderPlugin {
    readonly name: string;
}

export interface MeshoptDecoderLike {
    supported: boolean;
    ready: Promise<void>;
}

export class GLTFLoader extends Loader {
    constructor(manager?: LoadingManager);
    setMeshoptDecoder(decoder: MeshoptDecoderLike): this;
    register(callback: (parser: GLTFParser) => GLTFLoaderPlugin): this;
    parseAsync(data: ArrayBuffer | string, path: string): Promise<GLTF>;
}
