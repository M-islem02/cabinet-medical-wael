import { loadCurrentUser } from '../core/auth/current-user.js';
import { configureApplicationState } from '../core/state/app-state.js';
import { eventBus } from '../core/state/event-bus.js';
import { packageConfigService, normalizePackageConfig } from '../core/package/package-config-service.js';
import { initializeCoreNavigation, setSectionAvailability } from '../core/router/navigation.js';
import { getLoadedSpecialtyIds, loadEnabledSpecialties, reconcileSpecialties } from '../core/specialty/specialty-loader.js';
import { logger } from '../core/logging/logger.js';

function domReady() {
  return document.readyState === 'loading'
    ? new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
    : Promise.resolve();
}

function showStartupError(error) {
  document.documentElement.classList.remove('app-booting');
  document.body?.classList.add('app-ready');
  if (typeof window.showNotification === 'function') {
    window.showNotification('Initialisation partielle. Certaines fonctions sont indisponibles.', 'error');
  }
  logger.error('Renderer bootstrap failed', { code: error?.code || 'RENDERER_BOOTSTRAP_FAILED' });
}

async function initializeCoreFeatures(packageConfig) {
  const patientFeature = await import('../features/patients/index.js');
  const appointmentFeature = await import('../features/appointments/index.js');
  await patientFeature.initialize();
  await appointmentFeature.initialize();

  if (packageConfig.features.inventory) {
    const inventoryFeature = await import('../features/inventory/index.js');
    await inventoryFeature.initialize();
  } else {
    setSectionAvailability('inventory', false);
    setSectionAvailability('equipment', false);
  }
}

export async function bootstrapApplication() {
  await domReady();
  const currentUser = loadCurrentUser();
  let packageConfig;
  try {
    packageConfig = await packageConfigService.load();
  } catch (error) {
    logger.warn('Package configuration unavailable; preserving legacy all-enabled defaults', { code: error?.code });
    packageConfig = packageConfigService.prime(normalizePackageConfig(null).raw);
  }

  window._packageConfig = packageConfig.raw;
  window.medcareApp = Object.freeze({
    eventBus,
    packageConfigService,
    getLoadedSpecialtyIds,
    async reconcilePackageConfig() {
      const nextConfig = await packageConfigService.refresh();
      window._packageConfig = nextConfig.raw;
      configureApplicationState({ packageConfig: nextConfig });
      await reconcileSpecialties(nextConfig, { context: { eventBus } });
      eventBus.emit('package-config:changed', nextConfig);
      return nextConfig;
    }
  });

  configureApplicationState({ currentUser, packageConfig });
  initializeCoreNavigation();
  await initializeCoreFeatures(packageConfig);
  await loadEnabledSpecialties(packageConfig, { context: { eventBus } });
  await window.initializeLegacyApplication?.();
  eventBus.emit('package-config:loaded', packageConfig);
  logger.info('MedCareSO renderer initialized');
}

bootstrapApplication().catch(showStartupError);
