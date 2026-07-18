import { invokeApi } from '../api/api-client.js';

const SPECIALTY_ALIASES = Object.freeze({
  general: 'general', generalist: 'general',
  mpr: 'rehabilitation', rehabilitation: 'rehabilitation', reeducation: 'rehabilitation',
  dentistry: 'dentistry', dentist: 'dentistry', dental: 'dentistry',
  cardiology: 'cardiology', cardiologist: 'cardiology'
});
const ALL_SPECIALTIES = Object.freeze(['general', 'rehabilitation', 'dentistry', 'cardiology']);
let cachedConfig = null;
let loadPromise = null;

const enabled = (value, fallback = true) => value === undefined || value === null
  ? fallback
  : [true, 1, '1'].includes(value);

function normalizeSpecialty(value) {
  return SPECIALTY_ALIASES[String(value || '').trim().toLowerCase()] || null;
}

function parseSpecialties(raw) {
  let values = raw?.enabledSpecialties;
  if (typeof values === 'string') {
    try { values = JSON.parse(values); } catch { values = values.split(','); }
  }
  if (Array.isArray(values)) {
    return [...new Set(values.map(normalizeSpecialty).filter(Boolean))];
  }

  const hasLegacyFlags = ['featureRehabilitation', 'featureKineStaff', 'featureDentistry', 'featureCardiology']
    .some((key) => raw && raw[key] !== undefined && raw[key] !== null);
  if (!hasLegacyFlags) return [...ALL_SPECIALTIES];

  const result = ['general'];
  if (enabled(raw.featureRehabilitation, false) || enabled(raw.featureKineStaff, false)) result.push('rehabilitation');
  if (enabled(raw.featureDentistry, false)) result.push('dentistry');
  if (enabled(raw.featureCardiology, false)) result.push('cardiology');
  return result;
}

export function normalizePackageConfig(rawConfig) {
  const raw = rawConfig && typeof rawConfig === 'object' ? rawConfig : null;
  const specialties = parseSpecialties(raw);
  const requestedActive = normalizeSpecialty(raw?.activeSpecialty) || 'general';
  const activeSpecialty = specialties.includes(requestedActive) ? requestedActive : (specialties[0] || null);
  const specialtyFlags = Object.fromEntries(ALL_SPECIALTIES.map((id) => [id, specialties.includes(id)]));

  return Object.freeze({
    raw,
    specialties: Object.freeze(specialtyFlags),
    enabledSpecialties: Object.freeze([...specialties]),
    activeSpecialty,
    features: Object.freeze({
      calendar: enabled(raw?.featureCalendar, true),
      inventory: enabled(raw?.featureInventory, true),
      equipment: enabled(raw?.featureInventory, true),
      prescriptions: enabled(raw?.featurePrescriptions, true),
      waitingRoom: enabled(raw?.featureWaitingRoom, true),
      medicalImaging: enabled(raw?.featureMedicalImaging, true)
    })
  });
}

async function fetchPackageConfig() {
  const raw = await invokeApi('package.getConfig', () => window.api.package.getConfig());
  return normalizePackageConfig(raw || null);
}

export const packageConfigService = Object.freeze({
  async load() {
    if (cachedConfig) return cachedConfig;
    loadPromise ||= fetchPackageConfig().then((config) => (cachedConfig = config)).finally(() => { loadPromise = null; });
    return loadPromise;
  },
  async refresh() {
    cachedConfig = null;
    return this.load();
  },
  prime(rawConfig) { cachedConfig = normalizePackageConfig(rawConfig); return cachedConfig; },
  get() { return cachedConfig; },
  isSpecialtyEnabled(id) { return cachedConfig?.specialties?.[id] === true; },
  isFeatureEnabled(id) { return cachedConfig?.features?.[id] === true; },
  getActiveSpecialty() { return cachedConfig?.activeSpecialty || null; },
  getEnabledSpecialties() { return [...(cachedConfig?.enabledSpecialties || [])]; }
});
