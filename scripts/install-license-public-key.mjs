#!/usr/bin/env node
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const args = process.argv.slice(2);
const keyPath = args[args.indexOf('--key') + 1];
if (!keyPath) throw new Error('Usage: npm run license:install-public-key -- --key /secure/path/medcareso-license-public.pem');
const publicKey = await fs.readFile(path.resolve(keyPath), 'utf8');
crypto.createPublicKey(publicKey);
const destination = path.resolve('src/main/security/license-public-key.pem');
await fs.writeFile(destination, publicKey.trim() + '\n', { mode: 0o644 });
console.log(`Public key installed: ${destination}`);
