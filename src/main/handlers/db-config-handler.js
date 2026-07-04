/**
 * Module de gestion des handlers IPC pour la configuration de base de données
 */

import { ipcMain, app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getResponsiveWindowBounds, applyWindowPresentation } from '../window-utils.js';
import { migrateSqliteToMariaDb, migrateMariaDbToSqlite } from '../database-migration.js';
import { clearDatabaseConfigCache } from '../database-unified.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let dbConfigWindow = null;

/**
 * Configuration par défaut
 */
const DEFAULT_CONFIG = {
  type: 'sqlite',
  mariadb: {
    host: 'localhost',
    port: 3306,
    user: 'physiocare_user',
    password: '',
    database: 'physiocare'
  }
};

/**
 * Chemin du fichier de configuration
 */
function getConfigPath() {
  return path.join(app.getPath('userData'), 'database-config.json');
}

function getSqlitePath() {
  return path.join(app.getPath('userData'), 'physiocare.db');
}

function getBackupsDir() {
  return path.join(app.getPath('userData'), 'backups');
}

function ensureBackupsDir() {
  const backupsDir = getBackupsDir();
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  return backupsDir;
}

function buildTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

async function testMariaDbConnection(config) {
  const mysql = await import('mysql2/promise');

  const rawHost = (config.host || 'localhost').trim();
  const hostCandidates = [];
  const pushUnique = (host) => {
    if (host && !hostCandidates.includes(host)) hostCandidates.push(host);
  };

  pushUnique(rawHost);
  if (rawHost === 'localhost') {
    pushUnique('127.0.0.1');
  } else if (rawHost === '127.0.0.1') {
    pushUnique('localhost');
  } else {
    pushUnique('127.0.0.1');
    pushUnique('localhost');
  }

  const errors = [];
  for (const host of hostCandidates) {
    try {
      const connection = await mysql.createConnection({
        host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        connectTimeout: 7000
      });

      await connection.ping();
      await connection.end();

      return {
        success: true,
        resolvedHost: host,
        warning: host !== rawHost
          ? `Connexion OK via ${host}. L'hôte configuré (${rawHost}) semble inaccessible.`
          : null
      };
    } catch (candidateError) {
      errors.push(`${host}: ${candidateError.code || 'UNKNOWN'} - ${candidateError.message}`);
    }
  }

  return {
    success: false,
    error: `Connexion MariaDB impossible (${errors.join(' | ')})`
  };
}

/**
 * Charge la configuration de la base de données
 */
export function loadDatabaseConfig() {
  const configPath = getConfigPath();
  
  try {
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configData);
      return { ...DEFAULT_CONFIG, ...config };
    }
  } catch (error) {
    console.error('Erreur lors du chargement de la config DB:', error);
  }
  
  return DEFAULT_CONFIG;
}

/**
 * Sauvegarde la configuration de la base de données
 */
export function saveDatabaseConfig(config) {
  const configPath = getConfigPath();

  try {
    const merged = { ...DEFAULT_CONFIG, ...config };
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8');
    // Clear the in-memory config cache so the new settings are picked up immediately.
    clearDatabaseConfigCache();
    return true;
  } catch (error) {
    console.error('Erreur lors de la sauvegarde de la config DB:', error);
    return false;
  }
}

/**
 * Crée la fenêtre de configuration DB
 */
export function createDbConfigWindow() {
  if (dbConfigWindow) {
    dbConfigWindow.focus();
    return dbConfigWindow;
  }

  const bounds = getResponsiveWindowBounds({
    width: 1040,
    height: 920,
    minWidth: 920,
    minHeight: 700,
    marginX: 72,
    marginY: 72
  });

  dbConfigWindow = new BrowserWindow({
    ...bounds,
    resizable: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    },
    icon: path.join(__dirname, '..', '..', '..', 'assets', 'icon.png')
  });

  applyWindowPresentation(dbConfigWindow, { maximizeWhenTight: true });
  dbConfigWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'db-config.html'));
  
  dbConfigWindow.on('closed', () => {
    dbConfigWindow = null;
  });

  return dbConfigWindow;
}

/**
 * Initialise les handlers IPC pour la configuration DB
 */
