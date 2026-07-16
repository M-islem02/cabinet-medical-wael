let initialized = false;
let legacyModule = null;
export async function initialize() {
  if (initialized) return;
  legacyModule = await import('../../js/modules/dentistry.js');
  initialized = true;
}
export function activate() { return window.initDentistry?.(); }
export function destroy() {
  legacyModule?.destroyDentistryLegacy?.();
  legacyModule = null;
  initialized = false;
}
