// The one reach into CloudTAK internals: its MenuTemplate, so the panel looks and behaves
// (title bar, back button) like CloudTAK's own menu pages. The public plugin API has no
// equivalent. If a CloudTAK upgrade moves this file, this is the only line to fix.
//
// Path is relative to <CloudTAK>/app/plugins/<this plugin>/lib/.
export { default } from '../../../src/components/CloudTAK/util/MenuTemplate.vue';
