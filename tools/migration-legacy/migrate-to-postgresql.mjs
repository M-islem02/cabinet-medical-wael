#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';
import pg from 'pg';

const { Pool } = pg;

const BOOLEAN_COLUMN_NAMES = new Set([
  'activated',
  'isAdmin',
  'isSuperAdmin',
  'isActive',
  'publicBookingEnabled',
  'publicBookingQrEnabled',
  'featurePrescriptions',
  'featureWaitingRoom',
  'featureDailySummary',
  'featureStatistics',
  'featureInventory',
  'featureKineStaff',
  'featureRehabilitation',
  'featureDentistry',
  'featureCardiology',
  'featureMedicalImaging',
  'featureDebts',
  'featureCalendar',
  'featureDocuments',
  'featureSickLeaves',
  'featureMultiPC',
  'featureAiReports',
  'featureAiChatbot',
  'featureAfterSalesSupport',
  'isPaid',
  'isUnpaid',
  'isRead',
  'isArchived',
  'emailSent',
  'smsSent',
  'autoSendOnCreate',
  'enabled',
  'documentHideSignature'
]);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function usage() {
  return `
Usage:
  node tools/migration-legacy/migrate-to-postgresql.mjs --source sqlite --sqlite /path/client.db \\
    --pg-host localhost --pg-port 5432 --pg-db cabinet_db --pg-user cabinet_app --pg-password PhysioCare2024! --truncate

  node tools/migration-legacy/migrate-to-postgresql.mjs --source mariadb \\
    --mariadb-host localhost --mariadb-port 3306 --mariadb-db physiocare --mariadb-user physiocare_user --mariadb-password secret \\
    --pg-host localhost --pg-port 5432 --pg-db cabinet_db --pg-user cabinet_app --pg-password PhysioCare2024! --truncate

Options:
  --source sqlite|mariadb      Source database type.
  --sqlite PATH                SQLite .db path when --source sqlite.
  --truncate                   Empty PostgreSQL tables before copying data.
  --report PATH                Optional JSON report path.
  --schema NAME                PostgreSQL schema name, default: public.
`;
}

function q(identifier) {
  return `"${String(identifier).toLowerCase().replace(/"/g, '""')}"`;
}

