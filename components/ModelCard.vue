<template>
    <div class='card'>
        <div class='card-body d-flex flex-column gap-2 p-3'>
            <div class='d-flex align-items-center gap-3'>
                <IconDevices
                    v-if='model.source === "local"'
                    :size='32'
                    stroke='1'
                    class='flex-shrink-0'
                    title='Opened from this device'
                />
                <IconBuilding
                    v-else
                    :size='32'
                    stroke='1'
                    class='flex-shrink-0'
                />
                <div
                    class='flex-grow-1'
                    style='min-width: 0'
                >
                    <div
                        class='fw-bold text-truncate'
                        :title='model.name'
                        v-text='model.name'
                    />
                    <div
                        v-if='model.description'
                        class='text-secondary small'
                        v-text='model.description'
                    />
                </div>
                <label
                    class='form-switch m-0'
                    :title='s.visible ? "Hide on map" : "Show on map"'
                >
                    <input
                        v-model='s.visible'
                        class='form-check-input cursor-pointer'
                        type='checkbox'
                        :aria-label='`Show ${model.name}`'
                    >
                </label>
            </div>

            <div
                v-if='st.state !== "idle"'
                class='small'
                :class='st.state === "error" ? "text-danger" : "text-secondary"'
            >
                <span v-text='st.message' />
                <span
                    v-if='st.progress !== null'
                    v-text='` ${Math.round((st.progress || 0) * 100)}%`'
                />
                <button
                    v-if='st.state === "error"'
                    class='btn btn-sm btn-link p-0 ms-1 align-baseline'
                    @click='reload(model.id)'
                >
                    Retry
                </button>
            </div>

            <div
                v-if='st.info'
                class='small text-secondary'
                v-text='infoText()'
            />

            <div class='d-flex gap-2 flex-wrap'>
                <button
                    class='btn btn-sm'
                    @click='flyTo(model.id)'
                >
                    <IconPlaneDeparture
                        :size='16'
                        stroke='1'
                        class='me-1'
                    />
                    Fly to
                </button>
                <button
                    class='btn btn-sm'
                    @click='editing = !editing'
                >
                    <IconFocus2
                        :size='16'
                        stroke='1'
                        class='me-1'
                    />
                    {{ editing ? 'Done placing' : 'Adjust placement' }}
                </button>
                <button
                    v-if='model.source === "local"'
                    class='btn btn-sm'
                    :title='local?.kept ? "Remove the model and delete the copy kept in this browser" : "Remove the model"'
                    @click='removeLocal(model.id)'
                >
                    <IconTrash
                        :size='16'
                        stroke='1'
                        class='me-1'
                    />
                    Remove
                </button>
            </div>

            <div
                v-if='editing'
                class='d-flex flex-column gap-2 border-top pt-2'
            >
                <div class='row g-2'>
                    <div class='col-6'>
                        <label class='form-label small mb-0'>Latitude</label>
                        <input
                            v-model.number='s.placement.lat'
                            type='number'
                            step='0.00001'
                            class='form-control form-control-sm'
                        >
                    </div>
                    <div class='col-6'>
                        <label class='form-label small mb-0'>Longitude</label>
                        <input
                            v-model.number='s.placement.lon'
                            type='number'
                            step='0.00001'
                            class='form-control form-control-sm'
                        >
                    </div>
                </div>

                <div class='d-flex align-items-center gap-2 flex-wrap'>
                    <span class='small'>Move</span>
                    <select
                        v-model.number='step'
                        class='form-select form-select-sm w-auto'
                        aria-label='Move step'
                    >
                        <option :value='0.5'>
                            0.5 m
                        </option>
                        <option :value='1'>
                            1 m
                        </option>
                        <option :value='5'>
                            5 m
                        </option>
                        <option :value='25'>
                            25 m
                        </option>
                    </select>
                    <div class='btn-group'>
                        <button
                            class='btn btn-sm'
                            title='Move west'
                            @click='nudge(0, -1)'
                        >
                            <IconArrowLeft :size='16' />
                        </button>
                        <button
                            class='btn btn-sm'
                            title='Move north'
                            @click='nudge(1, 0)'
                        >
                            <IconArrowUp :size='16' />
                        </button>
                        <button
                            class='btn btn-sm'
                            title='Move south'
                            @click='nudge(-1, 0)'
                        >
                            <IconArrowDown :size='16' />
                        </button>
                        <button
                            class='btn btn-sm'
                            title='Move east'
                            @click='nudge(0, 1)'
                        >
                            <IconArrowRight :size='16' />
                        </button>
                    </div>
                    <button
                        class='btn btn-sm'
                        title='Put the anchor at the centre of the map view'
                        @click='useMapCenter()'
                    >
                        <IconCrosshair
                            :size='16'
                            class='me-1'
                        />
                        Map centre
                    </button>
                </div>

                <div>
                    <label class='form-label small mb-0'>Heading (degrees clockwise from north)</label>
                    <div class='d-flex align-items-center gap-2'>
                        <button
                            class='btn btn-sm'
                            title='Rotate 0.5° anticlockwise'
                            @click='rotate(-0.5)'
                        >
                            <IconRotate :size='16' />
                        </button>
                        <input
                            v-model.number='s.placement.heading'
                            type='range'
                            min='0'
                            max='360'
                            step='0.5'
                            class='form-range flex-grow-1'
                            aria-label='Heading'
                        >
                        <button
                            class='btn btn-sm'
                            title='Rotate 0.5° clockwise'
                            @click='rotate(0.5)'
                        >
                            <IconRotateClockwise :size='16' />
                        </button>
                        <input
                            v-model.number='s.placement.heading'
                            type='number'
                            step='0.5'
                            class='form-control form-control-sm'
                            style='width: 5.5em'
                            aria-label='Heading in degrees'
                        >
                    </div>
                </div>

                <div class='row g-2'>
                    <div class='col-6'>
                        <label class='form-label small mb-0'>Scale</label>
                        <input
                            v-model.number='s.placement.scale'
                            type='number'
                            step='0.01'
                            min='0.0001'
                            class='form-control form-control-sm'
                        >
                    </div>
                    <div class='col-6'>
                        <label class='form-label small mb-0'>Height offset (m)</label>
                        <div class='input-group input-group-sm'>
                            <button
                                class='btn btn-sm'
                                title='Lower 0.5 m'
                                @click='raise(-0.5)'
                            >
                                <IconArrowDown :size='16' />
                            </button>
                            <input
                                v-model.number='s.placement.altitude'
                                type='number'
                                step='0.5'
                                class='form-control form-control-sm'
                            >
                            <button
                                class='btn btn-sm'
                                title='Raise 0.5 m'
                                @click='raise(0.5)'
                            >
                                <IconArrowUp :size='16' />
                            </button>
                        </div>
                    </div>
                </div>

                <label class='form-check small mb-0'>
                    <input
                        v-model='s.placement.clampToTerrain'
                        class='form-check-input'
                        type='checkbox'
                    >
                    <span class='form-check-label'>Follow 3D terrain height</span>
                    <div
                        class='text-secondary'
                        v-text='s.placement.clampToTerrain
                            ? "Raises the model to the ground level around it when 3D terrain is on."
                            : "Ignores elevation: the model sits at height 0, which is right only when 3D terrain is off."'
                    />
                </label>

                <label
                    v-if='model.source === "local"'
                    class='form-check small mb-0'
                >
                    <input
                        :checked='model.unlit'
                        class='form-check-input'
                        type='checkbox'
                        @change='setUnlit(model.id, ($event.target as HTMLInputElement).checked)'
                    >
                    <span class='form-check-label'>Photogrammetry scan (draw without extra lighting)</span>
                    <div class='text-secondary'>
                        Scans already have real light in their textures. Untick for CAD or hand-made models.
                    </div>
                </label>

                <div v-if='model.source === "hosted"'>
                    <label class='form-label small mb-0'>Model file URL</label>
                    <input
                        v-model.lazy='s.url'
                        type='text'
                        class='form-control form-control-sm'
                        spellcheck='false'
                    >
                </div>

                <div class='d-flex gap-2 flex-wrap'>
                    <button
                        class='btn btn-sm'
                        title='Copy a models.json entry with this placement, for the CloudTAK admin'
                        @click='copyPlacement()'
                    >
                        <IconCopy
                            :size='16'
                            class='me-1'
                        />
                        {{ copied ? 'Copied' : 'Copy placement' }}
                    </button>
                    <button
                        class='btn btn-sm'
                        @click='resetPlacement(model)'
                    >
                        <IconArrowBackUp
                            :size='16'
                            class='me-1'
                        />
                        Reset to default
                    </button>
                </div>
            </div>

            <div
                v-if='model.attribution'
                class='small text-secondary border-top pt-2'
            >
                <a
                    v-if='safeHref(model.attribution.url)'
                    :href='safeHref(model.attribution.url)'
                    target='_blank'
                    rel='noopener'
                    v-text='model.attribution.title'
                />
                <span
                    v-else
                    v-text='model.attribution.title'
                />
                <span
                    v-if='model.attribution.author'
                    v-text='` by ${model.attribution.author}`'
                />
                <template v-if='model.attribution.license'>
                    <span v-text='", "' />
                    <a
                        v-if='safeHref(model.attribution.licenseUrl)'
                        :href='safeHref(model.attribution.licenseUrl)'
                        target='_blank'
                        rel='noopener'
                        v-text='model.attribution.license'
                    />
                    <span
                        v-else
                        v-text='model.attribution.license'
                    />
                </template>
                <span v-text='"."' />
                <span
                    v-if='model.attribution.changes'
                    v-text='` ${model.attribution.changes}.`'
                />
            </div>
            <div
                v-else-if='model.source === "local"'
                class='small text-secondary border-top pt-2'
            >
                <IconLock
                    :size='14'
                    stroke='1'
                    class='me-1'
                />
                {{ local?.kept ? 'Kept in this browser only.' : 'Open for this session only.' }}
                Not uploaded; other users can't see it.
            </div>
        </div>
    </div>
