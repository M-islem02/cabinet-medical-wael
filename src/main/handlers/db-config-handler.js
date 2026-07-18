/**
 * PostgreSQL-only database configuration IPC handlers.
 */

import { ipcMain, app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getResponsiveWindowBounds, applyWindowPresentation } from '../window-utils.js';
import {
  DEFAULT_POSTGRES_CONFIG,
  ensureSchemaForConfig,
  getDatabaseStatus,
  normalizePostgresConfig,
  testConnection as testPostgreSqlConnection
} from '../database-postgresql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let dbConfigWindow = null;

function getConfigPath() {
  return path.join(app.getPath('userData'), 'database-config.json');
}

function normalizeConfigFile(rawConfig = {}) {
  return {
    database: normalizePostgresConfig(rawConfig)
  };
}

export function loadDatabaseConfig() {
  const configPath = getConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      return normalizeConfigFile(JSON.parse(fs.readFileSync(configPath, 'utf-8')));
    }
  } catch (error) {
    console.error('Erreur lors du chargement de la config DB:', error);
  }
  return { database: normalizePostgresConfig(DEFAULT_POSTGRES_CONFIG) };
}

export function saveDatabaseConfig(config) {
  const configPath = getConfigPath();
  const normalized = normalizeConfigFile(config);
  fs.writeFileSync(configPath, JSON.stringify(normalized, null, 2), 'utf-8');
  return normalized;
}

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
      preload: path.join(__dirname, '..', '..', 'preload', 'preload-bundled.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
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

export function setupDbConfigHandlers() {
  ipcMain.handle('dbConfig:get', () => loadDatabaseConfig());

  ipcMain.handle('dbConfig:getStatus', async () => {
    try {
      const config = loadDatabaseConfig();
      return { success: true, data: await getDatabaseStatus(config.database) };
    } catch (error) {
      const config = loadDatabaseConfig();
      return {
        success: true,
        data: {
          engine: 'PostgreSQL',
          mode: config.database.mode,
          host: config.database.host,
          port: config.database.port,
          connected: false,
          error: error.message,
          tableCounts: { patients: 0, treatment_plans: 0, inventory: 0 }
        }
      };
    }
  });

  ipcMain.handle('dbConfig:save', async (event, config) => {
    try {
      const pending = normalizeConfigFile(config);
      if (pending.database.mode === 'network') {
        const connectionTest = await testPostgreSqlConnection(pending.database);
        if (!connectionTest.success) {
          return { success: false, error: connectionTest.error || connectionTest.message || 'Connexion PostgreSQL impossible' };
        }
        await ensureSchemaForConfig(pending.database);
      }
      const normalized = saveDatabaseConfig(pending);
      return { success: true, config: normalized };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dbConfig:testConnection', async (event, config) => {
    try {
      const normalized = normalizePostgresConfig(config?.database || config || loadDatabaseConfig().database);
      return await testPostgreSqlConnection(normalized);
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dbConfig:restart', () => {
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle('dbConfig:cancel', () => {
    if (dbConfigWindow) {
      dbConfigWindow.close();
    }
  });

  ipcMain.handle('dbConfig:showWindow', () => {
    createDbConfigWindow();
    return { success: true };
  });
}

export function isMariaDBMode() {
  return false;
}

export function getMariaDBConfig() {
  return null;
}
