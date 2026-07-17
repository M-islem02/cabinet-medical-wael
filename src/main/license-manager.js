/**
 * Module de gestion des licences
 * Gère une clé d'essai 7 jours et une clé illimitée.
 */

import { queryOne, run, query, withTransaction } from './database-unified.js';
import crypto from 'crypto';
import moment from 'moment';

const LICENSE_SECRET = 'MEDPRO-SECURE-PEPPER-2026-X89';

function calculateKeySignature(days, partA) {
  return crypto
    .createHmac('sha256', LICENSE_SECRET)
    .update(`${days}D-${partA}`)
    .digest('hex')
    .substring(0, 6)
    .toUpperCase();
}

export const TRIAL_LICENSE_KEY = 'MEDPRO-TRIAL-7JOURS';
export const FIVE_DAY_LICENSE_KEY = 'MEDPRO-TRIAL-5JOURS';
export const FIFTEEN_DAY_LICENSE_KEY = 'MEDPRO-TRIAL-15JOURS';
export const ANNUAL_LICENSE_KEY = 'MEDPRO-ANNUELLE-1AN';
export const UNLIMITED_LICENSE_KEY = 'MEDPRO-ILLIMITEE-ACTIVE';
export const LEGACY_MASTER_LICENSE_KEY = 'MEDPRO-MASTER-2024-ACTIVATED';
const LICENSE_TYPES = {
  trial: 'trial',
  duration: 'duration',
  annual: 'annual',
  unlimited: 'unlimited'
};

const DURATION_LICENSES = new Map([
  [FIVE_DAY_LICENSE_KEY, 5],
  [TRIAL_LICENSE_KEY, 7],
  [FIFTEEN_DAY_LICENSE_KEY, 15]
]);

const BUILTIN_LICENSE_LABELS = new Map([
  [FIVE_DAY_LICENSE_KEY, 'Licence essai 5 jours'],
  [TRIAL_LICENSE_KEY, 'Licence essai 7 jours'],
  [FIFTEEN_DAY_LICENSE_KEY, 'Licence essai 15 jours'],
  [ANNUAL_LICENSE_KEY, 'Licence annuelle'],
  [UNLIMITED_LICENSE_KEY, 'Licence illimitée'],
  [LEGACY_MASTER_LICENSE_KEY, 'Licence annuelle historique']
]);

async function ensureBuiltinLicenseRecord(licenseKey) {
  const clientName = BUILTIN_LICENSE_LABELS.get(licenseKey);
  if (!clientName) return;

  const existing = await queryOne('SELECT id FROM licenses WHERE `key` = ?', [licenseKey]);
  if (existing?.id) return;

  await run(
    `INSERT INTO licenses (id, \`key\`, clientName, generatedDate, expirationDate, activated, activationDate, machineId, status)
     VALUES (?, ?, ?, ?, NULL, 0, NULL, NULL, 'pending')`,
    [crypto.randomUUID(), licenseKey, clientName, moment().format('YYYY-MM-DD HH:mm:ss')]
  );
}

async function getDatabaseNowMoment() {
  try {
    const row = await queryOne('SELECT CURRENT_TIMESTAMP AS nowTs');
    if (row?.nowTs) {
      return moment(row.nowTs);
    }
  } catch (error) {
    console.warn('Unable to read DB current timestamp, fallback to local time:', error?.message || error);
  }
  return moment();
}

function getLicenseExpirationMoment(expirationDate) {
  if (!expirationDate) return null;

  const raw = String(expirationDate).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return moment(raw, 'YYYY-MM-DD').endOf('day');
  }

  return moment(raw);
}

function getLicenseTypeFromKey(licenseKey) {
  if (DURATION_LICENSES.has(licenseKey)) return LICENSE_TYPES.trial;
  if (/^MEDPRO-\d+D-[A-Z0-9]{6}-[A-Z0-9]{6}$/.test(licenseKey)) return LICENSE_TYPES.duration;
  if (licenseKey === ANNUAL_LICENSE_KEY || licenseKey === LEGACY_MASTER_LICENSE_KEY) return LICENSE_TYPES.annual;
  if (licenseKey === UNLIMITED_LICENSE_KEY) return LICENSE_TYPES.unlimited;
  return null;
}