export function setupDbConfigHandlers() {
  // Obtenir la configuration actuelle
  ipcMain.handle('dbConfig:get', () => {
    return loadDatabaseConfig();
  });

  // Résumé des données de la base actuelle
  ipcMain.handle('dbConfig:getDataSummary', async () => {
    try {
      const config = loadDatabaseConfig();
      const mode = config.type || 'sqlite';
      const counts = {};
      let tables = [];

      if (mode === 'sqlite') {
        const { getDatabase } = await import('../database.js');
        const sqliteDb = getDatabase();
        tables = sqliteDb
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
          .all()
          .map((row) => row.name);

        for (const table of tables) {
          try {
            counts[table] = sqliteDb
              .prepare(`SELECT COUNT(*) AS c FROM ${quoteIdentifier(table)}`)
              .get().c;
          } catch (countError) {
            counts[table] = null;
            console.warn(`Impossible de compter ${table}:`, countError.message);
          }
        }
      } else {
        const { getDatabase } = await import('../database-mariadb.js');
        const pool = getDatabase();
        const [rows] = await pool.query(
          `SELECT TABLE_NAME AS tableName
           FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
           ORDER BY TABLE_NAME`
        );
        tables = rows.map((row) => row.tableName);

        for (const table of tables) {
          try {
            const [countRows] = await pool.query(
              `SELECT COUNT(*) AS c FROM ${quoteIdentifier(table)}`
            );
            counts[table] = countRows[0]?.c || 0;
          } catch (countError) {
            counts[table] = null;
            console.warn(`Impossible de compter ${table}:`, countError.message);
          }
        }
      }

      return {
        success: true,
        mode,
        counts,
        totalTables: tables.length
      };
    } catch (error) {
      console.error('Erreur résumé base de données:', error);
      return { success: false, error: error.message };
    }
  });

  // Sauvegarder la configuration
  ipcMain.handle('dbConfig:save', async (event, config) => {
    try {
      const currentConfig = loadDatabaseConfig();
      const mergedConfig = { ...DEFAULT_CONFIG, ...config };
      let connectionWarning = null;
      let migrationResult = null;

      // Tester la connexion si la cible est MariaDB
      if (mergedConfig.type === 'mariadb') {
        const connectionTest = await testMariaDbConnection(mergedConfig.mariadb || {});
        if (!connectionTest.success) {
          return { success: false, error: connectionTest.error || 'Connexion MariaDB impossible' };
        }

        if (connectionTest.resolvedHost && connectionTest.resolvedHost !== mergedConfig.mariadb.host) {
          mergedConfig.mariadb.host = connectionTest.resolvedHost;
        }
        connectionWarning = connectionTest.warning || null;
      }

      // Déterminer si une migration automatique est nécessaire
      const typeChanged = currentConfig.type !== mergedConfig.type;
      const explicitFromSqlite = config?.migration?.fromSqlite === true
        && currentConfig.type === 'sqlite'
        && mergedConfig.type === 'mariadb';

      if (typeChanged || explicitFromSqlite) {
        if (currentConfig.type === 'sqlite' && mergedConfig.type === 'mariadb') {
          if (!fs.existsSync(getSqlitePath())) {
            migrationResult = { migrated: false, skipped: true, reason: 'Aucune base SQLite locale trouvée.' };
          } else {
            const rawReport = await migrateSqliteToMariaDb(getSqlitePath(), mergedConfig.mariadb);
            migrationResult = {
              migrated: rawReport.success === true,
              skipped: false,
              success: rawReport.success,
              error: rawReport.error || null,
              reason: rawReport.error || null,
              reportPath: rawReport.reportPath,
              backupPath: rawReport.backupPath,
              copiedTables: rawReport.copiedTables || [],
              warnings: rawReport.warnings || []
            };
          }
        } else if (currentConfig.type === 'mariadb' && mergedConfig.type === 'sqlite') {
          const rawReport = await migrateMariaDbToSqlite(currentConfig.mariadb, getSqlitePath());
          migrationResult = {
            migrated: rawReport.success === true,
            skipped: false,
            success: rawReport.success,
            error: rawReport.error || null,
            reason: rawReport.error || null,
            reportPath: rawReport.reportPath,
            backupPath: rawReport.backupPath,
            copiedTables: rawReport.copiedTables || [],
            warnings: rawReport.warnings || []
          };
        }
      }

      if (migrationResult && migrationResult.success === false) {
        return {
          success: false,
          error: migrationResult.error || 'La migration a échoué',
          warning: connectionWarning,
          migration: migrationResult
        };
      }

      const success = saveDatabaseConfig(mergedConfig);
      return {
        success,
        warning: connectionWarning,
        migration: migrationResult
      };
    } catch (error) {
      console.error('Erreur sauvegarde config DB:', error);
      return { success: false, error: error.message };
    }
  });

  // Tester la connexion MariaDB
  ipcMain.handle('dbConfig:testConnection', async (event, config) => {
    try {
      return await testMariaDbConnection(config);
    } catch (error) {
      console.error('Test connexion MariaDB échoué:', error);
      return { 
        success: false, 
        error: error.message
      };
    }
  });

  // Redémarrer l'application
  ipcMain.handle('dbConfig:restart', () => {
    app.relaunch();
    app.exit(0);
  });

  // Fermer la fenêtre de configuration (annuler)
  ipcMain.handle('dbConfig:cancel', () => {
    if (dbConfigWindow) {
      dbConfigWindow.close();
    }
  });

  // Ouvrir la fenêtre de configuration DB
  ipcMain.handle('dbConfig:showWindow', () => {
    createDbConfigWindow();
    return { success: true };
  });
}

/**
 * Vérifie si on utilise MariaDB
 */
export function isMariaDBMode() {
  const config = loadDatabaseConfig();
  return config.type === 'mariadb';
}

/**
 * Récupère la configuration MariaDB
 */
export function getMariaDBConfig() {
  const config = loadDatabaseConfig();
  return config.mariadb || DEFAULT_CONFIG.mariadb;
}
