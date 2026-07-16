export const FEATURE_REGISTRY = Object.freeze({
  patients: { core: true },
  appointments: { core: true, packageKey: 'featureCalendar', defaultEnabled: true },
  inventory: { core: false, packageKey: 'featureInventory', defaultEnabled: true },
  equipment: { core: false, packageKey: 'featureInventory', defaultEnabled: true },
  prescriptions: { core: false, packageKey: 'featurePrescriptions', defaultEnabled: true },
  waitingRoom: { core: false, packageKey: 'featureWaitingRoom', defaultEnabled: true },
  medicalImaging: { core: false, packageKey: 'featureMedicalImaging', defaultEnabled: true }
});

export function isFeatureEnabled(config, featureId) {
  const definition = FEATURE_REGISTRY[featureId];
  if (!definition) return false;
  if (definition.core && !definition.packageKey) return true;
  const value = config?.raw?.[definition.packageKey];
  return value === undefined ? definition.defaultEnabled !== false : [true, 1, '1'].includes(value);
}