function getDurationDaysFromKey(licenseKey) {
  if (DURATION_LICENSES.has(licenseKey)) {
    return DURATION_LICENSES.get(licenseKey);
  }
  const match = String(licenseKey || '').match(/^MEDPRO-(\d+)D-/);
  if (!match) return null;
  const days = Number(match[1]);
  return Number.isFinite(days) && days > 0 ? Math.min(365, Math.round(days)) : null;
}

async function getValidActiveLicense() {
  const licenses = await query(
    "SELECT * FROM licenses WHERE activated = 1 ORDER BY CASE WHEN `key` = ? THEN 0 ELSE 1 END, activationDate DESC, generatedDate DESC",
    [UNLIMITED_LICENSE_KEY]
  );

  const now = await getDatabaseNowMoment();
  for (const license of licenses) {
    const validation = await validateLicense(license.key);
    if (!validation.valid) {
      await run(
        "UPDATE licenses SET activated = 0, status = ? WHERE id = ?",
        [validation.reason === 'Licence expirée' ? 'expired' : 'inactive', license.id]
      );
      continue;
    }
    return license;
  }

  return null;
}

/**
 * Vérifie si la licence master est activée
 */
export async function checkLicenseAtStartup() {
  try {
    const license = await getValidActiveLicense();
    
    if (license) {
      return {
        hasActiveLicense: true,
        license: license,
        warning: false
      };
    }
    
    return {
      hasActiveLicense: false,
      reason: 'Aucune licence active. Connectez-vous avec un compte administrateur pour activer une clé.'
    };
  } catch (error) {
    console.error('❌ Erreur lors de la vérification de la licence:', error);
    return {
      hasActiveLicense: false,
      reason: 'Erreur lors de la vérification'
    };
  }
}

/**
 * Vérifie si une clé de licence est valide et active
 */
export async function validateLicense(licenseKey) {
  try {
    const license = await queryOne(
      "SELECT * FROM licenses WHERE `key` = ?",
      [licenseKey]
    );
    
    if (!license) {
      return {
        valid: false,
        reason: 'Clé de licence non trouvée'
      };
    }

    // Verify signature for generated duration keys
    const match = String(licenseKey || '').match(/^MEDPRO-(\d+)D-([A-Z0-9]{6})-([A-Z0-9]{6})$/);
    if (match) {
      const days = Number(match[1]);
      const partA = match[2];
      const signature = match[3];
      const expectedSignature = calculateKeySignature(days, partA);
      if (signature !== expectedSignature) {
        return {
          valid: false,
          reason: 'Clé de licence invalide ou corrompue'
        };
      }
    }
    
    const expirationDate = getLicenseExpirationMoment(license.expirationDate);
    const now = await getDatabaseNowMoment();
    
    // Vérifier l'expiration (si définie)
    if (expirationDate && expirationDate.isSameOrBefore(now)) {
      return {
        valid: false,
        reason: 'Licence expirée',
        license: license
      };
    }
    
    // Vérifier l'activation
    if (!license.activated) {
      return {
        valid: false,
        activated: false,
        reason: 'Licence non activée',
        license: license
      };
    }
    
    // Network workstations share one cabinet database. The license belongs to
    // that cabinet/database, not to one workstation. Ignore machineId values
    // written by older versions so existing activations keep working.
    
    // Calculer les jours restants (null si pas d'expiration)
    const daysRemaining = expirationDate ? Math.max(0, expirationDate.diff(now, 'days')) : null;
    
    return {
      valid: true,
      daysRemaining: daysRemaining,
      expirationDate: license.expirationDate,
      machineMismatch: false,
      license: license
    };
  } catch (error) {
    console.error('❌ Erreur lors de la validation de la licence:', error);
    return {
      valid: false,
      reason: 'Erreur lors de la validation'
    };
  }
}

/**
 * Active une clé de licence
 */
