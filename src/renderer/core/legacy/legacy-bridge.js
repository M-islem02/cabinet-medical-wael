const modules = new Map();

export function registerLegacyGlobals(moduleId, globals) {
  const names = [];
  for (const [name, value] of Object.entries(globals)) {
    if (typeof value !== 'function') continue;
    window[name] = value;
    names.push(name);
  }
  modules.set(moduleId, names);
  window.medcareLegacy = window.medcareLegacy || {};
  window.medcareLegacy[moduleId] = Object.freeze({ ...globals });
  return () => unregisterLegacyGlobals(moduleId);
}

export function unregisterLegacyGlobals(moduleId) {
  for (const name of modules.get(moduleId) || []) {
    delete window[name];
  }
  modules.delete(moduleId);
  if (window.medcareLegacy) delete window.medcareLegacy[moduleId];
}

export function getLegacyGlobalManifest() {
  return Object.fromEntries([...modules.entries()].map(([key, names]) => [key, [...names]]));
}
