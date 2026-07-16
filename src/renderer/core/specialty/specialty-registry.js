export const SPECIALTY_REGISTRY = Object.freeze({
  general: {
    packageKey: 'general',
    navigationSectionIds: [],
    loader: () => import('../../specialties/general/index.js')
  },
  rehabilitation: {
    packageKey: 'rehabilitation',
    navigationSectionIds: ['rehabilitation', 'kine-staff', 'daily-summary'],
    loader: () => import('../../specialties/rehabilitation/index.js')
  },
  dentistry: {
    packageKey: 'dentistry',
    navigationSectionIds: ['dentistry'],
    loader: () => import('../../specialties/dentistry/index.js')
  },
  cardiology: {
    packageKey: 'cardiology',
    navigationSectionIds: ['cardiology'],
    loader: () => import('../../specialties/cardiology/index.js')
  }
});
