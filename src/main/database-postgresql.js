/**
 * Module de gestion de la base de donnees PostgreSQL.
 * Utilise par les installations migrees avec le script L5.
 */

import pg from 'pg';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { startLocalPostgres, stopLocalPostgres } from './postgres-local-service.js';
import { ensurePostgreSqlSchema, getCanonicalColumnNameMap } from './database-schema-postgresql.js';

const { Pool } = pg;

let pool = null;
let dbConfig = null;
const BOOLEAN_COLUMN_NAMES = new Set([
  'activated',
  'isadmin',
  'issuperadmin',
  'isactive',
  'publicbookingenabled',
  'publicbookingqrenabled',
  'featureprescriptions',
  'featurewaitingroom',
  'featuredailysummary',
  'featurestatistics',
  'featureinventory',
  'featurekinestaff',
  'featurerehabilitation',
  'featuredentistry',
  'featurecardiology',
  'featuremedicalimaging',
  'featuredebts',
  'featurecalendar',
  'featuredocuments',
  'featuresickleaves',
  'featuremultipc',
  'featureaireports',
  'featureaichatbot',
  'featureaftersalessupport',
  'ispaid',
  'isunpaid',
  'isread',
  'isarchived',
  'emailsent',
  'smssent',
  'autosendoncreate',
  'enabled',
  'documenthidesignature'
]);
const RESULT_KEY_MAP = new Map([
  ...getCanonicalColumnNameMap(),
  ['firstname', 'firstName'],
  ['lastname', 'lastName'],
  ['fullname', 'fullName'],
  ['patientid', 'patientId'],
  ['consultationid', 'consultationId'],
  ['doctorid', 'doctorId'],
  ['userid', 'userId'],
  ['primarydoctorid', 'primaryDoctorId'],
  ['createdbyuserid', 'createdByUserId'],
  ['createdat', 'createdAt'],
  ['updatedat', 'updatedAt'],
  ['dateofbirth', 'dateOfBirth'],
  ['socialsecuritynumber', 'socialSecurityNumber'],
  ['bloodtype', 'bloodType'],
  ['medicalhistory', 'medicalHistory'],
  ['emergencycontact', 'emergencyContact'],
  ['emergencyphone', 'emergencyPhone'],
  ['paymentdate', 'paymentDate'],
  ['paymentmethod', 'paymentMethod'],
  ['treatmenttype', 'treatmentType'],
  ['totalcost', 'totalCost'],
  ['totalpaid', 'totalPaid'],
  ['sessionscount', 'sessionsCount'],
  ['completedsessions', 'completedSessions'],
  ['minquantity', 'minQuantity'],
  ['purchaseprice', 'purchasePrice'],
  ['sellingprice', 'sellingPrice'],
  ['supplierid', 'supplierId'],
  ['suppliername', 'supplierName'],
  ['photopath', 'photoPath'],
  ['lotid', 'lotId'],
  ['lotnumber', 'lotNumber'],
  ['purchasedate', 'purchaseDate'],
  ['expirationdate', 'expirationDate'],
  ['initialquantity', 'initialQuantity'],
  ['remainingquantity', 'remainingQuantity'],
  ['unitprice', 'unitPrice'],
  ['itemname', 'itemName'],
  ['contactname', 'contactName'],
  ['purchaseorderid', 'purchaseOrderId'],
  ['orderedquantity', 'orderedQuantity'],
  ['receivedquantity', 'receivedQuantity'],
  ['orderdate', 'orderDate'],
  ['expecteddeliverydate', 'expectedDeliveryDate'],
  ['totalamount', 'totalAmount'],
  ['invoicenumber', 'invoiceNumber'],
  ['invoiceamount', 'invoiceAmount'],
  ['possaleid', 'posSaleId'],
  ['saledate', 'saleDate'],
  ['customername', 'customerName'],
  ['discountamount', 'discountAmount'],
  ['discountpercent', 'discountPercent'],
  ['finalamount', 'finalAmount'],
  ['totalprice', 'totalPrice'],
  ['paymentmethod', 'paymentMethod'],
  ['paymentid', 'paymentId'],
  ['doctorname', 'doctorName'],
  ['assigneddoctorid', 'assignedDoctorId'],
  ['serialnumber', 'serialNumber'],
  ['warrantyend', 'warrantyEnd'],
  ['assignedroom', 'assignedRoom'],
  ['lastmaintenancedate', 'lastMaintenanceDate'],
  ['nextmaintenancedate', 'nextMaintenanceDate'],
  ['specificfields', 'specificFields'],
  ['equipmentid', 'equipmentId'],
  ['maintenancedate', 'maintenanceDate'],
  ['maintenancetype', 'maintenanceType'],
  ['performedby', 'performedBy'],
  ['isactive', 'isActive'],
  ['isadmin', 'isAdmin'],
  ['issuperadmin', 'isSuperAdmin'],
  ['lastlogin', 'lastLogin']
]);

