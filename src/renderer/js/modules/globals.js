/**
 * Script principal - Gestion de l'interface PhysioCare
 */

console.log('✅ Main.js script loaded successfully');

let currentPatientId = null;
let currentPatientData = null;
let selectedPatientRequestVersion = 0;
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

async function setSelectedPatient(patientId, { patient = null, source = 'unknown' } = {}) {
  const normalizedPatientId = String(patientId || '').trim();
  if (!normalizedPatientId) return currentPatientData;

  const requestVersion = ++selectedPatientRequestVersion;
  let selectedPatient = patient;

  if (!selectedPatient && String(currentPatientId || '') === normalizedPatientId && currentPatientData) {
    selectedPatient = currentPatientData;
  }

  if (!selectedPatient) {
    try {
      const result = await window.api.patient.getById({
        patientId: normalizedPatientId,
        includeConsultations: false
      });
      if (!result?.success || !result.data) return null;
      selectedPatient = result.data;
    } catch (error) {
      console.error('Error selecting patient:', error);
      return null;
    }
  }

  if (requestVersion !== selectedPatientRequestVersion) return null;

  currentPatientId = selectedPatient.id || normalizedPatientId;
  currentPatientData = selectedPatient;
  window.currentPatientId = currentPatientId;
  window.currentPatientData = currentPatientData;
  window.dispatchEvent(new CustomEvent('medcare:patient-selected', {
    detail: { patientId: currentPatientId, patient: selectedPatient, source }
  }));
  return selectedPatient;
}

window.setSelectedPatient = setSelectedPatient;

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
  orl: {
    key: 'orl',
    label: 'Médecin ORL',
    shortLabel: 'ORL',
    doctorBadgeLabel: 'MÉDECIN ORL',
    doctorSpecialtyLine: 'MÉDECIN SPÉCIALISTE EN OTO-RHINO-LARYNGOLOGIE',
    sectionId: 'orl',
    report: {
      kicker: 'Compte-rendu ORL',
      heroTitle: 'Rapport de consultation ORL',
      heroSubtitle: 'Otoscopie, audiométrie, fibroscopie et conduite thérapeutique.',
      badge: 'ORL',
      typeLabel: 'Compte-rendu ORL',
      defaultMotif: 'Bilan ORL',
      objectLabel: 'Motif / Objet ORL *',
      objectPlaceholder: 'Ex: Bilan otologique, acouphènes, vertiges, rhinopharyngite chronique',
      contextLabel: 'Contexte clinique & Antécédents *',
      contextPlaceholder: 'Antécédents ORL, surdité, exposition au bruit, tabagisme, terrain allergique...',
      findingsLabel: 'Constatations / Examen ORL *',
      findingsPlaceholder: 'Otoscopie OD/OG, rhinoscopie, examen pharyngo-laryngé, aires ganglionnaires...',
      careLabel: 'Explorations & Gestes pratiqués',
      carePlaceholder: 'Audiométrie, tympanométrie, fibroscopie, lavage auriculaire, traitement prescrit...',
      recommendationsLabel: 'Conduite à tenir / Recommandations',
      recommendationsPlaceholder: 'Traitement médical, surveillance audiométrique, précautions, contrôle prévu...',
      objectTitle: 'Motif de consultation',
      contextTitle: 'Contexte et antécédents',
      findingsTitle: 'Examen clinique ORL',
      careTitle: 'Explorations et traitement',
      conclusionTitle: 'Conclusion et recommandations',
      printTitle: 'COMPTE-RENDU ORL',
      printSubtitle: 'Oto-Rhino-Laryngologie'
    },
    aiPromptIntro: 'Tu es un médecin spécialiste en Oto-Rhino-Laryngologie (ORL). Génère un compte rendu de consultation ORL professionnel, structuré et concis en français.'
  },
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
  consultation: { label: 'Consultation médicale', specialties: ['orl', 'general', 'mpr', 'cardiology', 'dentistry', 'urology'] },
  audiometrie: { label: 'Audiométrie tonale / vocale', specialties: ['orl'] },
  tympanometrie: { label: 'Tympanométrie / Impédancemétrie', specialties: ['orl'] },
  fibroscopie: { label: 'Fibroscopie ORL / Nasofibroscopie', specialties: ['orl'] },
  lavage: { label: 'Lavage d\'oreille / Aspiration', specialties: ['orl', 'general'] },
  otoscopie_micro: { label: 'Otoscopie sous microscope', specialties: ['orl'] },
  manoeuvre_vestibulaire: { label: 'Manoeuvre libératoire vestibulaire', specialties: ['orl'] },
  paracentese: { label: 'Paracentèse / Soins otologiques', specialties: ['orl'] },
  ecg: { label: 'ECG de repos', specialties: ['cardiology'] },
  ecgstress: { label: 'ECG d\'effort', specialties: ['cardiology'] },
  echo: { label: 'Échographie', specialties: ['orl', 'general', 'mpr', 'cardiology', 'urology'] },
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
  other: { label: 'Autre acte', specialties: ['orl', 'general', 'mpr', 'cardiology', 'dentistry', 'urology'] }
};

const CONSULTATION_ACT_LABEL_OVERRIDES = {
  orl: {
    consultation: 'Consultation ORL',
    fibroscopie: 'Nasofibroscopie diagnostique',
    audiometrie: 'Bilan audiométrique tonal et vocal',
    echo: 'Échographie cervicale / salivaire',
    lavage: 'Lavage d\'oreille / Aspiration',
    other: 'Autre acte ORL'
  },
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
  if (!raw) return 'orl';
  if (['general', 'generaliste', 'généraliste', 'generalist', 'medecin', 'médecin'].includes(raw)) return 'general';
  if (['orl', 'oto-rhino', 'otorhino', 'ent', 'oto-rhino-laryngologie', 'médecin orl', 'medecin orl', 'orl (oto-rhino-laryngologiste)'].includes(raw)) return 'orl';
  if (['mpr', 'rehabilitation', 'rééducation', 'reeducation', 'medecine physique', 'médecine physique'].includes(raw)) return 'mpr';
  if (['cardiology', 'cardiologie', 'cardiologue', 'cardiologist'].includes(raw)) return 'cardiology';
  if (['dentistry', 'dentiste', 'dentaire', 'dentist'].includes(raw)) return 'dentistry';
  if (['urology', 'urologue', 'urologie', 'urologist', 'طبيب المسالك البولية', 'المسالك البولية'].includes(raw)) return 'urology';
  return PRACTICE_SPECIALTY_META[raw] ? raw : 'orl';
}

function getPracticeSpecialtyMeta(value = 'orl') {
  const key = normalizePracticeSpecialtyKey(value);
  return PRACTICE_SPECIALTY_META[key] || PRACTICE_SPECIALTY_META.orl || PRACTICE_SPECIALTY_META.general;
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
      return unique.length ? unique : ['orl'];
    } catch (_) {
      // Fall back to legacy feature columns below.
    }
  }

  const specialties = [];
  if (config?.featureORL === 1 || config?.featureORL === true || config?.featureORL === '1' || config?.activeSpecialty === 'orl') {
    specialties.push('orl');
  }
  if (config?.featureDentistry === 1 || config?.featureDentistry === true || config?.featureDentistry === '1' || config?.activeSpecialty === 'dentistry') {
    specialties.push('dentistry');
  }
  if (config?.featureGeneral === 1 || config?.featureGeneral === true || config?.activeSpecialty === 'general') {
    specialties.push('general');
  }
  return specialties.length ? [...new Set(specialties)] : ['orl', 'dentistry'];
}

function getCabinetType(config = window._packageConfig || null) {
  const raw = String(config?.cabinetType || '').toLowerCase();
  if (raw === 'singulier' || raw === 'single') return 'single';
  if (raw === 'multiple' || raw === 'multi') return 'multiple';
  const enabled = getEnabledPracticeSpecialties(config);
  return enabled.length > 1 ? 'multiple' : 'single';
}

function resolveActivePracticeSpecialty(config = window._packageConfig || null) {
  const userSpecialty = normalizePracticeSpecialtyKey(
    currentUserSpecialty || localStorage.getItem('currentUserSpecialty') || ''
  );
  const assistantSelectedDoctorSpecialty = normalizePracticeSpecialtyKey(
    window.selectedDoctorSpecialty || ''
  );
  const enabled = getEnabledPracticeSpecialties(config);
  const requested = normalizePracticeSpecialtyKey(config?.activeSpecialty || enabled[0] || 'orl');

  if (currentUserRole === 'assistant' && assistantSelectedDoctorSpecialty) {
    return assistantSelectedDoctorSpecialty;
  }

  if (userSpecialty) {
    return userSpecialty;
  }

  if (requested && enabled.includes(requested)) {
    return requested;
  }

  if (enabled.length === 1) return enabled[0];
  return enabled[0] || 'orl';
}

function getActivePracticeSpecialtyMeta(config = window._packageConfig || null) {
  return getPracticeSpecialtyMeta(resolveActivePracticeSpecialty(config));
}