export async function activateLicense(licenseKey) {
  try {
    const normalizedKey = String(licenseKey || '').trim().toUpperCase();
    const licenseType = getLicenseTypeFromKey(normalizedKey);

    if (!licenseType) {
      return {
        success: false,
        reason: 'Clé de licence invalide'
      };
    }

    await ensureBuiltinLicenseRecord(normalizedKey);
    
    const license = await queryOne(
      "SELECT * FROM licenses WHERE `key` = ?",
      [normalizedKey]
    );
    
    if (!license) {
      return {
        success: false,
        reason: 'Clé de licence non trouvée'
      };
    }
    
    const validation = await validateLicense(normalizedKey);

    if (license.activated && validation.valid) {
      return {
        success: true,
        message: 'Licence déjà activée',
        clientName: license.clientName,
        licenseType
      };
    }

    if (validation.reason === 'Licence expirée' && [LICENSE_TYPES.trial, LICENSE_TYPES.duration].includes(licenseType)) {
      return {
        success: false,
        reason: 'La clé temporaire a expiré'
      };
    }

    const now = await getDatabaseNowMoment();
    const activationDate = now.format('YYYY-MM-DD HH:mm:ss');
    const durationDays = getDurationDaysFromKey(normalizedKey);
    const expirationDate = [LICENSE_TYPES.trial, LICENSE_TYPES.duration].includes(licenseType)
      ? (
          license.activationDate && license.expirationDate
            ? license.expirationDate
            : now.clone().add(durationDays || 7, 'days').format('YYYY-MM-DD HH:mm:ss')
        )
      : licenseType === LICENSE_TYPES.annual
        ? now.clone().add(1, 'year').format('YYYY-MM-DD HH:mm:ss')
      : null;

    await withTransaction(async () => {
      await run(
        "UPDATE licenses SET activated = 0, status = CASE WHEN expirationDate IS NOT NULL AND expirationDate < ? THEN 'expired' ELSE 'inactive' END WHERE activated = 1",
        [activationDate]
      );

      const activationResult = await run(
        "UPDATE licenses SET activated = 1, activationDate = ?, expirationDate = ?, status = 'activated', machineId = NULL WHERE `key` = ?",
        [activationDate, expirationDate, normalizedKey]
      );

      if (!activationResult?.changes) {
        throw new Error('La clé de licence a disparu pendant l’activation');
      }
    });
    
    return {
      success: true,
      message: 'Licence activée avec succès',
      clientName: license.clientName,
      licenseType,
      durationDays,
      expirationDate: expirationDate || 'Illimitée'
    };
  } catch (error) {
    console.error('❌ Erreur lors de l\'activation de la licence:', error);
    return {
      success: false,
      reason: 'Erreur lors de l\'activation'
    };
  }
}

export async function deactivateLicense(licenseKey) {
  try {
    const normalizedKey = String(licenseKey || '').trim().toUpperCase();
    const license = await queryOne(
      "SELECT * FROM licenses WHERE `key` = ?",
      [normalizedKey]
    );

    if (!license) {
      return { success: false, reason: 'Clé de licence non trouvée' };
    }

    const now = await getDatabaseNowMoment();
    await run(
      "UPDATE licenses SET activated = 0, status = CASE WHEN expirationDate IS NOT NULL AND expirationDate < ? THEN 'expired' ELSE 'inactive' END WHERE `key` = ?",
      [now.format('YYYY-MM-DD HH:mm:ss'), normalizedKey]
    );

    return {
      success: true,
      message: 'Licence désactivée avec succès'
    };
  } catch (error) {
    console.error('❌ Erreur lors de la désactivation de la licence:', error);
    return {
      success: false,
      reason: 'Erreur lors de la désactivation'
    };
  }
}

/**
 * Récupère les informations de la licence active
 */
export async function getActiveLicense() {
  try {
    const license = await getValidActiveLicense();
    
    return license || null;
  } catch (error) {
    console.error('❌ Erreur lors de la récupération de la licence active:', error);
    return null;
  }
}

/**
 * Récupère les informations de licence formatées
 */
