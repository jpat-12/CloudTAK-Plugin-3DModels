<template>
    <MenuTemplate name='3D Models'>
        <div class='col-12 d-flex flex-column gap-3 py-2 px-2'>
            <div
                v-for='model of MODELS'
                :key='model.id'
                class='card'
            >
                <div class='card-body d-flex flex-column gap-2 p-3'>
                    <div class='d-flex align-items-center gap-3'>
                        <IconBuildingStadium
                            :size='32'
                            stroke='1'
                            class='flex-shrink-0'
                        />
                        <div
                            class='flex-grow-1'
                            style='min-width: 0'
                        >
                            <div
                                class='fw-bold'
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
                            :title='settings[model.id].visible ? "Hide on map" : "Show on map"'
                        >
                            <input
                                v-model='settings[model.id].visible'
                                class='form-check-input cursor-pointer'
                                type='checkbox'
                                :aria-label='`Show ${model.name}`'
                            >
                        </label>
                    </div>

                    <div
                        v-if='status[model.id].state !== "idle"'
                        class='small'
                        :class='status[model.id].state === "error" ? "text-danger" : "text-secondary"'
                    >
                        <span v-text='status[model.id].message' />
                        <span
                            v-if='status[model.id].progress !== null'
                            v-text='` ${Math.round((status[model.id].progress || 0) * 100)}%`'
                        />
                        <button
                            v-if='status[model.id].state === "error"'
                            class='btn btn-sm btn-link p-0 ms-1 align-baseline'
                            @click='reload(model.id)'
                        >
                            Retry
                        </button>
                    </div>

                    <div
                        v-if='status[model.id].info'
                        class='small text-secondary'
                        v-text='infoText(model.id)'
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
                            @click='toggleEdit(model.id)'
                        >
                            <IconFocus2
                                :size='16'
                                stroke='1'
                                class='me-1'
                            />
                            {{ editing === model.id ? 'Done placing' : 'Adjust placement' }}
                        </button>
                    </div>

                    <div
                        v-if='editing === model.id'
                        class='d-flex flex-column gap-2 border-top pt-2'
                    >
                        <div class='row g-2'>
                            <div class='col-6'>
                                <label class='form-label small mb-0'>Latitude</label>
                                <input
                                    v-model.number='settings[model.id].placement.lat'
                                    type='number'
                                    step='0.00001'
                                    class='form-control form-control-sm'
                                >
                            </div>
                            <div class='col-6'>
                                <label class='form-label small mb-0'>Longitude</label>
                                <input
                                    v-model.number='settings[model.id].placement.lon'
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
                                    @click='nudge(model.id, 0, -1)'
                                >
                                    <IconArrowLeft :size='16' />
                                </button>
                                <button
                                    class='btn btn-sm'
                                    title='Move north'
                                    @click='nudge(model.id, 1, 0)'
                                >
                                    <IconArrowUp :size='16' />
                                </button>
                                <button
                                    class='btn btn-sm'
                                    title='Move south'
                                    @click='nudge(model.id, -1, 0)'
                                >
                                    <IconArrowDown :size='16' />
                                </button>
                                <button
                                    class='btn btn-sm'
                                    title='Move east'
                                    @click='nudge(model.id, 0, 1)'
                                >
                                    <IconArrowRight :size='16' />
                                </button>
                            </div>
                            <button
                                class='btn btn-sm'
                                title='Put the anchor at the centre of the map view'
                                @click='useMapCenter(model.id)'
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
                                    @click='rotate(model.id, -0.5)'
                                >
                                    <IconRotate :size='16' />
                                </button>
                                <input
                                    v-model.number='settings[model.id].placement.heading'
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
                                    @click='rotate(model.id, 0.5)'
                                >
                                    <IconRotateClockwise :size='16' />
                                </button>
                                <input
                                    v-model.number='settings[model.id].placement.heading'
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
                                    v-model.number='settings[model.id].placement.scale'
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
                                        @click='raise(model.id, -0.5)'
                                    >
                                        <IconArrowDown :size='16' />
                                    </button>
                                    <input
                                        v-model.number='settings[model.id].placement.altitude'
                                        type='number'
                                        step='0.5'
                                        class='form-control form-control-sm'
                                    >
                                    <button
                                        class='btn btn-sm'
                                        title='Raise 0.5 m'
                                        @click='raise(model.id, 0.5)'
                                    >
                                        <IconArrowUp :size='16' />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <label class='form-check small mb-0'>
                            <input
                                v-model='settings[model.id].placement.clampToTerrain'
                                class='form-check-input'
                                type='checkbox'
                            >
                            <span class='form-check-label'>Follow 3D terrain height</span>
                            <div
                                class='text-secondary'
                                v-text='settings[model.id].placement.clampToTerrain
                                    ? "Raises the model to the ground level around it when 3D terrain is on."
                                    : "Ignores elevation: the model sits at height 0, which is right only when 3D terrain is off."'
                            />
                        </label>

                        <div>
                            <label class='form-label small mb-0'>Model file URL</label>
                            <input
                                v-model.lazy='settings[model.id].url'
                                type='text'
                                class='form-control form-control-sm'
                                spellcheck='false'
                            >
                        </div>

                        <div class='d-flex gap-2 flex-wrap'>
                            <button
                                class='btn btn-sm'
                                title='Copy these values to paste into lib/models.ts as the new default'
                                @click='copyPlacement(model.id)'
                            >
                                <IconCopy
                                    :size='16'
                                    class='me-1'
                                />
                                {{ copied === model.id ? 'Copied' : 'Copy placement' }}
                            </button>
                            <button
                                class='btn btn-sm'
                                @click='resetPlacement(model.id)'
                            >
                                <IconArrowBackUp
                                    :size='16'
                                    class='me-1'
                                />
                                Reset to default
                            </button>
                        </div>
                    </div>

                    <div class='small text-secondary border-top pt-2'>
                        <a
                            :href='model.attribution.url'
                            target='_blank'
                            rel='noopener'
                            v-text='model.attribution.title'
                        />
                        by {{ model.attribution.author }},
                        <a
                            :href='model.attribution.licenseUrl'
                            target='_blank'
                            rel='noopener'
                            v-text='model.attribution.license'
                        />.
                        <span
                            v-if='model.attribution.changes'
                            v-text='`${model.attribution.changes}.`'
                        />
                    </div>
                </div>
            </div>
        </div>
    </MenuTemplate>
