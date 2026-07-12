import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, queryOne, run } from './database-unified.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, '../../assets');
const SHARED_CONFIG_PATH = path.resolve(__dirname, '../shared/specialty-config.json');
const SPECIALTY_KEYS = ['general', 'mpr', 'cardiology', 'dentistry'];

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (_) {
    return fallback;
  }
}

export function normalizeSpecialtyKey(value = 'general') {
  const raw = String(value || '').trim().toLowerCase();
  if (['mpr', 'rehabilitation', 'reeducation', 'rééducation', 'medecine physique', 'médecine physique'].includes(raw)) return 'mpr';
  if (['cardiology', 'cardiologie', 'cardiologue', 'cardio'].includes(raw)) return 'cardiology';
  if (['dentistry', 'dentiste', 'dentaire', 'dentist'].includes(raw)) return 'dentistry';
  return 'general';
}

export function getSpecialtyConfig() {
  const parsed = readJsonFile(SHARED_CONFIG_PATH, {});
  return SPECIALTY_KEYS.reduce((acc, key) => {
    if (parsed[key]) acc[key] = { ...parsed[key], key };
    return acc;
  }, {});
}

export function parseEnabledSpecialties(value, fallbackConfig = null) {
  if (Array.isArray(value)) {
    const keys = value.map(normalizeSpecialtyKey);
    return [...new Set(keys.length ? keys : ['general'])];
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      return parseEnabledSpecialties(JSON.parse(value), fallbackConfig);
    } catch (_) {
      const keys = value.split(',').map(normalizeSpecialtyKey);
      return [...new Set(keys.length ? keys : ['general'])];
    }
  }

  const config = fallbackConfig || {};
  const legacyKeys = ['general'];
  if (config.featureRehabilitation === 1 || config.featureRehabilitation === true || config.featureRehabilitation === '1' || config.featureKineStaff === 1 || config.featureKineStaff === true || config.featureKineStaff === '1') legacyKeys.push('mpr');
  if (config.featureCardiology === 1 || config.featureCardiology === true || config.featureCardiology === '1') legacyKeys.push('cardiology');
  if (config.featureDentistry === 1 || config.featureDentistry === true || config.featureDentistry === '1') legacyKeys.push('dentistry');
  return [...new Set(legacyKeys)];
}

function medicationArrayFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.medicaments)) return payload.medicaments;
  if (Array.isArray(payload?.medications)) return payload.medications;
  return [];
}

function getMedicationJsonPath(specialtyKey) {
  const config = getSpecialtyConfig();
  const meta = config[normalizeSpecialtyKey(specialtyKey)] || config.general;
  return path.join(ASSETS_DIR, meta.medicationsJson);
}

