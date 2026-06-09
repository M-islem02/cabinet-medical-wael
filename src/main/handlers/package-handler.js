/**
 * Gestionnaire IPC pour la configuration des packages client
 * PhysioCare - SystÃ¨me de Packages
 */

import { ipcMain } from 'electron';
import { queryOne, run } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';

const PACKAGE_DEFINITIONS = {
  basic: {
    name: 'Pack Basique',
    description: 'Pour mÃ©decin solo',
    maxDoctors: 1,
    maxAssistants: 0,
    features: {
      prescriptions: true,
      waitingRoom: true,
      dailySummary: true,
      statistics: true,
      inventory: true,
      kineStaff: false,
      rehabilitation: false,
      dentistry: false,
      cardiology: false,
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
    description: 'MÃ©decin + Assistante',
    maxDoctors: 1,
    maxAssistants: 1,
    features: {
      prescriptions: true,
      waitingRoom: true,
      dailySummary: true,
      statistics: true,
      inventory: true,
      kineStaff: false,
      rehabilitation: false,
      dentistry: false,
      cardiology: false,
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
    description: 'MÃ©decin + IA (chat et rapports)',
    maxDoctors: 1,
    maxAssistants: 1,
    features: {
      prescriptions: true,
      waitingRoom: true,
      dailySummary: true,
      statistics: true,
      inventory: true,
      kineStaff: true,
      rehabilitation: true,
      dentistry: true,
      cardiology: true,
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
    name: 'Pack PersonnalisÃ©',
    description: 'Choisissez vos fonctionnalitÃ©s',
    maxDoctors: 1,
    maxAssistants: 0,
    features: {},
    basePrice: 0
  }
};

const OPTION_PRICES = {
  doctor: 60000,
  assistant: 15000,
  rehabilitation: 12000,
  dentistry: 12000,
  cardiology: 12000,
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

function normalizeSpecialtyKey(value = 'general') {
  const raw = String(value || '').trim().toLowerCase();
  if (['mpr', 'rehabilitation', 'reeducation', 'rÃ©Ã©ducation', 'medecine physique', 'mÃ©decine physique'].includes(raw)) {
    return 'mpr';
  }
  if (['cardiology', 'cardiologie', 'cardiologue', 'cardio'].includes(raw)) {
    return 'cardiology';
  }
  if (['dentistry', 'dentiste', 'dentaire', 'dentist'].includes(raw)) {
    return 'dentistry';
  }
  return 'general';
}

function getEnabledSpecialtiesFromConfig(config = {}) {
  const specialties = ['general'];
  if (isEnabled(config.featureRehabilitation) || isEnabled(config.featureKineStaff)) {
    specialties.push('mpr');
  }
  if (isEnabled(config.featureCardiology)) {
    specialties.push('cardiology');
  }
  if (isEnabled(config.featureDentistry)) {
    specialties.push('dentistry');
  }
  return specialties;
}

function sanitizePackageConfig(rawConfig = {}) {
  const requestedSpecialty = normalizeSpecialtyKey(rawConfig.activeSpecialty || 'general');
  const enabledSpecialties = getEnabledSpecialtiesFromConfig(rawConfig);
  const activeSpecialty = requestedSpecialty !== 'general' && enabledSpecialties.includes(requestedSpecialty)
    ? requestedSpecialty
    : 'general';

  return {
    ...rawConfig,
    activeSpecialty
  };
}

function calculateTotalFromConfig(config) {
  const doctors = parseInt(config.maxDoctors || 1, 10) || 1;
  const assistants = parseInt(config.maxAssistants || 0, 10) || 0;
  let total = doctors * OPTION_PRICES.doctor + assistants * OPTION_PRICES.assistant;
  if (config.featureRehabilitation || config.featureKineStaff) {
    total += OPTION_PRICES.rehabilitation;
  }
  if (config.featureDentistry) {
    total += OPTION_PRICES.dentistry;
  }
  if (config.featureCardiology) {
    total += OPTION_PRICES.cardiology;
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
      return { success: true, data: config };
    } catch (error) {
      console.error('Error getting package config:', error);
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

      const commonEntries = [
        ['clientName', normalizedConfig.clientName],
        ['packageType', normalizedConfig.packageType || 'basic'],
        ['activeSpecialty', normalizedConfig.activeSpecialty || 'general'],
        ['maxDoctors', normalizedConfig.maxDoctors || 1],
        ['maxAssistants', normalizedConfig.maxAssistants || 0],
        ['featurePrescriptions', toBool(normalizedConfig.featurePrescriptions ?? true)],
        ['featureWaitingRoom', toBool(normalizedConfig.featureWaitingRoom ?? true)],
        ['featureDailySummary', toBool(normalizedConfig.featureDailySummary ?? true)],
        ['featureStatistics', toBool(normalizedConfig.featureStatistics ?? true)],
        ['featureInventory', toBool(normalizedConfig.featureInventory ?? true)],
        ['featureKineStaff', toBool(normalizedConfig.featureKineStaff)],
        ['featureRehabilitation', toBool(normalizedConfig.featureRehabilitation)],
        ['featureDentistry', toBool(normalizedConfig.featureDentistry)],
        ['featureCardiology', toBool(normalizedConfig.featureCardiology)],
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
        ['priceDentistry', OPTION_PRICES.dentistry],
        ['priceCardiology', OPTION_PRICES.cardiology],
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
