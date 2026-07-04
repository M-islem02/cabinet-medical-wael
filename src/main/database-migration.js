/**
 * Module de migration bidirectionnelle entre SQLite (local) et MariaDB (réseau).
 *
 * Exporte deux fonctions :
 *   - migrateSqliteToMariaDb(sourceSqlitePath, targetMariaDbConfig)
 *   - migrateMariaDbToSqlite(sourceMariaDbConfig, targetSqlitePath)
 *
 * Chaque migration :
 *   - Sauvegarde la base cible avant modification (copie fichier pour SQLite,
 *     rapport de snapshot pour MariaDB)
 *   - Liste les tables utilisateur
 *   - Migre uniquement les colonnes communes entre source et cible
 *   - Préserve les clés primaires / identifiants
 *   - Désactive les clés étrangères pendant la migration et les réactive après
 *   - Retourne un rapport détaillé { success, copiedTables, warnings,
 *     backupPath, reportPath }
 */

import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';

// ---------------------------------------------------------------------------
// Helpers communs
// ---------------------------------------------------------------------------

function getBackupsDir() {
  return path.join(app.getPath('userData'), 'backups');
}

function ensureBackupsDir() {
  const dir = getBackupsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function buildTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function quoteSqliteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function quoteMariaDbIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function createBaseReport(direction) {
  return {
    direction,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    success: false,
    copiedTables: [],
    warnings: [],
    backupPath: null,
    reportPath: null,
    error: null
  };
}

function writeReport(report) {
  try {
    if (report.reportPath) {
      fs.writeFileSync(report.reportPath, JSON.stringify(report, null, 2), 'utf-8');
    }
  } catch (_) {
    // Ignore report write errors
  }
}

// ---------------------------------------------------------------------------
// Helpers SQLite
// ---------------------------------------------------------------------------

function getSqliteTables(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => row.name);
}

function getSqliteColumns(db, tableName) {
  return db.prepare(`PRAGMA table_info(${quoteSqliteIdentifier(tableName)})`).all();
}

function mapSqliteTypeToMariaDb(column) {
  if (column.pk) {
    return 'VARCHAR(36)';
  }

  const type = String(column.type || 'TEXT').toUpperCase();

  if (type.includes('BOOL')) {
    return 'BOOLEAN';
  }
  if (/INT|SERIAL/.test(type) && !/POINT/.test(type)) {
    return 'INT';
  }
  if (/REAL|FLOA|DOUB|DEC|NUM/.test(type)) {
    return 'DECIMAL(19,6)';
  }
  if (type.includes('BLOB')) {
    return 'LONGBLOB';
  }

  return 'LONGTEXT';
}

function buildMariaDbCreateTableSql(tableName, sqliteColumns) {
  const columnDefs = sqliteColumns.map((col) => {
    let def = `${quoteMariaDbIdentifier(col.name)} ${mapSqliteTypeToMariaDb(col)}`;
    if (col.notnull && col.dflt_value === undefined) {
      def += ' NOT NULL';
    }
    return def;
  });

  const pkColumns = sqliteColumns.filter((col) => col.pk).map((col) => quoteMariaDbIdentifier(col.name));
  if (pkColumns.length > 0) {
    columnDefs.push(`PRIMARY KEY (${pkColumns.join(', ')})`);
  }

  return `CREATE TABLE IF NOT EXISTS ${quoteMariaDbIdentifier(tableName)} (${columnDefs.join(', ')}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
}

function backupSqliteFile(sqlitePath) {
  if (!fs.existsSync(sqlitePath)) {
    return null;
  }

  ensureBackupsDir();
  const timestamp = buildTimestamp();
  const baseName = path.basename(sqlitePath, path.extname(sqlitePath));
  const ext = path.extname(sqlitePath) || '.db';
  const backupPath = path.join(getBackupsDir(), `${baseName}-pre-migration-${timestamp}${ext}`);
  fs.copyFileSync(sqlitePath, backupPath);
  return backupPath;
}

function restoreSqliteBackup(backupPath, targetPath) {
  if (!backupPath || !fs.existsSync(backupPath)) {
    return;
  }
  try {
    fs.copyFileSync(backupPath, targetPath);
  } catch (_) {
    // Best-effort restore
  }
}

// ---------------------------------------------------------------------------
// Helpers MariaDB
// ---------------------------------------------------------------------------

async function getMariaDbTables(conn, databaseName) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME AS tableName
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME`,
    [databaseName]
  );
  return rows.map((row) => row.tableName);
}

