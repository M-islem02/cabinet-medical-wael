/**
 * Script principal - Gestion de l'interface PhysioCare
 */

console.log('✅ Main.js script loaded successfully');

let currentPatientId = null;
let currentPatientData = null;
let currentPage = 'dashboard';
let currentUserId = null;
let currentUserIsAdmin = false;
let currentUserIsSuperAdmin = false;
let currentUserRole = 'doctor';
let currentUsername = 'Utilisateur';
let currentUserSpecialty = '';
let adminModeEnabled = false;
let pendingConsultationData = null;
let sickLeaveRestDaysDirty = false;
let cachedSettings = null;
let factureTotalEditedManually = false;

function hasMojibakeText(value) {
  return /\u00C3|\u00E2\u20AC|\u00F0\u0178|\u00C5\u201C|\u00EF\u00B8\u008F|�/.test(String(value || ''));
}

function repairMojibakeText(value) {
  const text = String(value ?? '');
  if (!text || !hasMojibakeText(text)) {
    return text;
  }

  return text
    .replace(/\u00C3\u20AC/g, 'À')
    .replace(/\u00C3\u00A0/g, 'à')
    .replace(/\u00C3\u00A1/g, 'á')
    .replace(/\u00C3\u00A2/g, 'â')
    .replace(/\u00C3\u00A4/g, 'ä')
    .replace(/\u00C3\u00A7/g, 'ç')
    .replace(/\u00C3\u00A8/g, 'è')
    .replace(/\u00C3\u00A9/g, 'é')
    .replace(/\u00C3\u00AA/g, 'ê')
    .replace(/\u00C3\u00AB/g, 'ë')
    .replace(/\u00C3\u00AE/g, 'î')
    .replace(/\u00C3\u00AF/g, 'ï')
    .replace(/\u00C3\u00B4/g, 'ô')
    .replace(/\u00C3\u00B6/g, 'ö')
    .replace(/\u00C3\u00B9/g, 'ù')
    .replace(/\u00C3\u00BB/g, 'û')
    .replace(/\u00C3\u00BC/g, 'ü')
    .replace(/\u00C3\u2030/g, 'É')
    .replace(/\u00C5\u201C/g, 'œ')
    .replace(/\u00E2\u20AC\u2122/g, "'")
    .replace(/\u00E2\u20AC\u00A2/g, '•')
    .replace(/\u00E2\u20AC\u201C/g, '-')
    .replace(/\u00E2\u20AC\u201D/g, '-')
    .replace(/\u00F0\u0178\u201D\u2018/g, 'Supprimer')
    .replace(/\u00F0\u0178\u2019\u0160/g, '')
    .replace(/\u00F0\u0178\u00AA\u00AA/g, '')
    .replace(/\u00EF\u00B8\u008F/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function repairUiMojibake(root = document.body) {
  if (!root || typeof document === 'undefined') return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const original = node.nodeValue || '';
    const fixed = repairMojibakeText(original);
    if (fixed !== original) {
      node.nodeValue = fixed;
    }
    node = walker.nextNode();
  }

  root.querySelectorAll('input, textarea, button, label, option, h1, h2, h3, h4, h5, h6, span, div, p, th, td').forEach((element) => {
    ['placeholder', 'title', 'aria-label', 'value'].forEach((attr) => {
      if (!element.hasAttribute(attr)) return;
      const original = element.getAttribute(attr) || '';
      const fixed = repairMojibakeText(original);
      if (fixed !== original) {
        element.setAttribute(attr, fixed);
        if (attr === 'value' && 'value' in element) {
          element.value = fixed;
        }
      }
    });
  });
}

window.repairMojibakeText = repairMojibakeText;
window.repairUiMojibake = repairUiMojibake;

const PRACTICE_SPECIALTY_META = {
  general: {
    key: 'general',
    label: 'Médecin généraliste',
    shortLabel: 'Généraliste',
    doctorBadgeLabel: 'MÉDECIN',
    doctorSpecialtyLine: 'MÉDECIN GÉNÉRALISTE',
    sectionId: null,
    report: {
      kicker: 'Compte-rendu de médecine générale',
      heroTitle: 'Rapport médical général',
      heroSubtitle: 'Synthèse clinique générale du cabinet.',
      badge: 'Généraliste',
      typeLabel: 'Rapport médical général',
      defaultMotif: 'Rapport médical général',
      objectLabel: 'Motif / Objet *',
      objectPlaceholder: 'Ex: Bilan clinique général',
      contextLabel: 'Contexte clinique *',
      contextPlaceholder: 'Décrivez le contexte, les antécédents et l’évolution clinique.',
      findingsLabel: 'Constatations / Examen *',
      findingsPlaceholder: 'Résumez l’examen clinique, les constantes et les résultats utiles.',
      careLabel: 'Prise en charge / Traitement',
      carePlaceholder: 'Traitement, conduite à tenir, examens demandés...',
      recommendationsLabel: 'Recommandations / Suites à donner',
      recommendationsPlaceholder: 'Surveillance, contrôle, examens complémentaires...',
      objectTitle: 'Objet du rapport',
      contextTitle: 'Contexte clinique',
      findingsTitle: 'Constatations cliniques',
      careTitle: 'Prise en charge',
      conclusionTitle: 'Conclusion et recommandations',
      printTitle: 'RAPPORT MÉDICAL',
      printSubtitle: 'Rapport clinique général'
    },
    aiPromptIntro: 'Tu es un médecin généraliste. Génère un compte rendu de consultation professionnel, concis et clair en français.'
  },
  mpr: {
    key: 'mpr',
    label: 'Médecin MPR',
    shortLabel: 'MPR',
    doctorBadgeLabel: 'MÉDECIN MPR',
    doctorSpecialtyLine: 'MÉDECIN SPÉCIALISTE EN MÉDECINE PHYSIQUE ET RÉADAPTATION',
    sectionId: 'rehabilitation',
    report: {
      kicker: 'Rapport de rééducation',
      heroTitle: 'Rapport structuré',
      heroSubtitle: 'Bilan fonctionnel, évolution clinique et conduite rééducative.',
      badge: 'Rapport',
      typeLabel: 'Rapport',
      defaultMotif: 'Bilan de rééducation',
      objectLabel: 'Motif / Objet *',
      objectPlaceholder: 'Ex: Bilan fonctionnel de rééducation',
      contextLabel: 'Contexte fonctionnel *',
      contextPlaceholder: 'Terrain, antécédents, limitations fonctionnelles, évolution...',
      findingsLabel: 'Constatations / Bilan clinique *',
      findingsPlaceholder: 'Examen clinique, bilan articulaire, force, douleur, autonomie...',
      careLabel: 'Prise en charge rééducative',
      carePlaceholder: 'Rééducation, appareillage, séances, objectifs thérapeutiques...',
      recommendationsLabel: 'Recommandations / Suites à donner',
      recommendationsPlaceholder: 'Exercices, poursuite du protocole, avis complémentaires...',
      objectTitle: 'Objet du rapport',
      contextTitle: 'Contexte fonctionnel',
      findingsTitle: 'Bilan clinique et fonctionnel',
      careTitle: 'Prise en charge rééducative',
      conclusionTitle: 'Conclusion et recommandations',
      printTitle: 'RAPPORT',
      printSubtitle: 'Rapport de rééducation'
    },
    aiPromptIntro: 'Tu es un médecin MPR (Médecine Physique et Réadaptation). Génère un compte rendu de consultation professionnel, structuré et concis en français.'
  },
  cardiology: {
    key: 'cardiology',
    label: 'Cardiologue',
    shortLabel: 'Cardiologie',
    doctorBadgeLabel: 'CARDIOLOGUE',
    doctorSpecialtyLine: 'MÉDECIN SPÉCIALISTE EN CARDIOLOGIE',
    sectionId: 'cardiology',
    report: {
      kicker: 'Compte-rendu cardiologique',
      heroTitle: 'Rapport cardiologique',
      heroSubtitle: 'Synthèse cardiovasculaire, examens et stratégie de suivi.',
      badge: 'Cardiologie',
      typeLabel: 'Rapport cardiologique',
      defaultMotif: 'Bilan cardiologique',
      objectLabel: 'Motif / Objet cardiologique *',
      objectPlaceholder: 'Ex: Bilan cardiologique, suivi HTA, douleur thoracique',
      contextLabel: 'Contexte cardiovasculaire *',
      contextPlaceholder: 'Terrain, facteurs de risque, antécédents cardio-vasculaires...',
      findingsLabel: 'Constatations / Examen cardiologique *',
      findingsPlaceholder: 'Examen clinique, TA, FC, ECG, écho, Holter, biologie...',
      careLabel: 'Prise en charge / Traitement',
      carePlaceholder: 'Traitement cardio-vasculaire, adaptation thérapeutique, examens...',
      recommendationsLabel: 'Suivi / Recommandations',
      recommendationsPlaceholder: 'Contrôle, hygiène de vie, surveillance, orientation...',
      objectTitle: 'Objet du rapport',
      contextTitle: 'Contexte cardiovasculaire',
      findingsTitle: 'Examen cardiologique et explorations',
      careTitle: 'Prise en charge thérapeutique',
      conclusionTitle: 'Conclusion et suivi recommandé',
      printTitle: 'RAPPORT CARDIOLOGIQUE',
      printSubtitle: 'Rapport de cardiologie'
    },
    aiPromptIntro: 'Tu es un cardiologue. Génère un compte rendu de consultation cardiologique professionnel, structuré et concis en français.'
  },
  dentistry: {
    key: 'dentistry',
    label: 'Dentiste',
    shortLabel: 'Dentisterie',
    doctorBadgeLabel: 'DENTISTE',
    doctorSpecialtyLine: 'MÉDECIN DENTISTE',
    sectionId: 'dentistry',
    report: {
      kicker: 'Compte-rendu bucco-dentaire',
      heroTitle: 'Rapport bucco-dentaire',
      heroSubtitle: 'Constatations cliniques, soins et stratégie dentaire.',
      badge: 'Dentisterie',
      typeLabel: 'Rapport bucco-dentaire',
      defaultMotif: 'Bilan bucco-dentaire',
      objectLabel: 'Motif / Objet dentaire *',
      objectPlaceholder: 'Ex: Bilan bucco-dentaire, contrôle post-soin, douleur dentaire',
      contextLabel: 'Contexte bucco-dentaire *',
      contextPlaceholder: 'Antécédents, plainte fonctionnelle, contexte du soin...',
      findingsLabel: 'Constatations / Examen *',
      findingsPlaceholder: 'Examen clinique, état dentaire, imagerie, lésions...',
      careLabel: 'Soins / Traitement',
      carePlaceholder: 'Soins réalisés, traitement proposé, plan de traitement...',
      recommendationsLabel: 'Recommandations / Suites à donner',
      recommendationsPlaceholder: 'Hygiène, contrôle, actes à prévoir, surveillance...',
      objectTitle: 'Objet du rapport',
      contextTitle: 'Contexte bucco-dentaire',
      findingsTitle: 'Constatations cliniques et radiologiques',
      careTitle: 'Soins réalisés et proposés',
      conclusionTitle: 'Conclusion et recommandations',
      printTitle: 'RAPPORT BUCCO-DENTAIRE',
      printSubtitle: 'Rapport dentaire'
    },
    aiPromptIntro: 'Tu es un dentiste. Génère un compte rendu bucco-dentaire professionnel, structuré et concis en français.'
  }
};

PRACTICE_SPECIALTY_META.urology = {
  key: 'urology',
  label: 'Urologue',
  shortLabel: 'Urologie',
  doctorBadgeLabel: 'UROLOGUE',
  doctorSpecialtyLine: 'طبيب المسالك البولية',
  sectionId: null,
  report: {
    kicker: 'Compte rendu urologique',
    heroTitle: 'Compte rendu d urologie',
    heroSubtitle: 'Indication, organe explore, description et conclusion.',
    badge: 'Urologie',
    typeLabel: 'Compte rendu urologique',
    defaultMotif: 'Compte rendu d echographie urologique',
    objectLabel: 'Indications *',
    objectPlaceholder: 'Ex: Lombalgies, douleurs inguinales droites, pesanteur scrotale',
    organLabel: 'Organe examine *',
    organPlaceholder: 'Ex: Rein droit, vessie, prostate...',
    contextLabel: 'Organe / Zone *',
    contextPlaceholder: 'Ex: Rein droit, vessie, prostate...',
    findingsLabel: 'Description / Resultats *',
    findingsPlaceholder: 'Decrire les constatations echographiques et cliniques...',
    careLabel: 'Details complementaires',
    carePlaceholder: 'Observations additionnelles si necessaire...',
    recommendationsLabel: 'Conclusion *',
    recommendationsPlaceholder: 'Conclusion diagnostique et conduite a tenir...',
    objectTitle: 'Indication',
    organTitle: 'Organe examine',
    contextTitle: 'Organe / Zone',
    findingsTitle: 'Description et resultats',
    careTitle: 'Details complementaires',
    conclusionTitle: 'Conclusion',
    printTitle: "COMPTE-RENDU D'ECHOGRAPHIE",
    printSubtitle: 'Rapport urologique'
  },
  aiPromptIntro: 'Tu es un urologue. Genere un compte rendu d echographie urologique structure et concis en francais.'
};

Object.assign(PRACTICE_SPECIALTY_META.mpr.report, {
  kicker: 'Compte rendu MPR',
  heroTitle: 'Compte rendu m\u00e9dical MPR',
  heroSubtitle: 'Bilan clinique, bilan fonctionnel et conduite th\u00e9rapeutique de r\u00e9adaptation.',
  badge: 'Compte rendu',
  typeLabel: 'Compte rendu MPR',
  defaultMotif: 'Compte rendu MPR',
  objectLabel: 'Indications *',
  objectPlaceholder: 'Ex: Lombalgie chronique, bilan fonctionnel, suivi de r\u00e9\u00e9ducation',
  organLabel: 'Organe / Zone *',
  organPlaceholder: 'Ex: Epaule droite, genou gauche...',
  careLabel: 'Prise en charge th\u00e9rapeutique et r\u00e9\u00e9ducative',
  recommendationsLabel: 'Conclusion / Recommandations',
  recommendationsPlaceholder: 'Conclusion clinique, exercices, suites, avis compl\u00e9mentaires...',
  objectTitle: 'Indication',
  organTitle: 'Organe / Zone examinee',
  contextTitle: 'Ant\u00e9c\u00e9dents et contexte fonctionnel',
  findingsTitle: 'Examen clinique et bilan fonctionnel',
  careTitle: 'Prise en charge th\u00e9rapeutique et r\u00e9\u00e9ducative',
  conclusionTitle: 'Conclusion',
  printTitle: 'COMPTE-RENDU MPR',
  printSubtitle: 'M\u00e9decine Physique et R\u00e9adaptation'
});

Object.assign(PRACTICE_SPECIALTY_META.cardiology.report, {
  objectLabel: 'Indications *',
  objectPlaceholder: 'Ex: Douleur thoracique, palpitations, dyspnee',
  organLabel: 'Organe / Zone *',
  organPlaceholder: 'Ex: Coeur, valves cardiaques...',
  contextLabel: 'Organe / Zone *',
  contextPlaceholder: 'Ex: Coeur, aorte, pericarde...',
  findingsLabel: 'Description / Resultats *',
  findingsPlaceholder: 'Decrire les resultats cliniques et paracliniques...',
  recommendationsLabel: 'Conclusion *',
  recommendationsPlaceholder: 'Conclusion cardiologique et suivi recommande...',
  objectTitle: 'Indication',
  organTitle: 'Organe / Zone examinee',
  contextTitle: 'Organe / Zone',
  findingsTitle: 'Description et resultats',
  careTitle: 'Details complementaires',
  conclusionTitle: 'Conclusion'
});

const CONSULTATION_ACT_META = {
  consultation: { label: 'Consultation médicale', specialties: ['general', 'mpr', 'cardiology', 'dentistry', 'urology'] },
  ecg: { label: 'ECG de repos', specialties: ['cardiology'] },
  ecgstress: { label: 'ECG d\'effort', specialties: ['cardiology'] },
  echo: { label: 'Échographie', specialties: ['general', 'mpr', 'cardiology', 'urology'] },
  holtermapa: { label: 'Holter / MAPA', specialties: ['cardiology'] },
  kine: { label: 'Séance kiné', specialties: ['mpr'] },
  reduction: { label: 'Réduction', specialties: ['general', 'mpr'] },
  infiltration: { label: 'Infiltration', specialties: ['general', 'mpr'] },
  electrotherapie: { label: 'Électrothérapie', specialties: ['mpr'] },
  massage: { label: 'Massage', specialties: ['mpr'] },
  tecartherapie: { label: 'Tecarthérapie', specialties: ['mpr'] },
  ondesdechoc: { label: 'Ondes de choc', specialties: ['mpr'] },
  mesotherapie: { label: 'Mésothérapie', specialties: ['mpr'] },
  lasertherapie: { label: 'Laser thérapie', specialties: ['mpr'] },
  dryneedling: { label: 'Dry needling', specialties: ['mpr'] },
  osteopathie: { label: 'Ostéopathie', specialties: ['mpr'] },
  other: { label: 'Autre acte', specialties: ['general', 'mpr', 'cardiology', 'dentistry', 'urology'] }
};

const CONSULTATION_ACT_LABEL_OVERRIDES = {
  cardiology: {
    consultation: 'Consultation cardiologique',
    echo: 'Échocardiographie',
    ecg: 'ECG de repos',
    ecgstress: 'ECG d\'effort',
    holtermapa: 'Holter / MAPA',
    other: 'Autre acte cardiologique'
  }
};

function normalizePracticeSpecialtyKey(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'general';
  if (['general', 'generaliste', 'généraliste', 'generalist', 'medecin', 'médecin'].includes(raw)) return 'general';
  if (['mpr', 'rehabilitation', 'rééducation', 'reeducation', 'medecine physique', 'médecine physique'].includes(raw)) return 'mpr';
  if (['cardiology', 'cardiologie', 'cardiologue', 'cardiologist'].includes(raw)) return 'cardiology';
  if (['dentistry', 'dentiste', 'dentaire', 'dentist'].includes(raw)) return 'dentistry';
  if (['urology', 'urologue', 'urologie', 'urologist', 'طبيب المسالك البولية', 'المسالك البولية'].includes(raw)) return 'urology';
  return PRACTICE_SPECIALTY_META[raw] ? raw : 'general';
}

function getPracticeSpecialtyMeta(value = 'general') {
  const key = normalizePracticeSpecialtyKey(value);
  return PRACTICE_SPECIALTY_META[key] || PRACTICE_SPECIALTY_META.general;
}

function getAvailablePracticeSpecialties(config = window._packageConfig || null) {
  const enabledKeys = getEnabledPracticeSpecialties(config);
  return enabledKeys
    .map((key) => PRACTICE_SPECIALTY_META[key])
    .filter((meta) => meta && meta.key)
    .map((meta) => ({
      key: meta.key,
      label: meta.label || meta.shortLabel || meta.key
    }));
}

function getEnabledPracticeSpecialties(config = window._packageConfig || null) {
  if (config?.enabledSpecialties) {
    try {
      const rawList = Array.isArray(config.enabledSpecialties)
        ? config.enabledSpecialties
        : JSON.parse(config.enabledSpecialties);
      const normalizedList = rawList
        .map((entry) => normalizePracticeSpecialtyKey(entry))
        .filter((entry) => PRACTICE_SPECIALTY_META[entry]);
      const unique = [...new Set(normalizedList)];
      return unique.length ? unique : ['general'];
    } catch (_) {
      // Fall back to legacy feature columns below.
    }
  }

  const specialties = ['general'];
  if (config?.featureRehabilitation === 1 || config?.featureRehabilitation === true || config?.featureRehabilitation === '1') {
    specialties.push('mpr');
  }
  if (config?.featureCardiology === 1 || config?.featureCardiology === true || config?.featureCardiology === '1') {
    specialties.push('cardiology');
  }
  if (config?.featureDentistry === 1 || config?.featureDentistry === true || config?.featureDentistry === '1') {
    specialties.push('dentistry');
  }
  if (config?.featureUrology === 1 || config?.featureUrology === true || config?.featureUrology === '1') {
    specialties.push('urology');
  }
  return specialties;
}

function resolveActivePracticeSpecialty(config = window._packageConfig || null) {
  const userSpecialty = normalizePracticeSpecialtyKey(
    currentUserSpecialty || localStorage.getItem('currentUserSpecialty') || ''
  );
  const assistantSelectedDoctorSpecialty = normalizePracticeSpecialtyKey(
    window.selectedDoctorSpecialty || ''
  );
  const enabled = getEnabledPracticeSpecialties(config);
  const requested = normalizePracticeSpecialtyKey(config?.activeSpecialty || enabled[0] || 'general');

  if (currentUserRole === 'assistant' && assistantSelectedDoctorSpecialty !== 'general') {
    return assistantSelectedDoctorSpecialty;
  }

  if (userSpecialty !== 'general' && (enabled.includes(userSpecialty) || userSpecialty === 'urology')) {
    return userSpecialty;
  }

  if (requested !== 'general' && (enabled.includes(requested) || requested === 'urology')) {
    return requested;
  }

  if (enabled.length > 1) {
    return 'general';
  }

  if (enabled.length === 1) return enabled[0];
  return 'general';
}

function getActivePracticeSpecialtyMeta(config = window._packageConfig || null) {
  return getPracticeSpecialtyMeta(resolveActivePracticeSpecialty(config));
}

function normalizeConsultationActLookupToken(value) {
  const repairedValue = typeof repairMojibakeText === 'function'
    ? repairMojibakeText(value)
    : String(value || '');

  return String(repairedValue || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getAllowedConsultationActValues(config = window._packageConfig || null) {
  const activeSpecialty = resolveActivePracticeSpecialty(config);
  return Object.entries(CONSULTATION_ACT_META)
    .filter(([, meta]) => Array.isArray(meta.specialties) && meta.specialties.includes(activeSpecialty))
    .map(([actValue]) => actValue);
}

function getConsultationActLabel(actValue, config = window._packageConfig || null) {
  const normalized = resolveConsultationActValue(actValue);
  if (!normalized) return '';

  const activeSpecialty = resolveActivePracticeSpecialty(config);
  const overrideLabel = CONSULTATION_ACT_LABEL_OVERRIDES[activeSpecialty]?.[normalized];
  if (overrideLabel) return overrideLabel;

  const resolvedLabel = CONSULTATION_ACT_META[normalized]?.label || normalized;
  return typeof repairMojibakeText === 'function'
    ? repairMojibakeText(resolvedLabel)
    : resolvedLabel;
}

function resolveConsultationActValue(rawValue) {
  const normalized = String(rawValue || '').trim();
  if (!normalized) return '';
  if (CONSULTATION_ACT_META[normalized]) return normalized;

  const lookupToken = normalizeConsultationActLookupToken(normalized);

  const directMatch = Object.entries(CONSULTATION_ACT_META).find(([key, meta]) => {
    return normalizeConsultationActLookupToken(key) === lookupToken
      || normalizeConsultationActLookupToken(meta?.label) === lookupToken;
  });
  if (directMatch) return directMatch[0];

  for (const specialtyOverrides of Object.values(CONSULTATION_ACT_LABEL_OVERRIDES)) {
    const matchedOverride = Object.entries(specialtyOverrides).find(([, label]) => {
      return normalizeConsultationActLookupToken(label) === lookupToken;
    });
    if (matchedOverride) return matchedOverride[0];
  }

  return normalized;
}

function isConsultationActEnabled(actValue, config = window._packageConfig || null) {
  const normalized = resolveConsultationActValue(actValue);
  if (!normalized) return false;
  return getAllowedConsultationActValues(config).includes(normalized);
}

function filterConsultationActsByActiveSpecialty(rawActs, config = window._packageConfig || null) {
  const acts = Array.isArray(rawActs) ? rawActs : [rawActs];
  return acts
    .map((act) => String(act || '').trim())
    .filter((act) => act && isConsultationActEnabled(act, config));
}

function getPracticeDoctorSpecialtyText(settings = cachedSettings, specialtyKey = null) {
  const manualSpecialty = String(settings?.doctorSpecialty || '').trim();
  if (manualSpecialty) {
    return manualSpecialty;
  }
  return getPracticeSpecialtyMeta(specialtyKey || resolveActivePracticeSpecialty(window._packageConfig)).doctorSpecialtyLine;
}

async function ensureSettingsLoaded() {
  if (cachedSettings) return cachedSettings;
  try {
    const result = await window.api.settings.get();
    if (result.success && result.data) {
      cachedSettings = result.data;
    }
  } catch (error) {
    console.error('Error loading settings cache:', error);
  }
  return cachedSettings;
}

function getCabinetLogoDataUrl() {
  const logo = (cachedSettings && cachedSettings.cabinetLogoDataUrl) || '';
  if (typeof logo !== 'string') return '';
  if (!logo.startsWith('data:image/')) return '';
  return logo;
}

function getCabinetWatermarkLogoDataUrl() {
  const logo = (cachedSettings && cachedSettings.cabinetWatermarkLogoDataUrl) || '';
  if (typeof logo !== 'string') return '';
  if (!logo.startsWith('data:image/')) return '';
  return logo;
}

function getAppBrandLogoSrc() {
  const activeSpecialty = typeof resolveActivePracticeSpecialty === 'function'
    ? resolveActivePracticeSpecialty(window._packageConfig)
    : 'general';
  const userSpecialty = normalizePracticeSpecialtyKey(currentUserSpecialty || localStorage.getItem('currentUserSpecialty') || '');
  const specialtyLogoMap = {
    general: userSpecialty === 'general' && currentUserRole === 'doctor' ? 'assets/Généraliste.png' : 'assets/logo.png',
    mpr: 'assets/MPR.png',
    cardiology: 'assets/Cardiologue.png',
    dentistry: 'assets/Dentiste.png'
  };
  if (specialtyLogoMap[activeSpecialty]) {
    return specialtyLogoMap[activeSpecialty];
  }
  const appLogo = document.querySelector('.app-brand-logo');
  if (appLogo && typeof appLogo.src === 'string' && appLogo.src) {
    return appLogo.src;
  }
  return 'assets/logo.png';
}

function getDocumentEditorLogoHTML() {
  const logoDataUrl = getCabinetLogoDataUrl();
  const logoSrc = logoDataUrl || getAppBrandLogoSrc();
  return `<img src="${escapeHTML(logoSrc)}" alt="Logo du cabinet">`;
}

function refreshDocumentEditorLogos() {
  document.querySelectorAll('.document-editor-logo').forEach((logoEl) => {
    if (!logoEl) return;
    logoEl.innerHTML = getDocumentEditorLogoHTML();
    logoEl.classList.toggle('is-fallback', !getCabinetLogoDataUrl());
  });
}
const patientRecordsCache = {
  consultations: [],
  prescriptions: [],
  sickLeaves: [],
  appointments: []
};
const documentModalState = {
  invoice: {
    consultationId: null,
    patientId: null,
    documentId: null,
    data: {}
  },
  rapport: {
    consultationId: null,
    patientId: null,
    documentId: null,
    data: {},
    readOnly: false
  }
};

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Read a File object as base64 string (with data URL prefix)
 * @param {File} file - The file to read
 * @returns {Promise<string>} - Base64 data URL string
 */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Keep the full data URL (e.g., "data:image/png;base64,...")
      resolve(reader.result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function convertBufferToUint8Array(bufferLike) {
  if (!bufferLike) return null;

  if (bufferLike instanceof ArrayBuffer) {
    return new Uint8Array(bufferLike);
  }

  if (ArrayBuffer.isView(bufferLike)) {
    return new Uint8Array(bufferLike.buffer);
  }

  if (Array.isArray(bufferLike)) {
    return new Uint8Array(bufferLike);
  }

  if (typeof bufferLike === 'object') {
    if (Array.isArray(bufferLike.data)) {
      return new Uint8Array(bufferLike.data);
    }
    if (bufferLike.type === 'Buffer' && Array.isArray(bufferLike.data)) {
      return new Uint8Array(bufferLike.data);
    }
  }

  return null;
}

function openPdfFromResult(result, successMessage) {
  if (!result?.success) {
    showNotification(`❌ Erreur: ${result?.error || 'Génération impossible'}`, 'error');
    return false;
  }

  const pdfBytes = convertBufferToUint8Array(result.data);
  if (!pdfBytes) {
    showNotification('❌ Erreur: Flux PDF invalide', 'error');
    return false;
  }

  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, '_blank');

  if (printWindow) {
    showNotification(successMessage, 'success');
  } else {
    showNotification('⚠️ Veuillez autoriser les pop-ups', 'warning');
  }

  return true;
}

// Package config is now an inline section (data-section="package-config")
// No longer need separate window function

function parseMedicationsField(rawValue) {
  if (!rawValue) return [];
  if (Array.isArray(rawValue)) return rawValue;
  if (typeof rawValue === 'string') {
    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('Impossible de parser les médicaments:', error, rawValue);
      return [];
    }
  }
  return [];
}

function escapeHTML(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.getCabinetLogoDataUrl = getCabinetLogoDataUrl;
window.getCabinetWatermarkLogoDataUrl = getCabinetWatermarkLogoDataUrl;
window.getAppBrandLogoSrc = getAppBrandLogoSrc;
window.getDocumentEditorLogoHTML = getDocumentEditorLogoHTML;
window.refreshDocumentEditorLogos = refreshDocumentEditorLogos;
window.normalizePracticeSpecialtyKey = normalizePracticeSpecialtyKey;
window.getPracticeSpecialtyMeta = getPracticeSpecialtyMeta;
window.getAvailablePracticeSpecialties = getAvailablePracticeSpecialties;
window.getEnabledPracticeSpecialties = getEnabledPracticeSpecialties;
window.resolveActivePracticeSpecialty = resolveActivePracticeSpecialty;
window.getActivePracticeSpecialtyMeta = getActivePracticeSpecialtyMeta;
window.getPracticeDoctorSpecialtyText = getPracticeDoctorSpecialtyText;
window.CONSULTATION_ACT_META = CONSULTATION_ACT_META;
window.getConsultationActLabel = getConsultationActLabel;
window.resolveConsultationActValue = resolveConsultationActValue;
window.getAllowedConsultationActValues = getAllowedConsultationActValues;
window.isConsultationActEnabled = isConsultationActEnabled;
window.filterConsultationActsByActiveSpecialty = filterConsultationActsByActiveSpecialty;

function formatDocumentDateLabel(value = null) {
  const parts = getAlgeriaDateParts(value);
  if (!parts) {
    return '';
  }
  return `${parts.day}/${parts.month}/${parts.year}`;
}

function formatDateToInputValue(value) {
  const parts = getAlgeriaDateParts(value);
  if (!parts) {
    return '';
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatDateToDDMMYYYY(value) {
  const parts = getAlgeriaDateParts(value);
  if (!parts) {
    return '';
  }
  return `${parts.day}/${parts.month}/${parts.year}`;
}

const ALGERIA_TIME_ZONE = 'Africa/Algiers';

function getAlgeriaDateParts(value = null) {
  if (!value) {
    return getAlgeriaDatePartsFromDate(new Date());
  }

  if (typeof value === 'string') {
    const isoDateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoDateMatch) {
      return {
        year: isoDateMatch[1],
        month: isoDateMatch[2],
        day: isoDateMatch[3]
      };
    }

    const frDateMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (frDateMatch) {
      return {
        year: frDateMatch[3],
        month: frDateMatch[2],
        day: frDateMatch[1]
      };
    }
  }

  const dateObj = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateObj.getTime())) {
    return null;
  }

  return getAlgeriaDatePartsFromDate(dateObj);
}

function getAlgeriaDatePartsFromDate(date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ALGERIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    return null;
  }

  return { year, month, day };
}

function getTodayInAlgeria() {
  return formatDateToInputValue();
}

window.getTodayInAlgeria = getTodayInAlgeria;

function calculatePatientAgeYears(dateString) {
  if (!dateString) return null;
  const birthDate = new Date(dateString);
  if (Number.isNaN(birthDate.getTime())) return null;
  const diff = Date.now() - birthDate.getTime();
  return Math.max(0, Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000)));
}

