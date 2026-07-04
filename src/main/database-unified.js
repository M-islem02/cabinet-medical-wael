/**
 * Module unifiÃ© de gestion de base de donnÃ©es
 * SÃ©lectionne automatiquement SQLite ou MariaDB selon la configuration
 */

import path from 'path';
import fs from 'fs';
import { app } from 'electron';

let currentMode = 'sqlite'; // 'sqlite' ou 'mariadb'
let dbModule = null;
let cachedDatabaseConfig = null;

/**
 * Convertit undefined en null pour la compatibilitÃ© MariaDB
 */
function sanitizeParams(params) {
  if (!Array.isArray(params)) return params;
  return params.map(p => p === undefined ? null : p);
}

/**
 * Charge la configuration de la base de donnÃ©es.
 * The configuration is cached in memory after the first read to avoid repeated
 * synchronous disk access on every query.
 */
export function loadDatabaseConfig() {
  if (cachedDatabaseConfig) {
    return cachedDatabaseConfig;
  }

  try {
    const configPath = path.join(app.getPath('userData'), 'database-config.json');

    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf-8');
      cachedDatabaseConfig = JSON.parse(configData);
      return cachedDatabaseConfig;
    }

    cachedDatabaseConfig = { type: 'sqlite' };
    return cachedDatabaseConfig;
  } catch (error) {
    console.error('Erreur lecture config DB:', error);
    cachedDatabaseConfig = { type: 'sqlite' };
    return cachedDatabaseConfig;
  }
}

/**
 * Clears the cached database configuration so the next call reloads it from disk.
 * Useful after the configuration has been updated.
 */
export function clearDatabaseConfigCache() {
  cachedDatabaseConfig = null;
}

/**
 * Initialise la base de donnÃ©es selon la configuration
 * Avec fallback automatique vers SQLite si MariaDB est inaccessible
 */
export async function initializeDatabase() {
  const config = loadDatabaseConfig();
  currentMode = config.type || 'sqlite';

  console.log(`Database mode configured: ${currentMode.toUpperCase()}`);

  if (currentMode === 'mariadb') {
    try {
      // Charger le module MariaDB dynamiquement
      dbModule = await import('./database-mariadb.js');
      return await dbModule.initializeDatabase();
    } catch (error) {
      // Si MariaDB Ã©choue, fallback vers SQLite
      console.error('MariaDB unavailable:', error.code || 'UNKNOWN', error.message);
      console.log('Automatic fallback to SQLite (local mode)...');

      currentMode = 'sqlite';
      dbModule = await import('./database-sqlite3.js');
      const result = await dbModule.initializeDatabase();
      console.log('SQLite connection established in fallback mode');
      console.log('Note: Data will be stored locally. Reconfigure MariaDB if needed.');
      return result;
    }
  } else {
    // Utiliser SQLite par dÃ©faut
    dbModule = await import('./database-sqlite3.js');
    return dbModule.initializeDatabase();
  }
}

/**
 * ExÃ©cute une requÃªte SELECT
 */
export function query(sql, params = []) {
  if (!dbModule) {
    throw new Error('Base de donnÃ©es non initialisÃ©e');
  }
  return dbModule.query(sql, sanitizeParams(params));
}

/**
 * ExÃ©cute une requÃªte SELECT qui retourne une seule ligne
 */
export function queryOne(sql, params = []) {
  if (!dbModule) {
    throw new Error('Base de donnÃ©es non initialisÃ©e');
  }
  return dbModule.queryOne(sql, sanitizeParams(params));
}

/**
 * ExÃ©cute une requÃªte INSERT/UPDATE/DELETE
 */
export function run(sql, params = []) {
  if (!dbModule) {
    throw new Error('Base de donnÃ©es non initialisÃ©e');
  }
  return dbModule.run(sql, sanitizeParams(params));
}

/**
 * Ferme la connexion Ã  la base de donnÃ©es
 */
export function closeDatabase() {
  if (!dbModule) return;
  return dbModule.closeDatabase();
}

/**
 * Retourne le mode actuel (sqlite ou mariadb)
 */
export function getCurrentMode() {
  return currentMode;
}

/**
 * Retourne l'objet base de donnÃ©es (pour cas spÃ©ciaux)
 */
export function getDatabase() {
  if (!dbModule) return null;
  return dbModule.getDatabase();
}