async function getMariaDbColumns(conn, databaseName, tableName) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME AS columnName,
            DATA_TYPE AS dataType,
            COLUMN_KEY AS columnKey,
            IS_NULLABLE AS isNullable,
            COLUMN_DEFAULT AS columnDefault,
            COLUMN_TYPE AS columnType
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [databaseName, tableName]
  );

  return rows.map((row) => ({
    name: row.columnName,
    type: row.dataType,
    columnKey: row.columnKey,
    isNullable: row.isNullable,
    columnDefault: row.columnDefault,
    columnType: row.columnType,
    isPrimaryKey: row.columnKey === 'PRI'
  }));
}

async function buildMariaDbSnapshot(conn, databaseName) {
  const tables = await getMariaDbTables(conn, databaseName);
  const snapshot = {
    database: databaseName,
    timestamp: new Date().toISOString(),
    tables: {}
  };

  for (const table of tables) {
    try {
      const [rows] = await conn.query(
        `SELECT COUNT(*) AS c FROM ${quoteMariaDbIdentifier(table)}`
      );
      snapshot.tables[table] = rows[0]?.c || 0;
    } catch (error) {
      snapshot.tables[table] = -1;
    }
  }

  return snapshot;
}

function mapMariaDbTypeToSqlite(column) {
  if (column.isPrimaryKey) {
    return 'TEXT PRIMARY KEY';
  }

  const type = String(column.type || 'TEXT').toUpperCase();

  if (/INT|SERIAL/.test(type)) {
    return 'INTEGER';
  }
  if (/REAL|FLOA|DOUB|DEC|NUM/.test(type)) {
    return 'REAL';
  }
  if (/BLOB|BINARY/.test(type)) {
    return 'BLOB';
  }

  return 'TEXT';
}

function buildSqliteCreateTableSql(tableName, mariadbColumns) {
  const columnDefs = mariadbColumns.map((col) => {
    let def = `${quoteSqliteIdentifier(col.name)} ${mapMariaDbTypeToSqlite(col)}`;
    if (col.isNullable === 'NO' && col.columnDefault === null) {
      def += ' NOT NULL';
    }
    return def;
  });

  // Les clés primaires simples sont déjà déclarées dans la définition de colonne.
  const pkColumns = mariadbColumns
    .filter((col) => col.isPrimaryKey)
    .map((col) => quoteSqliteIdentifier(col.name));
  if (pkColumns.length > 1) {
    columnDefs.push(`PRIMARY KEY (${pkColumns.join(', ')})`);
  }

  return `CREATE TABLE IF NOT EXISTS ${quoteSqliteIdentifier(tableName)} (${columnDefs.join(', ')})`;
}

// ---------------------------------------------------------------------------
// Insertions en batch
// ---------------------------------------------------------------------------

async function batchInsertMariaDb(conn, tableName, columns, targetPkColumns, rows, chunkSize = 250) {
  if (!rows.length) {
    return;
  }

  const quotedTable = quoteMariaDbIdentifier(tableName);
  const quotedColumns = columns.map(quoteMariaDbIdentifier).join(', ');
  const updateColumns = columns.filter((col) => !targetPkColumns.includes(col));
  let onDuplicate = '';
  if (updateColumns.length) {
    onDuplicate = ` ON DUPLICATE KEY UPDATE ${updateColumns
      .map((col) => `${quoteMariaDbIdentifier(col)} = VALUES(${quoteMariaDbIdentifier(col)})`)
      .join(', ')}`;
  } else if (targetPkColumns.length) {
    // Aucune colonne non-PK en commun : éviter l'erreur de doublon avec une mise à jour factice
    const dummyCol = targetPkColumns[0];
    onDuplicate = ` ON DUPLICATE KEY UPDATE ${quoteMariaDbIdentifier(dummyCol)} = ${quoteMariaDbIdentifier(dummyCol)}`;
  }

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
    const sql = `INSERT INTO ${quotedTable} (${quotedColumns}) VALUES ${placeholders}${onDuplicate}`;
    const values = chunk.flatMap((row) =>
      columns.map((col) => {
        const value = row[col];
        if (value === undefined) return null;
        if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof Buffer)) {
          try {
            return JSON.stringify(value);
          } catch (_) {
            return String(value);
          }
        }
        return value;
      })
    );
    await conn.query(sql, values);
  }
}

function batchInsertSqlite(db, tableName, columns, rows, chunkSize = 100) {
  if (!rows.length) {
    return;
  }

  const quotedTable = quoteSqliteIdentifier(tableName);
  const quotedColumns = columns.map(quoteSqliteIdentifier).join(', ');

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
    const sql = `INSERT OR REPLACE INTO ${quotedTable} (${quotedColumns}) VALUES ${placeholders}`;
    const values = chunk.flatMap((row) =>
      columns.map((col) => {
        const value = row[col];
        if (value === undefined) return null;
        if (value instanceof Date) return value.toISOString();
        if (value && typeof value === 'object' && !(value instanceof Buffer)) {
          try {
            return JSON.stringify(value);
          } catch (_) {
            return String(value);
          }
        }
        return value;
      })
    );
    db.prepare(sql).run(...values);
  }
}

