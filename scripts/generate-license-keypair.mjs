#!/usr/bin/env node
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const args = process.argv.slice(2);
const valueFor = (name) => args[args.indexOf(name) + 1];
const outputDir = path.resolve(valueFor('--out-dir') || 'developer-keys');

await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
await fs.writeFile(path.join(outputDir, 'medcareso-license-private.pem'), privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
await fs.writeFile(path.join(outputDir, 'medcareso-license-public.pem'), publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o644 });
console.log(`Ed25519 keys created in ${outputDir}`);
console.log('Move the private key to an encrypted developer-only location. Never copy it into the application or repository.');
