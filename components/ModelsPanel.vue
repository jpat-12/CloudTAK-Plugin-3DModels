<template>
    <MenuTemplate name='3D Models'>
        <div class='col-12 d-flex flex-column gap-3 py-2 px-2'>
            <div class='d-flex flex-column gap-2'>
                <div class='d-flex align-items-center'>
                    <div class='subheader flex-grow-1'>
                        From your organization
                    </div>
                    <button
                        v-if='catalog.manifest.state !== "loading"'
                        class='btn btn-sm btn-ghost-secondary p-1'
                        title='Reload the list'
                        aria-label='Reload the list'
                        @click='refresh()'
                    >
                        <IconRefresh :size='16' />
                    </button>
                </div>

                <div
                    v-if='catalog.manifest.state === "loading"'
                    class='small text-secondary'
                >
                    Loading the model list…
                </div>
                <div
                    v-if='catalog.manifest.state === "error"'
                    class='small text-danger'
                    v-text='catalog.manifest.message'
                />
                <div
                    v-if='catalog.manifest.state === "none" && !catalog.hosted.length'
                    class='small text-secondary'
                >
                    This CloudTAK has no shared 3D models yet. An administrator adds them by
                    publishing a <code>models.json</code> with the model files; see the plugin's README.
                </div>

                <ModelCard
                    v-for='model of catalog.hosted'
                    :key='model.id'
                    :model='model'
                />
            </div>

            <div
                v-if='catalog.allowLocalFiles || catalog.local.length'
                class='d-flex flex-column gap-2'
            >
                <div class='subheader'>
                    From this device
                </div>

                <div
                    v-if='catalog.allowLocalFiles'
                    class='card'
                >
                    <div class='card-body d-flex flex-column gap-2 p-3'>
                        <div class='small text-secondary'>
                            Open a <code>.glb</code> file from your computer. It is read and drawn
                            in this browser only: it is not uploaded to CloudTAK, and other users
                            can't see it.
                        </div>
                        <label class='form-check small mb-0'>
                            <input
                                v-model='keep'
                                class='form-check-input'
                                type='checkbox'
                            >
                            <span class='form-check-label'>Keep it in this browser after I close CloudTAK</span>
                        </label>
                        <label class='form-check small mb-0'>
                            <input
                                v-model='unlit'
                                class='form-check-input'
                                type='checkbox'
                            >
                            <span class='form-check-label'>It's a photogrammetry scan (draw without extra lighting)</span>
                        </label>
                        <div>
                            <button
                                class='btn btn-sm'
                                :disabled='opening'
                                @click='fileInput?.click()'
                            >
                                <IconFolderOpen
                                    :size='16'
                                    stroke='1'
                                    class='me-1'
                                />
                                {{ opening ? 'Opening…' : 'Open a model file…' }}
                            </button>
                            <input
                                ref='fileInput'
                                type='file'
                                accept='.glb,model/gltf-binary'
                                class='d-none'
                                @change='onFile'
                            >
                        </div>
                        <div
                            v-if='openError'
                            class='small text-danger'
                            v-text='openError'
                        />
                    </div>
                </div>

                <ModelCard
                    v-for='model of catalog.local'
                    :key='model.id'
                    :model='model'
                />
            </div>
        </div>
    </MenuTemplate>
</template>

<script setup lang='ts'>
import { ref, onMounted } from 'vue';
import { IconRefresh, IconFolderOpen } from '@tabler/icons-vue';
import MenuTemplate from '../lib/cloudtak-ui.ts';
import ModelCard from './ModelCard.vue';
import { catalog, loadManifest, type ModelDefinition } from '../lib/models.ts';
import { settings } from '../lib/settings.ts';
import { openLocalFile, restoreLocalModels } from '../lib/local-models.ts';
import { currentMap } from '../lib/controller.ts';

const fileInput = ref<HTMLInputElement | null>(null);
const keep = ref(true);
const unlit = ref(true);
const opening = ref(false);
const openError = ref('');


onMounted(() => {
    void loadManifest();
    void restoreLocalModels();
});

function refresh(): void {
    void loadManifest(true);
}

async function onFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    openError.value = '';
    opening.value = true;
    const centre = currentMap()?.getCenter();
    try {
        const model = await openLocalFile(file, {
            keep: keep.value,
            unlit: unlit.value,
            lat: centre?.lat ?? 0,
            lon: centre?.lng ?? 0
        });
        settings[model.id].visible = true;
    } catch (err) {
        openError.value = err instanceof Error ? err.message : String(err);
        // Opened, but could not be kept: still show it.
        const model = (err as { model?: ModelDefinition }).model;
        if (model) settings[model.id].visible = true;
    } finally {
        opening.value = false;
    }
}
</script>
