/**
 * Ce fichier conserve l'ancienne interface Promise basée sur sqlite3,
 * mais délègue désormais toute la logique à l'implémentation moderne
 * utilisant better-sqlite3 dans `database.js`. Cela évite la compilation
 * native de sqlite3 lors du build Electron tout en gardant la compatibilité
 * avec le reste du code.
 */

import {
  initializeDatabase as initializeBetterDatabase,
  closeDatabase as closeBetterDatabase,
  query as querySync,
  queryOne as queryOneSync,
  run as runSync,
  getDatabase as getBetterDatabase
} from './database.js';

export async function initializeDatabase() {
  return initializeBetterDatabase();
}

export function query(sql, params = []) {
  return Promise.resolve(querySync(sql, params));
}

export function queryOne(sql, params = []) {
  return Promise.resolve(queryOneSync(sql, params));
}

export function run(sql, params = []) {
  return Promise.resolve(runSync(sql, params));
}

export function closeDatabase() {
  closeBetterDatabase();
  return Promise.resolve();
}

export function getDatabase() {
  return getBetterDatabase();
}