function formatCurrencyDisplay(value) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  const numberValue = Number(value);
  if (Number.isFinite(numberValue)) {
    return `${numberValue.toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })} DA`;
  }
  return String(value);
}

function formatRichTextHtml(value, fallback = '-') {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  return escapeHTML(String(value)).replace(/\n/g, '<br>');
}

function cleanTextValue(value, fallback = '') {
  if (value === null || value === undefined) {
    return fallback;
  }
  const text = String(value).trim();
  return text || fallback;
}

function initializePasswordToggles(root = document) {
  const scope = root || document;
  const passwordInputs = scope.querySelectorAll('input[type="password"]:not([data-password-toggle-ready])');

  passwordInputs.forEach((input) => {
    input.dataset.passwordToggleReady = 'true';

    const wrapper = document.createElement('div');
    wrapper.className = 'password-field-wrapper';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'password-toggle-btn';
    toggle.textContent = '👁';
    toggle.title = 'Afficher le mot de passe';
    toggle.setAttribute('aria-label', 'Afficher le mot de passe');
    toggle.addEventListener('click', () => {
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      toggle.textContent = isHidden ? '🙈' : '👁';
      const actionLabel = isHidden ? 'Masquer le mot de passe' : 'Afficher le mot de passe';
      toggle.title = actionLabel;
      toggle.setAttribute('aria-label', actionLabel);
    });

    wrapper.appendChild(toggle);
  });
}