function normalizeResultRow(row) {
  const normalized = {};
  for (const [key, value] of Object.entries(row || {})) {
    normalized[RESULT_KEY_MAP.get(key) || key] = value;
  }
  return normalized;
}

function normalizeResultRows(rows) {
  return Array.isArray(rows) ? rows.map(normalizeResultRow) : rows;
}

export const DEFAULT_POSTGRES_CONFIG = {
  mode: 'local',
  host: 'localhost',
  port: 5432,
  database: 'cabinet_db',
  user: 'cabinet_app',
  password: 'PhysioCare2024!',
  ssl: false
};

function normalizeLegacyConfig(config = {}) {
  if (config.database && typeof config.database === 'object') {
    return config.database;
  }
  if (config.postgresql && typeof config.postgresql === 'object') {
    return {
      mode: config.postgresql.mode || 'network',
      ...config.postgresql
    };
  }
  if (config.type === 'mariadb' && config.mariadb) {
    return {
      mode: 'network',
      host: config.mariadb.host,
      port: 5432,
      database: config.mariadb.database || DEFAULT_POSTGRES_CONFIG.database,
      user: config.mariadb.user || DEFAULT_POSTGRES_CONFIG.user,
      password: config.mariadb.password || DEFAULT_POSTGRES_CONFIG.password
    };
  }
  return config;
}

export function normalizePostgresConfig(config = {}) {
  const source = normalizeLegacyConfig(config);
  return {
    mode: source.mode === 'network' ? 'network' : 'local',
    host: source.host || DEFAULT_POSTGRES_CONFIG.host,
    port: Number(source.port) || DEFAULT_POSTGRES_CONFIG.port,
    database: source.database || DEFAULT_POSTGRES_CONFIG.database,
    user: source.user || DEFAULT_POSTGRES_CONFIG.user,
    password: source.password || DEFAULT_POSTGRES_CONFIG.password,
    ssl: source.ssl === true ? { rejectUnauthorized: false } : false
  };
}

export function loadConfig() {
  const configPath = path.join(app.getPath('userData'), 'database-config.json');

  if (fs.existsSync(configPath)) {
    const configData = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configData);
    return normalizePostgresConfig(config);
  }

  return normalizePostgresConfig(DEFAULT_POSTGRES_CONFIG);
}

function convertPlaceholders(sql) {
  let index = 0;
  let inSingle = false;
  let inDouble = false;
  let inDollar = false;
  let dollarTag = '';
  let out = '';

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (!inDouble && !inDollar && char === "'" && sql[i - 1] !== '\\') {
      inSingle = !inSingle;
      out += char;
      continue;
    }

    if (!inSingle && !inDollar && char === '"') {
      inDouble = !inDouble;
      out += char;
      continue;
    }

    if (!inSingle && !inDouble && char === '$') {
      const match = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        const tag = match[0];
        if (!inDollar) {
          inDollar = true;
          dollarTag = tag;
        } else if (tag === dollarTag) {
          inDollar = false;
          dollarTag = '';
        }
        out += tag;
        i += tag.length - 1;
        continue;
      }
    }

    if (!inSingle && !inDouble && !inDollar && char === '?' && next !== '?') {
      index += 1;
      out += `$${index}`;
      continue;
    }

    out += char;
  }

  return out;
}

