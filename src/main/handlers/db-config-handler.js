/**
 * Module de gestion des handlers IPC pour la configuration de base de données
 */

import { ipcMain, app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getResponsiveWindowBounds, applyWindowPresentation } from '../window-utils.js';

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

async function migrateSqliteToMariaDb(targetConfig) {
  const sqlitePath = getSqlitePath();
  if (!fs.existsSync(sqlitePath)) {
    return { migrated: false, skipped: true, reason: 'Aucune base SQLite locale trouvée.' };
  }

  ensureBackupsDir();
  const timestamp = buildTimestamp();
  const sqliteSnapshotPath = path.join(getBackupsDir(), `sqlite-pre-migration-${timestamp}.db`);
  fs.copyFileSync(sqlitePath, sqliteSnapshotPath);

  const { default: Database } = await import('better-sqlite3');
  const mysql = await import('mysql2/promise');

  const sqliteDb = new Database(sqliteSnapshotPath, { readonly: true, fileMustExist: true });
  const mariadb = await mysql.createConnection({
    host: targetConfig.host,
    port: targetConfig.port,
    user: targetConfig.user,
    password: targetConfig.password,
    database: targetConfig.database,
    connectTimeout: 10000,
    multipleStatements: false
  });

  const report = {
    startedAt: new Date().toISOString(),
    sqliteSnapshotPath,
    database: targetConfig.database,
    copiedTables: [],
    warnings: []
  };

  try {
    const sqliteTables = sqliteDb
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((row) => row.name)
      .filter(Boolean);

    await mariadb.query('SET FOREIGN_KEY_CHECKS = 0');
    await mariadb.beginTransaction();

    for (const tableName of sqliteTables) {
      const sqliteRows = sqliteDb.prepare(`SELECT * FROM ${quoteIdentifier(tableName)}`).all();
      if (!sqliteRows.length) {
        continue;
      }

      const [targetExistsRows] = await mariadb.query('SHOW TABLES LIKE ?', [tableName]);
      if (!Array.isArray(targetExistsRows) || targetExistsRows.length === 0) {
        throw new Error(`Migration bloquée: table cible absente dans MariaDB (${tableName})`);
      }

      const [targetColumnsMeta] = await mariadb.query(
        `SELECT COLUMN_NAME as columnName, COLUMN_KEY as columnKey
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [targetConfig.database, tableName]
      );

      const targetColumns = Array.isArray(targetColumnsMeta)
        ? targetColumnsMeta.map((c) => c.columnName)
        : [];
      const targetPkColumns = Array.isArray(targetColumnsMeta)
        ? targetColumnsMeta.filter((c) => c.columnKey === 'PRI').map((c) => c.columnName)
        : [];

      const sqliteColumns = Object.keys(sqliteRows[0] || {});
      const commonColumns = sqliteColumns.filter((col) => targetColumns.includes(col));

      if (!commonColumns.length) {
        throw new Error(`Migration bloquée: aucune colonne commune pour la table ${tableName}`);
      }

      const columnListSql = commonColumns.map(quoteIdentifier).join(', ');
      const placeholders = `(${commonColumns.map(() => '?').join(', ')})`;
      const updateColumns = commonColumns.filter((col) => !targetPkColumns.includes(col));
      const updateClause = updateColumns.length
        ? ` ON DUPLICATE KEY UPDATE ${updateColumns.map((col) => `${quoteIdentifier(col)} = VALUES(${quoteIdentifier(col)})`).join(', ')}`
        : '';
      const insertSql = `INSERT INTO ${quoteIdentifier(tableName)} (${columnListSql}) VALUES ${placeholders}${updateClause}`;

      const statementValues = sqliteRows.map((row) => commonColumns.map((col) => row[col] === undefined ? null : row[col]));
      for (const values of statementValues) {
        await mariadb.query(insertSql, values);
      }

      report.copiedTables.push({
        table: tableName,
        rows: sqliteRows.length,
        columns: commonColumns.length
      });
    }

    await mariadb.commit();
    await mariadb.query('SET FOREIGN_KEY_CHECKS = 1');
    report.finishedAt = new Date().toISOString();

    const reportPath = path.join(getBackupsDir(), `sqlite-to-mariadb-report-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

    return {
      migrated: true,
      skipped: false,
      reportPath,
      sqliteSnapshotPath,
      copiedTables: report.copiedTables
    };
  } catch (error) {
    try {
      await mariadb.rollback();
      await mariadb.query('SET FOREIGN_KEY_CHECKS = 1');
    } catch (_) {
      // ignore rollback restoration errors
    }
    throw error;
  } finally {
    try {
      await mariadb.end();
    } catch (_) {
      // ignore close errors
    }
    try {
      sqliteDb.close();
    } catch (_) {
      // ignore close errors
    }
  }
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
    console.log('✅ Configuration DB sauvegardée:', configPath);
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

  // Sauvegarder la configuration
  ipcMain.handle('dbConfig:save', async (event, config) => {
    try {
      const currentConfig = loadDatabaseConfig();
      const mergedConfig = { ...DEFAULT_CONFIG, ...config };

      if (mergedConfig.type === 'mariadb') {
        const connectionTest = await testMariaDbConnection(mergedConfig.mariadb || {});
        if (!connectionTest.success) {
          return { success: false, error: connectionTest.error || 'Connexion MariaDB impossible' };
        }

        if (connectionTest.resolvedHost && connectionTest.resolvedHost !== mergedConfig.mariadb.host) {
          mergedConfig.mariadb.host = connectionTest.resolvedHost;
        }

        const shouldMigrate = config?.migration?.fromSqlite === true
          && currentConfig.type === 'sqlite';

        let migrationResult = null;
        if (shouldMigrate) {
          migrationResult = await migrateSqliteToMariaDb(mergedConfig.mariadb);
        }

        const success = saveDatabaseConfig(mergedConfig);
        return {
          success,
          warning: connectionTest.warning || null,
          migration: migrationResult
        };
      }

      const success = saveDatabaseConfig(mergedConfig);
      return { success };
    } catch (error) {
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