function normalizeMedicationIdentity(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function mapSpecialtyMedication(entry = {}) {
  return {
    nom_medicament: entry.nom_medicament || entry.name || '',
    dosage_posologie: entry.dosage_posologie || entry.defaultDosage || entry.dosage || '',
    prise: entry.prise || entry.defaultIntake || entry.intake || '',
    duree: entry.duree || entry.defaultDuration || entry.duration || '',
    boites: entry.boites ?? entry.defaultBoxes ?? entry.boxes ?? '',
    instructions_observations: entry.instructions_observations || entry.instructions || entry.notes || ''
  };
}

export function readSpecialtyMedications(specialtyKey) {
  const key = normalizeSpecialtyKey(specialtyKey);
  const filePath = getMedicationJsonPath(key);
  const payload = readJsonFile(filePath, { specialite: key, medicaments: [] });
  return {
    payload,
    filePath,
    medications: medicationArrayFromPayload(payload).map(mapSpecialtyMedication)
  };
}

export function writeMergedSpecialtyMedication(specialtyKey, medication) {
  const key = normalizeSpecialtyKey(specialtyKey);
  const { payload, filePath, medications } = readSpecialtyMedications(key);
  const nextMedication = mapSpecialtyMedication(medication);
  const identity = `${normalizeMedicationIdentity(nextMedication.nom_medicament)}|${normalizeMedicationIdentity(nextMedication.dosage_posologie)}`;
  if (!normalizeMedicationIdentity(nextMedication.nom_medicament)) {
    return { success: false, error: 'Le nom du médicament est requis' };
  }

  const existingIndex = medications.findIndex((entry) => {
    const entryIdentity = `${normalizeMedicationIdentity(entry.nom_medicament)}|${normalizeMedicationIdentity(entry.dosage_posologie)}`;
    return entryIdentity === identity;
  });

  const mergedMedication = {
    id: medication.id || (existingIndex >= 0 ? medicationArrayFromPayload(payload)[existingIndex]?.id : `${key}_${Date.now()}`),
    ...nextMedication
  };

  const rawMedications = medicationArrayFromPayload(payload);
  if (existingIndex >= 0) {
    rawMedications[existingIndex] = { ...rawMedications[existingIndex], ...mergedMedication };
  } else {
    rawMedications.push(mergedMedication);
  }

  const nextPayload = { ...payload, specialite: payload.specialite || key, medicaments: rawMedications };
  fs.writeFileSync(filePath, `${JSON.stringify(nextPayload, null, 2)}\n`, 'utf-8');
  return { success: true, updated: existingIndex >= 0, count: rawMedications.length, filePath };
}

export async function getCurrentEnabledSpecialties() {
  const config = await queryOne('SELECT * FROM package_config LIMIT 1');
  return parseEnabledSpecialties(config?.enabledSpecialties, config);
}

export async function getLoadedSpecialtyBases({ enabledOnly = false } = {}) {
  const config = getSpecialtyConfig();
  const enabled = await getCurrentEnabledSpecialties();
  return SPECIALTY_KEYS
    .filter((key) => !enabledOnly || enabled.includes(key))
    .map((key) => {
      const meta = config[key];
      const logoPath = path.join(ASSETS_DIR, meta.logo);
      const fallbackLogoPath = path.join(ASSETS_DIR, meta.fallbackLogo || 'logo.png');
      const medicationPath = path.join(ASSETS_DIR, meta.medicationsJson);
      const medicationPayload = readJsonFile(medicationPath, { medicaments: [] });
      const medications = medicationArrayFromPayload(medicationPayload);
      return {
        key,
        label: meta.label,
        doctorLabel: meta.doctorLabel,
        enabled: enabled.includes(key),
        logoFile: meta.logo,
        logoPath: fs.existsSync(logoPath) ? logoPath : (fs.existsSync(fallbackLogoPath) ? fallbackLogoPath : ''),
        logoExists: fs.existsSync(logoPath),
        medicationFileName: meta.medicationsJson,
        medicationPath,
        medicationJsonLoaded: fs.existsSync(medicationPath),
        medicationCount: medications.length,
        examsCount: Array.isArray(meta.exams) ? meta.exams.length : 0,
        imagingFamiliesCount: Array.isArray(meta.imagingFamilies) ? meta.imagingFamilies.length : 0,
        equipmentCategoriesCount: Array.isArray(meta.equipmentCategories) ? meta.equipmentCategories.length : 0,
        exams: meta.exams || [],
        imagingFamilies: meta.imagingFamilies || [],
        equipmentCategories: meta.equipmentCategories || [],
        medications: medications.map(mapSpecialtyMedication)
      };
    });
}

export async function mergeSpecialtyBaseIntoDb(specialtyKey) {
  const key = normalizeSpecialtyKey(specialtyKey);
  const { medications } = readSpecialtyMedications(key);
  let inserted = 0;
  let updated = 0;

  for (const entry of medications) {
    const medication = mapSpecialtyMedication(entry);
    const name = String(medication.nom_medicament || '').trim();
    if (!name) continue;
    const dosage = String(medication.dosage_posologie || '').trim();
    const existing = await queryOne(
      'SELECT id FROM medications WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND COALESCE(defaultDosage, \'\') = ? LIMIT 1',
      [name, dosage]
    );
    if (existing) {
      await run(
        `UPDATE medications
         SET defaultIntake = ?, defaultDuration = ?, defaultBoxes = ?, instructions = ?, isActive = 1, updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [medication.prise, medication.duree, String(medication.boites ?? ''), medication.instructions_observations, existing.id]
      );
      updated += 1;
    } else {
      const { v4: uuidv4 } = await import('uuid');
      await run(
        `INSERT INTO medications (id, name, defaultDosage, defaultIntake, defaultDuration, defaultBoxes, instructions, category, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [uuidv4(), name, dosage, medication.prise, medication.duree, String(medication.boites ?? ''), medication.instructions_observations, key]
      );
      inserted += 1;
    }
  }

  const rows = await query('SELECT COUNT(*) AS count FROM medications WHERE isActive = 1');
  return { success: true, specialty: key, inserted, updated, totalActiveMedications: rows?.[0]?.count || 0 };
}