function transformInsertOrReplace(sql) {
  const match = sql.match(/^\s*INSERT\s+OR\s+REPLACE\s+INTO\s+("[^"]+"|\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([\s\S]+)\)\s*$/i);
  if (!match) return sql;

  const [, table, rawColumns, values] = match;
  const columns = rawColumns.split(',').map((column) => column.trim()).filter(Boolean);
  const idColumn = columns.find((column) => column.replace(/"/g, '') === 'id') || columns[0];
  const updateColumns = columns.filter((column) => column !== idColumn);
  const updateSql = updateColumns.length
    ? ` DO UPDATE SET ${updateColumns.map((column) => `${column} = EXCLUDED.${column}`).join(', ')}`
    : ' DO NOTHING';

  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values}) ON CONFLICT (${idColumn})${updateSql}`;
}

function transformInsertOrIgnore(sql) {
  const match = sql.match(/^\s*INSERT\s+OR\s+IGNORE\s+INTO\s+([\s\S]+)$/i);
  if (!match) return sql;
  return `INSERT INTO ${match[1]} ON CONFLICT DO NOTHING`;
}

function normalizeColumnToken(column) {
  return String(column || '').replace(/["`]/g, '').trim().toLowerCase();
}

function isBooleanColumn(column) {
  return BOOLEAN_COLUMN_NAMES.has(normalizeColumnToken(column));
}