function parseDocumentPayload(rawPayload) {
  if (!rawPayload) return {};
  if (typeof rawPayload === 'string') {
    try {
      return JSON.parse(rawPayload);
    } catch (error) {
      console.warn('Impossible de parser le payload document:', error);
      return {};
    }
  }
  if (typeof rawPayload === 'object') {
    return { ...rawPayload };
  }
  return {};
}

function getSickLeaveTemplateFieldsFromInputs() {
  const careInput = document.getElementById('sickleave-care-text');
  const restInput = document.getElementById('sickleave-rest-days');
  const ippInput = document.getElementById('sickleave-ipp-estimate');
  const daysInput = document.getElementById('sickleave-days-display');
  const outingsInput = document.getElementById('sickleave-allowed-outings');
  return {
    careText: (careInput?.value || '').trim(),
    restDays: (restInput?.value || '').trim(),
    numberOfDays: (daysInput?.value || '').trim(),
    ippEstimate: (ippInput?.value || '').trim(),
    allowedOutings: Boolean(outingsInput?.checked)
  };
}

function parseSickLeaveTemplateMetadata(rawValue) {
  if (!rawValue) return null;
  try {
    const parsed = JSON.parse(rawValue);
    if (parsed && typeof parsed === 'object') {
      return {
        careText: (parsed.careText || '').trim(),
        restDays: (parsed.restDays || '').trim(),
        ippEstimate: (parsed.ippEstimate || '').trim()
      };
    }
  } catch (error) {
    console.warn('Impossible de parser les données du certificat:', error);
  }
  return null;
}

