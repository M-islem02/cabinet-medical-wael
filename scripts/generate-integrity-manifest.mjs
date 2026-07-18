#!/usr/bin/env node
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const privateKeyFile = process.env.MEDCARESO_LICENSE_PRIVATE_KEY_FILE;
if (!privateKeyFile) throw new Error('Set MEDCARESO_LICENSE_PRIVATE_KEY_FILE to create a signed customer build.');
const files = [
  'src/main/main.js',
  'src/main/security/license-public-key.pem'
];
const hashes = {};
for (const file of files) hashes[file] = crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const payload = JSON.stringify({ version: 1, files: hashes });
const privateKey = await fs.readFile(path.resolve(privateKeyFile), 'utf8');
const manifest = { version: 1, files: hashes, signature: crypto.sign(null, Buffer.from(payload), privateKey).toString('base64') };
await fs.writeFile('src/main/security/integrity-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('Signed integrity manifest generated.');
