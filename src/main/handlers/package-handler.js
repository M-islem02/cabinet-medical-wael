/**
 * Gestionnaire IPC pour la configuration des packages client
 * PhysioCare - SystÃ¨me de Packages
 */

import { ipcMain } from 'electron';
import { query, queryOne, run } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import {
  getLoadedSpecialtyBases,
  getSpecialtyConfig,
  mergeSpecialtyBaseIntoDb,
  normalizeSpecialtyKey,
  parseEnabledSpecialties,
  readSpecialtyMedications
} from '../specialty-assets.js';

const PACKAGE_DEFINITIONS = {
  basic: {
    name: 'Pack Basique',
    description: 'Pour médecin solo',
    maxDoctors: 1,
    maxAssistants: 0,
    features: {
      prescriptions: true,
      waitingRoom: true,
      dailySummary: false,
      statistics: true,
      inventory: true,
      orl: true,
      medicalImaging: true,
      debts: true,
      calendar: true,
      documents: true,
      sickLeaves: true,
      afterSalesSupport: true,
      aiReports: false,
      aiChatbot: false
    },
    basePrice: 60000
  },
  standard: {
    name: 'Pack Standard',
    description: 'Médecin + Assistante',
    maxDoctors: 1,
    maxAssistants: 1,
    features: {
      prescriptions: true,
      waitingRoom: true,
      dailySummary: false,
      statistics: true,
      inventory: true,
      orl: true,
      medicalImaging: true,
      debts: true,
      calendar: true,
      documents: true,
      sickLeaves: true,
      afterSalesSupport: true,
      aiReports: false,
      aiChatbot: false
    },
    basePrice: 75000
  },
  professional: {
    name: 'Pack Pro + IA',
    description: 'Médecin + IA (chat et rapports)',
    maxDoctors: 1,
    maxAssistants: 1,
    features: {
      prescriptions: true,
      waitingRoom: true,
      dailySummary: false,
      statistics: true,
      inventory: true,
      orl: true,
      medicalImaging: true,
      debts: true,
      calendar: true,
      documents: true,
      sickLeaves: true,
      afterSalesSupport: true,
      aiReports: true,
      aiChatbot: true
    },
    basePrice: 105000
  },
  custom: {
    name: 'Pack Personnalisé',
    description: 'Choisissez vos fonctionnalités',
    maxDoctors: 1,
    maxAssistants: 0,
    features: {
      orl: true
    },
    basePrice: 0
  }
};

const OPTION_PRICES = {
  doctor: 60000,
  assistant: 15000,
  orl: 0,
  aiReports: 10000,
  aiChatbot: 8000,
  afterSalesSupport: 0,
  waitingRoom: 0,
  inventory: 0,
  multiPC: 0
};

function toBool(value) {
  return value ? 1 : 0;
}

function isEnabled(value) {
  return value === true || value === 1 || value === '1';
}

function getEnabledSpecialtiesFromConfig(config = {}) {
  return parseEnabledSpecialties(config.enabledSpecialties, config);
}

function sanitizePackageConfig(rawConfig = {}) {
  const enabledSpecialties = parseEnabledSpecialties(rawConfig.enabledSpecialties, rawConfig);
  const safeEnabledSpecialties = enabledSpecialties.length ? enabledSpecialties : ['orl'];
  const requestedSpecialty = normalizeSpecialtyKey(rawConfig.activeSpecialty || safeEnabledSpecialties[0] || 'orl');
  const activeSpecialty = safeEnabledSpecialties.includes(requestedSpecialty)
    ? requestedSpecialty
    : (safeEnabledSpecialties[0] || 'orl');

  const rawCabinetType = String(rawConfig.cabinetType || '').toLowerCase();
  const cabinetType = rawCabinetType === 'singulier' || rawCabinetType === 'single'
    ? 'single'
    : (rawCabinetType === 'multiple' || rawCabinetType === 'multi' ? 'multiple' : null);

  return {
    ...rawConfig,
    enabledSpecialties: safeEnabledSpecialties,
    activeSpecialty,
    cabinetType,
    featureORL: safeEnabledSpecialties.includes('orl')
  };
}

function deriveCabinetTypeFromSpecialties(enabledSpecialties = []) {
  const count = Array.isArray(enabledSpecialties) ? enabledSpecialties.length : 0;
  return count > 1 ? 'multiple' : 'single';
}

