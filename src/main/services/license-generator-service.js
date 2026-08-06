import crypto from 'crypto';
import electron from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const { app } = electron || {};
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECURITY_DIR = path.join(__dirname, '..', 'security');
const PUBLIC_KEY_PATH = path.join(SECURITY_DIR, 'license-public-key.pem');

function getPrivateKeysDirectory() {
  const baseDir = app?.getPath ? app.getPath('userData') : path.join(os.homedir(), '.config', 'medcareso');
  const userDir = path.join(baseDir, 'security');
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true, mode: 0o700 });
  }
  return userDir;
}

function getPrivateKeyPath() {
  return path.join(getPrivateKeysDirectory(), 'developer-license-private.pem');
}

/**
 * Assures that a matching Ed25519 key pair exists for generating and verifying licenses.
 */
export function ensureLicenseKeyPair() {
  const privateKeyPath = getPrivateKeyPath();
  
  if (fs.existsSync(privateKeyPath) && fs.existsSync(PUBLIC_KEY_PATH)) {
    try {
      const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
      const publicKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
      // Quick validation test
      const testData = Buffer.from('test-payload', 'utf8');
      const sig = crypto.sign(null, testData, privateKey);
      if (crypto.verify(null, testData, publicKey, sig)) {
        return { privateKey, publicKey };
      }
    } catch (_) {
      // Key pair mismatch or corrupt, regenerate below
    }
  }

  // Generate a fresh matching Ed25519 key pair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

  if (!fs.existsSync(SECURITY_DIR)) {
    fs.mkdirSync(SECURITY_DIR, { recursive: true });
  }

  fs.writeFileSync(PUBLIC_KEY_PATH, pubPem, { encoding: 'utf8', mode: 0o644 });
  fs.writeFileSync(privateKeyPath, privPem, { encoding: 'utf8', mode: 0o600 });

  console.log('🔑 Matching Ed25519 license keypair initialized in security directory.');
  return { privateKey: privPem, publicKey: pubPem };
}

/**
 * Generates a signed license token for a client device ID.
 */
export function generateClientLicenseToken({ machineId, cabinetName, expiresAt, features = [] }) {
  if (!machineId || !String(machineId).trim()) {
    throw new Error('Identifiant Machine / Device ID obligatoire');
  }
  if (!cabinetName || !String(cabinetName).trim()) {
    cabinetName = 'Cabinet Médical';
  }

  const { privateKey } = ensureLicenseKeyPair();

  const formattedMachineId = String(machineId).trim().toLowerCase();
  const formattedCabinetName = String(cabinetName).trim();
  let formattedExpiresAt = null;

  if (expiresAt) {
    if (typeof expiresAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
      formattedExpiresAt = `${expiresAt}T23:59:59.999Z`;
    } else if (typeof expiresAt === 'string' && expiresAt.includes('T')) {
      formattedExpiresAt = expiresAt;
    } else {
      const d = new Date(expiresAt);
      if (!isNaN(d.getTime())) {
        formattedExpiresAt = d.toISOString();
      }
    }
  }

  const licensePayload = {
    version: 1,
    licenseId: crypto.randomUUID(),
    cabinetName: formattedCabinetName,
    issuedAt: new Date().toISOString(),
    expiresAt: formattedExpiresAt,
    machineId: formattedMachineId,
    features: Array.isArray(features) ? [...features].sort() : []
  };

  const canonicalJson = JSON.stringify(licensePayload);
  const signature = crypto.sign(null, Buffer.from(canonicalJson, 'utf8'), privateKey).toString('base64');

  const fullLicenseObject = {
    ...licensePayload,
    signature
  };

  const jsonContent = JSON.stringify(fullLicenseObject, null, 2);
  const tokenString = Buffer.from(jsonContent).toString('base64');

  return {
    success: true,
    license: fullLicenseObject,
    jsonContent,
    tokenString,
    licenseId: fullLicenseObject.licenseId,
    cabinetName: fullLicenseObject.cabinetName,
    machineId: fullLicenseObject.machineId,
    expiresAt: fullLicenseObject.expiresAt || 'Illimitée'
  };
}