export async function getLicenseInfo() {
  try {
    const license = await getActiveLicense();
    
    if (!license) {
      return null;
    }
    
    const validation = await validateLicense(license.key);
    
    return {
      clientName: license.clientName,
      licenseKey: license.key,
      licenseType: getLicenseTypeFromKey(license.key),
      activatedDate: license.activationDate,
      expirationDate: license.expirationDate || 'Illimitée',
      daysRemaining: validation.daysRemaining,
      status: license.status
    };
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des infos de licence:', error);
    return null;
  }
}

export async function generateLicenseKeys({ durationDays = 7, quantity = 1, clientName = 'Licence générée' } = {}) {
  const days = Math.min(365, Math.max(1, Math.round(Number(durationDays) || 7)));
  const count = Math.min(200, Math.max(1, Math.round(Number(quantity) || 1)));
  const label = String(clientName || `Licence ${days} jours`).trim();
  const now = await getDatabaseNowMoment();
  const generatedDate = now.format('YYYY-MM-DD HH:mm:ss');
  const generated = [];

  for (let index = 0; index < count; index += 1) {
    let key = '';
    let exists = true;
    while (exists) {
      const partA = crypto.randomBytes(3).toString('hex').toUpperCase();
      const signature = calculateKeySignature(days, partA);
      key = `MEDPRO-${days}D-${partA}-${signature}`;
      exists = await queryOne('SELECT id FROM licenses WHERE `key` = ?', [key]);
    }

    const rowClientName = `${label} - ${days} jours`;
    await run(
      `INSERT INTO licenses (id, \`key\`, clientName, generatedDate, expirationDate, activated, activationDate, machineId, status)
       VALUES (?, ?, ?, ?, NULL, 0, NULL, NULL, 'pending')`,
      [crypto.randomUUID(), key, rowClientName, generatedDate]
    );
    generated.push({ key, durationDays: days, clientName: rowClientName, status: 'pending' });
  }

  return { success: true, generated, durationDays: days, quantity: count };
}

/**
 * Récupère le statut de la licence pour affichage (login)
 */
export async function getLicenseStatus() {
  try {
    const activeLicense = await getActiveLicense();
    
    if (!activeLicense) {
      const trialLicense = await queryOne("SELECT * FROM licenses WHERE `key` = ?", [TRIAL_LICENSE_KEY]);
      const unlimitedLicense = await queryOne("SELECT * FROM licenses WHERE `key` = ?", [UNLIMITED_LICENSE_KEY]);

      return {
        expired: false,
        hasActiveLicense: false,
        licenseKey: null,
        clientName: null,
        message: 'Aucune licence active. Connectez-vous avec un compte administrateur pour activer une clé.',
        availableKeys: {
          trial5: FIVE_DAY_LICENSE_KEY,
          trial7: trialLicense?.key || TRIAL_LICENSE_KEY,
          trial15: FIFTEEN_DAY_LICENSE_KEY,
          annual: ANNUAL_LICENSE_KEY,
          unlimited: unlimitedLicense?.key || UNLIMITED_LICENSE_KEY
        }
      };
    }
    
    const validation = await validateLicense(activeLicense.key);
    const expirationDate = activeLicense.expirationDate
      ? moment(activeLicense.expirationDate).format('DD/MM/YYYY')
      : 'Illimitée';
    
    if (!validation.valid) {
      return {
        expired: true,
        hasActiveLicense: false,
        licenseType: getLicenseTypeFromKey(activeLicense.key),
        expirationDate: expirationDate,
        message: validation.reason,
        licenseKey: activeLicense.key,
        clientName: activeLicense.clientName,
        durationDays: getDurationDaysFromKey(activeLicense.key)
      };
    }
    
    return {
      expired: false,
      hasActiveLicense: true,
      expirationDate: expirationDate,
      daysRemaining: validation.daysRemaining,
      status: activeLicense.status,
      licenseKey: activeLicense.key,
      clientName: activeLicense.clientName,
      licenseType: getLicenseTypeFromKey(activeLicense.key),
      durationDays: getDurationDaysFromKey(activeLicense.key)
    };
  } catch (error) {
    console.error('❌ Erreur lors de la récupération du statut:', error);
    return null;
  }
}
