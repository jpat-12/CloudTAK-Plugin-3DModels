#!/usr/bin/env node
/* global process */
//
// Shrink a photogrammetry GLB so it loads quickly in CloudTAK on a tablet.
//
//   cd tools && npm install
//   node optimize-model.mjs <input.glb> [output.glb] [options]
//
// Defaults: decimate to 150,000 triangles, resize textures to at most 4096 px, re-encode them
// as WebP, and quantize vertex data. The result needs no WebAssembly decoder, so it works
// under CloudTAK's default content security policy.
//
// Options:
//   --faces <n>          Target triangle count (default 150000). 100000–150000 is the useful range.
//   --error <0..1>       Max simplification error, as a fraction of the model size (default 0.01).
//                        Raise it if the target count is not reached.
//   --texture-size <px>  Longest texture side (default 4096). 2048 halves the download again.
//   --format <f>         Texture format: webp (default), jpeg, or keep.
//   --quality <1-100>    WebP/JPEG quality (default 85).
//   --compress <c>       Geometry: quantize (default), meshopt, or none.
//                        meshopt is ~2–4x smaller but needs 'wasm-unsafe-eval' in CloudTAK's
//                        CSP (NGINX_CSP_DEFAULT_SRC) to decode. Draco and KTX2 are not
//                        supported by the plugin's loader.
//
// The output is written next to the input as <name>.optimized.glb unless a path is given.
// Copy it to your model pack's public/plugin-3d-models/ under the name its models.json uses.

import fs from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
    dedup, flatten, join, weld, simplify, prune, textureCompress, quantize, meshopt
} from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

function parseArgs(argv) {
    const opts = {
        faces: 150000,
        error: 0.01,
        textureSize: 4096,
        format: 'webp',
        quality: 85,
        compress: 'quantize',
        positional: []
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const next = () => {
            const v = argv[++i];
            if (v === undefined) throw new Error(`${a} needs a value`);
            return v;
        };
        if (a === '--faces') opts.faces = Number(next());
        else if (a === '--error') opts.error = Number(next());
        else if (a === '--texture-size') opts.textureSize = Number(next());
        else if (a === '--format') opts.format = next();
        else if (a === '--quality') opts.quality = Number(next());
        else if (a === '--compress') opts.compress = next();
        else if (a === '-h' || a === '--help') opts.help = true;
        else if (a.startsWith('--')) throw new Error(`Unknown option ${a}`);
        else opts.positional.push(a);
    }
    if (!['webp', 'jpeg', 'keep'].includes(opts.format)) throw new Error('--format must be webp, jpeg or keep');
    if (!['quantize', 'meshopt', 'none'].includes(opts.compress)) throw new Error('--compress must be quantize, meshopt or none');
    if (!(opts.faces > 0)) throw new Error('--faces must be a positive number');
    return opts;
}

function countTriangles(doc) {
    let n = 0;
    for (const mesh of doc.getRoot().listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
            if (prim.getMode() !== 4) continue; // TRIANGLES
            const indices = prim.getIndices();
            const position = prim.getAttribute('POSITION');
            n += Math.floor((indices ? indices.getCount() : position ? position.getCount() : 0) / 3);
        }
    }
    return n;
}

function textureSummary(doc) {
    return doc.getRoot().listTextures().map((t) => {
        const size = t.getSize();
        return `${t.getMimeType()} ${size ? size.join('×') : '?'}`;
    }).join(', ') || 'none';
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help || !opts.positional.length) {
        const src = await fs.readFile(new URL(import.meta.url), 'utf8');
        console.log(src.split('\n').slice(2, 27).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
        process.exit(opts.help ? 0 : 1);
    }

    const input = opts.positional[0];
    const output = opts.positional[1]
        || path.join(path.dirname(input), `${path.basename(input, path.extname(input))}.optimized.glb`);

    await MeshoptEncoder.ready;
    await MeshoptSimplifier.ready;

    const io = new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

    const inBytes = (await fs.stat(input)).size;
    const doc = await io.read(input);
    const before = countTriangles(doc);
    console.log(`in:  ${input}`);
    console.log(`     ${before.toLocaleString()} triangles, ${mb(inBytes)}, textures: ${textureSummary(doc)}`);

    const ratio = Math.min(1, opts.faces / Math.max(1, before));
    const steps = [dedup(), flatten(), join(), weld()];
    if (ratio < 1) {
        steps.push(simplify({ simplifier: MeshoptSimplifier, ratio, error: opts.error }));
    }
    steps.push(prune());
    if (opts.format !== 'keep') {
        steps.push(textureCompress({
            encoder: sharp,
            targetFormat: opts.format,
            resize: [opts.textureSize, opts.textureSize],
            quality: opts.quality
        }));
    } else {
        steps.push(textureCompress({ encoder: sharp, resize: [opts.textureSize, opts.textureSize] }));
    }
    if (opts.compress === 'quantize') steps.push(quantize());
    if (opts.compress === 'meshopt') steps.push(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));

    await doc.transform(...steps);

    await io.write(output, doc);
    const after = countTriangles(doc);
    const outBytes = (await fs.stat(output)).size;
    console.log(`out: ${output}`);
    console.log(`     ${after.toLocaleString()} triangles, ${mb(outBytes)}, textures: ${textureSummary(doc)}`);

    if (after > opts.faces * 1.1) {
        console.log(`\nnote: stopped at ${after.toLocaleString()} triangles because of the error limit. `
            + `Re-run with a larger --error (e.g. ${Math.min(1, opts.error * 3)}) to get closer to ${opts.faces.toLocaleString()}.`);
    }
}

main().catch((err) => {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
});
