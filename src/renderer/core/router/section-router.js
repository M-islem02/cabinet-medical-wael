import { setActiveSection } from '../state/app-state.js';

const features = new Map();

export function registerFeatureLifecycle(definition) {
  if (!definition?.id) throw new Error('Feature lifecycle requires an id');
  features.set(definition.id, definition);
  return () => features.delete(definition.id);
}

export async function navigateToSection(sectionId, options = {}) {
  if (!options.available && options.available !== undefined) return false;
  const current = [...features.values()].find((feature) => feature.sectionId === window.currentPage);
  const next = [...features.values()].find((feature) => feature.sectionId === sectionId);
  await current?.deactivate?.();
  if (typeof window.showSection === 'function') window.showSection(sectionId);
  setActiveSection(sectionId);
  await next?.activate?.();
  return true;
}

export function getRegisteredFeature(featureId) {
  return features.get(featureId) || null;
}
