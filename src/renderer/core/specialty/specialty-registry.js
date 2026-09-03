export const SPECIALTY_REGISTRY = Object.freeze({
  dentistry: {
    packageKey: 'dentistry',
    navigationSectionIds: ['dentistry'],
    loader: () => import('../../specialties/dentistry/index.js')
  },
  general: {
    packageKey: 'general',
    navigationSectionIds: [],
    loader: () => import('../../specialties/general/index.js')
  }
});
