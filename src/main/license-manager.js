/**
 * Offline licence manager.
 *
 * A licence is a signed JSON document.  The private Ed25519 key never enters
 * the application; only the public key below is packaged with MedCareSO.
 */
import { app } from 'electron';
import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const LICENSE_FILE = 'license.medcareso.json';
const CLOCK_FILE = '.license-clock';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_KEY_FILE = path.join(__dirname, 'security', 'license-public-key.pem');
const CLOCK_TOLERANCE_MS = 5 * 60 * 1000;

let cachedFingerprint = null;
let monitorTimer = null;

function canonicalPayload(license) {
  const payload = {
    version: Number(license.version || 1),
    licenseId: String(license.licenseId || ''),
    cabinetName: String(license.cabinetName || ''),
    issuedAt: String(license.issuedAt || ''),
    expiresAt: license.expiresAt ? String(license.expiresAt) : null,
    machineId: String(license.machineId || ''),
    features: Array.isArray(license.features) ? [...license.features].map(String).sort() : []
  };
  return JSON.stringify(payload);
}

function getSecurityDirectory() {
  return path.join(app.getPath('userData'), 'security');
}

function getLicensePath() {
  return path.join(getSecurityDirectory(), LICENSE_FILE);
}

function getClockPath() {
  return path.join(getSecurityDirectory(), CLOCK_FILE);
}

async function readStableMachineValue() {
  try {
    if (process.platform === 'linux') {
      return (await fs.readFile('/etc/machine-id', 'utf8')).trim();
    }
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile', '-Command', '(Get-CimInstance Win32_ComputerSystemProduct).UUID'
      ], { windowsHide: true, timeout: 4000 });
      return stdout.trim();
    }
    if (process.platform === 'darwin') {
      const { stdout } = await execFileAsync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { timeout: 4000 });
      const match = stdout.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
      return match?.[1] || '';
    }
  } catch (_) {
    // A deterministic fallback is still preferable to storing a mutable UUID.
  }
  return `${os.hostname()}|${os.arch()}|${os.cpus()?.[0]?.model || ''}`;
}

export async function getMachineFingerprint() {
  if (cachedFingerprint) return cachedFingerprint;
  const stableValue = await readStableMachineValue();
  cachedFingerprint = crypto.createHash('sha256')
    .update(`MedCareSO|v1|${process.platform}|${stableValue}`)
    .digest('hex');
  return cachedFingerprint;
}

async function readPublicKey() {
  const key = await fs.readFile(PUBLIC_KEY_FILE, 'utf8');
  if (!key.includes('BEGIN PUBLIC KEY')) {
    throw new Error('Clé publique de licence non configurée. Installez la clé publique avant de créer la version client.');
  }
  return key;
}

