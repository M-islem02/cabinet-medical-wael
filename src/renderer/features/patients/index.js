import '../../js/modules/patients.js';
import { registerFeatureLifecycle } from '../../core/router/section-router.js';
import { markFeatureInitialized } from '../../core/state/app-state.js';

let initialized = false;
export async function initialize() {
  if (initialized) return;
  initialized = true;
  registerFeatureLifecycle({ id: 'patients', sectionId: 'patients', activate: () => window.loadPatients?.() });
  markFeatureInitialized('patients');
}
export async function activate() { await window.loadPatients?.(); }
export function deactivate() {}
export function destroy() { initialized = false; }