</template>

<script setup lang='ts'>
import { ref } from 'vue';
import {
    IconBuildingStadium,
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
    IconArrowBackUp
} from '@tabler/icons-vue';
import MenuTemplate from '../lib/cloudtak-ui.ts';
import { MODELS } from '../lib/models.ts';
import { settings, status, resetPlacement } from '../lib/settings.ts';
import { flyTo, reload, currentMap } from '../lib/controller.ts';

const editing = ref<string | null>(null);
const copied = ref<string | null>(null);
const step = ref(1);

const METERS_PER_DEG_LAT = 111320;

function toggleEdit(id: string): void {
    editing.value = editing.value === id ? null : id;
}

function round(n: number, places: number): number {
    const f = 10 ** places;
    return Math.round(n * f) / f;
}

function nudge(id: string, north: number, east: number): void {
    const p = settings[id].placement;
    const meters = step.value;
    p.lat = round(p.lat + (north * meters) / METERS_PER_DEG_LAT, 7);
    p.lon = round(p.lon + (east * meters) / (METERS_PER_DEG_LAT * Math.cos(p.lat * Math.PI / 180)), 7);
}

function rotate(id: string, by: number): void {
    const p = settings[id].placement;
    p.heading = round((((p.heading + by) % 360) + 360) % 360, 2);
}

function raise(id: string, by: number): void {
    const p = settings[id].placement;
    p.altitude = round(p.altitude + by, 2);
}

function useMapCenter(id: string): void {
    const map = currentMap();
    if (!map) return;
    const c = map.getCenter();
    settings[id].placement.lat = round(c.lat, 7);
    settings[id].placement.lon = round(c.lng, 7);
}

function infoText(id: string): string {
    const info = status[id].info;
    if (!info) return '';
    const [ew, ns, h] = info.sizeMeters.map((n) => Math.round(n));
    const mb = (info.bytes / 1024 / 1024).toFixed(1);
    const ground = info.groundAboveLowest >= 0.5 ? ` · ground found ${Math.round(info.groundAboveLowest)} m above the lowest point` : '';
    return `${info.triangles.toLocaleString()} triangles · ${mb} MB · about ${ew} × ${ns} m, ${h} m tall at heading 0${ground}`;
}

async function copyPlacement(id: string): Promise<void> {
    const text = JSON.stringify({ placement: settings[id].placement }, null, 4);
    try {
        await navigator.clipboard.writeText(text);
        copied.value = id;
        setTimeout(() => { if (copied.value === id) copied.value = null; }, 2000);
    } catch {
        console.log('[plugin-3d-models] placement:', text);
    }
}
</script>