</template>

<script setup lang='ts'>
import { ref, computed } from 'vue';
import {
    IconBuilding,
    IconDevices,
    IconPlaneDeparture,
    IconFocus2,
    IconArrowUp,
    IconArrowDown,
    IconArrowLeft,
    IconArrowRight,
    IconCrosshair,
    IconRotate,
    IconRotateClockwise,
    IconCopy,
    IconArrowBackUp,
    IconTrash,
    IconLock
} from '@tabler/icons-vue';
import type { ModelDefinition } from '../lib/models.ts';
import { settings, status, resetPlacement } from '../lib/settings.ts';
import { localInfo } from '../lib/local-models.ts';
import { flyTo, reload, currentMap, removeLocal, setUnlit } from '../lib/controller.ts';

const props = defineProps<{ model: ModelDefinition }>();

const editing = ref(false);
const copied = ref(false);
const step = ref(1);

// The panel creates both entries before it renders a card.
const s = computed(() => settings[props.model.id]);
const st = computed(() => status[props.model.id]);
const local = computed(() => localInfo[props.model.id]);

const METERS_PER_DEG_LAT = 111320;

function round(n: number, places: number): number {
    const f = 10 ** places;
    return Math.round(n * f) / f;
}

function safeHref(href: string | undefined): string | undefined {
    return href && /^https?:\/\//i.test(href) ? href : undefined;
}

