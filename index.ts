// CloudTAK 3D Models plugin: entry point.
//
// Draws glTF/GLB models (first: IU Memorial Stadium) on the CloudTAK map with three.js, via a
// MapLibre custom layer. Adds a "3D Models" menu item whose panel shows/hides each model and
// lines it up with the imagery.
//
// Installed, this file is <CloudTAK>/app/plugins/<name>/index.ts, found at build time by the
// plugins/*/index.ts glob.
//
// Lifecycle:
//   install()  once at startup: register the panel route.
//   enable()   whenever the map is ready: add the menu item and the shown models' layers.
//   disable()  whenever the map is not ready, including once before the first enable():
//              remove the menu item and layers. The route is never removed.

import type { App } from 'vue';
import { markRaw } from 'vue';
import type { PluginAPI, PluginInstance, MenuItemConfig } from '@tak-ps/cloudtak';
import { IconBuildingStadium } from '@tabler/icons-vue';
import ModelsPanel from './components/ModelsPanel.vue';
import { attach, detach } from './lib/controller.ts';

const MENU_KEY   = 'plugin-3d-models';
const ROUTE_NAME = 'home-menu-3d-models';

export default class ThreeDModelsPlugin implements PluginInstance {
    api: PluginAPI;

    constructor(api: PluginAPI) {
        this.api = api;
    }

    static async install(app: App, api: PluginAPI): Promise<ThreeDModelsPlugin> {
        void app;

        api.routes.add(
            { path: '3d-models', name: ROUTE_NAME, component: markRaw(ModelsPanel) },
            'home-menu',
        );

        return new ThreeDModelsPlugin(api);
    }

    async enable(): Promise<void> {
        this.api.menu.add({
            key:         MENU_KEY,
            label:       '3D Models',
            route:       ROUTE_NAME,
            tooltip:     '3D Models',
            description: 'Show 3D building models on the map',
            icon:        markRaw(IconBuildingStadium) as unknown as MenuItemConfig['icon'],
        } as MenuItemConfig);

        try {
            attach(this.api.map);
        } catch (err) {
            console.error('[plugin-3d-models] could not attach to the map', err);
        }
    }

    async disable(): Promise<void> {
        try { this.api.menu.remove(MENU_KEY); } catch { /* map not loaded yet */ }
        try { detach(); } catch { /* map not loaded yet */ }
    }
}