async function migrateForCabinetTypeChange(oldType, newType) {
  try {
    if (oldType === newType) return;
    if (newType === 'multiple' && oldType === 'single') {
      const patients = await query(
        'SELECT id, primaryDoctorId FROM patients WHERE primaryDoctorId IS NOT NULL AND primaryDoctorId <> ?',
        ['']
      );
      for (const p of patients) {
        await run(
          `INSERT INTO patient_practitioners (patientId, practitionerId)
           VALUES (?, ?)
           ON CONFLICT (patientId, practitionerId) DO NOTHING`,
          [p.id, p.primaryDoctorId]
        );
      }
      console.log(`[cabinetType] single→multiple : ${patients.length} assignations patient_practitioners créées depuis primaryDoctorId`);
    } else if (newType === 'single' && oldType === 'multiple') {
      const firstAssignments = await query(
        `SELECT DISTINCT ON (patientId) patientId, practitionerId
         FROM patient_practitioners ORDER BY patientId, assignedAt ASC`
      );
      for (const a of firstAssignments) {
        await run('UPDATE patients SET primaryDoctorId = ? WHERE id = ? AND (primaryDoctorId IS NULL OR primaryDoctorId = ?)', [a.practitionerId, a.patientId, '']);
      }
      console.log(`[cabinetType] multiple→single : ${firstAssignments.length} primaryDoctorId consolidés (assignations conservées)`);
    }
  } catch (e) {
    console.error('[cabinetType] migration error:', e.message);
  }
}

function calculateTotalFromConfig(config) {
  const doctors = parseInt(config.maxDoctors || 1, 10) || 1;
  const assistants = parseInt(config.maxAssistants || 0, 10) || 0;
  let total = doctors * OPTION_PRICES.doctor + assistants * OPTION_PRICES.assistant;
  if (config.featureRehabilitation || config.featureKineStaff) {
    total += OPTION_PRICES.rehabilitation;
  }
  if (config.featureORL && OPTION_PRICES.orl) {
    total += OPTION_PRICES.orl;
  }
  if (config.featureAiReports) {
    total += OPTION_PRICES.aiReports;
  }
  if (config.featureAiChatbot) {
    total += OPTION_PRICES.aiChatbot;
  }
  return total;
}