// ---------------------------------------------------------------------------
// Migration SQLite → MariaDB
// ---------------------------------------------------------------------------

export async function migrateSqliteToMariaDb(sourceSqlitePath, targetMariaDbConfig) {
  const report = createBaseReport('sqlite-to-mariadb');
  const backupsDir = ensureBackupsDir();
  const timestamp = buildTimestamp();
  report.reportPath = path.join(backupsDir, `sqlite-to-mariadb-report-${timestamp}.json`);

  let sqliteDb = null;
  let mariadb = null;
  let sourceSnapshotPath = null;
  let transactionStarted = false;

  try {
    if (!fs.existsSync(sourceSqlitePath)) {
      throw new Error(`Base SQLite source introuvable : ${sourceSqlitePath}`);
    }

    // Snapshot de la source pour éviter les verrous / modifications pendant la migration
    sourceSnapshotPath = path.join(backupsDir, `sqlite-source-snapshot-${timestamp}.db`);
    fs.copyFileSync(sourceSqlitePath, sourceSnapshotPath);

    sqliteDb = new Database(sourceSnapshotPath, { readonly: true, fileMustExist: true });

    mariadb = await mysql.createConnection({
      host: targetMariaDbConfig.host,
      port: targetMariaDbConfig.port,
      user: targetMariaDbConfig.user,
      password: targetMariaDbConfig.password,
      database: targetMariaDbConfig.database,
      connectTimeout: 10000,
      multipleStatements: false
    });

    // Rapport de snapshot de la cible MariaDB (backup logique)
    const targetSnapshot = await buildMariaDbSnapshot(mariadb, targetMariaDbConfig.database);
    report.backupPath = path.join(backupsDir, `mariadb-pre-migration-snapshot-${timestamp}.json`);
    fs.writeFileSync(report.backupPath, JSON.stringify(targetSnapshot, null, 2), 'utf-8');

    await mariadb.query('SET FOREIGN_KEY_CHECKS = 0');

    const sourceTables = getSqliteTables(sqliteDb);

    for (const tableName of sourceTables) {
      const sourceColumns = getSqliteColumns(sqliteDb, tableName);
      const sourceColumnNames = sourceColumns.map((col) => col.name);

      let targetColumns = await getMariaDbColumns(mariadb, targetMariaDbConfig.database, tableName);

      // Créer la table cible si elle n'existe pas
      if (targetColumns.length === 0) {
        try {
          await mariadb.query(buildMariaDbCreateTableSql(tableName, sourceColumns));
          targetColumns = await getMariaDbColumns(mariadb, targetMariaDbConfig.database, tableName);
          report.warnings.push(`Table ${tableName} créée dans MariaDB car absente de la cible.`);
        } catch (createError) {
          report.warnings.push(`Table ${tableName} ignorée : impossible de créer la table cible (${createError.message}).`);
          continue;
        }
      }

      const targetColumnNames = targetColumns.map((col) => col.name);
      const targetPkColumns = targetColumns.filter((col) => col.isPrimaryKey).map((col) => col.name);
      const commonColumns = sourceColumnNames.filter((name) => targetColumnNames.includes(name));

      if (commonColumns.length === 0) {
        report.warnings.push(`Table ${tableName} ignorée : aucune colonne commune.`);
        continue;
      }

      const rows = sqliteDb
        .prepare(`SELECT ${commonColumns.map(quoteSqliteIdentifier).join(', ')} FROM ${quoteSqliteIdentifier(tableName)}`)
        .all();

      if (rows.length > 0) {
        if (!transactionStarted) {
          await mariadb.beginTransaction();
          transactionStarted = true;
        }
        await batchInsertMariaDb(mariadb, tableName, commonColumns, targetPkColumns, rows);
      }

      report.copiedTables.push({
        table: tableName,
        rows: rows.length,
        columns: commonColumns.length
      });
    }

    if (transactionStarted) {
      await mariadb.commit();
      transactionStarted = false;
    }

    await mariadb.query('SET FOREIGN_KEY_CHECKS = 1');

    report.success = true;
    report.finishedAt = new Date().toISOString();
    writeReport(report);
    return report;
  } catch (error) {
    report.success = false;
    report.error = error.message;

    if (mariadb) {
      try {
        if (transactionStarted) {
          await mariadb.rollback();
        }
      } catch (_) {
        // ignore
      }
      try {
        await mariadb.query('SET FOREIGN_KEY_CHECKS = 1');
      } catch (_) {
        // ignore
      }
    }

    writeReport(report);
    return report;
  } finally {
    if (mariadb) {
      try {
        await mariadb.end();
      } catch (_) {
        // ignore
      }
    }
    if (sqliteDb) {
      try {
        sqliteDb.close();
      } catch (_) {
        // ignore
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Migration MariaDB → SQLite
// ---------------------------------------------------------------------------

export async function migrateMariaDbToSqlite(sourceMariaDbConfig, targetSqlitePath) {
  const report = createBaseReport('mariadb-to-sqlite');
  const backupsDir = ensureBackupsDir();
  const timestamp = buildTimestamp();
  report.reportPath = path.join(backupsDir, `mariadb-to-sqlite-report-${timestamp}.json`);

  let mariadb = null;
  let sqliteDb = null;
  let backupPath = null;

  try {
    // Backup de la cible SQLite si elle existe déjà
    backupPath = backupSqliteFile(targetSqlitePath);
    report.backupPath = backupPath;

    // S'assurer que le répertoire cible existe
    const targetDir = path.dirname(targetSqlitePath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Ouvrir (ou créer) la base SQLite cible
    sqliteDb = new Database(targetSqlitePath);

    mariadb = await mysql.createConnection({
      host: sourceMariaDbConfig.host,
      port: sourceMariaDbConfig.port,
      user: sourceMariaDbConfig.user,
      password: sourceMariaDbConfig.password,
      database: sourceMariaDbConfig.database,
      connectTimeout: 10000,
      multipleStatements: false,
      dateStrings: true
    });

    sqliteDb.pragma('foreign_keys = OFF');

    const sourceTables = await getMariaDbTables(mariadb, sourceMariaDbConfig.database);

    // Démarrer une transaction explicite pour pouvoir rollback en cas d'erreur
    sqliteDb.exec('BEGIN TRANSACTION');

    for (const tableName of sourceTables) {
      const sourceColumns = await getMariaDbColumns(mariadb, sourceMariaDbConfig.database, tableName);
      const sourceColumnNames = sourceColumns.map((col) => col.name);

      let targetColumns = getSqliteColumns(sqliteDb, tableName);

      // Créer la table cible si elle n'existe pas
      if (targetColumns.length === 0) {
        try {
          sqliteDb.exec(buildSqliteCreateTableSql(tableName, sourceColumns));
          targetColumns = getSqliteColumns(sqliteDb, tableName);
          report.warnings.push(`Table ${tableName} créée dans SQLite car absente de la cible.`);
        } catch (createError) {
          report.warnings.push(`Table ${tableName} ignorée : impossible de créer la table cible (${createError.message}).`);
          continue;
        }
      }

      const targetColumnNames = targetColumns.map((col) => col.name);
      const commonColumns = sourceColumnNames.filter((name) => targetColumnNames.includes(name));

      if (commonColumns.length === 0) {
        report.warnings.push(`Table ${tableName} ignorée : aucune colonne commune.`);
        continue;
      }

      const [rawRows] = await mariadb.query(
        `SELECT ${commonColumns.map(quoteMariaDbIdentifier).join(', ')} FROM ${quoteMariaDbIdentifier(tableName)}`
      );
      const rows = Array.isArray(rawRows) ? rawRows : [];

      if (rows.length > 0) {
        batchInsertSqlite(sqliteDb, tableName, commonColumns, rows);
      }

      report.copiedTables.push({
        table: tableName,
        rows: rows.length,
        columns: commonColumns.length
      });
    }

    sqliteDb.exec('COMMIT');
    sqliteDb.pragma('foreign_keys = ON');

    report.success = true;
    report.finishedAt = new Date().toISOString();
    writeReport(report);
    return report;
  } catch (error) {
    report.success = false;
    report.error = error.message;

    if (sqliteDb) {
      try {
        sqliteDb.exec('ROLLBACK');
      } catch (_) {
        // ignore
      }
      try {
        sqliteDb.pragma('foreign_keys = ON');
      } catch (_) {
        // ignore
      }
      try {
        sqliteDb.close();
      } catch (_) {
        // ignore
      }
      sqliteDb = null;
    }

    // Restaurer la sauvegarde SQLite en cas d'échec
    restoreSqliteBackup(backupPath, targetSqlitePath);

    writeReport(report);
    return report;
  } finally {
    if (mariadb) {
      try {
        await mariadb.end();
      } catch (_) {
        // ignore
      }
    }
    if (sqliteDb) {
      try {
        sqliteDb.close();
      } catch (_) {
        // ignore
      }
    }
  }
}