function enforceSpecialtySidebarVisibility(explicitSpecialty = null) {
  const currentSpecialty = explicitSpecialty || resolveActivePracticeSpecialty();
  const isTest = (typeof currentUserRole !== 'undefined' && currentUserRole === 'test')
    || (typeof currentUsername !== 'undefined' && String(currentUsername).trim().toLowerCase() === 'test')
    || (String(localStorage.getItem('currentUsername') || '').trim().toLowerCase() === 'test')
    || (localStorage.getItem('currentUserRole') === 'test');

  const specialtySectionMap = {
    'orl': ['orl', 'treatment-plans'],
    'dentistry': ['dentistry', 'treatment-plans'],
    'mpr': ['rehabilitation', 'kine-staff', 'daily-summary', 'treatment-plans'],
    'rehabilitation': ['rehabilitation', 'kine-staff', 'daily-summary', 'treatment-plans'],
    'cardiology': ['cardiology', 'treatment-plans']
  };

  const allSpecialtySections = ['orl', 'dentistry', 'rehabilitation', 'kine-staff', 'cardiology'];
  const allowedSections = specialtySectionMap[currentSpecialty] || (currentSpecialty === 'general' ? ['treatment-plans'] : ['orl', 'treatment-plans']);

  allSpecialtySections.forEach((sectionId) => {
    const isAllowed = isTest || allowedSections.includes(sectionId);
    const navItem = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
    if (navItem) {
      navItem.dataset.featureDisabled = isAllowed ? '0' : '1';
      if (isAllowed) {
        navItem.classList.remove('feature-disabled', 'hidden', 'role-hidden');
        navItem.style.display = 'flex';
      } else {
        navItem.classList.add('feature-disabled', 'hidden', 'role-hidden');
        navItem.style.display = 'none';
      }
    }
    const section = document.getElementById(sectionId);
    if (section) {
      if (isAllowed) {
        section.classList.remove('role-hidden', 'feature-disabled');
      } else {
        section.classList.add('role-hidden', 'feature-disabled');
        section.style.display = 'none';
      }
    }
  });

  // Ensure treatment-plans is always visible and available for doctors/practitioners across all specialties
  const plansNavItem = document.querySelector('.nav-item[data-section="treatment-plans"]');
  const plansSection = document.getElementById('treatment-plans');
  const isAssistant = (typeof currentUserRole !== 'undefined' && currentUserRole === 'assistant')
    || (localStorage.getItem('currentUserRole') === 'assistant');
  if (!isAssistant) {
    if (plansNavItem) {
      plansNavItem.dataset.featureDisabled = '0';
      plansNavItem.classList.remove('feature-disabled', 'hidden', 'role-hidden', 'hidden-for-assistant');
      plansNavItem.style.display = 'flex';
    }
    if (plansSection) {
      plansSection.classList.remove('role-hidden', 'feature-disabled', 'hidden-for-assistant');
    }
  }

  document.title = 'MedCareSO v1.0.9';
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
  const staticActs = Object.entries(CONSULTATION_ACT_META)
    .filter(([, meta]) => Array.isArray(meta.specialties) && meta.specialties.includes(activeSpecialty))
    .map(([actValue]) => actValue);

  const customKeys = [];
  if (typeof window !== 'undefined' && window.customConsultationActsMap) {
    Object.keys(window.customConsultationActsMap).forEach((k) => {
      if (!customKeys.includes(k)) customKeys.push(k);
    });
  }
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('medcareso_custom_consultation_acts_v2') : null;
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && typeof saved === 'object') {
        Object.keys(saved).forEach((k) => {
          if (!customKeys.includes(k)) customKeys.push(k);
        });
      }
    }
  } catch (_) { /* ignore */ }

  return [...staticActs, ...customKeys];
}

function getConsultationActLabel(actValue, config = window._packageConfig || null) {
  if (!actValue) return '';
  const strVal = String(actValue).trim();
  if (typeof window !== 'undefined' && window.customConsultationActsMap) {
    if (window.customConsultationActsMap[strVal]?.label) {
      return window.customConsultationActsMap[strVal].label;
    }
    const lower = strVal.toLowerCase();
    if (window.customConsultationActsMap[lower]?.label) {
      return window.customConsultationActsMap[lower].label;
    }
  }

  // Fallback to DOM and localStorage for custom acts
  if (strVal.startsWith('custom_')) {
    if (typeof document !== 'undefined') {
      const cb = document.querySelector(`input[name="acts"][value="${strVal}"], input[value="${strVal}"]`);
      if (cb) {
        const parent = cb.closest('.checkbox-label');
        const span = parent?.querySelector('.act-name-span') || parent?.querySelector('span');
        const txt = span?.textContent?.trim();
        if (txt && !txt.startsWith('custom_')) return txt;
      }
    }
    try {
      const raw = typeof localStorage !== 'undefined'
        ? (localStorage.getItem('medcareso_custom_consultation_acts_v2') || localStorage.getItem('medcareso_custom_consultation_acts'))
        : null;
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && saved[strVal]?.label) {
          if (typeof window !== 'undefined') {
            window.customConsultationActsMap = window.customConsultationActsMap || {};
            window.customConsultationActsMap[strVal] = saved[strVal];
          }
          return saved[strVal].label;
        }
      }
    } catch (_) { /* ignore */ }
    return 'Acte médical';
  }

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
  if (normalized.startsWith('custom_')) return normalized;
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
  if (!actValue) return false;
  const str = String(actValue).trim();
  if (str.startsWith('custom_')) return true;
  if (typeof window !== 'undefined' && window.customConsultationActsMap && window.customConsultationActsMap[str]) {
    return true;
  }
  const normalized = resolveConsultationActValue(actValue);
  if (!normalized) return false;
  if (String(normalized).startsWith('custom_')) return true;
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

function getCustomAppLogoDataUrl() {
  const logo = (cachedSettings && cachedSettings.appLogoDataUrl) || '';
  if (typeof logo !== 'string' || !logo.startsWith('data:image/')) return '';
  return logo;
}