function splitTopLevelCsv(value) {
  const parts = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let depth = 0;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];

    if (char === "'" && !inDouble && value[i - 1] !== '\\') {
      inSingle = !inSingle;
    } else if (char === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (!inSingle && !inDouble) {
      if (char === '(') depth += 1;
      if (char === ')') depth -= 1;
      if (char === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function normalizeBooleanLiteral(value) {
  if (/^0$/.test(value)) return 'FALSE';
  if (/^1$/.test(value)) return 'TRUE';
  return value;
}

function transformBooleanInsertLiterals(sql) {
  return sql.replace(
    /(INSERT\s+INTO\s+("[^"]+"|\w+)\s*\(([^)]+)\)\s*VALUES\s*\()([^;]+)(\)\s*(?:ON\s+CONFLICT[\s\S]*)?$)/i,
    (match, prefix, table, rawColumns, rawValues, suffix) => {
      const columns = splitTopLevelCsv(rawColumns);
      const values = splitTopLevelCsv(rawValues);
      if (!columns.length || columns.length !== values.length) return match;
      const normalizedValues = values.map((value, index) => (
        isBooleanColumn(columns[index]) ? normalizeBooleanLiteral(value) : value
      ));
      return `${prefix}${normalizedValues.join(', ')}${suffix}`;
    }
  );
}

function coerceBooleanParamValue(value) {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  return value;
}

function coerceBooleanParams(sql, params = []) {
  if (!Array.isArray(params) || params.length === 0) return params;
  const nextParams = [...params];

  const insertMatch = sql.match(/INSERT\s+INTO\s+("[^"]+"|\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
  if (insertMatch) {
    const columns = splitTopLevelCsv(insertMatch[2]);
    const values = splitTopLevelCsv(insertMatch[3]);
    columns.forEach((column, index) => {
      if (!isBooleanColumn(column)) return;
      const placeholder = values[index]?.match(/^\$(\d+)$/);
      if (!placeholder) return;
      const paramIndex = Number(placeholder[1]) - 1;
      nextParams[paramIndex] = coerceBooleanParamValue(nextParams[paramIndex]);
    });
  }

  const assignmentRegex = /\b("?[\w]+"?)\s*=\s*\$(\d+)/g;
  let match;
  while ((match = assignmentRegex.exec(sql)) !== null) {
    if (!isBooleanColumn(match[1])) continue;
    const paramIndex = Number(match[2]) - 1;
    nextParams[paramIndex] = coerceBooleanParamValue(nextParams[paramIndex]);
  }

  return nextParams;
}

function translateSql(sql) {
  let translated = String(sql)
    .replace(/`([^`]+)`/g, '"$1"')
    .replace(/\bCURDATE\s*\(\s*\)/gi, 'CURRENT_DATE')
    .replace(/DATE\s*\(\s*'now'\s*,\s*'\+(\d+)\s+day'\s*\)/gi, "CURRENT_DATE + INTERVAL '$1 day'")
    .replace(/DATE\s*\(\s*'now'\s*\)/gi, 'CURRENT_DATE')
    .replace(/\bDATE\s*\(\s*([A-Za-z0-9_".?]+)\s*\)/gi, 'CAST($1 AS DATE)')
    .replace(/\bTIME\s*\(\s*([A-Za-z0-9_".?]+)\s*\)/gi, 'CAST($1 AS TIME)')
    .replace(/strftime\s*\(\s*'%Y-%m'\s*,\s*([^)]+)\)/gi, "TO_CHAR($1::timestamp, 'YYYY-MM')")
    .replace(/strftime\s*\(\s*'%Y-W%W'\s*,\s*([^)]+)\)/gi, "TO_CHAR($1::timestamp, 'IYYY-\"W\"IW')")
    .replace(/\bVALUES\s*\("([^"]+)"\)/gi, 'EXCLUDED."$1"');

  translated = transformInsertOrReplace(translated);
  translated = transformInsertOrIgnore(translated);
  translated = transformBooleanInsertLiterals(translated);

  translated = convertPlaceholders(translated);

  // Compatibility with SQL written for SQLite/MySQL booleans.
  translated = translated
    .replace(/\b(isActive|isAdmin|isSuperAdmin|activated|feature[A-Za-z0-9_]+|publicBookingEnabled|publicBookingQrEnabled|isPaid|isUnpaid|isRead|isArchived|emailSent|smsSent|autoSendOnCreate|enabled)\s*=\s*1\b/g, '"$1" = TRUE')
    .replace(/"([^"]+)"\s*=\s*TRUE/g, '$1 = TRUE')
    .replace(/\b(isActive|isAdmin|isSuperAdmin|activated|feature[A-Za-z0-9_]+|publicBookingEnabled|publicBookingQrEnabled|isPaid|isUnpaid|isRead|isArchived|emailSent|smsSent|autoSendOnCreate|enabled)\s*=\s*0\b/g, '$1 = FALSE')
    .replace(/\bNOT\s+(isActive|isAdmin|isSuperAdmin|activated|isRead|enabled)\b/g, 'NOT $1');

  return translated;
}

function prepareSql(sql, params = []) {
  const translated = translateSql(sql);
  return {
    sql: translated,
    params: coerceBooleanParams(translated, normalizeParams(params))
  };
}

function normalizeParams(params = []) {
  if (!Array.isArray(params)) return params;
  return params.map((value) => (value === undefined ? null : value));
}

export async function initializeDatabase() {
  dbConfig = normalizePostgresConfig(loadConfig());

  if (dbConfig.mode === 'local') {
    await startLocalPostgres(dbConfig);
    await waitForPostgres(dbConfig);
  }

  await ensureDatabaseExists(dbConfig);

  pool = new Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    ssl: dbConfig.ssl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }

  await ensurePostgreSqlSchema(pool);
  console.log(`Connected to PostgreSQL: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
  return pool;
}

export async function ensureSchemaForConfig(config) {
  const targetConfig = normalizePostgresConfig(config);
  const schemaPool = new Pool({
    host: targetConfig.host,
    port: targetConfig.port,
    user: targetConfig.user,
    password: targetConfig.password,
    database: targetConfig.database,
    ssl: targetConfig.ssl,
    max: 2,
    connectionTimeoutMillis: 10000
  });

  try {
    await schemaPool.query('SELECT 1');
    await ensurePostgreSqlSchema(schemaPool);
    return { success: true, database: targetConfig.database };
  } finally {
    await schemaPool.end();
  }
}

export function getDatabase() {
  if (!pool) {
    throw new Error('Base de donnees PostgreSQL non initialisee');
  }
  return pool;
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  stopLocalPostgres();
}

export async function query(sql, params = []) {
  const prepared = prepareSql(sql, params);
  const result = await pool.query(prepared.sql, prepared.params);
  return normalizeResultRows(result.rows);
}

export async function run(sql, params = []) {
  const prepared = prepareSql(sql, params);
  const result = await pool.query(prepared.sql, prepared.params);
  return {
    rowCount: result.rowCount,
    affectedRows: result.rowCount,
    changes: result.rowCount,
    rows: result.rows
  };
}

export async function queryOne(sql, params = []) {
  const prepared = prepareSql(sql, params);
  const result = await pool.query(prepared.sql, prepared.params);
  return result.rows[0] ? normalizeResultRow(result.rows[0]) : null;
}

export async function testConnection(config) {
  const targetConfig = normalizePostgresConfig(config);
  const testPool = new Pool({
    host: targetConfig.host,
    port: targetConfig.port,
    user: targetConfig.user,
    password: targetConfig.password,
    database: targetConfig.database,
    ssl: targetConfig.ssl,
    max: 1,
    connectionTimeoutMillis: 7000
  });

  try {
    await testPool.query('SELECT 1');
    return { success: true, message: 'Connexion reussie' };
  } catch (error) {
    return { success: false, message: error.message, error: error.message };
  } finally {
    await testPool.end().catch(() => {});
  }
}

export function getConfig() {
  return dbConfig || normalizePostgresConfig(loadConfig());
}

async function waitForPostgres(config, timeoutMs = 15000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    const testPool = new Pool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: 'postgres',
      max: 1,
      connectionTimeoutMillis: 1000
    });

    try {
      await testPool.query('SELECT 1');
      await testPool.end();
      return;
    } catch (error) {
      lastError = error;
      await testPool.end().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw lastError || new Error('PostgreSQL local did not become ready');
}

async function ensureDatabaseExists(config) {
  const adminPool = new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: 'postgres',
    max: 1,
    connectionTimeoutMillis: 7000
  });

  try {
    const exists = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [config.database]);
    if (exists.rowCount === 0) {
      await adminPool.query(`CREATE DATABASE "${String(config.database).replace(/"/g, '""')}"`);
    }
  } finally {
    await adminPool.end().catch(() => {});
  }
}

export async function getDatabaseStatus(config = getConfig()) {
  const targetConfig = normalizePostgresConfig(config);
  const result = await testConnection(targetConfig);
  const tableCounts = {};

  if (result.success) {
    const statusPool = new Pool({
      host: targetConfig.host,
      port: targetConfig.port,
      user: targetConfig.user,
      password: targetConfig.password,
      database: targetConfig.database,
      ssl: targetConfig.ssl,
      max: 1,
      connectionTimeoutMillis: 3000
    });
    try {
      for (const table of ['patients', 'treatment_plans', 'inventory']) {
        try {
          const count = await statusPool.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
          tableCounts[table] = Number(count.rows[0]?.count || 0);
        } catch (_) {
          tableCounts[table] = 0;
        }
      }
    } finally {
      await statusPool.end().catch(() => {});
    }
  }

  return {
    engine: 'PostgreSQL',
    mode: targetConfig.mode,
    host: targetConfig.host,
    port: targetConfig.port,
    connected: result.success,
    error: result.success ? null : (result.error || result.message),
    tableCounts
  };
}
