import { app } from 'electron';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const securityDir = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(securityDir, '..', '..', '..');

export async function verifyApplicationIntegrity() {
  if (!app.isPackaged) return { valid: true, skipped: true };
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(securityDir, 'integrity-manifest.json'), 'utf8'));
    const publicKey = await fs.readFile(path.join(securityDir, 'license-public-key.pem'), 'utf8');
    const payload = JSON.stringify({ version: manifest.version, files: manifest.files });
    const signature = Buffer.from(String(manifest.signature || ''), 'base64');
    if (!manifest.files || !crypto.verify(null, Buffer.from(payload), publicKey, signature)) {
      return { valid: false, reason: 'Manifest de sécurité non signé ou invalide' };
    }
    for (const [relativePath, expectedHash] of Object.entries(manifest.files)) {
      const actualHash = crypto.createHash('sha256').update(await fs.readFile(path.join(sourceRoot, relativePath))).digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(actualHash), Buffer.from(String(expectedHash)))) {
        return { valid: false, reason: `Fichier protégé modifié: ${relativePath}` };
      }
    }
    return { valid: true };
  } catch (error) {
    return { valid: false, reason: error.message || 'Vérification d’intégrité impossible' };
  }
}