async function readInstalledLicense() {
  try {
    return JSON.parse(await fs.readFile(getLicensePath(), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error('Fichier de licence illisible ou corrompu');
  }
}

async function writeJsonAtomically(targetPath, data, mode = 0o600) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
  const tempPath = `${targetPath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode });
  await fs.rename(tempPath, targetPath);
  try { await fs.chmod(targetPath, mode); } catch (_) {}
}

async function validateClock(now = Date.now()) {
  try {
    const state = JSON.parse(await fs.readFile(getClockPath(), 'utf8'));
    const fingerprint = await getMachineFingerprint();
    const expected = crypto.createHmac('sha256', fingerprint)
      .update(String(state.lastSeenAt || ''))
      .digest('hex');
    if (!state.lastSeenAt || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(state.mac || '')))) {
      return { valid: false, reason: 'Horloge de licence corrompue' };
    }
    if (now + CLOCK_TOLERANCE_MS < Number(state.lastSeenAt)) {
      return { valid: false, reason: 'Date système antérieure à la dernière utilisation enregistrée' };
    }
  } catch (error) {
    if (error.code !== 'ENOENT') return { valid: false, reason: 'Horloge de licence illisible' };
  }
  return { valid: true };
}

async function writeClock(now = Date.now()) {
  const fingerprint = await getMachineFingerprint();
  const state = { lastSeenAt: now };
  state.mac = crypto.createHmac('sha256', fingerprint).update(String(now)).digest('hex');
  await writeJsonAtomically(getClockPath(), state);
}

async function assessLicense(license) {
  if (!license || typeof license !== 'object') return { valid: false, reason: 'Aucune licence signée installée' };
  if (!license.licenseId || !license.cabinetName || !license.issuedAt || !license.machineId || !license.signature) {
    return { valid: false, reason: 'Licence incomplète' };
  }
  const fingerprint = await getMachineFingerprint();
  if (!crypto.timingSafeEqual(Buffer.from(String(license.machineId)), Buffer.from(fingerprint))) {
    return { valid: false, reason: 'Cette licence est liée à une autre machine' };
  }
  const publicKey = await readPublicKey();
  const signature = Buffer.from(String(license.signature), 'base64');
  const signatureValid = crypto.verify(null, Buffer.from(canonicalPayload(license), 'utf8'), publicKey, signature);
  if (!signatureValid) return { valid: false, reason: 'Signature cryptographique de licence invalide' };

  const now = Date.now();
  const clock = await validateClock(now);
  if (!clock.valid) return clock;
  const expiration = license.expiresAt ? Date.parse(license.expiresAt) : null;
  if (license.expiresAt && (!Number.isFinite(expiration) || expiration < now)) {
    return { valid: false, reason: 'Licence expirée' };
  }
  await writeClock(now);
  return {
    valid: true,
    license,
    daysRemaining: expiration ? Math.max(0, Math.ceil((expiration - now) / 86400000)) : null
  };
}

function parseCandidate(candidate) {
  if (candidate && typeof candidate === 'object') return candidate;
  if (typeof candidate !== 'string' || !candidate.trim()) throw new Error('Sélectionnez un fichier de licence signé');
  return JSON.parse(candidate);
}

export async function validateLicense() {
  try {
    return await assessLicense(await readInstalledLicense());
  } catch (error) {
    return { valid: false, reason: error.message || 'Validation de licence impossible' };
  }
}

export async function checkLicenseAtStartup() {
  const result = await validateLicense();
  return result.valid
    ? { hasActiveLicense: true, license: result.license, warning: false, daysRemaining: result.daysRemaining }
    : { hasActiveLicense: false, reason: result.reason || 'Licence non valide' };
}

export async function activateLicense(candidate) {
  try {
    const license = parseCandidate(candidate);
    const validation = await assessLicense(license);
    if (!validation.valid) return { success: false, reason: validation.reason };
    await writeJsonAtomically(getLicensePath(), license);
    return {
      success: true,
      clientName: license.cabinetName,
      licenseId: license.licenseId,
      expirationDate: license.expiresAt || 'Illimitée',
      daysRemaining: validation.daysRemaining,
      message: 'Licence signée activée avec succès'
    };
  } catch (error) {
    return { success: false, reason: error.message || 'Activation impossible' };
  }
}

export async function deactivateLicense() {
  try {
    await fs.unlink(getLicensePath());
    return { success: true, message: 'Licence désactivée' };
  } catch (error) {
    if (error.code === 'ENOENT') return { success: true, message: 'Aucune licence active' };
    return { success: false, reason: error.message || 'Désactivation impossible' };
  }
}

export async function getLicenseStatus() {
  const result = await validateLicense();
  if (!result.valid) {
    return { expired: result.reason === 'Licence expirée', hasActiveLicense: false, message: result.reason };
  }
  return {
    expired: false,
    hasActiveLicense: true,
    clientName: result.license.cabinetName,
    licenseKey: result.license.licenseId,
    licenseType: result.license.expiresAt ? 'subscription' : 'unlimited',
    expirationDate: result.license.expiresAt || 'Illimitée',
    daysRemaining: result.daysRemaining,
    status: 'signed'
  };
}

// Kept only to avoid breaking old IPC callers. Issuing licences inside the
// customer application is intentionally disabled.
export async function generateLicenseKeys() {
  return { success: false, error: 'La génération est réservée à l’outil développeur de signature.' };
}

export function startLicenseMonitor(onInvalid, intervalMs = 10 * 60 * 1000) {
  if (monitorTimer) clearInterval(monitorTimer);
  monitorTimer = setInterval(async () => {
    const result = await validateLicense();
    if (!result.valid && typeof onInvalid === 'function') onInvalid(result);
  }, intervalMs);
  monitorTimer.unref?.();
}

export function stopLicenseMonitor() {
  if (monitorTimer) clearInterval(monitorTimer);
  monitorTimer = null;
}
