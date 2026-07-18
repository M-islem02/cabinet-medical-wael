/**
 * PostgreSQL-only database facade.
 *
 * The application runtime no longer switches between SQLite/MariaDB/PostgreSQL.
 * Legacy engines are supported only by the migration kit outside the runtime.
 */

import {
  initializeDatabase as initializePostgreSqlDatabase,
  closeDatabase as closePostgreSqlDatabase,
  query as postgreSqlQuery,
  queryOne as postgreSqlQueryOne,
  run as postgreSqlRun,
  withTransaction as postgreSqlWithTransaction,
  getDatabase as getPostgreSqlDatabase,
  getConfig as getPostgreSqlConfig,
  loadConfig as loadPostgreSqlConfig
} from './database-postgresql.js';

const currentMode = 'postgresql';

function sanitizeParams(params) {
  if (!Array.isArray(params)) return params;
  return params.map((param) => (param === undefined ? null : param));
}

export function loadDatabaseConfig() {
  return {
    database: loadPostgreSqlConfig()
  };
}

export async function initializeDatabase() {
  return initializePostgreSqlDatabase();
}

export function query(sql, params = []) {
  return postgreSqlQuery(sql, sanitizeParams(params));
}

export function queryOne(sql, params = []) {
  return postgreSqlQueryOne(sql, sanitizeParams(params));
}

export function run(sql, params = []) {
  return postgreSqlRun(sql, sanitizeParams(params));
}

export function withTransaction(task, options = {}) {
  return postgreSqlWithTransaction(task, options);
}

export function closeDatabase() {
  return closePostgreSqlDatabase();
}

export function getCurrentMode() {
  return currentMode;
}

export function getDatabase() {
  return getPostgreSqlDatabase();
}

export function getDatabaseConfig() {
  return getPostgreSqlConfig();
}