const FRENCH_NUMBER_UNITS = [
  'zero', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'
];

function convertFrenchUnderHundred(value) {
  const number = Number(value);
  if (number < 17) return FRENCH_NUMBER_UNITS[number];
  if (number < 20) return `dix-${FRENCH_NUMBER_UNITS[number - 10]}`;

  if (number < 70) {
    const tensMap = {
      20: 'vingt',
      30: 'trente',
      40: 'quarante',
      50: 'cinquante',
      60: 'soixante'
    };
    const tens = Math.floor(number / 10) * 10;
    const units = number % 10;
    const base = tensMap[tens];

    if (units === 0) return base;
    if (units === 1) return `${base} et un`;
    return `${base}-${convertFrenchUnderHundred(units)}`;
  }

  if (number < 80) {
    if (number === 71) return 'soixante et onze';
    return `soixante-${convertFrenchUnderHundred(number - 60)}`;
  }

  if (number === 80) return 'quatre-vingts';
  return `quatre-vingt-${convertFrenchUnderHundred(number - 80)}`;
}

function convertFrenchUnderThousand(value) {
  const number = Number(value);
  if (number < 100) return convertFrenchUnderHundred(number);

  const hundreds = Math.floor(number / 100);
  const remainder = number % 100;
  let label = hundreds === 1 ? 'cent' : `${FRENCH_NUMBER_UNITS[hundreds]} cent`;

  if (remainder === 0 && hundreds > 1) {
    label += 's';
  }

  return remainder === 0
    ? label
    : `${label} ${convertFrenchUnderHundred(remainder)}`;
}

function convertFrenchInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  if (number === 0) return FRENCH_NUMBER_UNITS[0];
  if (number < 0) return `moins ${convertFrenchInteger(Math.abs(number))}`;
  if (number < 1000) return convertFrenchUnderThousand(number);

  if (number < 1000000) {
    const thousands = Math.floor(number / 1000);
    const remainder = number % 1000;
    const thousandsLabel = thousands === 1 ? 'mille' : `${convertFrenchUnderThousand(thousands)} mille`;
    return remainder === 0
      ? thousandsLabel
      : `${thousandsLabel} ${convertFrenchUnderThousand(remainder)}`;
  }

  const millions = Math.floor(number / 1000000);
  const remainder = number % 1000000;
  const millionsLabel = millions === 1 ? 'un million' : `${convertFrenchInteger(millions)} millions`;
  return remainder === 0
    ? millionsLabel
    : `${millionsLabel} ${convertFrenchInteger(remainder)}`;
}

function convertNumberToFrenchWords(rawValue) {
  const value = String(rawValue || '').trim().replace(/\s+/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(value)) return '';

  const [integerPart, decimalPart] = value.split('.');
  let label = convertFrenchInteger(Number(integerPart));

  if (decimalPart && Number(decimalPart) !== 0) {
    const decimalLabel = decimalPart
      .split('')
      .map((digit) => FRENCH_NUMBER_UNITS[Number(digit)] || digit)
      .join(' ');
    label = `${label} virgule ${decimalLabel}`;
  }

  return label;
}

function formatFrenchNumericDisplay(rawValue) {
  const value = String(rawValue || '').trim().replace(/\s+/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(value)) return String(rawValue || '').trim();

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(rawValue || '').trim();
  if (Number.isInteger(numericValue)) return String(numericValue);
  return String(numericValue).replace('.', ',');
}

function formatValueWithWords(rawValue, { unitSingular = '', unitPlural = '', isPercentage = false } = {}) {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) return '';

  const numericSource = isPercentage
    ? trimmed.replace(/\s+/g, '').replace('%', '')
    : trimmed;
  const words = convertNumberToFrenchWords(numericSource);

  if (!words) return trimmed;

  if (isPercentage) {
    return `${formatFrenchNumericDisplay(numericSource)}% (${words} pour cent)`;
  }

  const numericValue = Number(String(numericSource).replace(',', '.'));
  const unitLabel = unitSingular
    ? (numericValue === 1 ? unitSingular : (unitPlural || `${unitSingular}s`))
    : '';

  return unitLabel
    ? `${formatFrenchNumericDisplay(numericSource)} (${words}) ${unitLabel}`
    : `${formatFrenchNumericDisplay(numericSource)} (${words})`;
}

function formatRestDaysWithWords(restDays) {
  return formatValueWithWords(restDays, { unitSingular: 'jour', unitPlural: 'jours' });
}

function formatIppEstimateWithWords(ippEstimate) {
  return formatValueWithWords(ippEstimate, { isPercentage: true });
}

function buildSickLeaveDiagnosisText({ careText = '', restDays = '', ippEstimate = '', numberOfDays = '', allowedOutings = false } = {}) {
  const placeholder = '______________________________________________________________';
  const cleanCare = careText || placeholder;
  const effectiveDays = String(restDays || numberOfDays || '').trim();
  const daysLabel = formatRestDaysWithWords(effectiveDays) || (effectiveDays ? `${effectiveDays} jour(s)` : placeholder);
  const ippLabel = formatIppEstimateWithWords(ippEstimate) || ippEstimate || '';
  const rawDoctorName = typeof normalizeDoctorDisplayName === 'function'
    ? normalizeDoctorDisplayName(cachedSettings?.doctorName || '')
    : String(cachedSettings?.doctorName || '').trim();
  const doctorName = rawDoctorName || 'Docteur';

  const sections = [
    `Je soussignee Dr ${doctorName} certifie avoir vu et examine`,
    `le/la patient(e) suivi(e) a notre niveau pour la prise en charge de ${cleanCare}.`,
    `Le present certificat mentionne :`,
    `- Nombre de jours : ${daysLabel}.`
  ];

  if (allowedOutings) {
    sections.push(`- Sorties autorisees.`);
  }

  if (ippLabel) {
    sections.push(`- IPP estimee a ${ippLabel}.`);
  }

  return sections.join('\n');
}

function autoResizeSickLeavePreview() {
  const preview = document.getElementById('sickleave-preview-text');
  if (!preview) return;
  preview.style.overflowY = 'hidden';
  preview.style.height = 'auto';
  preview.style.height = `${preview.scrollHeight}px`;
}

function updateSickLeavePreview() {
  const preview = document.getElementById('sickleave-preview-text');
  if (!preview) return '';
  const fields = getSickLeaveTemplateFieldsFromInputs();
  const template = buildSickLeaveDiagnosisText(fields);
  preview.value = template;
  autoResizeSickLeavePreview();
  updateSickLeaveSummary();
  return template;
}

function updateSickLeaveSummary() {
  const periodEl = document.getElementById('sickleave-period-summary');
  const outingsEl = document.getElementById('sickleave-outings-summary');
  const restEl = document.getElementById('sickleave-rest-summary');
  const patientEl = document.getElementById('sickleave-patient-summary');

  if (patientEl) {
    const patientName = currentPatientData
      ? `${currentPatientData.lastName || ''} ${currentPatientData.firstName || ''}`.trim()
      : '-';
    patientEl.textContent = patientName || '-';
  }

  const startValue = document.getElementById('sickleave-start-date')?.value;
  const endValue = document.getElementById('sickleave-end-date')?.value;
  const restValue = document.getElementById('sickleave-rest-days')?.value;
  const daysValue = document.getElementById('sickleave-days-display')?.value;
  const outingsAllowed = document.getElementById('sickleave-allowed-outings')?.checked;

  if (periodEl) {
    const startLabel = formatDateToDDMMYYYY(startValue);
    const endLabel = formatDateToDDMMYYYY(endValue);
    periodEl.textContent = startLabel && endLabel ? `${startLabel} → ${endLabel}` : '-';
  }

  if (outingsEl) {
    outingsEl.textContent = outingsAllowed ? 'Autorisées' : 'Non autorisées';
  }

  if (restEl) {
    restEl.textContent = formatRestDaysWithWords(daysValue || restValue) || '-';
  }
}

function hydrateSickLeaveTemplateFields(fields = {}, sickLeave = null) {
  const careInput = document.getElementById('sickleave-care-text');
  if (careInput) careInput.value = fields.careText || '';

  const restInput = document.getElementById('sickleave-rest-days');
  if (restInput) {
    if (fields.restDays) {
      restInput.value = fields.restDays;
    } else if (sickLeave?.numberOfDays) {
      restInput.value = sickLeave.numberOfDays;
    } else {
      restInput.value = '';
    }
  }

  const daysInput = document.getElementById('sickleave-days-display');
  if (daysInput && !daysInput.value) {
    daysInput.value = fields.restDays || sickLeave?.numberOfDays || '';
  }

  const ippInput = document.getElementById('sickleave-ipp-estimate');
  if (ippInput) ippInput.value = fields.ippEstimate || '';

  sickLeaveRestDaysDirty = Boolean(fields.restDays);
  updateSickLeavePreview();
}

function handleSickLeaveDateChange() {
  const startInput = document.getElementById('sickleave-start-date');
  const endInput = document.getElementById('sickleave-end-date');
  const daysDisplay = document.getElementById('sickleave-days-display');
  const restInput = document.getElementById('sickleave-rest-days');
  if (!startInput || !endInput || !daysDisplay) {
    return;
  }

  const startValue = startInput.value;
  const endValue = endInput.value;

  if (startValue && endValue) {
    const startDate = new Date(startValue);
    const endDate = new Date(endValue);
    const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    if (Number.isFinite(days) && days > 0) {
      daysDisplay.value = days;
      if (restInput) restInput.value = String(days);
    } else {
      daysDisplay.value = '';
      if (restInput) restInput.value = '';
    }
  } else {
    daysDisplay.value = '';
    if (restInput) restInput.value = '';
  }

  updateSickLeavePreview();
}

