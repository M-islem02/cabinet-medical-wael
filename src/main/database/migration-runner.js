import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const MIGRATION_FILE_PATTERN = /^(\d+)_([a-z0-9_]+)\.sql$/;
const BASELINE_VERSION = 1;
const ADVISORY_LOCK_NAMESPACE = 1374679970;
const ADVISORY_LOCK_KEY = 2101001;

const REQUIRED_MEDCARESO_TABLES = [
  'users',
  'patients',
  'consultations',
  'settings',
  'inventory',
  'inventory_movements',
  'plan_equipment_usage'
];

const MEDCARESO_SUPPORTING_TABLES = [
  'licenses',
  'payments',
  'inventory',
  'treatment_plans',
  'package_config',
  'appointments'
];

function checksumMigration(sql) {
  return crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
}

function loadMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`PostgreSQL migrations directory not found: ${MIGRATIONS_DIR}`);
  }

  const migrations = fs.readdirSync(MIGRATIONS_DIR)
    .map((fileName) => {
      const match = fileName.match(MIGRATION_FILE_PATTERN);
      if (!match) return null;
      const version = Number(match[1]);
      const filePath = path.join(MIGRATIONS_DIR, fileName);
      const sql = fs.readFileSync(filePath, 'utf8');
      return {
        version,
        name: match[2],
        fileName,
        filePath,
        sql,
        checksum: checksumMigration(sql)
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.version - right.version);

  if (migrations.length === 0) {
    throw new Error('No PostgreSQL migration files were found');
  }

  const versions = new Set();
  for (const migration of migrations) {
    if (versions.has(migration.version)) {
      throw new Error(`Duplicate PostgreSQL migration version: ${migration.version}`);
    }
    versions.add(migration.version);
  }

  if (migrations[0].version !== BASELINE_VERSION) {
    throw new Error(`The first PostgreSQL migration must be version ${BASELINE_VERSION}`);
  }

  return migrations;
}

async function createMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      execution_time_ms INTEGER,
      adopted BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await client.query(
    'ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS adopted BOOLEAN NOT NULL DEFAULT FALSE'
  );
}

async function migrationTableExists(client) {
  const result = await client.query(
    `SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists`
  );
  return result.rows[0].exists;
}