function mysqlQ(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function normalizeType(rawType = '', columnName = '') {
  const type = String(rawType || '').toLowerCase();
  if (BOOLEAN_COLUMN_NAMES.has(columnName) || type.includes('bool')) return 'BOOLEAN';
  if (type.includes('bigint')) return 'BIGINT';
  if (type.includes('int')) return 'INTEGER';
  if (type.includes('decimal') || type.includes('numeric') || type.includes('double') || type.includes('float') || type.includes('real')) return 'NUMERIC';
  if (type.includes('blob') || type.includes('binary')) return 'BYTEA';
  if (type === 'date' || type.includes(' date')) return 'DATE';
  if (type.includes('datetime') || type.includes('timestamp')) return 'TIMESTAMP';
  if (type.includes('time')) return 'TIME';
  return 'TEXT';
}

function normalizeDefault(rawDefault) {
  if (rawDefault === undefined || rawDefault === null) return '';
  const value = String(rawDefault).trim();
  if (!value || /^NULL$/i.test(value)) return '';
  if (/current_timestamp/i.test(value)) return ' DEFAULT CURRENT_TIMESTAMP';
  if (/^['"].*['"]$/.test(value)) return ` DEFAULT ${value}`;
  if (/^-?\d+(\.\d+)?$/.test(value)) return ` DEFAULT ${value}`;
  return '';
}

function normalizeValue(value, pgType) {
  if (value === undefined) return null;
  if (value === '') {
    if (['DATE', 'TIME', 'TIMESTAMP', 'NUMERIC', 'INTEGER', 'BIGINT', 'BOOLEAN'].includes(pgType)) return null;
    return value;
  }
  if (pgType === 'BOOLEAN') {
    if (value === true || value === false) return value;
    if (value === 1 || value === '1') return true;
    if (value === 0 || value === '0') return false;
    if (typeof value === 'string') {
      const normalized = value.toLowerCase();
      if (['true', 'yes', 'y', 'on'].includes(normalized)) return true;
      if (['false', 'no', 'n', 'off'].includes(normalized)) return false;
    }
  }
  return value;
}

async function createTargetTable(pgPool, table, columns) {
  const pkColumns = columns.filter((column) => column.primaryKey).map((column) => column.name);
  const columnDefs = columns.map((column) => {
    const defaultSql = normalizeDefault(column.defaultValue);
    const notNullSql = column.notNull && !column.primaryKey ? ' NOT NULL' : '';
    return `${q(column.name)} ${column.pgType}${notNullSql}${defaultSql}`;
  });

  if (pkColumns.length > 0) {
    columnDefs.push(`PRIMARY KEY (${pkColumns.map(q).join(', ')})`);
  }

  await pgPool.query(`CREATE TABLE IF NOT EXISTS ${q(table)} (${columnDefs.join(', ')})`);
}

async function copyRows(pgPool, table, columns, rows) {
  if (!rows.length) return 0;
  const insertColumns = columns.filter((column) => Object.prototype.hasOwnProperty.call(rows[0], column.name));
  if (!insertColumns.length) return 0;

  const pkColumns = insertColumns.filter((column) => column.primaryKey).map((column) => column.name);
  const columnSql = insertColumns.map((column) => q(column.name)).join(', ');
  const placeholderSql = insertColumns.map((_, index) => `$${index + 1}`).join(', ');

  const updateColumns = insertColumns.filter((column) => !column.primaryKey);
  const conflictSql = pkColumns.length
    ? ` ON CONFLICT (${pkColumns.map(q).join(', ')}) DO ${updateColumns.length
      ? `UPDATE SET ${updateColumns.map((column) => `${q(column.name)} = EXCLUDED.${q(column.name)}`).join(', ')}`
      : 'NOTHING'}`
    : '';

  const sql = `INSERT INTO ${q(table)} (${columnSql}) VALUES (${placeholderSql})${conflictSql}`;
  let copied = 0;

  for (const row of rows) {
    const values = insertColumns.map((column) => normalizeValue(row[column.name], column.pgType));
    await pgPool.query(sql, values);
    copied += 1;
  }

  return copied;
}

function buildValidationCounts(tableReports, totals) {
  const byTable = Object.fromEntries(tableReports.map((entry) => [entry.table, entry.sourceRows]));
  return {
    patients: byTable.patients || 0,
    treatmentPlans: (byTable.treatment_plans || 0) + (byTable.dental_plans || 0) + (byTable.rehabilitation_plans || 0),
    payments: byTable.payments || 0,
    inventoryItems: byTable.inventory || 0,
    consultations: byTable.consultations || 0,
    prescriptions: byTable.prescriptions || 0,
    totalPaymentAmount: totals.totalPaymentAmount || 0,
    totalPlanCost: totals.totalPlanCost || 0,
    totalPlanPaid: totals.totalPlanPaid || 0,
    totalInventoryQuantity: totals.totalInventoryQuantity || 0
  };
}

function getSqliteSource(sqlitePath) {
  if (!sqlitePath || !fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite source introuvable: ${sqlitePath || '(vide)'}`);
  }

  const db = new Database(sqlitePath, { readonly: true, fileMustExist: true });

  return {
    label: sqlitePath,
    async close() {
      db.close();
    },
    async listTables() {
      return db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .all()
        .map((row) => row.name);
    },
    async getColumns(table) {
      return db.prepare(`PRAGMA table_info(${q(table)})`).all().map((column) => ({
        name: column.name,
        sourceType: column.type || 'TEXT',
        pgType: normalizeType(column.type, column.name),
        notNull: Number(column.notnull) === 1,
        primaryKey: Number(column.pk) > 0,
        defaultValue: column.dflt_value
      }));
    },
    async getRows(table) {
      return db.prepare(`SELECT * FROM ${q(table)}`).all();
    },
    async scalar(sql) {
      try {
        const row = db.prepare(sql).get();
        return row ? Object.values(row)[0] : 0;
      } catch (_) {
        return 0;
      }
    }
  };
}

async function getMariaDbSource(args) {
  const connection = await mysql.createConnection({
    host: args['mariadb-host'] || 'localhost',
    port: Number(args['mariadb-port']) || 3306,
    user: args['mariadb-user'] || 'physiocare_user',
    password: args['mariadb-password'] || '',
    database: args['mariadb-db'] || 'physiocare',
    charset: 'utf8mb4'
  });
  const database = args['mariadb-db'] || 'physiocare';

  return {
    label: `${args['mariadb-host'] || 'localhost'}:${Number(args['mariadb-port']) || 3306}/${database}`,
    async close() {
      await connection.end();
    },
    async listTables() {
      const [rows] = await connection.query(
        `SELECT TABLE_NAME as name
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
         ORDER BY TABLE_NAME`,
        [database]
      );
      return rows.map((row) => row.name);
    },
    async getColumns(table) {
      const [rows] = await connection.query(
        `SELECT COLUMN_NAME as name, DATA_TYPE as dataType, IS_NULLABLE as nullable,
                COLUMN_KEY as columnKey, COLUMN_DEFAULT as defaultValue
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [database, table]
      );
      return rows.map((column) => ({
        name: column.name,
        sourceType: column.dataType || 'text',
        pgType: normalizeType(column.dataType, column.name),
        notNull: column.nullable === 'NO',
        primaryKey: column.columnKey === 'PRI',
        defaultValue: column.defaultValue
      }));
    },
    async getRows(table) {
      const [rows] = await connection.query(`SELECT * FROM ${mysqlQ(table)}`);
      return rows;
    },
    async scalar(sql) {
      try {
        const [rows] = await connection.query(sql);
        return rows?.[0] ? Object.values(rows[0])[0] : 0;
      } catch (_) {
        return 0;
      }
    }
  };
}

async function createPgPool(args) {
  const pool = new Pool({
    host: args['pg-host'] || 'localhost',
    port: Number(args['pg-port']) || 5432,
    user: args['pg-user'] || 'cabinet_app',
    password: args['pg-password'] || 'PhysioCare2024!',
    database: args['pg-db'] || 'cabinet_db',
    max: 4,
    connectionTimeoutMillis: 10000
  });
  await pool.query('SELECT 1');
  return pool;
}

async function tableExists(pgPool, schema, table) {
  const result = await pgPool.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = $2
     ) as exists`,
    [schema, table]
  );
  return result.rows[0]?.exists === true;
}

async function pgCount(pgPool, schema, table) {
  if (!(await tableExists(pgPool, schema, table))) return 0;
  const result = await pgPool.query(`SELECT COUNT(*)::int as count FROM ${q(table)}`);
  return result.rows[0]?.count || 0;
}

async function pgScalar(pgPool, schema, table, expression) {
  if (!(await tableExists(pgPool, schema, table))) return 0;
  try {
    const result = await pgPool.query(`SELECT COALESCE(${expression}, 0)::numeric as value FROM ${q(table)}`);
    return Number(result.rows[0]?.value || 0);
  } catch (_) {
    return 0;
  }
}

async function migrate() {
  const args = parseArgs(process.argv.slice(2));
  const sourceType = String(args.source || '').toLowerCase();

  if (!['sqlite', 'mariadb'].includes(sourceType)) {
    console.error(usage());
    throw new Error('Option --source requise: sqlite ou mariadb');
  }

  const reportPath = args.report
    ? path.resolve(args.report)
    : path.resolve(`migration-postgresql-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

  const source = sourceType === 'sqlite'
    ? getSqliteSource(path.resolve(String(args.sqlite || '')))
    : await getMariaDbSource(args);
  const pgPool = await createPgPool(args);
  const schema = String(args.schema || 'public');

  const report = {
    startedAt: new Date().toISOString(),
    sourceType,
    source: source.label,
    target: `${args['pg-host'] || 'localhost'}:${Number(args['pg-port']) || 5432}/${args['pg-db'] || 'cabinet_db'}`,
    schema,
    truncate: args.truncate === true,
    tables: [],
    totalsBefore: {},
    totalsAfter: {},
    validation: {},
    warnings: []
  };

  try {
    const tables = await source.listTables();

    await pgPool.query('BEGIN');
    await pgPool.query(`CREATE SCHEMA IF NOT EXISTS ${q(schema)}`);
    await pgPool.query(`SET search_path TO ${q(schema)}`);

    if (args.truncate === true) {
      for (const table of tables) {
        if (await tableExists(pgPool, schema, table)) {
          await pgPool.query(`TRUNCATE TABLE ${q(table)} RESTART IDENTITY CASCADE`);
        }
      }
    }

    for (const table of tables) {
      const columns = await source.getColumns(table);
      const rows = await source.getRows(table);
      await createTargetTable(pgPool, table, columns);
      const copiedRows = await copyRows(pgPool, table, columns, rows);
      const targetRows = await pgCount(pgPool, schema, table);

      report.tables.push({
        table,
        sourceRows: rows.length,
        copiedRows,
        targetRows,
        columns: columns.length,
        status: targetRows >= rows.length ? 'ok' : 'mismatch'
      });

      if (targetRows < rows.length) {
        report.warnings.push(`${table}: source=${rows.length}, target=${targetRows}`);
      }
    }

    await pgPool.query('COMMIT');

    const sourceTotals = {
      totalPaymentAmount: Number(await source.scalar('SELECT COALESCE(SUM(amount), 0) FROM payments')),
      totalPlanCost: Number(await source.scalar('SELECT COALESCE(SUM(totalCost), 0) FROM treatment_plans')),
      totalPlanPaid: Number(await source.scalar('SELECT COALESCE(SUM(totalPaid), 0) FROM treatment_plans')),
      totalInventoryQuantity: Number(await source.scalar('SELECT COALESCE(SUM(quantity), 0) FROM inventory'))
    };

    const targetTotals = {
      totalPaymentAmount: await pgScalar(pgPool, schema, 'payments', 'SUM("amount")'),
      totalPlanCost: await pgScalar(pgPool, schema, 'treatment_plans', 'SUM("totalCost")'),
      totalPlanPaid: await pgScalar(pgPool, schema, 'treatment_plans', 'SUM("totalPaid")'),
      totalInventoryQuantity: await pgScalar(pgPool, schema, 'inventory', 'SUM("quantity")')
    };

    report.totalsBefore = buildValidationCounts(report.tables, sourceTotals);
    report.totalsAfter = {
      patients: await pgCount(pgPool, schema, 'patients'),
      treatmentPlans: (await pgCount(pgPool, schema, 'treatment_plans')) + (await pgCount(pgPool, schema, 'dental_plans')) + (await pgCount(pgPool, schema, 'rehabilitation_plans')),
      payments: await pgCount(pgPool, schema, 'payments'),
      inventoryItems: await pgCount(pgPool, schema, 'inventory'),
      consultations: await pgCount(pgPool, schema, 'consultations'),
      prescriptions: await pgCount(pgPool, schema, 'prescriptions'),
      ...targetTotals
    };

    report.validation = {
      patientsMatch: report.totalsBefore.patients === report.totalsAfter.patients,
      treatmentPlansMatch: report.totalsBefore.treatmentPlans === report.totalsAfter.treatmentPlans,
      paymentsMatch: report.totalsBefore.payments === report.totalsAfter.payments,
      inventoryItemsMatch: report.totalsBefore.inventoryItems === report.totalsAfter.inventoryItems,
      paymentAmountMatch: Number(report.totalsBefore.totalPaymentAmount) === Number(report.totalsAfter.totalPaymentAmount),
      inventoryQuantityMatch: Number(report.totalsBefore.totalInventoryQuantity) === Number(report.totalsAfter.totalInventoryQuantity)
    };

    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

    console.log('Migration PostgreSQL terminee.');
    console.log(`Rapport: ${reportPath}`);
    console.table(report.tables.map((entry) => ({
      table: entry.table,
      source: entry.sourceRows,
      copied: entry.copiedRows,
      target: entry.targetRows,
      status: entry.status
    })));
    console.log('Validation L9.2:', report.validation);

    if (report.warnings.length) {
      console.warn('Avertissements:');
      for (const warning of report.warnings) console.warn(`- ${warning}`);
    }
  } catch (error) {
    await pgPool.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await source.close().catch(() => {});
    await pgPool.end().catch(() => {});
  }
}

migrate().catch((error) => {
  console.error(`Migration echouee: ${error.message}`);
  process.exitCode = 1;
});