// Handle days input change - calculate end date from start date + days
function handleSickLeaveDaysChange() {
  const startInput = document.getElementById('sickleave-start-date');
  const endInput = document.getElementById('sickleave-end-date');
  const daysDisplay = document.getElementById('sickleave-days-display');
  const restInput = document.getElementById('sickleave-rest-days');
  
  if (!startInput || !endInput || !daysDisplay) return;
  
  const days = parseInt(daysDisplay.value, 10);
  const startValue = startInput.value;
  
  if (startValue && days > 0) {
    const startDate = new Date(startValue);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days - 1);
    
    // Format end date as YYYY-MM-DD
    const year = endDate.getFullYear();
    const month = String(endDate.getMonth() + 1).padStart(2, '0');
    const day = String(endDate.getDate()).padStart(2, '0');
    endInput.value = `${year}-${month}-${day}`;
    
    if (restInput) {
      restInput.value = String(days);
    }
  } else if (restInput) {
    restInput.value = Number.isFinite(days) && days > 0 ? String(days) : '';
  }
  
  updateSickLeavePreview();
}

function attachSickLeaveTemplateListeners() {
  const careInput = document.getElementById('sickleave-care-text');
  if (careInput) {
    careInput.addEventListener('input', () => updateSickLeavePreview());
  }

  const ippInput = document.getElementById('sickleave-ipp-estimate');
  if (ippInput) {
    ippInput.addEventListener('input', () => updateSickLeavePreview());
  }

  const startInput = document.getElementById('sickleave-start-date');
  const endInput = document.getElementById('sickleave-end-date');
  const daysInput = document.getElementById('sickleave-days-display');
  
  startInput?.addEventListener('change', handleSickLeaveDateChange);
  endInput?.addEventListener('change', handleSickLeaveDateChange);
  
  // Add listener for days input to calculate end date
  daysInput?.addEventListener('input', handleSickLeaveDaysChange);
  document.getElementById('sickleave-allowed-outings')?.addEventListener('change', () => updateSickLeavePreview());
}

function getDefaultFactureData({ consultation = null, settings = null } = {}) {
  const mainLabel = consultation?.consultationType || consultation?.type || 'Consultation';
  const defaultUnit = settings?.defaultConsultationFee && !Number.isNaN(Number(settings.defaultConsultationFee))
    ? Number(settings.defaultConsultationFee)
    : '';
  const sessions = consultation?.sessions || '';
  const rawAmount = consultation?.amount;
  const numericAmount = Number.isFinite(Number(rawAmount)) ? Number(rawAmount) : '';
  const normalizedUnit = Number.isFinite(Number(consultation?.unitPrice)) ? Number(consultation.unitPrice) : '';
  const unitPrice = normalizedUnit || numericAmount || defaultUnit;
  const totalPrice = sessions && Number.isFinite(Number(unitPrice))
    ? Number(sessions) * Number(unitPrice)
    : numericAmount || defaultUnit || '';

  return {
    mainLabel,
    numberOfSessions: sessions || '',
    rhythm: consultation?.treatment ? 'Selon prescription' : '',
    unitPrice: unitPrice === '' ? '' : Number(unitPrice),
    totalPrice: totalPrice === '' ? '' : Number(totalPrice),
    notes: '',
    additionalItems: [],
    invoiceDate: consultation?.consultationDate
      ? formatDateToInputValue(consultation.consultationDate)
      : formatDateToInputValue(new Date())
  };
}

function normalizeFactureNumericValue(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const normalizedValue = Number(String(value).replace(',', '.'));
  return Number.isFinite(normalizedValue) ? normalizedValue : '';
}

function normalizeFactureAdditionalItem(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return { label: '', amount: '' };
  }

  return {
    label: cleanTextValue(raw.label || raw.description || raw.title || raw.name, ''),
    amount: normalizeFactureNumericValue(raw.amount ?? raw.price ?? raw.totalPrice ?? raw.total)
  };
}

function normalizeFacturePayload(raw = {}, context = {}) {
  const defaults = getDefaultFactureData(context);

  if (!raw || typeof raw !== 'object') {
    return { ...defaults };
  }

  const additionalItemsSource = Array.isArray(raw.additionalItems)
    ? raw.additionalItems
    : Array.isArray(raw.lineItems)
      ? raw.lineItems
      : [];

  return {
    mainLabel: cleanTextValue(raw.mainLabel || raw.primaryLabel || defaults.mainLabel, defaults.mainLabel),
    numberOfSessions: normalizeFactureNumericValue(raw.numberOfSessions ?? raw.sessions),
    rhythm: cleanTextValue(raw.rhythm, defaults.rhythm),
    unitPrice: normalizeFactureNumericValue(raw.unitPrice ?? raw.price ?? defaults.unitPrice),
    totalPrice: normalizeFactureNumericValue(raw.totalPrice ?? defaults.totalPrice),
    notes: cleanTextValue(raw.notes, defaults.notes),
    additionalItems: additionalItemsSource
      .map((item) => normalizeFactureAdditionalItem(item))
      .filter((item) => item.label || item.amount !== ''),
    invoiceDate: formatDateToInputValue(raw.invoiceDate || raw.date || raw.updatedAt || raw.createdAt || defaults.invoiceDate) || defaults.invoiceDate
  };
}

function calculateFactureTotals(raw = {}, context = {}) {
  const normalized = normalizeFacturePayload(raw, context);
  const sessionsCount = Number(normalized.numberOfSessions);
  const unitPrice = Number(normalized.unitPrice);
  const computedBaseTotal = Number.isFinite(sessionsCount) && Number.isFinite(unitPrice)
    ? sessionsCount * unitPrice
    : Number.isFinite(unitPrice)
      ? unitPrice
      : 0;
  const fallbackBaseTotal = normalized.additionalItems.length === 0
    ? (
        normalized.totalPrice !== ''
          ? Number(normalized.totalPrice) || 0
          : (normalized.unitPrice !== '' ? Number(normalized.unitPrice) || 0 : 0)
      )
    : 0;
  const baseTotal = computedBaseTotal || fallbackBaseTotal;
  const additionalTotal = normalized.additionalItems.reduce((sum, item) => {
    const amount = Number(item.amount);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);
  const storedTotal = Number(normalized.totalPrice);
  const grandTotal = normalized.totalPrice !== '' && Number.isFinite(storedTotal)
    ? storedTotal
    : baseTotal + additionalTotal;

  return {
    baseTotal,
    additionalTotal,
    grandTotal
  };
}

function getDefaultRapportBody(patient = {}) {
  const fullName = patient ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() : '';
  return `Patient(e) ${fullName || ''} s'est présenté(e) à notre cabinet le ____ pour prise en charge.
L'examen initial était en faveur de ____.
Actuellement, il/elle présente ____ nécessitant ____.`;
}

function getDefaultRapportData({ patient = {}, consultation = null } = {}) {
  const baseDate = consultation?.consultationDate || consultation?.date || consultation?.createdAt || new Date();
  const specialtyMeta = getActivePracticeSpecialtyMeta(window._packageConfig);
  return {
    date: formatDateToInputValue(baseDate),
    specialtyKey: specialtyMeta.key,
    specialtyLabel: specialtyMeta.label,
    reportType: specialtyMeta.report.typeLabel,
    documentTitle: specialtyMeta.report.printTitle || specialtyMeta.report.typeLabel || 'COMPTE RENDU',
    motif: consultation?.reason || specialtyMeta.report.defaultMotif,
    organFindings: [],
    organTarget: '',
    contexte: consultation?.diagnosis || '',
    constats: consultation?.notes || consultation?.examination || consultation?.findings || '',
    priseEnCharge: consultation?.treatment || consultation?.carePlan || '',
    recommandations: ''
  };
}

function normalizeRapportPayload(raw = {}, context = {}) {
  const defaults = getDefaultRapportData(context);
  if (!raw || typeof raw !== 'object') {
    return { ...defaults };
  }

  const legacyBody = cleanTextValue(raw.body || raw.text || '', '');
  const normalizedDateSource = raw.date || raw.emittedAt || raw.updatedAt || raw.createdAt || defaults.date;
  const specialtyKey = normalizePracticeSpecialtyKey(raw.specialtyKey || raw.specialty || raw.specialtyLabel || defaults.specialtyKey);
  const specialtyMeta = getPracticeSpecialtyMeta(specialtyKey);
  const organFindingsSource = Array.isArray(raw.organFindings)
    ? raw.organFindings
    : Array.isArray(raw.organs)
      ? raw.organs
      : [];

  const organFindings = organFindingsSource
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      organ: cleanTextValue(item.organ || item.label || item.target, ''),
      entries: Array.isArray(item.entries)
        ? item.entries
            .filter((entry) => entry && typeof entry === 'object')
            .map((entry) => ({
              key: cleanTextValue(entry.key, ''),
              label: cleanTextValue(entry.label, ''),
              type: cleanTextValue(entry.type, 'text') || 'text',
              placeholder: cleanTextValue(entry.placeholder, ''),
              value: cleanTextValue(entry.value, '')
            }))
        : []
    }))
    .filter((item) => item.organ || item.entries.some((entry) => entry.value));

  const legacyOrgan = cleanTextValue(raw.organTarget || raw.organ || raw.targetOrgan, defaults.organTarget);
  const legacyFindings = cleanTextValue(raw.constats || raw.findings, legacyBody || defaults.constats);
  const legacyCare = cleanTextValue(raw.priseEnCharge || raw['prise_charge'] || raw.treatment, defaults.priseEnCharge);
  const resolvedOrganFindings = organFindings.length
    ? organFindings
    : (legacyOrgan || legacyFindings || legacyCare)
      ? [{
          organ: legacyOrgan,
          entries: [
            {
              key: 'legacy_findings',
              label: specialtyMeta.report.findingsTitle || 'Description',
              type: 'textarea',
              placeholder: '',
              value: legacyFindings
            },
            {
              key: 'legacy_care',
              label: specialtyMeta.report.careTitle || 'Details complementaires',
              type: 'textarea',
              placeholder: '',
              value: legacyCare
            }
          ].filter((entry) => entry.value)
        }]
      : [];

  return {
    date: formatDateToInputValue(normalizedDateSource) || defaults.date,
    specialtyKey,
    specialtyLabel: cleanTextValue(raw.specialtyLabel || raw.specialty || specialtyMeta.label, specialtyMeta.label),
    reportType: cleanTextValue(raw.reportType || raw.reportKind, specialtyMeta.report.typeLabel),
    documentTitle: cleanTextValue(raw.documentTitle || raw.title || raw.reportTitle, defaults.documentTitle),
    motif: cleanTextValue(raw.motif || raw.subject, defaults.motif),
    organFindings: resolvedOrganFindings,
    organTarget: legacyOrgan,
    contexte: cleanTextValue(raw.contexte || raw.context, legacyBody || defaults.contexte),
    constats: legacyFindings,
    priseEnCharge: legacyCare,
    recommandations: cleanTextValue(raw.recommandations || raw.recommendations, defaults.recommandations)
  };
}