export function handlePackageEvents() {
  ipcMain.handle('package:get-config', async () => {
    try {
      const config = await queryOne('SELECT * FROM package_config LIMIT 1');
      if (config) {
        config.enabledSpecialties = JSON.stringify(parseEnabledSpecialties(config.enabledSpecialties, config));
        if (!config.cabinetType) {
          const derived = deriveCabinetTypeFromSpecialties(parseEnabledSpecialties(config.enabledSpecialties, config));
          await run('UPDATE package_config SET cabinetType = ? WHERE id = ?', [derived, config.id]);
          config.cabinetType = derived;
        }
      }
      return { success: true, data: config };
    } catch (error) {
      console.error('Error getting package config:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('package:get-specialty-config', async () => {
    try {
      return { success: true, data: getSpecialtyConfig() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('package:get-loaded-bases', async () => {
    try {
      const data = await getLoadedSpecialtyBases();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('package:refresh-specialty-base', async (event, specialtyKey) => {
    try {
      return await mergeSpecialtyBaseIntoDb(specialtyKey);
    } catch (error) {
      console.error('Error refreshing specialty base:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('package:export-medications-json', async (event, specialtyKey) => {
    try {
      const key = normalizeSpecialtyKey(specialtyKey);
      const { filePath, medications } = readSpecialtyMedications(key);
      return { success: true, data: { specialty: key, filePath, count: medications.length } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('package:get-definitions', async () => {
    return {
      success: true,
      data: {
        packages: PACKAGE_DEFINITIONS,
        prices: OPTION_PRICES
      }
    };
  });

  ipcMain.handle('package:save-config', async (event, configData) => {
    try {
      const normalizedConfig = sanitizePackageConfig(configData || {});
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const existing = await queryOne('SELECT id FROM package_config LIMIT 1');
      const totalPrice = typeof normalizedConfig.totalPrice === 'number'
        ? normalizedConfig.totalPrice
        : calculateTotalFromConfig(normalizedConfig);

      const finalCabinetType = normalizedConfig.cabinetType || deriveCabinetTypeFromSpecialties(normalizedConfig.enabledSpecialties || []);

      if (existing) {
        const prevConfig = await queryOne('SELECT cabinetType FROM package_config WHERE id = ?', [existing.id]);
        await migrateForCabinetTypeChange(prevConfig?.cabinetType || null, finalCabinetType);
      }

      const commonEntries = [
        ['clientName', normalizedConfig.clientName],
        ['packageType', normalizedConfig.packageType || 'basic'],
        ['activeSpecialty', normalizedConfig.activeSpecialty || 'orl'],
        ['cabinetType', finalCabinetType],
        ['enabledSpecialties', JSON.stringify(normalizedConfig.enabledSpecialties || ['orl'])],
        ['maxDoctors', normalizedConfig.maxDoctors || 1],
        ['maxAssistants', normalizedConfig.maxAssistants || 0],
        ['featurePrescriptions', toBool(normalizedConfig.featurePrescriptions ?? true)],
        ['featureWaitingRoom', toBool(normalizedConfig.featureWaitingRoom ?? true)],
        ['featureDailySummary', toBool(normalizedConfig.featureDailySummary ?? false)],
        ['featureStatistics', toBool(normalizedConfig.featureStatistics ?? true)],
        ['featureInventory', toBool(normalizedConfig.featureInventory ?? true)],
        ['featureORL', toBool(normalizedConfig.featureORL ?? true)],
        ['featureMedicalImaging', toBool(normalizedConfig.featureMedicalImaging ?? true)],
        ['featureDebts', toBool(normalizedConfig.featureDebts ?? true)],
        ['featureCalendar', toBool(normalizedConfig.featureCalendar ?? true)],
        ['featureDocuments', toBool(normalizedConfig.featureDocuments ?? true)],
        ['featureSickLeaves', toBool(normalizedConfig.featureSickLeaves ?? true)],
        ['featureMultiPC', toBool(normalizedConfig.featureMultiPC)],
        ['featureAiReports', toBool(normalizedConfig.featureAiReports)],
        ['featureAiChatbot', toBool(normalizedConfig.featureAiChatbot)],
        ['featureAfterSalesSupport', toBool(normalizedConfig.featureAfterSalesSupport ?? true)],
        ['priceDoctor', OPTION_PRICES.doctor],
        ['priceAssistant', OPTION_PRICES.assistant],
        ['pricePrescriptions', 0],
        ['priceMultiPC', OPTION_PRICES.multiPC],
        ['priceORL', OPTION_PRICES.orl || 0],
        ['priceAiReports', OPTION_PRICES.aiReports],
        ['priceAiChatbot', OPTION_PRICES.aiChatbot],
        ['priceAfterSales', OPTION_PRICES.afterSalesSupport],
        ['totalPrice', totalPrice],
        ['currency', 'DZD']
      ];
      const commonColumns = commonEntries.map(([column]) => column);
      const commonParams = commonEntries.map(([, value]) => value);

      if (existing) {
        await run(`
          UPDATE package_config SET
            ${commonColumns.map((column) => `${column} = ?`).join(',\n            ')},
            updatedAt = ?
          WHERE id = ?
        `, [...commonParams, now, existing.id]);
      } else {
        const id = uuidv4();
        const insertColumns = ['id', ...commonColumns, 'updatedAt', 'createdAt'];
        const insertPlaceholders = insertColumns.map(() => '?').join(', ');
        await run(`
          INSERT INTO package_config (
            ${insertColumns.join(', ')}
          ) VALUES (${insertPlaceholders})
        `, [id, ...commonParams, now, now]);
      }

      console.log('âœ… Package config saved:', normalizedConfig.clientName);
      return { success: true };
    } catch (error) {
      console.error('Error saving package config:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('package:check-feature', async (event, featureName) => {
    try {
      const config = await queryOne('SELECT * FROM package_config LIMIT 1');
      if (!config) {
        return { success: true, enabled: true };
      }

      const featureColumn = `feature${featureName.charAt(0).toUpperCase() + featureName.slice(1)}`;
      const enabled = config[featureColumn] === 1;

      return { success: true, enabled };
    } catch (error) {
      console.error('Error checking feature:', error);
      return { success: false, enabled: true };
    }
  });

  ipcMain.handle('package:check-user-limit', async (event, role) => {
    try {
      const config = await queryOne('SELECT * FROM package_config LIMIT 1');
      if (!config) {
        return { success: true, allowed: true };
      }

      const counts = await queryOne(`
        SELECT
          SUM(CASE WHEN role IN ('doctor', 'dentist') THEN 1 ELSE 0 END) as doctors,
          SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END) as assistants
        FROM users WHERE isActive = 1 AND isSuperAdmin = 0
      `);

      if (role === 'doctor' || role === 'dentist') {
        const allowed = (counts?.doctors || 0) < config.maxDoctors;
        return { success: true, allowed, current: counts?.doctors || 0, max: config.maxDoctors };
      }

      if (role === 'assistant') {
        const allowed = (counts?.assistants || 0) < config.maxAssistants;
        return { success: true, allowed, current: counts?.assistants || 0, max: config.maxAssistants };
      }

      return { success: true, allowed: true };
    } catch (error) {
      console.error('Error checking user limit:', error);
      return { success: false, allowed: true };
    }
  });

  ipcMain.handle('package:is-configured', async () => {
    try {
      const config = await queryOne('SELECT * FROM package_config LIMIT 1');
      const isConfigured = config && config.clientName !== 'Client Non ConfigurÃ©';
      return { success: true, configured: isConfigured, data: config };
    } catch (error) {
      console.error('Error checking package config:', error);
      return { success: false, configured: false };
    }
  });

  console.log('Package events registered');
}
