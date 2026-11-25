// The models this plugin can place on the map.
//
// Add an entry here to ship another model. Each model's GLB is served as a static file, usually
// from this repo's public/ folder: CloudTAK's plugin installer copies public/<path> into the web
// app's public dir, so public/plugin-3d-models/foo.glb is served at /plugin-3d-models/foo.glb.
//
// Everything under `placement` is only the default. Users can adjust each value from the
// plugin's panel and it is remembered in their browser. Once a model is lined up, use the
// panel's "Copy placement" button and paste the result here to make it the default for
// everyone.

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
    url: string;
    license: string;
    licenseUrl: string;
    /** CC BY asks you to say what was changed. */
    changes?: string;
}

export interface ModelDefinition {
    /** Stable id. Used for layer ids and saved settings, so do not change it once shipped. */
    id: string;
    name: string;
    description?: string;
    /** URL of the .glb. Same-origin by default; CloudTAK's CSP blocks other hosts. */
    url: string;
    placement: ModelPlacement;
    /**
     * Move the model so the centre of its bounding box sits on the anchor and its lowest point
     * sits on the ground. Photogrammetry exports rarely have a meaningful origin.
     */
    recenter: boolean;
    /**
     * Which height of the model sits on the map when recentring:
     *   'auto'   the ground detected in the scan (most common low vertex height). Right for
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
    attribution: ModelAttribution;
}

export const MODELS: ModelDefinition[] = [{
    id: 'iu-memorial-stadium',
    name: 'IU Memorial Stadium',
    description: 'Photogrammetry scan of Memorial Stadium, Bloomington, Indiana',
    url: '/plugin-3d-models/iu-memorial-stadium.glb',
    placement: {
        // Stadium centre (midfield). Heading and scale still need lining up with imagery.
        lat: 39.180837,
        lon: -86.525596,
        heading: 0,
        scale: 1,
        altitude: 0,
        clampToTerrain: true
    },
    recenter: true,
    ground: 'auto',
    unlit: true,
    flyToZoom: 16.5,
    attribution: {
        title: 'IU Memorial Stadium',
        author: 'IU3D',
        url: 'https://sketchfab.com/3d-models/iu-memorial-stadium-37bd3ddfc39941bda2c8550087b6387f',
        license: 'CC BY 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        changes: 'Decimated, quantized and texture-compressed for web use'
    }
}];

export function modelById(id: string): ModelDefinition | undefined {
    return MODELS.find((m) => m.id === id);
}