function getDefaultAppBrandLogoSrc() {
  const activeSpecialty = typeof resolveActivePracticeSpecialty === 'function'
    ? resolveActivePracticeSpecialty(window._packageConfig)
    : 'general';
  const userSpecialty = normalizePracticeSpecialtyKey(currentUserSpecialty || localStorage.getItem('currentUserSpecialty') || '');
  const specialtyLogoMap = {
    orl: '../../assets/ORL.png',
    general: 'assets/logo.png',
    mpr: '../../assets/MPR.png',
    cardiology: '../../assets/Cardiologue.png',
    dentistry: '../../assets/Dentiste.png'
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

function getAppBrandLogoSrc() {
  return getCustomAppLogoDataUrl() || getDefaultAppBrandLogoSrc();
}

function refreshAppBrandLogo() {
  const logoSrc = getAppBrandLogoSrc();
  document.querySelectorAll('.app-brand-logo').forEach((logo) => {
    logo.src = logoSrc;
    logo.classList.toggle('app-brand-logo-custom', Boolean(getCustomAppLogoDataUrl()));
  });
}

function getDocumentEditorLogoHTML() {
  const logoDataUrl = getCabinetLogoDataUrl();
  const logoSrc = logoDataUrl || getDefaultAppBrandLogoSrc();
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
  certificates: [],
  workstops: [],
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
window.getCabinetType = getCabinetType;
window.getActivePracticeSpecialtyMeta = getActivePracticeSpecialtyMeta;
window.getPracticeDoctorSpecialtyText = getPracticeDoctorSpecialtyText;
window.CONSULTATION_ACT_META = CONSULTATION_ACT_META;
window.getConsultationActLabel = getConsultationActLabel;
window.resolveConsultationActValue = resolveConsultationActValue;
window.getAllowedConsultationActValues = getAllowedConsultationActValues;
window.isConsultationActEnabled = isConsultationActEnabled;
window.filterConsultationActsByActiveSpecialty = filterConsultationActsByActiveSpecialty;
window.enforceSpecialtySidebarVisibility = enforceSpecialtySidebarVisibility;

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
  const startInput = document.getElementById('sickleave-start-date');
  const endInput = document.getElementById('sickleave-end-date');
  const form = document.getElementById('sickleave-form');
  const documentKind = form?.dataset?.documentKind === 'workstop' ? 'workstop' : 'certificate';

  return {
    careText: (careInput?.value || '').trim(),
    restDays: (restInput?.value || '').trim(),
    numberOfDays: (daysInput?.value || '').trim(),
    ippEstimate: (ippInput?.value || '').trim(),
    allowedOutings: Boolean(outingsInput?.checked),
    startDate: startInput?.value || '',
    endDate: endInput?.value || '',
    documentKind
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

function formatDateFrShort(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).trim();
  return date.toLocaleDateString('fr-FR');
}

// 1 seul jour → "le 24/08/2026" ; plusieurs jours → "du 24/08/2026 au 26/08/2026 inclus"
function buildSickLeavePeriodLabel(startDate, endDate) {
  const start = formatDateFrShort(startDate);
  if (!start) return '';
  const end = formatDateFrShort(endDate);
  if (!end || start === end) return `le ${start}`;
  return `du ${start} au ${end} inclus`;
}
window.buildSickLeavePeriodLabel = buildSickLeavePeriodLabel;

function getDocumentCustomTemplatesMap() {
  try {
    const fromSettings = cachedSettings?.documentCustomTemplates;
    if (typeof fromSettings === 'string' && fromSettings.trim()) {
      return JSON.parse(fromSettings);
    } else if (typeof fromSettings === 'object' && fromSettings) {
      return fromSettings;
    }
    const local = localStorage.getItem('medcareso_doc_custom_templates');
    if (local) return JSON.parse(local);
  } catch {}
  return {};
}

function getDocumentCustomTemplate(docType) {
  const map = getDocumentCustomTemplatesMap();
  const k = String(docType || '').toLowerCase().trim();
  return map[k] || null;
}

function escapeRegexChars(string) {
  return String(string || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractDocumentTemplatePattern(rawText, { doctorName = '', patientName = '', careText = '', daysLabel = '', startDate = '', endDate = '', allowedOutings = false } = {}) {
  let pattern = String(rawText || '');
  if (doctorName && doctorName.trim()) {
    pattern = pattern.replace(new RegExp(`Dr\\s+${escapeRegexChars(doctorName.trim())}`, 'gi'), 'Dr {DOCTOR_NAME}');
    pattern = pattern.replace(new RegExp(escapeRegexChars(doctorName.trim()), 'gi'), '{DOCTOR_NAME}');
  }
  if (patientName && patientName.trim()) {
    pattern = pattern.replace(new RegExp(escapeRegexChars(patientName.trim()), 'gi'), '{PATIENT_NAME}');
  }
  if (careText && careText.trim() && careText.trim().length > 3) {
    pattern = pattern.replace(new RegExp(escapeRegexChars(careText.trim()), 'gi'), '{CARE_TEXT}');
  }
  if (daysLabel && daysLabel.trim()) {
    pattern = pattern.replace(new RegExp(escapeRegexChars(daysLabel.trim()), 'gi'), '{DAYS_LABEL}');
  }

  // Rendre les dates dynamiques : "du X au Y inclus" / "le X" -> {PERIOD}
  const startStr = startDate ? formatDateFrShort(startDate) : '';
  const endStr = endDate ? formatDateFrShort(endDate) : '';
  if (startStr && endStr && startStr !== endStr) {
    pattern = pattern.replace(
      new RegExp(`du\\s*${escapeRegexChars(startStr)}\\s*au\\s*${escapeRegexChars(endStr)}(?:\\s*(?:inclus|incluse))?`, 'gi'),
      '{PERIOD}'
    );
  } else if (startStr && (!endStr || startStr === endStr)) {
    pattern = pattern.replace(new RegExp(`le\\s*${escapeRegexChars(startStr)}`, 'gi'), '{PERIOD}');
  }
  const usedPeriodPlaceholder = pattern.includes('{PERIOD}');
  if (!usedPeriodPlaceholder && startStr) {
    pattern = pattern.split(startStr).join('{START_DATE}');
  }
  if (!usedPeriodPlaceholder && endStr && endStr !== startStr) {
    pattern = pattern.split(endStr).join('{END_DATE}');
  }

  // Rendre l'état des sorties dynamique
  pattern = pattern.replace(/sorties?\s+autoris[eé]e?s?\s*:\s*(oui|non)\s*\./gi, '{OUTINGS_STATE}');
  return pattern;
}

function saveDocumentCustomTemplate(docType, rawText, context = {}) {
  try {
    if (!rawText || !rawText.trim()) return;
    const k = String(docType || '').toLowerCase().trim();
    const pattern = extractDocumentTemplatePattern(rawText, context);
    const map = getDocumentCustomTemplatesMap();
    map[k] = pattern;
    localStorage.setItem('medcareso_doc_custom_templates', JSON.stringify(map));
    if (cachedSettings) {
      cachedSettings.documentCustomTemplates = JSON.stringify(map);
    }
  } catch (err) {
    console.error('Error saving document custom template:', err);
  }
}

function hydrateDocumentTemplate(templatePattern, { doctorName = '', patientName = '', careText = '', daysLabel = '', allowedOutings = false, ippEstimate = '', startDate = '', endDate = '' } = {}) {
  let text = String(templatePattern || '');
  const placeholder = '______________________________________________________________';
  const cleanCare = careText || placeholder;
  const outingsLine = allowedOutings ? '- Sorties autorisees.' : '';
  const outingsState = allowedOutings ? 'Sorties autorisées : OUI.' : 'Sorties autorisées : NON.';
  const periodLabel = typeof buildSickLeavePeriodLabel === 'function' ? buildSickLeavePeriodLabel(startDate, endDate) : '';
  const startLabel = typeof formatDateFrShort === 'function' ? formatDateFrShort(startDate) : '';
  const endLabel = typeof formatDateFrShort === 'function' ? formatDateFrShort(endDate) : '';
  const ippLabel = typeof formatIppEstimateWithWords === 'function' ? formatIppEstimateWithWords(ippEstimate) : (ippEstimate ? `${ippEstimate}%` : '');
  const ippLine = ippLabel ? `- IPP estimee a ${ippLabel}.` : '';

  text = text.replace(/\{DOCTOR_NAME\}/g, doctorName || 'Docteur');
  text = text.replace(/\{PATIENT_NAME\}/g, patientName || 'le/la patient(e)');
  text = text.replace(/\{CARE_TEXT\}/g, cleanCare);
  text = text.replace(/\{DAYS_LABEL\}/g, daysLabel || placeholder);
  text = text.replace(/\{OUTINGS_LINE\}/g, outingsLine);
  text = text.replace(/\{OUTINGS_STATE\}/g, outingsState);
  text = text.replace(/\{PERIOD\}/g, periodLabel || placeholder);
  text = text.replace(/\{START_DATE\}/g, startLabel || placeholder);
  text = text.replace(/\{END_DATE\}/g, endLabel || placeholder);
  text = text.replace(/\{IPP_LINE\}/g, ippLine);

  return text.trim();
}

window.getDocumentCustomTemplate = getDocumentCustomTemplate;
window.saveDocumentCustomTemplate = saveDocumentCustomTemplate;
window.hydrateDocumentTemplate = hydrateDocumentTemplate;
window.extractDocumentTemplatePattern = extractDocumentTemplatePattern;

function buildSickLeaveDiagnosisText({ careText = '', restDays = '', ippEstimate = '', numberOfDays = '', allowedOutings = false, documentKind = 'certificate', startDate = '', endDate = '' } = {}) {
  const placeholder = '______________________________________________________________';
  const cleanCare = careText || placeholder;
  const effectiveDays = String(restDays || numberOfDays || '').trim();
  const daysLabel = formatRestDaysWithWords(effectiveDays) || (effectiveDays ? `${effectiveDays} jour(s)` : placeholder);
  const ippLabel = formatIppEstimateWithWords(ippEstimate) || ippEstimate || '';
  const rawDoctorName = typeof normalizeDoctorDisplayName === 'function'
    ? normalizeDoctorDisplayName(cachedSettings?.doctorName || '')
    : String(cachedSettings?.doctorName || '').trim();
  const doctorName = rawDoctorName || 'Docteur';
  const patient = currentPatientData;
  const patientName = patient ? `${patient.lastName || ''} ${patient.firstName || ''}`.trim() : 'le/la patient(e)';

  const customTemplate = getDocumentCustomTemplate(documentKind || 'certificate');
  if (customTemplate) {
    return hydrateDocumentTemplate(customTemplate, {
      doctorName,
      patientName,
      careText: cleanCare,
      daysLabel,
      allowedOutings,
      ippEstimate,
      startDate,
      endDate
    });
  }

  // Arrêt de travail dédié (totalement séparé du certificat médical)
  if (documentKind === 'workstop') {
    const periodStr = typeof buildSickLeavePeriodLabel === 'function'
      ? buildSickLeavePeriodLabel(startDate, endDate)
      : '';

    const sections = [
      `Je soussigné(e) Dr ${doctorName}, certifie avoir examiné ce jour le/la patient(e) ${patientName}.`,
      `Son état de santé nécessite un arrêt de travail d'une durée de ${daysLabel}${periodStr ? ' ' + periodStr : ''}.`
    ];

    if (cleanCare && cleanCare !== placeholder) {
      sections.push(`Motif médical : ${cleanCare}.`);
    }

    sections.push(allowedOutings ? `Sorties autorisées : OUI.` : `Sorties autorisées : NON.`);

    if (ippLabel) {
      sections.push(`IPP estimée : ${ippLabel}.`);
    }

    return sections.join('\n\n');
  }

  // Certificat médical (intact)
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

let sickLeavePreviewManualEdited = false;

function resetSickLeavePreviewText() {
  sickLeavePreviewManualEdited = false;
  const fields = getSickLeaveTemplateFieldsFromInputs();
  const template = buildSickLeaveDiagnosisText(fields);
  const preview = document.getElementById('sickleave-preview-text');
  if (preview) {
    preview.value = template;
    autoResizeSickLeavePreview();
  }
  updateSickLeaveSummary();
}

function updateSickLeavePreview() {
  const preview = document.getElementById('sickleave-preview-text');
  const fields = getSickLeaveTemplateFieldsFromInputs();
  const template = buildSickLeaveDiagnosisText(fields);
  if (preview && !sickLeavePreviewManualEdited) {
    preview.value = template;
  }
  autoResizeSickLeavePreview();
  updateSickLeaveSummary();
  renderSickLeaveDocumentPreview();
  return preview?.value || template;
}

function fitDocumentPreviewA5(target) {
  const container = typeof target === 'string' ? document.getElementById(target) : target;
  if (!container) return;

  const sheet = container.querySelector('.document-a5-sheet') || container.firstElementChild;
  if (!sheet) return;

  sheet.style.transform = 'none';
  sheet.style.transformOrigin = 'top center';
  sheet.style.margin = '0 auto';
  sheet.style.display = 'block';

  const containerW = container.clientWidth - 16;
  const containerH = container.clientHeight - 16;

  const naturalW = sheet.offsetWidth || 500;
  const naturalH = sheet.scrollHeight || sheet.offsetHeight || 650;

  if (containerW <= 0 || containerH <= 0 || naturalW <= 0 || naturalH <= 0) {
    requestAnimationFrame(() => {
      const cW = container.clientWidth - 16;
      const cH = container.clientHeight - 16;
      const nW = sheet.offsetWidth || 500;
      const nH = sheet.scrollHeight || 650;
      if (cW > 0 && cH > 0 && nW > 0 && nH > 0) {
        const sX = cW / nW;
        const sY = cH / nH;
        const scale = Math.min(sX, sY, 1.0);
        sheet.style.transform = `scale(${scale})`;
        sheet.style.transformOrigin = 'top center';
      }
    });
    return;
  }

  const scaleX = containerW / naturalW;
  const scaleY = containerH / naturalH;
  const scale = Math.min(scaleX, scaleY, 1.0);

  sheet.style.transform = `scale(${scale})`;
  sheet.style.transformOrigin = 'top center';
}
window.fitDocumentPreviewA5 = fitDocumentPreviewA5;

function buildFittedPreviewHtml(html) {
  const fitBlock = `
    <style>
      html, body { overflow: hidden !important; width: 100% !important; height: 100% !important; min-width: 0 !important; background: transparent !important; margin: 0; padding: 0; cursor: grab; box-sizing: border-box; }
      body.is-grabbing { cursor: grabbing !important; user-select: none !important; }
      body.has-scroll { overflow: auto !important; }
      .page { margin-left: auto !important; margin-right: auto !important; transform-origin: top center !important; box-shadow: 0 6px 22px rgba(15, 23, 42, 0.18) !important; transition: transform 0.1s ease-out !important; }
      .preview-zoom-bar {
        position: fixed;
        bottom: 12px;
        right: 12px;
        z-index: 99999;
        display: flex;
        align-items: center;
        gap: 3px;
        background: rgba(15, 23, 42, 0.88);
        backdrop-filter: blur(4px);
        padding: 3px 6px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        color: #ffffff;
        font-family: system-ui, -apple-system, sans-serif;
      }
      .preview-zoom-btn {
        background: rgba(255, 255, 255, 0.18);
        border: 1px solid rgba(255, 255, 255, 0.25);
        color: #ffffff;
        width: 24px;
        height: 24px;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }
      .preview-zoom-btn:hover {
        background: rgba(255, 255, 255, 0.35);
      }
      .preview-zoom-text {
        font-size: 11px;
        font-weight: 600;
        min-width: 42px;
        text-align: center;
        color: #f1f5f9;
        cursor: pointer;
      }
    </style>
    <div class="preview-zoom-bar">
      <span style="font-size: 11px; margin-right: 4px; opacity: 0.85; user-select: none;" title="Glissez avec la souris pour déplacer">✋</span>
      <button type="button" class="preview-zoom-btn" onclick="__adjustZoom(-0.1)" title="Zoom arrière">-</button>
      <span class="preview-zoom-text" id="__zoomLabel" onclick="__resetZoom()" title="Réinitialiser zoom">Fit</span>
      <button type="button" class="preview-zoom-btn" onclick="__adjustZoom(0.1)" title="Zoom avant">+</button>
    </div>
    <script>
      (function () {
        var userZoom = null;
        var baseScale = 1;

        function __fitPreviewPage() {
          var page = document.querySelector('.page');
          if (!page) return;
          var pw = page.offsetWidth || 500;
          var ph = page.scrollHeight || page.offsetHeight || 650;
          if (pw <= 0 || ph <= 0) return;
          baseScale = Math.min((window.innerWidth - 8) / pw, (window.innerHeight - 8) / ph, 1);
          var effectiveScale = userZoom !== null ? userZoom : baseScale;
          page.style.transform = 'scale(' + effectiveScale + ')';
          
          if (userZoom !== null && userZoom > baseScale) {
            document.body.classList.add('has-scroll');
            document.body.style.minHeight = Math.ceil(ph * effectiveScale + 20) + 'px';
          } else {
            document.body.classList.remove('has-scroll');
            document.body.style.minHeight = '100%';
            document.body.style.overflow = 'hidden';
            window.scrollTo(0, 0);
          }

          var lbl = document.getElementById('__zoomLabel');
          if (lbl) {
            lbl.textContent = userZoom !== null ? Math.round(userZoom * 100) + '%' : 'Fit';
          }
        }

        window.__adjustZoom = function(delta) {
          var current = userZoom !== null ? userZoom : baseScale;
          userZoom = Math.min(2.5, Math.max(0.3, Math.round((current + delta) * 10) / 10));
          __fitPreviewPage();
        };

        window.__resetZoom = function() {
          userZoom = null;
          __fitPreviewPage();
        };

        // Click-and-drag hand / pan tool (Main de déplacement)
        var isPanning = false;
        var startX = 0, startY = 0;
        var scrollX = 0, scrollY = 0;

        window.addEventListener('mousedown', function(e) {
          if (e.target.closest && e.target.closest('.preview-zoom-bar')) return;
          if (['BUTTON', 'INPUT', 'TEXTAREA', 'A'].indexOf(e.target.tagName) !== -1) return;
          isPanning = true;
          startX = e.clientX;
          startY = e.clientY;
          scrollX = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
          scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
          document.body.classList.add('is-grabbing');
        });

        window.addEventListener('mousemove', function(e) {
          if (!isPanning) return;
          e.preventDefault();
          var dx = e.clientX - startX;
          var dy = e.clientY - startY;
          window.scrollTo(scrollX - dx, scrollY - dy);
        });

        window.addEventListener('mouseup', function() {
          if (isPanning) {
            isPanning = false;
            document.body.classList.remove('is-grabbing');
          }
        });

        window.addEventListener('wheel', function(e) {
          if (e.ctrlKey) {
            e.preventDefault();
            window.__adjustZoom(e.deltaY < 0 ? 0.1 : -0.1);
          }
        }, { passive: false });

        window.addEventListener('resize', function() {
          if (userZoom === null) __fitPreviewPage();
        });

        [0, 50, 150, 400].forEach(function (d) { setTimeout(__fitPreviewPage, d); });
      })();
    <\/script>
  `;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${fitBlock}</head>`);
  return `${html}${fitBlock}`;
}
window.buildFittedPreviewHtml = buildFittedPreviewHtml;

function renderLiveDocumentPreviewFrame(containerId, html) {
  const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
  if (!container) return;

  let iframe = container.querySelector('iframe.document-live-preview-iframe');
  if (!iframe) {
    container.innerHTML = `
      <iframe class="document-live-preview-iframe" title="Aperçu exact" style="width: 100%; height: 100%; min-height: 420px; border: none; border-radius: 6px; background: transparent; display: block;"></iframe>
    `;
    iframe = container.querySelector('iframe.document-live-preview-iframe');
  }

  if (iframe) {
    iframe.srcdoc = buildFittedPreviewHtml(html);
  }
}
window.renderLiveDocumentPreviewFrame = renderLiveDocumentPreviewFrame;

function renderSickLeaveDocumentPreview() {
  const container = document.getElementById('sickleave-live-preview-sheet');
  if (!container) return;

  const form = document.getElementById('sickleave-form');
  const documentKind = form?.dataset?.documentKind === 'workstop' ? 'workstop' : 'certificate';
  const isWorkstop = documentKind === 'workstop';
  const docTitle = isWorkstop ? 'ARRÊT DE TRAVAIL' : 'CERTIFICAT MÉDICAL';
  const docSubtitle = isWorkstop ? 'Arrêt de travail' : 'Certificat médical';
  const docContentTitle = isWorkstop ? 'Motif de l\'arrêt' : 'Texte du certificat';

  const patient = currentPatientData || {
    firstName: document.getElementById('sickleave-patient-summary')?.textContent || 'Patient',
    lastName: '',
    dateOfBirth: null
  };

  const startValue = document.getElementById('sickleave-start-date')?.value;
  const endValue = document.getElementById('sickleave-end-date')?.value;
  const daysValue = document.getElementById('sickleave-days-display')?.value || document.getElementById('sickleave-rest-days')?.value || '1';
  const outingsAllowed = document.getElementById('sickleave-allowed-outings')?.checked;
  const previewText = document.getElementById('sickleave-preview-text')?.value || document.getElementById('sickleave-care-text')?.value || '';

  const startDateObj = startValue ? new Date(startValue) : new Date();
  const endDateObj = endValue ? new Date(endValue) : new Date();
  const daysCount = parseInt(daysValue, 10) || 1;
  const daysFormatted = typeof formatRestDaysWithWords === 'function' ? formatRestDaysWithWords(daysCount) : `${daysCount} jour(s)`;
  const diagnosis = typeof formatPrintingRichTextHtml === 'function'
    ? formatPrintingRichTextHtml((previewText || "Je soussigné(e) certifie avoir examiné ce jour le/la patient(e) sus-nommé(e)...").trim())
    : (previewText || "Je soussigné(e) certifie avoir examiné ce jour le/la patient(e) sus-nommé(e)...").replace(/\n/g, '<br>');
  const outingsLabel = outingsAllowed ? 'Autorisées' : 'Non autorisées';

  let pageContent = '';
  if (isWorkstop) {
    // Arrêt de travail : aucun cadrage, texte libre
    if (sickLeavePreviewManualEdited || (previewText && previewText.includes('Je soussigné'))) {
      pageContent = `
        <div class="content-box content-box-flat">
          <div class="content-text" style="font-size: 14.5px; line-height: 1.8; white-space: pre-wrap;">${diagnosis}</div>
        </div>
      `;
    } else {
      pageContent = `
        <div class="content-box content-box-flat">
          <h3>Période</h3>
          <div class="period-grid">
            <div class="period-item"><span class="period-label">Début :</span> <span class="period-value">${startDateObj.toLocaleDateString('fr-FR')}</span></div>
            <div class="period-item"><span class="period-label">Fin :</span> <span class="period-value">${endDateObj.toLocaleDateString('fr-FR')}</span></div>
            <div class="period-item"><span class="period-label">Durée :</span> <span class="period-value">${escapePrintingHtml(String(daysFormatted))}</span></div>
            <div class="period-item"><span class="period-label">Sorties :</span> <span class="period-value">${outingsLabel}</span></div>
          </div>
        </div>
        <div class="content-box content-box-flat">
          <h3>Motif de l'arrêt</h3>
          <div class="content-text">${diagnosis}</div>
        </div>
      `;
    }
  } else {
    // Certificat médical : cadrage conservé uniquement pour la période, texte libre sans titre
    pageContent = `
      <div class="content-box">
        <h3>Période</h3>
        <div class="period-grid">
          <div class="period-item"><span class="period-label">Début :</span> <span class="period-value">${startDateObj.toLocaleDateString('fr-FR')}</span></div>
          <div class="period-item"><span class="period-label">Fin :</span> <span class="period-value">${endDateObj.toLocaleDateString('fr-FR')}</span></div>
          <div class="period-item"><span class="period-label">Durée :</span> <span class="period-value">${escapePrintingHtml(String(daysFormatted))}</span></div>
          <div class="period-item"><span class="period-label">Sorties :</span> <span class="period-value">${outingsLabel}</span></div>
        </div>
      </div>
      <div class="document-free-text">
        <div class="content-text">${diagnosis}</div>
      </div>
    `;
  }

  if (typeof buildPrintableHtml === 'function') {
    const html = buildPrintableHtml({
      title: docTitle,
      subtitle: docSubtitle,
      dateLabel: typeof formatPrintingDocumentDateLabel === 'function' ? formatPrintingDocumentDateLabel(new Date()) : new Date().toLocaleDateString('fr-FR'),
      patient,
      bodyContentHtml: pageContent,
      documentType: isWorkstop ? 'workstop' : 'certificate',
      documentNumber: 'REF-' + new Date().toISOString().slice(0, 10).replace(/-/g, ''),
      pages: [pageContent]
    });
    renderLiveDocumentPreviewFrame(container, html);
  }
}

function toggleSickLeaveRawTextEdit() {
  const container = document.getElementById('sickleave-raw-text-container');
  if (!container) return;
  const isHidden = container.style.display === 'none';
  container.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    document.getElementById('sickleave-preview-text')?.focus();
  }
}

function applySickLeavePreset(presetKey) {
  const careInput = document.getElementById('sickleave-care-text');
  const daysDisplay = document.getElementById('sickleave-days-display');
  const outingsCheckbox = document.getElementById('sickleave-allowed-outings');
  if (!careInput) return;

  if (presetKey === 'certif_soins') {
    careInput.value = 'Soins ORL et surveillance médicale au cabinet.';
    if (daysDisplay) daysDisplay.value = '1';
    if (outingsCheckbox) outingsCheckbox.checked = true;
  } else if (presetKey === 'arret_maladie' || presetKey === 'arret_3j') {
    careInput.value = 'Pathologie ORL aiguë nécessitant repos et soins.';
    if (daysDisplay) daysDisplay.value = '3';
    if (outingsCheckbox) outingsCheckbox.checked = true;
  } else if (presetKey === 'arret_5j') {
    careInput.value = 'Infection ORL aiguë avec état fébrile nécessitant repos strict.';
    if (daysDisplay) daysDisplay.value = '5';
    if (outingsCheckbox) outingsCheckbox.checked = true;
  } else if (presetKey === 'arret_7j') {
    careInput.value = 'Affection ORL nécessitant repos à domicile et traitement médical.';
    if (daysDisplay) daysDisplay.value = '7';
    if (outingsCheckbox) outingsCheckbox.checked = true;
  }

  sickLeavePreviewManualEdited = false;
  handleSickLeaveDaysChange();
  updateSickLeavePreview();
}

function saveSickLeaveRawTextAsDefaultTemplate() {
  const customPreviewText = document.getElementById('sickleave-preview-text')?.value;
  if (!customPreviewText || !customPreviewText.trim()) {
    if (typeof showNotification === 'function') {
      showNotification('Le texte brut est vide', 'warning');
    }
    return;
  }
  const form = document.getElementById('sickleave-form');
  const documentKind = form?.dataset?.documentKind === 'workstop' ? 'workstop' : 'certificate';
  const templateFields = (typeof getSickLeaveTemplateFieldsFromInputs === 'function')
    ? getSickLeaveTemplateFieldsFromInputs()
    : { careText: document.getElementById('sickleave-care-text')?.value || '' };
  
  const patient = currentPatientData;
  const patientName = patient ? `${patient.lastName || ''} ${patient.firstName || ''}`.trim() : '';
  const rawDoctorName = typeof normalizeDoctorDisplayName === 'function'
    ? normalizeDoctorDisplayName(cachedSettings?.doctorName || '')
    : String(cachedSettings?.doctorName || '').trim();
  const daysDisplay = document.getElementById('sickleave-days-display')?.value || templateFields.restDays || '1';
  const effectiveDays = String(daysDisplay).trim();
  const daysLabel = typeof formatRestDaysWithWords === 'function' ? formatRestDaysWithWords(effectiveDays) : `${effectiveDays} jour(s)`;

  if (typeof saveDocumentCustomTemplate === 'function') {
    saveDocumentCustomTemplate(documentKind, customPreviewText, {
      doctorName: rawDoctorName || 'Docteur',
      patientName,
      careText: templateFields.careText,
      daysLabel,
      startDate: templateFields.startDate || document.getElementById('sickleave-start-date')?.value || '',
      endDate: templateFields.endDate || document.getElementById('sickleave-end-date')?.value || '',
      allowedOutings: Boolean(templateFields.allowedOutings ?? document.getElementById('sickleave-allowed-outings')?.checked)
    });
  }

  if (typeof showNotification === 'function') {
    showNotification('Modèle de texte brut enregistré par défaut pour tous les prochains documents', 'success');
  }
}

window.saveSickLeaveRawTextAsDefaultTemplate = saveSickLeaveRawTextAsDefaultTemplate;
window.toggleSickLeaveRawTextEdit = toggleSickLeaveRawTextEdit;
window.applySickLeavePreset = applySickLeavePreset;
window.renderSickLeaveDocumentPreview = renderSickLeaveDocumentPreview;

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
  
  const previewInput = document.getElementById('sickleave-preview-text');
  if (previewInput) {
    previewInput.addEventListener('input', () => {
      sickLeavePreviewManualEdited = true;
      autoResizeSickLeavePreview();
      renderSickLeaveDocumentPreview();
    });
  }

  // Add listener for days input to calculate end date
  daysInput?.addEventListener('input', handleSickLeaveDaysChange);
  document.getElementById('sickleave-allowed-outings')?.addEventListener('change', () => updateSickLeavePreview());
}

async function previewSickLeaveDocumentModal() {
  const form = document.getElementById('sickleave-form');
  const documentKind = form?.dataset?.documentKind === 'workstop' ? 'workstop' : 'certificate';
  const docTitle = documentKind === 'workstop' ? 'ARRÊT DE TRAVAIL' : 'CERTIFICAT MÉDICAL';
  const docSubtitle = documentKind === 'workstop' ? 'Arrêt de travail' : 'Certificat médical';
  const docContentTitle = documentKind === 'workstop' ? 'Motif de l\'arrêt' : 'Texte du certificat';
  
  const startDate = document.getElementById('sickleave-start-date')?.value;
  const endDate = document.getElementById('sickleave-end-date')?.value;
  const previewText = document.getElementById('sickleave-preview-text')?.value || '';
  const daysDisplay = document.getElementById('sickleave-days-display')?.value || '1';
  const allowedOutings = document.getElementById('sickleave-allowed-outings')?.checked;
  const patientId = document.getElementById('sickleave-patient-id')?.value || currentPatientId;

  let patient = currentPatientData;
  if (!patient && patientId && window.api?.patient?.getById) {
    try {
      const res = await window.api.patient.getById(patientId);
      if (res?.success && res.data) patient = res.data;
    } catch (_) {}
  }
  if (!patient) {
    patient = { firstName: 'Patient', lastName: '' };
  }

  const startDateObj = startDate ? new Date(startDate) : new Date();
  const endDateObj = endDate ? new Date(endDate) : new Date();
  const outingsLabel = allowedOutings ? 'Autorisées' : 'Non autorisées';
  const daysCount = parseInt(daysDisplay, 10) || 1;
  const daysLabel = typeof formatRestDaysWithWords === 'function'
    ? formatRestDaysWithWords(daysCount)
    : `${daysCount} jour${daysCount > 1 ? 's' : ''}`;

  const diagnosisHtml = typeof formatPrintingRichTextHtml === 'function'
    ? formatPrintingRichTextHtml(previewText || 'Repos médical prescrit.')
    : (previewText || 'Repos médical prescrit.').replace(/\n/g, '<br>');

  const pageContent = `
    <div class="content-box${documentKind === 'workstop' ? ' content-box-flat' : ''}">
      <h3>Période</h3>
      <div class="period-grid">
        <div class="period-item"><span class="period-label">Début :</span> <span class="period-value">${startDateObj.toLocaleDateString('fr-FR')}</span></div>
        <div class="period-item"><span class="period-label">Fin :</span> <span class="period-value">${endDateObj.toLocaleDateString('fr-FR')}</span></div>
        <div class="period-item"><span class="period-label">Durée :</span> <span class="period-value">${daysLabel}</span></div>
        <div class="period-item"><span class="period-label">Sorties :</span> <span class="period-value">${outingsLabel}</span></div>
      </div>
    </div>
    ${documentKind === 'workstop'
      ? `<div class="content-box content-box-flat">
          <h3>Motif de l'arrêt</h3>
          <div class="content-text" style="font-size: 13.5px; line-height: 1.7; white-space: pre-wrap;">${diagnosisHtml}</div>
        </div>`
      : `<div class="document-free-text">
          <div class="content-text" style="font-size: 13.5px; line-height: 1.7; white-space: pre-wrap;">${diagnosisHtml}</div>
        </div>`}
  `;

  if (typeof openA5PrintDocument === 'function') {
    await openA5PrintDocument({
      title: docTitle,
      subtitle: docSubtitle,
      dateLabel: typeof formatPrintingDocumentDateLabel === 'function' ? formatPrintingDocumentDateLabel(new Date()) : new Date().toLocaleDateString('fr-FR'),
      patient,
      bodyContentHtml: pageContent,
      documentType: documentKind,
      pages: [pageContent]
    });
  } else {
    showNotification('Aperçu ouvert', 'info');
  }
}

window.resetSickLeavePreviewText = resetSickLeavePreviewText;
window.previewSickLeaveDocumentModal = previewSickLeaveDocumentModal;

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

  if (['orl', 'oto', 'otorhino', 'oto-rhino-laryngologie', 'ent'].includes(rawSpecialty)) return 'orl';
  if (['dentist', 'dentiste', 'dentistry', 'dentaire'].includes(rawSpecialty)) return 'dentiste';
  if (['cardio', 'cardiologie', 'cardiologue'].includes(rawSpecialty)) return 'cardiologue';
  if (['mpr', 'physio', 'rehab', 'rééducation', 'reeducation'].includes(rawSpecialty)) return 'mpr';
  return rawSpecialty || 'orl';
}

function resolveBonPourDocumentTitle(settings = null) {
  try {
    const s = settings || (typeof getEffectivePrintSettings === 'function' ? getEffectivePrintSettings() : null) || cachedSettings || window.cachedSettings || {};
    if (s && typeof s.documentBonPourTitle === 'string' && s.documentBonPourTitle.trim()) {
      return s.documentBonPourTitle.trim();
    }
  } catch {}
  return 'Demande de Bilan';
}
window.resolveBonPourDocumentTitle = resolveBonPourDocumentTitle;

function getPatientDocumentSpecialtyConfig() {
  const key = getPatientDocumentSpecialtyKey();
  const bilanStandardPreset = {
    label: 'Demande de Bilan Standard',
    type: 'analyses',
    details: [
      '- RADIO DU THORAX',
      '- ECG',
      '- Groupage/Rh',
      '- FNS',
      '- TP/TCK',
      '- Glycémie à jeun',
      '- HbA1C',
      '- VS-CRP',
      '- Ionogramme sanguin',
      '- Urée-créatininémie',
      '- Calcémie-Phosphorémie',
      '- ASLO',
      '- Cholestérol total, HDL, LDL, TG',
      '- Fer sérique',
      '- Bilirubine totale et directe',
      '- TSH',
      '- FT3, FT4',
      '- Sérologie (HIV, Syphilis, VHB, VHC)'
    ].join('\n'),
    indication: 'Bilan complet standard'
  };

  const configs = {
    orl: {
      label: 'ORL (Oto-Rhino-Laryngologie)',
      imaging: [
        bilanStandardPreset,
        { label: 'TDM des Rochers', type: 'scanner', details: '- TDM des rochers (Os temporaux) en coupes millimétriques sans injection\n- Étude anatomique de l\'oreille moyenne, interne, osselets et mastoïdes', indication: 'Bilan d\'otite chronique / hypoacousie / acouphènes / cholestéatome' },
        { label: 'TDM Sinus de la Face', type: 'scanner', details: '- TDM du massif facial et des sinus (coronal et axial sans injection)\n- Étude des méats, complexe ostio-méatal, cloisons et cavités sinusiennes', indication: 'Bilan de sinusite chronique / polypose naso-sinusienne / déviation septale' },
        { label: 'IRM des CAI (Conduits Auditifs)', type: 'irm', details: '- IRM des conduits auditifs internes (CAI) et de l\'angle ponto-cérébelleux\n- Séquences CISS 3D / T2 haute résolution et T1 avec injection de Gadolinium', indication: 'Hypoacousie unilatérale / acouphènes / vertiges / éliminer schwannome vestibulaire' },
        { label: 'IRM Sinus & Cavum', type: 'irm', details: '- IRM du cavum, pharynx et sinus de la face avec injection de Gadolinium\n- Évaluation des tissus mous et extensions', indication: 'Lésion cavum / obstruction nasale unilatérale / adénopathie' },
        { label: 'Échographie Cervicale & Thyroïde', type: 'echo', details: '- Échographie cervicale bilatérale avec étude des aires ganglionnaires\n- Échographie de la glande thyroïde et des glandes salivaires (parotides et sous-maxillaires)', indication: 'Adénopathie cervicale / nodule thyroïdien / tuméfaction salivaire' },
        { label: 'Audiométrie & Tympanométrie', type: 'audio_orl', details: '- Audiométrie tonale liminaire (conduction aérienne et osseuse)\n- Audiométrie vocale (seuil d\'intelligibilité)\n- Tympanométrie avec recherche des réflexes stapédiens', indication: 'Bilan de surdité / acouphènes / hypoacousie de transmission ou perception' },
        { label: 'Bilan Pré-opératoire ORL', type: 'analyses', details: '- NFS / Plaquettes complète\n- TP, TCA, INR, Fibrinogène\n- Groupe Sanguin Rhésus + RAI\n- Glycémie à jeun, Urée, Créatininémie', indication: 'Bilan pré-opératoire (Adénoïdectomie / Amygdalectomie / Septoplastie / Chirurgie otologique)' },
        { label: 'Bilan Vertiges (VNG / PEA)', type: 'audio_orl', details: '- Vidéonystagmographie (VNG) avec épreuves vestibulaires caloriques\n- Potentiels Évoqués Auditifs (PEA) précoces du tronc cérébral', indication: 'Exploration de vertiges / instabilité / syndrome vestibulaire périphérique' },
        { label: 'Nasofibroscopie VADS', type: 'audio_orl', details: '- Nasofibroscopie diagnostique des fosses nasales, du pharynx et du larynx', indication: 'Dysphonie chronique / dysphagie / obstruction nasale' }
      ],
      orientations: [
        { label: 'Radiologue', specialty: 'Radiologue', motif: 'Imagerie ORL spécialisée (TDM rochers/sinus, IRM CAI, Échographie cervicale)' },
        { label: 'Audioprothésiste', specialty: 'Autre', motif: 'Bilan d\'appareillage auditif prothétique' },
        { label: 'Orthophoniste', specialty: 'Autre', motif: 'Rééducation vocale / bilan de déglutition / rééducation tubaire' },
        { label: 'Kinésithérapeute Vestibulaire', specialty: 'Kinesitherapeute', motif: 'Rééducation vestibulaire fonctionnelle' },
        { label: 'Allergologue', specialty: 'Autre', motif: 'Bilan allergologique respiratoire (Prick-tests / RAST pneumallergènes)' }
      ]
    },
    dentiste: {
      label: 'Dentiste / Stomatologie',
      imaging: [
        bilanStandardPreset,
        { label: 'Panoramique dentaire', type: 'radio', details: '- Orthopantomogramme (Radiographie panoramique dentaire numérique)', indication: 'Bilan bucco-dentaire global / orientation diagnostique' },
        { label: 'Cone Beam 3D (CBCT)', type: 'radio', details: '- Cône Beam CT 3D maxillo-mandibulaire haute résolution\n- Étude volumétrique osseuse et repérage du canal mandibulaire / sinus', indication: 'Bilan implantaire / dent de sagesse incluse / lésion péri-apicale' },
        { label: 'Téléradiographie de profil', type: 'radio', details: '- Téléradiographie de profil (Céphalométrie orthodontique)', indication: 'Bilan d\'orthopédie dento-faciale / orthodontie' },
        { label: 'Radiographie des ATM', type: 'radio', details: '- Radiographie / Cone Beam des ATM bouche ouverte et bouche fermée', indication: 'Dysfonctionnement temporo-mandibulaire / craquements / douleurs ATM' },
        { label: 'Bilan Pré-implantaire / Chirurgical', type: 'analyses', details: '- NFS / Plaquettes\n- TP, TCA, INR\n- Glycémie à jeun, HbA1c\n- Calcémie, Vitamine D (25-OH-D3)\n- Créatininémie, Clairance rénale', indication: 'Bilan biologique pré-implantaire et pré-chirurgical' },
        { label: 'Bilan Infectieux Bucco-Dentaire', type: 'analyses', details: '- NFS / Plaquettes\n- CRP (Protéine C-Réactive)\n- Vitesse de Sédimentation (VS)\n- Glycémie à jeun', indication: 'Bilan de cellulite / abcès / infection dentaire aiguë' }
      ],
      orientations: [
        { label: 'Radiologue Maxillo-Facial', specialty: 'Radiologue', motif: 'Bilan d’imagerie 3D Cone Beam / Panoramique dentaire' },
        { label: 'Chirurgien Maxillo-Facial', specialty: 'Autre', motif: 'Avis spécialisé extraction complexe / kystes / chirurgie orthognathique' },
        { label: 'ORL', specialty: 'ORL', motif: 'Avis ORL pour communication bucco-sinusienne ou sinusite maxillaire d\'origine dentaire' },
        { label: 'Orthodontiste', specialty: 'Autre', motif: 'Prise en charge orthodontique spécialisée' },
        { label: 'Parodontiste', specialty: 'Autre', motif: 'Prise en charge de parodontite sévère / chirurgie parodontale' }
      ]
    },
    cardiologue: {
      label: 'Cardiologue',
      imaging: [
        bilanStandardPreset,
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
        bilanStandardPreset,
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
        bilanStandardPreset,
        { label: 'Analyses biologiques', type: 'analyses', details: '- FNS complete\n- VS, CRP\n- Glycémie à jeun\n- Urée, Créatinine', indication: 'Bilan biologique standard' },
        { label: 'Radiographie', type: 'radio', details: '- Radiographie du thorax face', indication: 'Bilan radiologique' },
        { label: 'Échographie', type: 'echo', details: '- Échographie abdominale / cervicale', indication: 'Bilan échographique' },
        { label: 'Scanner / TDM', type: 'scanner', details: '- Scanner TDM', indication: 'Bilan scanner' },
        { label: 'IRM', type: 'irm', details: '- IRM', indication: 'Bilan IRM' }
      ],
      orientations: [
        { label: 'Spécialiste', specialty: 'Autre', motif: 'Avis spécialisé' },
        { label: 'Radiologue', specialty: 'Radiologue', motif: 'Bilan complémentaire' }
      ]
    }
  };

  return configs[key] || configs.orl || configs.general;
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
    panel.innerHTML = '<div class="document-placeholder" style="font-size: 14px; color: #94a3b8; padding: 12px;">Sélectionnez un patient pour générer les documents.</div>';
    return;
  }

  const patientLabel = currentPatientData
    ? `${currentPatientData.firstName || ''} ${currentPatientData.lastName || ''}`.trim() || 'ce patient'
    : 'ce patient';

  panel.innerHTML = `
    <div class="patient-documents-select" style="margin-bottom: 12px;">
      <p style="margin: 0; font-size: 13.5px; color: #475569;">Générer un document pour <strong style="color: #0f172a;">${escapeHTML(patientLabel)}</strong> :</p>
    </div>
    <div class="patient-documents-actions patient-documents-actions-grid" style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
      <!-- Ligne 1 : Ordonnance, Facture, Certificat Médical -->
      <div class="patient-documents-row patient-documents-row-3" style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; width: 100%;">
        <button type="button" class="btn" onclick="handlePatientDocumentAction('ordonnance')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <span>Ordonnance</span>
        </button>
        <button type="button" class="btn" onclick="handlePatientDocumentAction('invoice')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <span>Facture</span>
        </button>
        <button type="button" class="btn" onclick="handlePatientDocumentAction('certificate')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span>Certificat Médical</span>
        </button>
      </div>

      <!-- Ligne 2 : Orientation, Bon pour faire, Arrêt de travail -->
      <div class="patient-documents-row patient-documents-row-3" style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; width: 100%;">
        <button type="button" class="btn" onclick="handlePatientDocumentAction('orientation')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          <span>Orientation / Lettre</span>
        </button>
        <button type="button" class="btn" onclick="handlePatientDocumentAction('bonpour')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          <span>Bon Pour / Faire Svp</span>
        </button>
        <button type="button" class="btn" onclick="handlePatientDocumentAction('workstop')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></svg>
          <span>Arrêt de travail</span>
        </button>
      </div>

      <!-- Ligne 3 : Comptes-rendus ORL (Nasofibroscopie, Échographie Cervicale, Audiogramme) -->
      <div class="patient-documents-row patient-documents-row-3" style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; width: 100%;">
        <button type="button" class="btn" onclick="handlePatientDocumentAction('nasofibroscopie')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
          <span>Nasofibroscopie</span>
        </button>
        <button type="button" class="btn" onclick="handlePatientDocumentAction('echographie_cervicale')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h3l2-6 4 13 3-9 2 5h6"/><circle cx="18" cy="6" r="3"/></svg>
          <span>Échographie Cervicale</span>
        </button>
        <button type="button" class="btn" onclick="handlePatientDocumentAction('audiogramme')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h2a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H2v7zm16 0h2a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2v7z"/><path d="M4 15v2a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-2"/><path d="M9 9h.01M15 9h.01M9 13h6"/></svg>
          <span>Audiogramme</span>
        </button>
      </div>
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

  if (action === 'audiogramme' || action === 'audiometrie') {
    const openAudio = typeof openAudiogrammeModal === 'function'
      ? openAudiogrammeModal
      : window.openAudiogrammeModal;
    if (typeof openAudio === 'function') {
      openAudio(currentPatientId);
    } else {
      showNotification('Module audiogramme non chargé', 'error');
    }
    return;
  }

  if (action === 'nasofibroscopie') {
    const openNaso = typeof openNasofibroscopieModal === 'function'
      ? openNasofibroscopieModal
      : window.openNasofibroscopieModal;
    if (typeof openNaso === 'function') {
      openNaso(currentPatientId);
    } else {
      showNotification('Module nasofibroscopie non charge', 'error');
    }
    return;
  }

  if (action === 'echographie_cervicale' || action === 'echographie') {
    const openEcho = typeof openEchographieCervicaleModal === 'function'
      ? openEchographieCervicaleModal
      : window.openEchographieCervicaleModal;
    if (typeof openEcho === 'function') {
      openEcho(currentPatientId);
    } else {
      showNotification('Module échographie cervicale non charge', 'error');
    }
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

window.handlePatientDocumentAction = handlePatientDocumentAction;
window.renderPatientDocumentWidget = renderPatientDocumentWidget;
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
  orl: {
    accent: '#0d7377', // Medical Teal / Cyan for ORL
    accentLight: '#149d9f',
    accentDark: '#073b4c'
  },
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
    : 'orl';
  
  const colors = SPECIALTY_CONFIG[activeSpecialty] || SPECIALTY_CONFIG.orl || SPECIALTY_CONFIG.general;
  
  const root = document.documentElement;
  root.style.setProperty('--primary-color', colors.accent);
  root.style.setProperty('--primary-light', colors.accentLight);
  root.style.setProperty('--primary-dark', colors.accentDark);
  root.style.setProperty('--color-accent', colors.accent);
  console.log('[Specialty] Applied specialty colors for active specialty [' + activeSpecialty + ']:', colors);
}

function switchRehabMainTab(tabName) {
  document.querySelectorAll('.rehab-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.rehab-tab-content').forEach(content => {
    content.style.display = 'none';
  });
  const activeTab = document.getElementById('rehab-tab-' + tabName);
  if (activeTab) {
    activeTab.style.display = 'block';
  }
}

window.SPECIALTY_CONFIG = SPECIALTY_CONFIG;
window.applySpecialtyAccent = applySpecialtyAccent;
window.getPatientDocumentSpecialtyConfig = getPatientDocumentSpecialtyConfig;
window.getPatientDocumentSpecialtyKey = getPatientDocumentSpecialtyKey;
window.switchRehabMainTab = switchRehabMainTab;

async function openMobileAccessModal(preferredAddress = '') {
  const modal = document.getElementById('modal-mobile-access');
  if (!modal) return;

  const qrImg = document.getElementById('mobile-qr-img');
  const loader = document.getElementById('mobile-qr-loader');
  const urlInput = document.getElementById('mobile-url-input');
  const ipSelect = document.getElementById('mobile-ip-select');
  const ipSelectContainer = document.getElementById('mobile-ip-select-container');
  const networkStatus = document.getElementById('mobile-network-status');
  const statusBadge = document.getElementById('mobile-server-status-badge');
  const statusText = document.getElementById('mobile-server-status-text');
  const warnBox = document.getElementById('mobile-share-warning');

  const setServerStatus = (active) => {
    if (!statusBadge) return;
    statusBadge.style.background = active ? '#f6ffed' : '#fff1f0';
    statusBadge.style.borderColor = active ? '#b7eb8f' : '#ffa39e';
    statusBadge.style.color = active ? '#389e0d' : '#cf1322';
    const dot = statusBadge.querySelector('span');
    if (dot) dot.style.background = active ? '#52c41a' : '#ff4d4f';
    if (statusText) statusText.textContent = active ? 'Serveur Local Actif • Même réseau Wi-Fi' : 'Serveur mobile NON actif';
  };
  const setWarnings = (items) => {
    if (!warnBox) return;
    if (!items.length) {
      warnBox.style.display = 'none';
      warnBox.replaceChildren();
      return;
    }
    warnBox.style.display = 'block';
    warnBox.replaceChildren(...items.map((msg) => Object.assign(document.createElement('div'), { textContent: `• ${msg}` })));
  };

  if (loader) loader.style.display = 'flex';
  if (urlInput) urlInput.value = 'Détection du réseau en direct...';
  setWarnings([]);
  showModal('modal-mobile-access');

  try {
    if (typeof window.api.publicBooking?.refresh === 'function') {
      try { await window.api.publicBooking.refresh(); } catch (_) {}
    }

    const res = await window.api.publicBooking?.getShareData?.(preferredAddress || '');
    if (res?.success && res.data) {
      const data = res.data;
      const targetUrl = data.mobileUrl || ('http://' + (data.localAddress || '127.0.0.1') + ':' + (data.port || 4580) + '/mobile/' + (data.token || ''));
      if (urlInput) urlInput.value = targetUrl;

      if (data.mobileQrDataUrl && qrImg) {
        qrImg.src = data.mobileQrDataUrl;
      } else if (qrImg) {
        qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(targetUrl);
      }

      const serverRunning = data.running !== false;
      setServerStatus(serverRunning);
      const warnings = [];
      if (!serverRunning) {
        warnings.push(`Le serveur mobile n'a pas démarré${data.lastError ? ` (${data.lastError})` : ''}. Fermez puis rouvrez cette fenêtre, ou redémarrez l'application.`);
      }
      if (serverRunning && data.firewallOk === false) {
        warnings.push("Pare-feu Windows : la règle d'accès n'a pas pu être créée automatiquement. Faites un clic droit sur l'application puis « Exécuter en tant qu'administrateur » une seule fois pour autoriser les téléphones.");
      }
      if (serverRunning && data.selfTestOk === false) {
        warnings.push("Test réseau : cette adresse ne répond pas. Vérifiez que le PC et le téléphone sont sur le même Wi-Fi (même box), choisissez une autre adresse IP dans la liste ci-dessous, et si le problème persiste désactivez l'« isolation client / AP isolation » dans la box.");
      }

      const isHotspot = data.localAddress && (
        data.localAddress.startsWith('192.168.43.') ||
        data.localAddress.startsWith('172.20.10.') ||
        data.localAddress.startsWith('192.168.42.') ||
        data.localAddress.startsWith('192.168.137.') ||
        data.localAddress.startsWith('192.168.44.') ||
        data.localAddress.startsWith('192.168.49.')
      );

      if (networkStatus) {
        networkStatus.textContent = isHotspot ? 'Point d\'accès Hotspot Actif' : 'Réseau Wi-Fi / Local Actif';
        networkStatus.style.color = isHotspot ? '#52c41a' : '#1677ff';
      }

      if (ipSelect) {
        const addresses = (Array.isArray(data.availableAddresses) && data.availableAddresses.length > 0)
          ? data.availableAddresses
          : [{ address: data.localAddress || '127.0.0.1', name: 'Réseau' }];

        ipSelect.innerHTML = addresses.map((cand) => {
          let label = cand.address;
          if (cand.address.startsWith('192.168.43.')) label += ' 📱 (Hotspot Android)';
          else if (cand.address.startsWith('172.20.10.')) label += ' 📱 (Hotspot iPhone / iOS)';
          else if (cand.address.startsWith('192.168.42.')) label += ' 🔌 (Partage USB)';
          else if (cand.address.startsWith('192.168.137.')) label += ' 📡 (Hotspot Windows)';
          else if (cand.name) label += ` (${cand.name})`;
          const selected = (cand.address === data.localAddress) ? 'selected' : '';
          return `<option value="${cand.address}" ${selected}>${label}</option>`;
        }).join('');

        if (ipSelectContainer) {
          ipSelectContainer.style.display = 'block';
        }
      }

      setWarnings(warnings);
    } else {
      setServerStatus(false);
      const fallbackUrl = 'http://127.0.0.1:4580/mobile';
      if (urlInput) urlInput.value = fallbackUrl;
      if (qrImg) qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(fallbackUrl);
      setWarnings(['Impossible de récupérer les informations de partage. Redémarrez l\'application puis réessayez.']);
    }
  } catch (err) {
    console.error('Error fetching mobile share data:', err);
    setServerStatus(false);
    const fallbackUrl = 'http://127.0.0.1:4580/mobile';
    if (urlInput) urlInput.value = fallbackUrl;
    if (qrImg) qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(fallbackUrl);
    setWarnings(['Erreur lors de la détection du réseau. Vérifiez votre connexion Wi-Fi puis réessayez.']);
  } finally {
    if (loader) loader.style.display = 'none';
  }
}

async function onMobileNetworkAddressChange(address) {
  if (!address) return;
  await openMobileAccessModal(address);
}

async function refreshMobileAccessModal() {
  const ipSelect = document.getElementById('mobile-ip-select');
  const selectedIp = ipSelect ? ipSelect.value : '';
  await openMobileAccessModal(selectedIp);
  if (typeof showNotification === 'function') {
    showNotification('Adresse réseau actualisée', 'info');
  }
}

function copyMobileUrl() {
  const input = document.getElementById('mobile-url-input');
  if (!input || !input.value) return;
  navigator.clipboard.writeText(input.value).then(() => {
    if (typeof showNotification === 'function') {
      showNotification('Lien mobile copié dans le presse-papier', 'success');
    }
  });
}

function openMobileInBrowser() {
  const input = document.getElementById('mobile-url-input');
  const url = input?.value;
  if (!url || url.includes('Recherche')) return;
  if (window.api?.system?.openExternal) {
    window.api.system.openExternal(url);
  } else if (window.api?.openExternal) {
    window.api.openExternal(url);
  } else {
    window.open(url, '_blank');
  }
}

window.openMobileAccessModal = openMobileAccessModal;
window.onMobileNetworkAddressChange = onMobileNetworkAddressChange;
window.refreshMobileAccessModal = refreshMobileAccessModal;
window.copyMobileUrl = copyMobileUrl;
window.openMobileInBrowser = openMobileInBrowser;
