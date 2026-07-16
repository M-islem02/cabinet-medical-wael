import '../../js/modules/inventory.js';
import { inventoryState } from './inventory-state.js';
import { registerFeatureLifecycle } from '../../core/router/section-router.js';
import { markFeatureInitialized } from '../../core/state/app-state.js';

export async function initialize() {
  if (!inventoryState.initialize()) return;
  registerFeatureLifecycle({ id: 'inventory', sectionId: 'inventory', activate, deactivate });
  markFeatureInitialized('inventory');
}
export async function activate() { inventoryState.activate(); await window.initInventory?.(); }
export function deactivate() { inventoryState.deactivate(); }
export function destroy() { inventoryState.reset(); }