function nudge(north: number, east: number): void {
    const p = s.value.placement;
    const meters = step.value;
    p.lat = round(p.lat + (north * meters) / METERS_PER_DEG_LAT, 7);
    p.lon = round(p.lon + (east * meters) / (METERS_PER_DEG_LAT * Math.cos(p.lat * Math.PI / 180)), 7);
}

function rotate(by: number): void {
    const p = s.value.placement;
    p.heading = round((((p.heading + by) % 360) + 360) % 360, 2);
}

function raise(by: number): void {
    const p = s.value.placement;
    p.altitude = round(p.altitude + by, 2);
}

function useMapCenter(): void {
    const map = currentMap();
    if (!map) return;
    const c = map.getCenter();
    s.value.placement.lat = round(c.lat, 7);
    s.value.placement.lon = round(c.lng, 7);
}

function infoText(): string {
    const info = st.value.info;
    if (!info) return '';
    const [ew, ns, h] = info.sizeMeters.map((n) => Math.round(n));
    const mb = (info.bytes / 1024 / 1024).toFixed(1);
    const ground = info.groundAboveLowest >= 0.5 ? ` · ground found ${Math.round(info.groundAboveLowest)} m above the lowest point` : '';
    return `${info.triangles.toLocaleString()} triangles · ${mb} MB · about ${ew} × ${ns} m, ${h} m tall at heading 0${ground}`;
}

/**
 * A models.json entry with the current placement. For a local file it is the starting point
 * for an admin who wants to host it for everyone (the url is where they would put the file).
 */
async function copyPlacement(): Promise<void> {
    const m = props.model;
    const entry = m.source === 'hosted'
        ? { id: m.id, name: m.name, url: s.value.url, placement: s.value.placement }
        : {
            id: (local.value?.fileName ?? m.name).replace(/\.glb$/i, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'my-model',
            name: m.name,
            url: local.value?.fileName ?? 'my-model.glb',
            placement: s.value.placement,
            unlit: m.unlit
        };
    const text = JSON.stringify(entry, null, 4);
    try {
        await navigator.clipboard.writeText(text);
        copied.value = true;
        setTimeout(() => { copied.value = false; }, 2000);
    } catch {
        console.log('[plugin-3d-models] models.json entry:', text);
    }
}
</script>
