import { SPECIALTY_REGISTRY } from './specialty-registry.js';
import { setSectionAvailability } from '../router/navigation.js';
import { logger } from '../logging/logger.js';

const loadedSpecialties = new Map();

export async function loadEnabledSpecialties(packageConfig, options = {}) {
  const registry = options.registry || SPECIALTY_REGISTRY;
  const setAvailability = options.setAvailability || setSectionAvailability;
  const context = options.context || {};

  for (const [specialtyId, definition] of Object.entries(registry)) {
    const enabled = packageConfig?.specialties?.[definition.packageKey] === true;
    definition.navigationSectionIds.forEach((sectionId) => setAvailability(sectionId, enabled));
    if (!enabled) continue;
    if (loadedSpecialties.has(specialtyId)) continue;

    try {
      const specialtyModule = await definition.loader();
      await specialtyModule.initialize?.({ ...context, packageConfig });
      loadedSpecialties.set(specialtyId, specialtyModule);
      logger.info(`Specialty loaded: ${specialtyId}`);
    } catch (error) {
      definition.navigationSectionIds.forEach((sectionId) => setAvailability(sectionId, false));
      logger.error(`Failed to load specialty: ${specialtyId}`, { code: error?.code || 'SPECIALTY_IMPORT_FAILED' });
      if (packageConfig?.activeSpecialty === specialtyId) throw error;
    }
  }
  return new Map(loadedSpecialties);
}

export async function reconcileSpecialties(packageConfig, options = {}) {
  const registry = options.registry || SPECIALTY_REGISTRY;
  for (const [specialtyId, specialtyModule] of [...loadedSpecialties]) {
    const definition = registry[specialtyId];
    if (packageConfig?.specialties?.[definition.packageKey] === true) continue;
    await specialtyModule.destroy?.();
    loadedSpecialties.delete(specialtyId);
  }
  return loadEnabledSpecialties(packageConfig, options);
}

export async function destroyLoadedSpecialties() {
  for (const specialtyModule of loadedSpecialties.values()) await specialtyModule.destroy?.();
  loadedSpecialties.clear();
}

export function getLoadedSpecialtyIds() {
  return [...loadedSpecialties.keys()];
}
