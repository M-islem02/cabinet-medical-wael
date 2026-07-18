#!/usr/bin/env node
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const args = process.argv.slice(2);
const valueFor = (name, fallback = '') => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const privateKeyPath = valueFor('--private-key');
const machineId = valueFor('--machine-id');
const cabinetName = valueFor('--cabinet');
const outPath = valueFor('--out');
const expiresAt = valueFor('--expires') || null;
const featureValues = valueFor('--features', '').split(',').map((item) => item.trim()).filter(Boolean).sort();
if (!privateKeyPath || !machineId || !cabinetName || !outPath) {
  throw new Error('Usage: npm run license:sign -- --private-key KEY --machine-id FINGERPRINT --cabinet "Cabinet" --expires 2027-07-18 --out licence.medcareso.json');
}
if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) throw new Error('--expires must use YYYY-MM-DD');
const license = {
  version: 1,
  licenseId: crypto.randomUUID(),
  cabinetName,
  issuedAt: new Date().toISOString(),
  expiresAt: expiresAt ? `${expiresAt}T23:59:59.999Z` : null,
  machineId: machineId.toLowerCase(),
  features: featureValues
};
const canonical = JSON.stringify(license);
const privateKey = await fs.readFile(path.resolve(privateKeyPath), 'utf8');
license.signature = crypto.sign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64');
await fs.writeFile(path.resolve(outPath), JSON.stringify(license, null, 2) + '\n', { mode: 0o600 });
console.log(`Signed licence created: ${path.resolve(outPath)}`);