window.normalizeFacturePayload = normalizeFacturePayload;
window.calculateFactureTotals = calculateFactureTotals;

function setPatientRecordTablePlaceholder(tbodyId, columns, message) {
  const tbody = document.getElementById(tbodyId);
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="${columns}" class="text-center empty-row">${message}</td></tr>`;
  }
}

function resetPatientRecordsView(message = 'Sélectionnez un patient') {
  Object.keys(patientRecordsCache).forEach((key) => {
    patientRecordsCache[key] = [];
  });

  setPatientRecordTablePlaceholder('details-consultations-tbody', 4, message);
  setPatientRecordTablePlaceholder('details-prescriptions-tbody', 3, message);
  setPatientRecordTablePlaceholder('details-sickleaves-tbody', 5, message);
  setPatientRecordTablePlaceholder('details-appointments-tbody', 5, message);
  renderPatientDocumentWidget();
}

function formatConsultationOptionLabel(consultation) {
  const rawDate = consultation.date || consultation.consultationDate || consultation.createdAt;
  const dateLabel = rawDate ? new Date(rawDate).toLocaleDateString('fr-FR') : 'Sans date';
  const reason = consultation.reason || consultation.type || consultation.diagnosis || 'Consultation';
  return `${dateLabel} • ${reason}`;
}

function getPatientDocumentSpecialtyKey() {
  const rawSpecialty = String(
    (typeof currentUserSpecialty !== 'undefined' && currentUserSpecialty)
      || localStorage.getItem('currentUserSpecialty')
      || (typeof currentUserRole !== 'undefined' ? currentUserRole : '')
      || ''
  ).trim().toLowerCase();

  if (['dentist', 'dentiste', 'dentistry', 'dentaire'].includes(rawSpecialty)) return 'dentiste';
  if (['cardio', 'cardiologie', 'cardiologue'].includes(rawSpecialty)) return 'cardiologue';
  if (['mpr', 'physio', 'rehab', 'rééducation', 'reeducation'].includes(rawSpecialty)) return 'mpr';
  return rawSpecialty || 'general';
}

function getPatientDocumentSpecialtyConfig() {
  const key = getPatientDocumentSpecialtyKey();
  const configs = {
    dentiste: {
      label: 'Dentiste',
      imaging: [
        { label: 'Panoramique dentaire', type: 'radio', details: 'Radiographie panoramique dentaire', indication: 'Bilan dentaire / orientation diagnostique' },
        { label: 'Cone Beam CT', type: 'scanner', details: 'Cone Beam CT dentaire ciblé', indication: 'Étude 3D pré-thérapeutique ou lésion dentaire' },
        { label: 'Rétro-alvéolaire', type: 'radio', details: 'Radiographie rétro-alvéolaire ciblée', indication: 'Douleur dentaire / contrôle endodontique' },
        { label: 'Télécrâne', type: 'radio', details: 'Téléradiographie de profil', indication: 'Bilan orthodontique' }
      ],
      orientations: [
        { label: 'Radiologue', specialty: 'Radiologue', motif: 'Bilan d’imagerie dentaire orienté' },
        { label: 'Chirurgie maxillo-faciale', specialty: 'Autre', motif: 'Avis spécialisé en chirurgie maxillo-faciale' },
        { label: 'ORL', specialty: 'ORL', motif: 'Avis ORL selon contexte sinusien ou maxillo-facial' }
      ]
    },
    cardiologue: {
      label: 'Cardiologue',
      imaging: [
        { label: 'ECG', type: 'other', details: 'Électrocardiogramme de repos', indication: 'Bilan cardiologique' },
        { label: 'Échocardiographie', type: 'echo', details: 'Échocardiographie transthoracique', indication: 'Évaluation morphologique et fonctionnelle cardiaque' },
        { label: 'Holter ECG', type: 'other', details: 'Holter ECG 24h / 48h', indication: 'Trouble du rythme suspecté' },
        { label: 'Épreuve d’effort', type: 'other', details: 'Épreuve d’effort', indication: 'Bilan d’ischémie / capacité fonctionnelle' },
        { label: 'Angio-scanner coronaire', type: 'scanner', details: 'Angio-scanner coronaire', indication: 'Exploration coronaire non invasive' },
        { label: 'IRM cardiaque', type: 'irm', details: 'IRM cardiaque', indication: 'Caractérisation myocardique / bilan spécialisé' }
      ],
      orientations: [
        { label: 'Rythmologue', specialty: 'Cardiologue', motif: 'Avis spécialisé en rythmologie' },
        { label: 'Radiologue', specialty: 'Radiologue', motif: 'Imagerie cardiovasculaire spécialisée' },
        { label: 'Urgences', specialty: 'Autre', motif: 'Orientation urgente selon le contexte clinique' }
      ]
    },
    mpr: {
      label: 'MPR',
      imaging: [
        { label: 'Rx ostéo-articulaire', type: 'radio', details: 'Radiographie ostéo-articulaire ciblée', indication: 'Bilan de douleur ou limitation fonctionnelle' },
        { label: 'IRM rachis / articulation', type: 'irm', details: 'IRM rachis ou articulation selon clinique', indication: 'Bilan lésionnel et fonctionnel' },
        { label: 'EMG / ENMG', type: 'emg', details: 'EMG / ENMG', indication: 'Bilan neuro-musculaire' },
        { label: 'Doppler', type: 'doppler', details: 'Doppler vasculaire selon indication', indication: 'Bilan vasculaire complémentaire' },
        { label: 'Kinésithérapie', type: 'kine', details: 'Rééducation fonctionnelle', indication: 'Programme de réadaptation' }
      ],
      orientations: [
        { label: 'Kinésithérapeute', specialty: 'Kinesitherapeute', motif: 'Prise en charge rééducative fonctionnelle' },
        { label: 'Orthopédiste', specialty: 'Orthopediste', motif: 'Avis orthopédique spécialisé' },
        { label: 'Neurologue', specialty: 'Neurologue', motif: 'Avis neurologique / bilan neuro-musculaire' },
        { label: 'Rhumatologue', specialty: 'Rhumatologue', motif: 'Avis rhumatologique spécialisé' }
      ]
    },
    general: {
      label: 'Général',
      imaging: [
        { label: 'Analyses', type: 'analyses', details: '', indication: 'Bilan biologique' },
        { label: 'Radiographie', type: 'radio', details: '', indication: 'Bilan radiologique' },
        { label: 'Échographie', type: 'echo', details: '', indication: 'Bilan échographique' },
        { label: 'Scanner', type: 'scanner', details: '', indication: 'Bilan scanner' }
      ],
      orientations: [
        { label: 'Spécialiste', specialty: 'Autre', motif: 'Avis spécialisé' },
        { label: 'Radiologue', specialty: 'Radiologue', motif: 'Bilan complémentaire' }
      ]
    }
  };

  return configs[key] || configs.general;
}

window.patientDocumentPresetMap = window.patientDocumentPresetMap || {};

function registerPatientDocumentPreset(group, preset) {
  const id = `${group}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  window.patientDocumentPresetMap[id] = preset;
  return id;
}

