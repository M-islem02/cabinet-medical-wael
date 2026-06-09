/**
 * Module de gestion des licences
 * Gère une clé d'essai 7 jours et une clé illimitée.
 */

import { queryOne, run, query } from './database-unified.js';
import crypto from 'crypto';
import moment from 'moment';
import os from 'os';

export const TRIAL_LICENSE_KEY = 'MEDPRO-TRIAL-7JOURS';
export const ANNUAL_LICENSE_KEY = 'MEDPRO-ANNUELLE-1AN';
export const UNLIMITED_LICENSE_KEY = 'MEDPRO-ILLIMITEE-ACTIVE';
export const LEGACY_MASTER_LICENSE_KEY = 'MEDPRO-MASTER-2024-ACTIVATED';
const LICENSE_TYPES = {
  trial: 'trial',
  annual: 'annual',
  unlimited: 'unlimited'
};

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

/**
 * Génère un ID de machine unique basé sur le matériel
 */
export function generateMachineId() {
  const networkInterfaces = os.networkInterfaces();
  const allAddresses = Object.values(networkInterfaces).flat();
  const macAddress = allAddresses.find(iface => iface.mac && iface.mac !== '00:00:00:00:00:00')?.mac || 'unknown';
  const hostname = os.hostname();
  
  const combined = `${hostname}:${macAddress}`;
  return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 32);
}

function getLicenseTypeFromKey(licenseKey) {
  if (licenseKey === TRIAL_LICENSE_KEY) return LICENSE_TYPES.trial;
  if (licenseKey === ANNUAL_LICENSE_KEY || licenseKey === LEGACY_MASTER_LICENSE_KEY) return LICENSE_TYPES.annual;
  if (licenseKey === UNLIMITED_LICENSE_KEY) return LICENSE_TYPES.unlimited;
  return null;
}

async function getValidActiveLicense() {
  const licenses = await query(
    "SELECT * FROM licenses WHERE activated = 1 ORDER BY CASE WHEN `key` = ? THEN 0 ELSE 1 END, activationDate DESC, generatedDate DESC",
    [UNLIMITED_LICENSE_KEY]
  );

  const now = await getDatabaseNowMoment();
  for (const license of licenses) {
    const expirationDate = getLicenseExpirationMoment(license.expirationDate);
    if (expirationDate && expirationDate.isSameOrBefore(now)) {
      await run(
        "UPDATE licenses SET activated = 0, status = 'expired' WHERE id = ?",
        [license.id]
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
    
    const machineMismatch = !!(license.machineId && license.machineId !== generateMachineId());
    
    // Calculer les jours restants (null si pas d'expiration)
    const daysRemaining = expirationDate ? Math.max(0, expirationDate.diff(now, 'days')) : null;
    
    return {
      valid: true,
      daysRemaining: daysRemaining,
      expirationDate: license.expirationDate,
      machineMismatch,
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

    if (validation.reason === 'Licence expirée' && licenseType === LICENSE_TYPES.trial) {
      return {
        success: false,
        reason: 'La clé d\'essai a expiré'
      };
    }

    const now = await getDatabaseNowMoment();
    const activationDate = now.format('YYYY-MM-DD HH:mm:ss');
    const expirationDate = licenseType === LICENSE_TYPES.trial
      ? (
          license.activationDate && license.expirationDate
            ? license.expirationDate
            : now.clone().add(7, 'days').format('YYYY-MM-DD HH:mm:ss')
        )
      : licenseType === LICENSE_TYPES.annual
        ? now.clone().add(1, 'year').format('YYYY-MM-DD HH:mm:ss')
      : null;

    await run(
      "UPDATE licenses SET activated = 0, status = CASE WHEN expirationDate IS NOT NULL AND expirationDate < ? THEN 'expired' ELSE 'inactive' END WHERE activated = 1",
      [activationDate]
    );

    await run(
      "UPDATE licenses SET activated = 1, activationDate = ?, expirationDate = ?, status = 'activated', machineId = ? WHERE `key` = ?",
      [activationDate, expirationDate, generateMachineId(), normalizedKey]
    );
    
    return {
      success: true,
      message: 'Licence activée avec succès',
      clientName: license.clientName,
      licenseType,
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
          trial: trialLicense?.key || TRIAL_LICENSE_KEY,
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
        clientName: activeLicense.clientName
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
      licenseType: getLicenseTypeFromKey(activeLicense.key)
    };
  } catch (error) {
    console.error('❌ Erreur lors de la récupération du statut:', error);
    return null;
  }
}
