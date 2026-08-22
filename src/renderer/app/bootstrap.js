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
  console.error('❌ Renderer bootstrap failed:', error);
  logger.error('Renderer bootstrap failed', { code: error?.code || 'RENDERER_BOOTSTRAP_FAILED', message: error?.message, stack: error?.stack });
}

async function initializeCoreFeatures(packageConfig) {
  try {
    const patientFeature = await import('../features/patients/index.js');
    await patientFeature.initialize();
  } catch (err) {
    logger.warn('Patients feature initialization warning:', err);
  }

  try {
    const appointmentFeature = await import('../features/appointments/index.js');
    await appointmentFeature.initialize();
  } catch (err) {
    logger.warn('Appointments feature initialization warning:', err);
  }

  if (packageConfig.features.inventory) {
    try {
      const inventoryFeature = await import('../features/inventory/index.js');
      await inventoryFeature.initialize();
    } catch (err) {
      logger.warn('Inventory feature initialization warning:', err);
    }
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
  
  try {
    await loadEnabledSpecialties(packageConfig, { context: { eventBus } });
  } catch (err) {
    logger.warn('Specialties load warning:', err);
  }

  try {
    await window.initializeLegacyApplication?.();
  } catch (err) {
    logger.warn('Legacy application initialization warning:', err);
  }

  eventBus.emit('package-config:loaded', packageConfig);
  document.documentElement.classList.remove('app-booting');
  document.body?.classList.add('app-ready');
  logger.info('MedCareSO renderer initialized');
}

bootstrapApplication().catch(showStartupError);