function buildPatientDocumentPresetButton(group, preset) {
  const id = registerPatientDocumentPreset(group, preset);
  return `
    <button type="button" class="patient-documents-chip" onclick="openPatientDocumentPreset('${id}')">
      <span>${escapeHTML(preset.label)}</span>
    </button>
  `;
}

function openPatientDocumentPreset(presetId) {
  const preset = window.patientDocumentPresetMap?.[presetId];
  if (!preset) return;

  if (preset.specialty || preset.motif) {
    handlePatientDocumentAction('orientation', preset);
    return;
  }

  handlePatientDocumentAction('bonpour', preset);
}

function renderPatientDocumentWidget() {
  const panel = document.getElementById('patient-documents-panel');
  if (!panel) return;

  if (!currentPatientId) {
    panel.innerHTML = '<div class="document-placeholder">Sélectionnez un patient pour générer les documents.</div>';
    return;
  }

  const patientLabel = currentPatientData
    ? `${currentPatientData.firstName || ''} ${currentPatientData.lastName || ''}`.trim() || 'ce patient'
    : 'ce patient';

  panel.innerHTML = `
    <div class="patient-documents-select">
      <p>Générer un document pour <strong>${escapeHTML(patientLabel)}</strong>.</p>
    </div>
    <div class="patient-documents-actions patient-documents-actions-single">
      <button class="btn btn-small" onclick="handlePatientDocumentAction('ordonnance')">Ordonnance</button>
      <button class="btn btn-small" onclick="handlePatientDocumentAction('certificate')">Certificat médical</button>
      <button class="btn btn-small" onclick="handlePatientDocumentAction('workstop')">Arrêt de travail</button>
      <button class="btn btn-small" onclick="handlePatientDocumentAction('invoice')">Facture</button>
      <button class="btn btn-small" onclick="handlePatientDocumentAction('rapport')">Rapport</button>
      <button class="btn btn-small" onclick="openBonPourModal(currentPatientId)">Faire Svp</button>
      <button class="btn btn-small" onclick="openOrientationModal(currentPatientId)">Orientations</button>
    </div>
  `;
}

function refreshPatientDocumentWidget() {
  renderPatientDocumentWidget();
}

function handlePatientDocumentAction(action, preset = null) {
  if (!currentPatientId) {
    showNotification('Sélectionnez un patient avant de continuer', 'warning');
    return;
  }

  if (action === 'certificate') {
    showSickLeaveForm();
    return;
  }

  if (action === 'workstop') {
    const openWorkStop = typeof showWorkStopForm === 'function'
      ? showWorkStopForm
      : window.showWorkStopForm;
    if (typeof openWorkStop === 'function') {
      openWorkStop();
    } else {
      showNotification('Module arrêt de travail non charge', 'error');
    }
    return;
  }

  if (action === 'ordonnance') {
    const openOrdonnance = typeof openPatientPrescriptionModal === 'function'
      ? openPatientPrescriptionModal
      : window.openPatientPrescriptionModal;
    if (typeof openOrdonnance === 'function') {
      openOrdonnance();
    } else {
      showNotification('Module ordonnance non charge', 'error');
    }
    return;
  }

  if (action === 'invoice') {
    const openInvoice = typeof openPatientLevelFactureModal === 'function'
      ? openPatientLevelFactureModal
      : window.openPatientLevelFactureModal;
    if (typeof openInvoice === 'function') {
      openInvoice(currentPatientId);
    } else {
      showNotification('Module facture non charge', 'error');
    }
    return;
  }

  if (action === 'rapport') {
    const openRapport = typeof openPatientLevelRapportModal === 'function'
      ? openPatientLevelRapportModal
      : window.openPatientLevelRapportModal;
    if (typeof openRapport === 'function') {
      openRapport(currentPatientId);
    } else {
      showNotification('Module rapport non charge', 'error');
    }
    return;
  }

  if (action === 'bonpour') {
    const openBonPour = typeof openBonPourModal === 'function'
      ? openBonPourModal
      : window.openBonPourModal;
    if (typeof openBonPour === 'function') {
      openBonPour(currentPatientId, preset || null);
    } else {
      showNotification('Module bon pour non charge', 'error');
    }
    return;
  }

  if (action === 'orientation') {
    const openOrientation = typeof openOrientationModal === 'function'
      ? openOrientationModal
      : window.openOrientationModal;
    if (typeof openOrientation === 'function') {
      openOrientation(currentPatientId, preset || null);
    } else {
      showNotification('Module orientation non charge', 'error');
    }
    return;
  }
}

window.openPatientDocumentPreset = openPatientDocumentPreset;

/**
 * Initialize date inputs with French locale format (DD/MM/YYYY)
 * Adds visual hints and ensures 24-hour time format
 */
function initializeDateInputs() {
  // Add title/tooltip to all date inputs showing expected format
  document.querySelectorAll('input[type="date"]').forEach(input => {
    input.lang = 'fr-FR';
    input.title = 'Format: JJ/MM/AAAA';
    input.placeholder = 'jj/mm/aaaa';
    input.setAttribute('inputmode', 'numeric');
    // Add a data attribute for reference
    input.dataset.dateFormat = 'dd/mm/yyyy';
  });
  
  // Ensure time inputs show 24-hour format hint
  document.querySelectorAll('input[type="time"]').forEach(input => {
    input.title = 'Format: HH:MM (00:00 - 23:59)';
    input.dataset.timeFormat = '24h';
  });
}

/**
 * Initialize 24-hour time inputs with auto-formatting
 */
function initializeTimeInputs() {
  // Auto-format time inputs as user types
  document.querySelectorAll('.time-input-24h').forEach(input => {
    // Format on input
    input.addEventListener('input', function(e) {
      let value = e.target.value.replace(/[^0-9]/g, '');
      
      if (value.length >= 2) {
        // Insert colon after hours
        value = value.slice(0, 2) + ':' + value.slice(2, 4);
      }
      
      // Limit to 5 characters (HH:MM)
      if (value.length > 5) {
        value = value.slice(0, 5);
      }
      
      e.target.value = value;
    });
    
    // Validate on blur
    input.addEventListener('blur', function(e) {
      let value = e.target.value;
      
      // If empty, set default
      if (!value) {
        e.target.value = '09:00';
        return;
      }
      
      // Parse and validate
      const parts = value.split(':');
      if (parts.length === 2) {
        let hours = parseInt(parts[0], 10) || 0;
        let minutes = parseInt(parts[1], 10) || 0;
        
        // Clamp hours to 0-23
        hours = Math.max(0, Math.min(23, hours));
        // Clamp minutes to 0-59
        minutes = Math.max(0, Math.min(59, minutes));
        
        e.target.value = String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
      } else if (parts.length === 1 && parts[0].length > 0) {
        // Only hours entered
        let hours = parseInt(parts[0], 10) || 0;
        hours = Math.max(0, Math.min(23, hours));
        e.target.value = String(hours).padStart(2, '0') + ':00';
      }
    });
    
    // Set default value if empty
    if (!input.value) {
      input.value = '09:00';
    }
  });
}

// Make initializeDateInputs globally available
window.initializeDateInputs = initializeDateInputs;
window.initializeTimeInputs = initializeTimeInputs;
window.initializePasswordToggles = initializePasswordToggles;

const SPECIALTY_CONFIG = {
  general: {
    accent: '#145da0', // Professional blue
    accentLight: '#2d7fbe',
    accentDark: '#0f4272'
  },
  mpr: {
    accent: '#8b5cf6', // Purple
    accentLight: '#a78bfa',
    accentDark: '#6d28d9'
  },
  cardiology: {
    accent: '#dc2626', // Red
    accentLight: '#ef4444',
    accentDark: '#b91c1c'
  },
  dentistry: {
    accent: '#0f766e', // Teal/cyan
    accentLight: '#14b8a6',
    accentDark: '#115e59'
  },
  urology: {
    accent: '#2563eb', // Blue
    accentLight: '#3b82f6',
    accentDark: '#1d4ed8'
  }
};

function applySpecialtyAccent() {
  const activeSpecialty = typeof resolveActivePracticeSpecialty === 'function'
    ? resolveActivePracticeSpecialty(window._packageConfig)
    : 'general';
  
  const colors = SPECIALTY_CONFIG[activeSpecialty] || SPECIALTY_CONFIG.general;
  
  const root = document.documentElement;
  root.style.setProperty('--primary-color', colors.accent);
  root.style.setProperty('--primary-light', colors.accentLight);
  root.style.setProperty('--primary-dark', colors.accentDark);
  root.style.setProperty('--color-accent', colors.accent);
  console.log(`🎨 Applied specialty colors for active specialty [${activeSpecialty}]:`, colors);
}

window.SPECIALTY_CONFIG = SPECIALTY_CONFIG;
window.applySpecialtyAccent = applySpecialtyAccent;
window.getPatientDocumentSpecialtyConfig = getPatientDocumentSpecialtyConfig;
window.getPatientDocumentSpecialtyKey = getPatientDocumentSpecialtyKey;
