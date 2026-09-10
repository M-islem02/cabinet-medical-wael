let initialized = false;
let legacyModule = null;

export async function initialize() {
  if (initialized) return;
  legacyModule = await import('../../js/modules/traumatology.js');
  initialized = true;
}

export function activate() {
  return window.initTraumatology?.();
}

export function destroy() {
  legacyModule?.destroyTraumatologyLegacy?.();
  legacyModule = null;
  initialized = false;
}