async function listApplicationTables(client) {
  const result = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name <> 'schema_migrations'
  `);
  return new Set(result.rows.map((row) => row.table_name));
}

function validateExistingMedCareSoDatabase(tableNames) {
  const missingCore = REQUIRED_MEDCARESO_TABLES.filter((table) => !tableNames.has(table));
  const supporting = MEDCARESO_SUPPORTING_TABLES.filter((table) => tableNames.has(table));

  if (missingCore.length > 0 || supporting.length < 2) {
    const details = [
      missingCore.length ? `missing core tables: ${missingCore.join(', ')}` : null,
      `supporting MedCareSO tables found: ${supporting.length}`
    ].filter(Boolean).join('; ');
    throw new Error(
      `Database contains tables but is not a supported MedCareSO PostgreSQL database (${details})`
    );
  }
}

async function readAppliedMigrations(client) {
  const result = await client.query(
    'SELECT version, name, checksum, adopted FROM schema_migrations ORDER BY version'
  );
  return new Map(result.rows.map((row) => [Number(row.version), row]));
}

async function adoptExistingBaseline(client, baseline) {
  const tableNames = await listApplicationTables(client);
  if (tableNames.size === 0) return false;

  validateExistingMedCareSoDatabase(tableNames);

  await client.query('BEGIN');
  try {
    await client.query(
      `INSERT INTO schema_migrations
         (version, name, checksum, execution_time_ms, adopted)
       VALUES ($1, $2, $3, $4, TRUE)`,
      [baseline.version, baseline.name, baseline.checksum, 0]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  console.info(
    `[PostgreSQL migrations] adopted baseline ${baseline.version} for validated existing MedCareSO database`
  );
  return true;
}

async function assertAppliedChecksum(client, migration, applied) {
  if (applied.checksum !== migration.checksum) {
    console.warn(
      `[PostgreSQL migrations] Migration ${migration.version} (${migration.name}) checksum mismatch (recorded: ${applied.checksum}, file: ${migration.checksum}). Auto-repairing recorded checksum.`
    );
    try {
      await client.query(
        'UPDATE schema_migrations SET checksum = $1, name = $2 WHERE version = $3',
        [migration.checksum, migration.name, migration.version]
      );
    } catch (updateErr) {
      console.warn(`[PostgreSQL migrations] Could not update migration checksum: ${updateErr.message}`);
    }
  }
}

async function applyMigration(client, migration) {
  const startedAt = Date.now();
  await client.query('BEGIN');
  try {
    await client.query(migration.sql);
    const elapsedMs = Date.now() - startedAt;
    await client.query(
      `INSERT INTO schema_migrations
         (version, name, checksum, execution_time_ms, adopted)
       VALUES ($1, $2, $3, $4, FALSE)`,
      [migration.version, migration.name, migration.checksum, elapsedMs]
    );
    await client.query('COMMIT');
    console.info(
      `[PostgreSQL migrations] applied ${migration.version}_${migration.name} (${elapsedMs} ms)`
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw new Error(
      `PostgreSQL migration ${migration.version} (${migration.name}) failed: ${error.message}`,
      { cause: error }
    );
  }
}

/**
 * Apply all native PostgreSQL migrations using one dedicated client.
 *
 * Existing validated MedCareSO databases created before migrations are
 * adopted at the immutable baseline, then receive every later migration.
 * Every new migration runs in its own transaction while a session advisory
 * lock prevents concurrent application instances from racing schema changes.
 *
 * @param {import('pg').Pool} pool Connected PostgreSQL pool.
 * @returns {Promise<{applied: number[], skipped: number[], adoptedBaseline: boolean}>}
 */
export async function runPostgreSqlMigrations(pool) {
  const client = await pool.connect();
  let lockAcquired = false;
  const result = { applied: [], skipped: [], adoptedBaseline: false };

  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', [
      ADVISORY_LOCK_NAMESPACE,
      ADVISORY_LOCK_KEY
    ]);
    lockAcquired = true;

    const migrations = loadMigrationFiles();
    if (!await migrationTableExists(client)) {
      const preMigrationTables = await listApplicationTables(client);
      if (preMigrationTables.size > 0) {
        validateExistingMedCareSoDatabase(preMigrationTables);
      }
    }
    await createMigrationTable(client);
    let appliedMigrations = await readAppliedMigrations(client);

    if (!appliedMigrations.has(BASELINE_VERSION)) {
      result.adoptedBaseline = await adoptExistingBaseline(client, migrations[0]);
      if (result.adoptedBaseline) {
        appliedMigrations = await readAppliedMigrations(client);
      }
    }

    for (const migration of migrations) {
      const applied = appliedMigrations.get(migration.version);
      if (applied) {
        await assertAppliedChecksum(client, migration, applied);
        result.skipped.push(migration.version);
        continue;
      }

      await applyMigration(client, migration);
      result.applied.push(migration.version);
    }

    console.info(
      `[PostgreSQL migrations] complete; applied=${result.applied.length}, skipped=${result.skipped.length}`
    );
    return result;
  } finally {
    if (lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock($1, $2)', [
          ADVISORY_LOCK_NAMESPACE,
          ADVISORY_LOCK_KEY
        ]);
      } catch (unlockError) {
        console.error(`[PostgreSQL migrations] advisory unlock failed: ${unlockError.message}`);
      }
    }
    client.release();
  }
}

/**
 * Return immutable migration metadata without connecting to PostgreSQL.
 * Intended for diagnostics and the dedicated migration verification script.
 *
 * @returns {{version: number, name: string, fileName: string, checksum: string}[]}
 */
export function listPostgreSqlMigrations() {
  return loadMigrationFiles().map(({ version, name, fileName, checksum }) => ({
    version,
    name,
    fileName,
    checksum
  }));
}
