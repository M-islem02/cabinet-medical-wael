/**
 * Cloud Sync Handler - Hybrid Online/Offline Data Backup
 * Supports: Firebase, Custom REST API, or Remote MariaDB replication
 * Works offline-first: data is always local, cloud is backup
 */

import { ipcMain, dialog } from 'electron';
import { query, run, queryOne, getCurrentMode, loadDatabaseConfig } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import os from 'os';
import crypto from 'crypto';
import archiver from 'archiver';
import AdmZip from 'adm-zip';

let syncInterval = null;
let syncInProgress = false;
let syncConfig = null;
let endOfDayInterval = null;
let lastEndOfDayRunDate = null;
let cloudSyncSchemaPromise = null;

const SYNC_TABLES = [
  'patients', 'consultations', 'appointments', 'payments', 'prescriptions',
  'documents', 'expenses', 'inventory', 'medication_records', 'settings', 'licenses',
  'dental_records', 'dental_teeth', 'dental_teeth_history', 'dental_treatments', 'dental_plans', 'dental_xrays',
  'treatment_plans', 'plan_payment_sessions'
];

const FILE_COLUMN_PATTERN = /photo|image|img|file|fichier|attachment|piece_jointe|document|signature|logo|avatar|scan|radio|resultat_fichier|base64|blob|data/i;
const INVALID_BACKUP_VALUES = new Set(['', '-', 'null', 'undefined', 'Invalid Date', 'NaN']);

function getBackupDirectory() {
  const configuredDir = String(syncConfig?.backupDirectory || '').trim();
  if (configuredDir) {
    return configuredDir;
  }
  return path.join(app.getPath('userData'), 'backups');
}

function sanitizeFileSegment(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function splitDoctorName(fullName = '') {
  const normalized = String(fullName || '').trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return { firstName: 'docteur', lastName: 'principal' };
  }

  const parts = normalized.split(' ');
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: 'principal' };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join('_')
  };
}

function getBackupBaseName(prefix = 'backup', exportedAt = null, doctorName = '') {
  const safeDate = moment(exportedAt || undefined, 'YYYY-MM-DD HH:mm:ss', true).isValid()
    ? moment(exportedAt, 'YYYY-MM-DD HH:mm:ss').format('YYYY-MM-DD')
    : moment().format('YYYY-MM-DD');
  const doctor = splitDoctorName(doctorName);
  const first = sanitizeFileSegment(doctor.firstName) || 'docteur';
  const last = sanitizeFileSegment(doctor.lastName) || 'principal';
  return `${prefix}_${last}_${first}_${safeDate}`;
}

function getBackupPaths(baseName) {
  const backupDir = getBackupDirectory();
  return {
    jsonPath: path.join(backupDir, `${baseName}.json`),
    csvPath: path.join(backupDir, `${baseName}.csv`),
    markdownPath: path.join(backupDir, `${baseName}.md`),
    zipPath: path.join(backupDir, `${baseName}.zip`),
    encryptedPath: path.join(backupDir, `${baseName}.medbackup`)
  };
}

function hasBackupEncryptionEnabled(config = syncConfig) {
  return !!config?.backupEncryptionEnabled && String(config?.backupPassphrase || '').trim().length > 0;
}

function deriveBackupKey(passphrase, salt, iterations = 120000) {
  return crypto.pbkdf2Sync(String(passphrase || ''), salt, iterations, 32, 'sha256');
}

function buildEncryptedBackupEnvelope(zipBuffer, dynamicBundle, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveBackupKey(passphrase, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(zipBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    format: 'medcareso_encrypted_backup_v1',
    algorithm: 'aes-256-gcm',
    kdf: 'pbkdf2-sha256',
    iterations: 120000,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    meta: {
      baseName: dynamicBundle.baseName,
      exportedAt: dynamicBundle.payload?.meta?.exportedAt || '',
      doctorName: dynamicBundle.payload?.meta?.practice?.doctorName || '',
      cabinetName: dynamicBundle.payload?.meta?.practice?.cabinetName || '',
      totalTables: dynamicBundle.payload?.meta?.statistics?.totalTables || 0,
      totalRecords: dynamicBundle.payload?.meta?.statistics?.totalRecords || 0,
      totalFiles: dynamicBundle.payload?.meta?.statistics?.totalFiles || 0,
      archiveFileName: dynamicBundle.files?.zip?.fileName || `${dynamicBundle.baseName}.zip`
    },
    ciphertext: encrypted.toString('base64')
  }, null, 2);
}

function decryptEncryptedBackupEnvelope(envelopeText, passphrase) {
  const parsed = JSON.parse(envelopeText);
  if (parsed?.format !== 'medcareso_encrypted_backup_v1') {
    throw new Error('Format de sauvegarde chiffrÃ©e non reconnu');
  }

  if (!passphrase) {
    throw new Error('Mot de passe de sauvegarde requis');
  }

  const salt = Buffer.from(parsed.salt, 'base64');
  const iv = Buffer.from(parsed.iv, 'base64');
  const authTag = Buffer.from(parsed.authTag, 'base64');
  const encrypted = Buffer.from(parsed.ciphertext, 'base64');
  const key = deriveBackupKey(passphrase, salt, parsed.iterations || 120000);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  return {
    zipBuffer: Buffer.concat([decipher.update(encrypted), decipher.final()]),
    envelope: parsed
  };
}

function quoteIdentifier(identifier, dialect = 'sqlite') {
  const normalized = String(identifier || '').trim();
  if (!normalized) {
    throw new Error('Identifiant SQL vide');
  }

  if (dialect === 'mariadb') {
    return `\`${normalized.replace(/`/g, '``')}\``;
  }

  return `"${normalized.replace(/"/g, '""')}"`;
}

function getSQLiteDatabasePath() {
  const dbConfig = loadDatabaseConfig() || {};
  return dbConfig.path || dbConfig.sqlitePath || path.join(app.getPath('userData'), 'physiocare.db');
}

function getMariaDBBackupConfig() {
  const dbConfig = loadDatabaseConfig() || {};
  const nested = dbConfig.mariadb || {};

  return {
    host: nested.host || dbConfig.host || syncConfig?.remoteHost || '',
    port: parseInt(nested.port || dbConfig.port || syncConfig?.remotePort || 5432, 10) || 5432,
    user: nested.user || dbConfig.user || syncConfig?.remoteUser || '',
    password: nested.password || dbConfig.password || syncConfig?.remotePassword || '',
    database: nested.database || dbConfig.database || syncConfig?.remoteDatabase || ''
  };
}

function normalizeBackupScalar(value) {
  if (value instanceof Date) {
    return moment(value).format('YYYY-MM-DD HH:mm:ss');
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeBackupScalar(item));
  }

  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, normalizeBackupScalar(nestedValue)])
    );
  }

  return value;
}

function isLikelyJSON(value) {
  const trimmed = String(value || '').trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}'))
    || (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

function isLikelyBase64String(value) {
  const normalized = String(value || '').trim();
  if (normalized.length < 80 || normalized.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/=\r\n]+$/.test(normalized);
}

function inferExtensionFromMime(mimeType = '') {
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/tiff': '.tiff',
    'application/pdf': '.pdf',
    'application/json': '.json',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/msword': '.doc',
    'text/plain': '.txt'
  };
  return map[String(mimeType || '').toLowerCase()] || '.bin';
}

function inferExtensionFromName(fileName = '', fallback = '.bin') {
  const ext = path.extname(String(fileName || '').trim());
  return ext || fallback;
}

function sanitizeArchivePathPart(value = '', fallback = 'item') {
  return sanitizeFileSegment(value) || fallback;
}

function computeBufferChecksum(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function registerBackupArtifact(artifacts, descriptor) {
  const uniqueKey = descriptor.uniqueKey;
  const existing = artifacts.find((artifact) => artifact.uniqueKey === uniqueKey);
  if (existing) {
    return existing.archivePath;
  }

  artifacts.push(descriptor);
  return descriptor.archivePath;
}

function createArchivePath(sourceType, tableName, columnName, rowId, fileName = '', fallbackExt = '.bin') {
  const safeSourceType = sanitizeArchivePathPart(sourceType, 'source');
  const safeTable = sanitizeArchivePathPart(tableName, 'table');
  const safeColumn = sanitizeArchivePathPart(columnName, 'file');
  const safeRowId = sanitizeArchivePathPart(rowId, 'row');
  const fileBase = sanitizeArchivePathPart(path.basename(fileName || '', path.extname(fileName || '')), `${safeColumn}_${safeRowId}`);
  const extension = inferExtensionFromName(fileName, fallbackExt);
  return `images/${safeSourceType}/${safeTable}/${safeRowId}_${safeColumn}_${fileBase}${extension}`;
}

function registerSourceFileArtifact(artifacts, context, filePath) {
  const absolutePath = path.resolve(filePath);
  const archivePath = createArchivePath(
    context.sourceType,
    context.tableName,
    context.columnName,
    context.rowId,
    path.basename(absolutePath),
    path.extname(absolutePath) || '.bin'
  );
  return registerBackupArtifact(artifacts, {
    uniqueKey: `file:${absolutePath}`,
    archivePath,
    sourcePath: absolutePath,
    size: fs.statSync(absolutePath).size,
    sha256: computeBufferChecksum(fs.readFileSync(absolutePath)),
    tableName: context.tableName,
    columnName: context.columnName,
    rowId: context.rowId,
    sourceType: context.sourceType,
    fileName: path.basename(absolutePath)
  });
}

function registerBufferArtifact(artifacts, context, buffer, fileName = '', mimeType = '') {
  const extension = inferExtensionFromName(fileName, inferExtensionFromMime(mimeType));
  const archivePath = createArchivePath(
    context.sourceType,
    context.tableName,
    context.columnName,
    context.rowId,
    fileName || `${context.columnName}${extension}`,
    extension
  );
  return registerBackupArtifact(artifacts, {
    uniqueKey: `buffer:${context.sourceType}:${context.tableName}:${context.columnName}:${context.rowId}:${computeBufferChecksum(buffer)}`,
    archivePath,
    buffer,
    size: buffer.length,
    sha256: computeBufferChecksum(buffer),
    tableName: context.tableName,
    columnName: context.columnName,
    rowId: context.rowId,
    sourceType: context.sourceType,
    fileName: fileName || path.basename(archivePath),
    mimeType
  });
}

function extractBackupArtifactsFromValue(value, context, artifacts) {
  if (value === null || value === undefined) return value;

  if (Buffer.isBuffer(value)) {
    return registerBufferArtifact(artifacts, context, value, `${context.columnName}.bin`, 'application/octet-stream');
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => extractBackupArtifactsFromValue(item, {
      ...context,
      columnName: `${context.columnName}_${index}`
    }, artifacts));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        extractBackupArtifactsFromValue(nestedValue, { ...context, columnName: `${context.columnName}_${key}` }, artifacts)
      ])
    );
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed || INVALID_BACKUP_VALUES.has(trimmed)) {
    return value;
  }

  if (isLikelyJSON(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed);
      const normalized = extractBackupArtifactsFromValue(parsed, context, artifacts);
      return JSON.stringify(normalized);
    } catch (_) {
      // Keep original string if JSON parsing fails
    }
  }

  if (fs.existsSync(trimmed) && fs.statSync(trimmed).isFile()) {
    return registerSourceFileArtifact(artifacts, context, trimmed);
  }

  const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    const mimeType = dataUrlMatch[1];
    const buffer = Buffer.from(dataUrlMatch[2], 'base64');
    return registerBufferArtifact(artifacts, context, buffer, `${context.columnName}${inferExtensionFromMime(mimeType)}`, mimeType);
  }

  if (isLikelyBase64String(trimmed)) {
    try {
      const buffer = Buffer.from(trimmed, 'base64');
      if (buffer.length > 0) {
        return registerBufferArtifact(artifacts, context, buffer, `${context.columnName}.bin`, 'application/octet-stream');
      }
    } catch (_) {
      // Ignore undecodable base64
    }
  }

  return value;
}

function normalizeBackupRow(row, sourceType, tableName, artifacts) {
  const normalizedRow = {};
  const rowId = row?.id || row?.uuid || row?.patientId || row?.appointmentId || uuidv4();

  for (const [columnName, rawValue] of Object.entries(row || {})) {
    const scalar = normalizeBackupScalar(rawValue);
    normalizedRow[columnName] = FILE_COLUMN_PATTERN.test(columnName) || Buffer.isBuffer(scalar)
      ? extractBackupArtifactsFromValue(scalar, { sourceType, tableName, columnName, rowId }, artifacts)
      : scalar;
  }

  return normalizedRow;
}

async function discoverSQLiteBackupSource(artifacts) {
  return null;
  const sqlitePath = getSQLiteDatabasePath();
  if (!sqlitePath || !fs.existsSync(sqlitePath)) {
    return null;
  }

  const sqliteDb = new Database(sqlitePath, { readonly: true, fileMustExist: true });

  try {
    const tables = sqliteDb.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();

    const discoveredTables = [];
    const data = {};

    for (const { name: tableName } of tables) {
      const quotedTable = quoteIdentifier(tableName, 'sqlite');
      const columns = sqliteDb.prepare(`PRAGMA table_info(${quotedTable})`).all().map((column) => column.name);
      const rows = sqliteDb.prepare(`SELECT * FROM ${quotedTable}`).all();
      const normalizedRows = rows.map((row) => normalizeBackupRow(row, 'sqlite', tableName, artifacts));
      data[`sqlite_${tableName}`] = normalizedRows;
      discoveredTables.push({ name: `sqlite_${tableName}`, rawName: tableName, source: 'sqlite', columns, count: normalizedRows.length });
    }

    return {
      source: 'sqlite',
      label: 'SQLite local',
      data,
      tables: discoveredTables,
      databasePath: sqlitePath
    };
  } finally {
    sqliteDb.close();
  }
}

async function discoverMariaDBBackupSource(artifacts) {
  return null;
  const config = getMariaDBBackupConfig();
  if (!config.host || !config.user || !config.database) {
    return null;
  }

  const connection = null;

  try {
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME
    `);

    const discoveredTables = [];
    const data = {};

    for (const tableRow of tables) {
      const tableName = tableRow.TABLE_NAME;
      const quotedTable = quoteIdentifier(tableName, 'mariadb');
      const [columns] = await connection.execute(`SHOW COLUMNS FROM ${quotedTable}`);
      const [rows] = await connection.execute(`SELECT * FROM ${quotedTable}`);
      const normalizedRows = rows.map((row) => normalizeBackupRow(row, 'mariadb', tableName, artifacts));
      data[`mariadb_${tableName}`] = normalizedRows;
      discoveredTables.push({
        name: `mariadb_${tableName}`,
        rawName: tableName,
        source: 'mariadb',
        columns: columns.map((column) => column.Field),
        count: normalizedRows.length
      });
    }

    return {
      source: 'mariadb',
      label: 'MariaDB distant',
      data,
      tables: discoveredTables,
      host: config.host,
      database: config.database
    };
  } finally {
    await connection.end();
  }
}

function resolveBackupDoctorIdentity(sources = [], fallbackPractice = {}) {
  const allUsers = [];
  const allSettings = [];

  for (const source of sources) {
    if (Array.isArray(source?.data?.sqlite_users)) allUsers.push(...source.data.sqlite_users);
    if (Array.isArray(source?.data?.mariadb_users)) allUsers.push(...source.data.mariadb_users);
    if (Array.isArray(source?.data?.sqlite_settings)) allSettings.push(...source.data.sqlite_settings);
    if (Array.isArray(source?.data?.mariadb_settings)) allSettings.push(...source.data.mariadb_settings);
  }

  const preferredUser = allUsers.find((user) => String(user?.username || '').trim().toLowerCase() === 'ddd')
    || allUsers.find((user) => ['doctor', 'dentist'].includes(String(user?.role || '').toLowerCase()))
    || allUsers.find((user) => String(user?.role || '').toLowerCase() === 'admin')
    || null;

  const settingsDoctorName = allSettings.find((row) => String(row?.doctorName || '').trim())?.doctorName
    || fallbackPractice.doctorName
    || '';

  const displayName = String(preferredUser?.fullName || settingsDoctorName || 'Dr. Tektak Asma').trim();
  const normalizedFileLabel = displayName.replace(/^(dr|docteur)\.?\s+/i, '').trim();
  const specialty = String(preferredUser?.specialty || fallbackPractice.doctorSpecialty || '').trim();

  return {
    displayName,
    fileNameLabel: String(preferredUser?.username || '').toLowerCase() === 'ddd' ? 'Asma Tektak' : (normalizedFileLabel || 'Asma Tektak'),
    username: preferredUser?.username || 'ddd',
    specialty
  };
}

function buildBackupManifest(dynamicBundle) {
  const artifactLines = (dynamicBundle.artifacts || []).map((artifact) => {
    const checksum = artifact.sha256 || '-';
    return `${artifact.archivePath} | sha256=${checksum} | source=${artifact.sourceType}:${artifact.tableName}.${artifact.columnName} | row=${artifact.rowId}`;
  });

  return [
    'BACKUP MANIFEST - MedCareSO',
    `Backup: ${dynamicBundle.baseName}`,
    `Date: ${dynamicBundle.payload?.meta?.exportedAt || '-'}`,
    `Docteur: ${dynamicBundle.payload?.meta?.practice?.doctorName || '-'}`,
    `Mode actif: ${dynamicBundle.payload?.meta?.database?.mode || '-'}`,
    `Tables: ${(dynamicBundle.payload?.meta?.tables || []).length}`,
    `Fichiers: ${(dynamicBundle.artifacts || []).length}`,
    '',
    'ARTIFACTS:',
    `- ${dynamicBundle.files.json.fileName}`,
    `- ${dynamicBundle.files.csv.fileName}`,
    `- ${dynamicBundle.files.markdown.fileName}`,
    ...artifactLines
  ].join('\n');
}

async function createBackupZip(dynamicBundle, targetZipPath = null) {
  const { zipPath: defaultZipPath } = getBackupPaths(dynamicBundle.baseName);
  const zipPath = targetZipPath || defaultZipPath;
  const manifestContent = buildBackupManifest(dynamicBundle);

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);
    archive.append(dynamicBundle.files.json.content, { name: dynamicBundle.files.json.fileName });
    archive.append(dynamicBundle.files.csv.content, { name: dynamicBundle.files.csv.fileName });
    archive.append(dynamicBundle.files.markdown.content, { name: dynamicBundle.files.markdown.fileName });
    archive.append(manifestContent, { name: 'manifest.txt' });

    for (const artifact of dynamicBundle.artifacts || []) {
      if (artifact.sourcePath && fs.existsSync(artifact.sourcePath)) {
        archive.file(artifact.sourcePath, { name: artifact.archivePath });
      } else if (artifact.buffer) {
        archive.append(artifact.buffer, { name: artifact.archivePath });
      }
    }

    archive.finalize();
  });

  return { zipPath, manifestContent };
}

function extractArchiveArtifacts(archive, restoreTag = 'restore') {
  const restoreRoot = path.join(app.getPath('userData'), 'restored-assets', sanitizeArchivePathPart(restoreTag, 'restore'));
  fs.mkdirSync(restoreRoot, { recursive: true });

  const artifactMap = {};
  archive.getEntries().forEach((entry) => {
    if (entry.isDirectory) return;

    const entryName = String(entry.entryName || '').replace(/\\/g, '/');
    const lowerName = entryName.toLowerCase();
    const isMetadataFile = lowerName.endsWith('.json')
      || lowerName.endsWith('.csv')
      || lowerName.endsWith('.md')
      || lowerName.endsWith('manifest.txt');

    if (isMetadataFile) return;

    const targetPath = path.join(restoreRoot, entryName);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, entry.getData());
    artifactMap[entryName] = targetPath;
  });

  return artifactMap;
}

function restoreBackupArtifactsInValue(value, artifactMap = {}) {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => restoreBackupArtifactsInValue(item, artifactMap));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, restoreBackupArtifactsInValue(nestedValue, artifactMap)])
    );
  }

  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim();
  if (artifactMap[normalized]) {
    return artifactMap[normalized];
  }

  if (isLikelyJSON(normalized)) {
    try {
      const parsed = JSON.parse(normalized);
      return JSON.stringify(restoreBackupArtifactsInValue(parsed, artifactMap));
    } catch (_) {
      return value;
    }
  }

  return value;
}

function readBackupPayloadFromPath(filePath, options = {}) {
  const normalizedPath = String(filePath || '').trim();
  if (!normalizedPath) {
    throw new Error('Chemin de sauvegarde invalide');
  }

  const lowerPath = normalizedPath.toLowerCase();
  if (lowerPath.endsWith('.zip') || lowerPath.endsWith('.medbackup')) {
    let archive = null;
    let envelopeMeta = null;

    if (lowerPath.endsWith('.medbackup')) {
      const encryptedText = fs.readFileSync(normalizedPath, 'utf8');
      const decrypted = decryptEncryptedBackupEnvelope(encryptedText, options.passphrase || '');
      archive = new AdmZip(decrypted.zipBuffer);
      envelopeMeta = decrypted.envelope?.meta || null;
    } else {
      archive = new AdmZip(normalizedPath);
    }

    const jsonEntry = archive.getEntries().find((entry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.json'));
    if (!jsonEntry) {
      throw new Error('Aucun fichier JSON trouvÃ© dans lâ€™archive');
    }

    const artifactMap = extractArchiveArtifacts(
      archive,
      `${path.basename(normalizedPath, path.extname(normalizedPath))}_${Date.now()}`
    );

    return {
      content: archive.readAsText(jsonEntry, 'utf8'),
      artifactMap,
      envelopeMeta
    };
  }

  return {
    content: fs.readFileSync(normalizedPath, 'utf8'),
    artifactMap: {},
    envelopeMeta: null
  };
}

function escapeCSVValue(value) {
  const normalized = value === null || value === undefined ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

function formatDatabaseModeLabel(mode) {
  return mode === 'mariadb'
    ? 'MariaDB distant (cabinet multi-poste)'
    : 'SQLite local (cabinet mono-poste)';
}

function buildCSVExport(exported) {
  const rows = [
    [
      'exportId',
      'exportedAt',
      'doctorName',
      'cabinetName',
      'deviceId',
      'hostname',
      'pcUser',
      'databaseMode',
      'tableName',
      'recordId',
      'patientId',
      'appointmentId',
      'createdAt',
      'updatedAt',
      'rowJson'
    ].map(escapeCSVValue).join(',')
  ];

  const doctorName = exported?.meta?.practice?.doctorName || '';
  const cabinetName = exported?.meta?.practice?.cabinetName || '';
  const deviceId = exported?.meta?.device?.deviceId || '';
  const hostname = exported?.meta?.device?.hostname || '';
  const pcUser = exported?.meta?.device?.username || '';
  const databaseMode = exported?.meta?.database?.mode || '';
  const exportId = exported?.meta?.exportId || '';
  const exportedAt = exported?.meta?.exportedAt || '';

  for (const table of Object.keys(exported?.data || {})) {
    for (const record of exported.data[table] || []) {
      rows.push([
        exportId,
        exportedAt,
        doctorName,
        cabinetName,
        deviceId,
        hostname,
        pcUser,
        databaseMode,
        table,
        record?.id || '',
        record?.patientId || '',
        record?.appointmentId || '',
        record?.createdAt || '',
        record?.updatedAt || '',
        JSON.stringify(record || {})
      ].map(escapeCSVValue).join(','));
    }
  }

  return rows.join('\n');
}

function buildMarkdownExport(exported) {
  const tableLines = (exported?.meta?.tables || []).map((table) => `| ${table.name} | ${table.count} |`).join('\n');
  const practice = exported?.meta?.practice || {};
  const device = exported?.meta?.device || {};
  const database = exported?.meta?.database || {};
  const countsSection = tableLines || '| Aucune table | 0 |';
  const attachmentCount = exported?.meta?.statistics?.totalFiles || 0;

  return `# MedCareSO Recovery Backup

## Export
- Export ID: ${exported?.meta?.exportId || '-'}
- ExportÃ© le: ${exported?.meta?.exportedAt || '-'}
- Version: ${exported?.meta?.version || '-'}
- Mode base de donnÃ©es: ${database.label || formatDatabaseModeLabel(database.mode)}

## Cabinet et praticien
- Cabinet: ${practice.cabinetName || '-'}
- Docteur: ${practice.doctorName || '-'}
- TÃ©lÃ©phone cabinet: ${practice.cabinetPhone || '-'}
- Email cabinet: ${practice.cabinetEmail || '-'}
- Scanner prÃ©fÃ©rÃ©: ${practice.preferredScanner || '-'}

## PC source
- Device ID: ${device.deviceId || '-'}
- Nom du PC: ${device.hostname || '-'}
- Utilisateur: ${device.username || '-'}
- Plateforme: ${device.platform || '-'}
- Version OS: ${device.release || '-'}
- Architecture: ${device.arch || '-'}

## Configuration base de donnÃ©es
- Type actif: ${database.mode || '-'}
- Description: ${database.label || '-'}
- HÃ´te configurÃ©: ${database.host || '-'}
- Base distante: ${database.databaseName || '-'}
- Fichier SQLite: ${database.sqlitePath || '-'}

## Volume des donnÃ©es
| Table | Lignes |
| --- | ---: |
${countsSection}

## RÃ©cupÃ©ration
- Les donnÃ©es complÃ¨tes sont prÃ©sentes dans le JSON.
- Le CSV contient une ligne par enregistrement avec le cabinet, le docteur et le PC source.
- Ce fichier Markdown garde le contexte technique pour les futures restaurations et prompts.
- L'archive ZIP associe ces fichiers avec ${attachmentCount} image(s) ou piÃ¨ce(s) jointe(s) dÃ©tectÃ©e(s).
- SQLite est prÃ©vu pour un seul PC du cabinet.
- MariaDB est prÃ©vu pour plusieurs PC du cabinet.
`;
}

async function buildExportContext() {
  const settings = await queryOne(
    `SELECT cabinetName, cabinetAddress, cabinetPhone, cabinetEmail,
            doctorName, doctorRPPS, doctorSpecialty, preferredScanner
     FROM settings
     LIMIT 1`
  ).catch(() => null);

  const dbConfig = loadDatabaseConfig() || {};
  const activeMode = getCurrentMode() || dbConfig.type || 'sqlite';
  const currentUserInfo = (() => {
    try {
      return os.userInfo();
    } catch (_) {
      return { username: '' };
    }
  })();

  return {
    exportId: uuidv4(),
    version: '1.1.0',
    practice: {
      cabinetName: settings?.cabinetName || '',
      cabinetAddress: settings?.cabinetAddress || '',
      cabinetPhone: settings?.cabinetPhone || '',
      cabinetEmail: settings?.cabinetEmail || '',
      doctorName: settings?.doctorName || '',
      doctorRPPS: settings?.doctorRPPS || '',
      doctorSpecialty: settings?.doctorSpecialty || '',
      preferredScanner: settings?.preferredScanner || ''
    },
    device: {
      deviceId: getDeviceId(),
      hostname: os.hostname(),
      username: currentUserInfo.username || '',
      platform: os.platform(),
      release: os.release(),
      arch: os.arch()
    },
    database: {
      mode: activeMode,
      label: formatDatabaseModeLabel(activeMode),
      type: dbConfig.type || activeMode,
      host: dbConfig.host || dbConfig.remoteHost || '',
      databaseName: dbConfig.database || dbConfig.remoteDatabase || '',
      sqlitePath: dbConfig.path || dbConfig.sqlitePath || path.join(app.getPath('userData'), 'physiocare.db'),
      isMultiPC: activeMode === 'mariadb'
    }
  };
}

async function buildDynamicBackupBundle(prefix = 'backup') {
  const context = await buildExportContext();
  const artifacts = [];
  const sources = [];

  try {
    const sqliteSource = await discoverSQLiteBackupSource(artifacts);
    if (sqliteSource) {
      sources.push(sqliteSource);
    }
  } catch (error) {
    console.warn('SQLite backup skipped:', error.message);
  }

  try {
    const mariaSource = await discoverMariaDBBackupSource(artifacts);
    if (mariaSource) {
      sources.push(mariaSource);
    }
  } catch (error) {
    console.warn('MariaDB backup skipped:', error.message);
  }

  if (!sources.length) {
    throw new Error('Aucune source de base de donnÃ©es disponible pour le backup');
  }

  const doctorIdentity = resolveBackupDoctorIdentity(sources, context.practice);
  const tables = sources.flatMap((source) => source.tables);
  const data = Object.assign({}, ...sources.map((source) => source.data));
  const totalRecords = tables.reduce((sum, table) => sum + table.count, 0);
  const exportedAt = moment().format('YYYY-MM-DD HH:mm:ss');
  const exported = {
    meta: {
      exportId: uuidv4(),
      exportedAt,
      version: '1.2.0',
      backupFormat: 'dynamic_zip_v1',
      tables,
      practice: {
        ...context.practice,
        doctorName: doctorIdentity.displayName || context.practice.doctorName || 'Dr. Tektak Asma',
        doctorSpecialty: doctorIdentity.specialty || context.practice.doctorSpecialty || ''
      },
      device: context.device,
      database: {
        ...context.database,
        sources: sources.map((source) => ({
          source: source.source,
          label: source.label,
          databasePath: source.databasePath || '',
          host: source.host || '',
          databaseName: source.database || ''
        }))
      },
      statistics: {
        totalTables: tables.length,
        totalRecords,
        totalFiles: artifacts.length
      },
      recovery: {
        preferredUsername: doctorIdentity.username || 'ddd',
        doctorFileNameLabel: doctorIdentity.fileNameLabel || doctorIdentity.displayName || 'Asma Tektak'
      }
    },
    data
  };

  const baseName = getBackupBaseName(
    prefix,
    exportedAt,
    exported.meta.recovery.doctorFileNameLabel || exported.meta.practice.doctorName
  );
  const jsonContent = JSON.stringify(exported, null, 2);
  const csvContent = buildCSVExport(exported);
  const markdownContent = buildMarkdownExport(exported);

  return {
    payload: exported,
    artifacts,
    baseName,
    files: {
      json: {
        fileName: `${baseName}.json`,
        mimeType: 'application/json',
        content: jsonContent
      },
      csv: {
        fileName: `${baseName}.csv`,
        mimeType: 'text/csv',
        content: csvContent
      },
      markdown: {
        fileName: `${baseName}.md`,
        mimeType: 'text/markdown',
        content: markdownContent
      },
      zip: {
        fileName: `${baseName}.zip`,
        mimeType: 'application/zip'
      }
    }
  };
}

function createExportBundle(exported, prefix = 'backup') {
  const baseName = getBackupBaseName(prefix, exported?.meta?.exportedAt, exported?.meta?.practice?.doctorName);
  const jsonContent = JSON.stringify(exported, null, 2);
  const csvContent = buildCSVExport(exported);
  const markdownContent = buildMarkdownExport(exported);

  return {
    payload: exported,
    baseName,
    files: {
      json: {
        fileName: `${baseName}.json`,
        mimeType: 'application/json',
        content: jsonContent
      },
      csv: {
        fileName: `${baseName}.csv`,
        mimeType: 'text/csv',
        content: csvContent
      },
      markdown: {
        fileName: `${baseName}.md`,
        mimeType: 'text/markdown',
        content: markdownContent
      }
    }
  };
}

async function buildExportBundle(prefix = 'backup') {
  const exported = await exportLocalData();
  return createExportBundle(exported, prefix);
}

function cleanupOldBackups(backupDir, keepCount = 1) {
  const baseNames = fs.readdirSync(backupDir)
    .filter((fileName) => fileName.startsWith('backup_') && (fileName.endsWith('.json') || fileName.endsWith('.medbackup')))
    .sort()
    .reverse()
    .map((fileName) => fileName.replace(/\.(json|medbackup)$/i, ''));

  for (let index = keepCount; index < baseNames.length; index += 1) {
    const { jsonPath, csvPath, markdownPath, zipPath, encryptedPath } = getBackupPaths(baseNames[index]);
    [jsonPath, csvPath, markdownPath, zipPath, encryptedPath].forEach((filePath) => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
  }
}

async function ensureRemoteExportTable(connection) {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS cloud_sync_exports (
      id VARCHAR(36) PRIMARY KEY,
      exportId VARCHAR(36) NOT NULL,
      exportedAt DATETIME,
      doctorName VARCHAR(255),
      cabinetName VARCHAR(255),
      deviceId VARCHAR(255),
      hostname VARCHAR(255),
      databaseMode VARCHAR(30),
      tableCountsJson LONGTEXT,
      jsonBackup LONGTEXT,
      csvBackup LONGTEXT,
      markdownBackup LONGTEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function defaultSyncConfig() {
  return {
    enabled: false,
    provider: 'rest',
    apiUrl: '',
    apiKey: '',
    firebaseProject: '',
    firebaseKey: '',
    remoteHost: '',
    remotePort: 5432,
    remoteUser: '',
    remotePassword: '',
    remoteDatabase: '',
    syncIntervalMinutes: 1440,
    lastSyncAt: null,
    autoSync: true,
    dailyBackupEnabled: true,
    dailyBackupTime: '23:55',
    autoPushEndOfDay: false,
    backupDirectory: '',
    backupEncryptionEnabled: false,
    backupPassphrase: '',
    telegramEnabled: false,
    telegramBotToken: '',
    telegramChatId: ''
  };
}

async function ensureCloudSyncSchema() {
  if (!cloudSyncSchemaPromise) {
    cloudSyncSchemaPromise = (async () => {
      const alterStatements = [
        'ALTER TABLE cloud_sync_config ADD COLUMN IF NOT EXISTS dailyBackupEnabled INTEGER DEFAULT 1',
        "ALTER TABLE cloud_sync_config ADD COLUMN IF NOT EXISTS dailyBackupTime TEXT DEFAULT '23:55'",
        'ALTER TABLE cloud_sync_config ADD COLUMN IF NOT EXISTS autoPushEndOfDay INTEGER DEFAULT 0',
        'ALTER TABLE cloud_sync_config ADD COLUMN IF NOT EXISTS telegramEnabled INTEGER DEFAULT 0',
        "ALTER TABLE cloud_sync_config ADD COLUMN IF NOT EXISTS telegramBotToken TEXT DEFAULT ''",
        "ALTER TABLE cloud_sync_config ADD COLUMN IF NOT EXISTS telegramChatId TEXT DEFAULT ''",
        "ALTER TABLE cloud_sync_config ADD COLUMN IF NOT EXISTS backupDirectory TEXT DEFAULT ''",
        'ALTER TABLE cloud_sync_config ADD COLUMN IF NOT EXISTS backupEncryptionEnabled INTEGER DEFAULT 0',
        "ALTER TABLE cloud_sync_config ADD COLUMN IF NOT EXISTS backupPassphrase TEXT DEFAULT ''"
      ];

      for (const sql of alterStatements) await run(sql);
    })().catch((error) => {
      cloudSyncSchemaPromise = null;
      throw error;
    });
  }
  return cloudSyncSchemaPromise;
}

// ========== SYNC CONFIG ==========

async function loadSyncConfig() {
  try {
    await ensureCloudSyncSchema();
    const row = await queryOne('SELECT * FROM cloud_sync_config LIMIT 1');
    const defaults = defaultSyncConfig();
    if (row) {
      syncConfig = {
        ...defaults,
        enabled: !!row.enabled,
        provider: row.provider || 'rest', // 'rest', 'firebase', 'mariadb'
        apiUrl: row.apiUrl || '',
        apiKey: row.apiKey || '',
        firebaseProject: row.firebaseProject || '',
        firebaseKey: row.firebaseKey || '',
        remoteHost: row.remoteHost || '',
        remotePort: parseInt(row.remotePort) || 5432,
        remoteUser: row.remoteUser || '',
        remotePassword: row.remotePassword || '',
        remoteDatabase: row.remoteDatabase || '',
        syncIntervalMinutes: parseInt(row.syncIntervalMinutes) || 1440,
        lastSyncAt: row.lastSyncAt || null,
        autoSync: !!row.autoSync,
        dailyBackupEnabled: row.dailyBackupEnabled === undefined ? true : !!row.dailyBackupEnabled,
        dailyBackupTime: row.dailyBackupTime || '23:55',
        autoPushEndOfDay: !!row.autoPushEndOfDay,
        backupDirectory: row.backupDirectory || '',
        backupEncryptionEnabled: row.backupEncryptionEnabled === undefined ? false : !!row.backupEncryptionEnabled,
        backupPassphrase: row.backupPassphrase || '',
        telegramEnabled: !!row.telegramEnabled,
        telegramBotToken: row.telegramBotToken || '',
        telegramChatId: row.telegramChatId || ''
      };
    } else {
      syncConfig = defaults;
    }
    return syncConfig;
  } catch (e) {
    console.error('Error loading sync config:', e);
    return defaultSyncConfig();
  }
}

async function saveSyncConfig(config) {
  try {
    await ensureCloudSyncSchema();
    const existing = await queryOne('SELECT id FROM cloud_sync_config LIMIT 1');
    const now = moment().format('YYYY-MM-DD HH:mm:ss');

    const mergedConfig = {
      ...defaultSyncConfig(),
      ...(config || {})
    };

    if (existing) {
      await run(
        `UPDATE cloud_sync_config SET
          enabled = ?, provider = ?, apiUrl = ?, apiKey = ?,
          firebaseProject = ?, firebaseKey = ?,
          remoteHost = ?, remotePort = ?, remoteUser = ?, remotePassword = ?, remoteDatabase = ?,
          syncIntervalMinutes = ?, autoSync = ?,
          dailyBackupEnabled = ?, dailyBackupTime = ?, autoPushEndOfDay = ?,
          backupDirectory = ?, backupEncryptionEnabled = ?, backupPassphrase = ?, telegramEnabled = ?, telegramBotToken = ?, telegramChatId = ?,
          updatedAt = ?
        WHERE id = ?`,
        [
          mergedConfig.enabled ? 1 : 0, mergedConfig.provider || 'rest', mergedConfig.apiUrl || '', mergedConfig.apiKey || '',
          mergedConfig.firebaseProject || '', mergedConfig.firebaseKey || '',
          mergedConfig.remoteHost || '', mergedConfig.remotePort || 5432, mergedConfig.remoteUser || '', mergedConfig.remotePassword || '', mergedConfig.remoteDatabase || '',
          mergedConfig.syncIntervalMinutes || 1440, mergedConfig.autoSync ? 1 : 0,
          mergedConfig.dailyBackupEnabled ? 1 : 0, mergedConfig.dailyBackupTime || '23:55', mergedConfig.autoPushEndOfDay ? 1 : 0,
          mergedConfig.backupDirectory || '',
          mergedConfig.backupEncryptionEnabled ? 1 : 0, mergedConfig.backupPassphrase || '',
          mergedConfig.telegramEnabled ? 1 : 0, mergedConfig.telegramBotToken || '', mergedConfig.telegramChatId || '',
          now,
          existing.id
        ]
      );
    } else {
      await run(
        `INSERT INTO cloud_sync_config (id, enabled, provider, apiUrl, apiKey,
          firebaseProject, firebaseKey,
          remoteHost, remotePort, remoteUser, remotePassword, remoteDatabase,
          syncIntervalMinutes, autoSync,
          dailyBackupEnabled, dailyBackupTime, autoPushEndOfDay,
          backupDirectory, backupEncryptionEnabled, backupPassphrase, telegramEnabled, telegramBotToken, telegramChatId,
          createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(), mergedConfig.enabled ? 1 : 0, mergedConfig.provider || 'rest', mergedConfig.apiUrl || '', mergedConfig.apiKey || '',
          mergedConfig.firebaseProject || '', mergedConfig.firebaseKey || '',
          mergedConfig.remoteHost || '', mergedConfig.remotePort || 5432, mergedConfig.remoteUser || '', mergedConfig.remotePassword || '', mergedConfig.remoteDatabase || '',
          mergedConfig.syncIntervalMinutes || 1440, mergedConfig.autoSync ? 1 : 0,
          mergedConfig.dailyBackupEnabled ? 1 : 0, mergedConfig.dailyBackupTime || '23:55', mergedConfig.autoPushEndOfDay ? 1 : 0,
          mergedConfig.backupDirectory || '',
          mergedConfig.backupEncryptionEnabled ? 1 : 0, mergedConfig.backupPassphrase || '',
          mergedConfig.telegramEnabled ? 1 : 0, mergedConfig.telegramBotToken || '', mergedConfig.telegramChatId || '',
          now, now
        ]
      );
    }

    syncConfig = mergedConfig;
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function sendBackupToTelegram(config, backupPath, caption = '') {
  try {
    if (!config?.telegramEnabled || !config?.telegramBotToken || !config?.telegramChatId) {
      return { success: false, error: 'Telegram non configurÃ©' };
    }

    if (!fs.existsSync(backupPath)) {
      return { success: false, error: 'Fichier backup introuvable' };
    }

    const endpoint = `https://api.telegram.org/bot${config.telegramBotToken}/sendDocument`;
    const form = new FormData();
    const fileBuffer = fs.readFileSync(backupPath);
    const fileName = path.basename(backupPath);
    const lowerFileName = fileName.toLowerCase();
    const mimeType = lowerFileName.endsWith('.zip')
      ? 'application/zip'
      : lowerFileName.endsWith('.csv')
        ? 'text/csv'
        : lowerFileName.endsWith('.md')
          ? 'text/markdown'
          : 'application/json';

    form.append('chat_id', String(config.telegramChatId));
    form.append('caption', caption || `Backup MedCareSO ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
    form.append('document', new Blob([fileBuffer], { type: mimeType }), fileName);

    const response = await fetch(endpoint, {
      method: 'POST',
      body: form
    });

    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`Telegram HTTP ${response.status}: ${txt}`);
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function sendBufferToTelegram(config, payload) {
  try {
    if (!config?.telegramEnabled || !config?.telegramBotToken || !config?.telegramChatId) {
      return { success: false, error: 'Telegram non configurÃ©' };
    }

    const endpoint = `https://api.telegram.org/bot${config.telegramBotToken}/sendDocument`;
    const form = new FormData();
    const fileName = payload?.fileName || `backup_${moment().format('YYYY-MM-DD_HH-mm-ss')}.csv`;
    const mimeType = payload?.mimeType || 'text/csv';
    const caption = payload?.caption || `Backup CSV MedCareSO ${moment().format('YYYY-MM-DD HH:mm:ss')}`;
    const data = Buffer.isBuffer(payload?.content)
      ? payload.content
      : Buffer.from(String(payload?.content || ''), 'utf8');

    form.append('chat_id', String(config.telegramChatId));
    form.append('caption', caption);
    form.append('document', new Blob([data], { type: mimeType }), fileName);

    const response = await fetch(endpoint, {
      method: 'POST',
      body: form
    });

    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`Telegram HTTP ${response.status}: ${txt}`);
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ========== EXPORT DATA FOR SYNC ==========

async function exportLocalData() {
  const context = await buildExportContext();
  const data = {};
  const exportMeta = {
    exportId: context.exportId,
    exportedAt: moment().format('YYYY-MM-DD HH:mm:ss'),
    version: context.version,
    tables: [],
    practice: context.practice,
    device: context.device,
    database: context.database
  };

  for (const table of SYNC_TABLES) {
    try {
      const rows = await query(`SELECT * FROM ${table}`);
      data[table] = rows || [];
      exportMeta.tables.push({ name: table, count: (rows || []).length });
    } catch (e) {
      // Table might not exist â€” skip
      data[table] = [];
    }
  }

  return { meta: exportMeta, data };
}

async function getPrimaryDoctorName() {
  try {
    const doctor = await queryOne(
      `SELECT fullName, username
       FROM users
       WHERE role IN ('doctor', 'dentist')
       ORDER BY id ASC
       LIMIT 1`
    );

    if (doctor) {
      return (doctor.fullName || doctor.username || 'Docteur Principal').trim();
    }

    const adminFallback = await queryOne(
      `SELECT fullName, username
       FROM users
       WHERE role = 'admin'
       ORDER BY id ASC
       LIMIT 1`
    );

    return (adminFallback?.fullName || adminFallback?.username || 'Docteur Principal').trim();
  } catch (_) {
    return 'Docteur Principal';
  }
}

// ========== LOCAL BACKUP ==========

async function createLocalBackup() {
  try {
    if (!syncConfig) {
      await loadSyncConfig();
    }

    if (syncConfig?.backupEncryptionEnabled && !String(syncConfig?.backupPassphrase || '').trim()) {
      return { success: false, error: 'Le chiffrement est activÃ© mais aucun mot de passe de sauvegarde nâ€™est configurÃ©.' };
    }

    const backupBundle = await buildDynamicBackupBundle('backup');

    const backupDir = getBackupDirectory();
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const { jsonPath, csvPath, markdownPath, zipPath, encryptedPath } = getBackupPaths(backupBundle.baseName);
    const encryptionEnabled = hasBackupEncryptionEnabled(syncConfig);

    let primaryPath = zipPath;
    let primaryFileName = backupBundle.files.zip.fileName;

    if (encryptionEnabled) {
      const tempZipPath = path.join(backupDir, `${backupBundle.baseName}__tmp.zip`);
      await createBackupZip(backupBundle, tempZipPath);
      const zipBuffer = fs.readFileSync(tempZipPath);
      const encryptedPayload = buildEncryptedBackupEnvelope(zipBuffer, backupBundle, syncConfig.backupPassphrase);
      fs.writeFileSync(encryptedPath, encryptedPayload, 'utf8');
      fs.unlinkSync(tempZipPath);
      primaryPath = encryptedPath;
      primaryFileName = path.basename(encryptedPath);
    } else {
      fs.writeFileSync(jsonPath, backupBundle.files.json.content, 'utf8');
      fs.writeFileSync(csvPath, backupBundle.files.csv.content, 'utf8');
      fs.writeFileSync(markdownPath, backupBundle.files.markdown.content, 'utf8');
      await createBackupZip(backupBundle);
    }

    cleanupOldBackups(backupDir, 1);

    console.log('Local backup created:', backupBundle.baseName);
    return {
      success: true,
      baseName: backupBundle.baseName,
      path: primaryPath,
      csvPath: encryptionEnabled ? null : csvPath,
      markdownPath: encryptionEnabled ? null : markdownPath,
      zipPath: encryptionEnabled ? null : zipPath,
      encryptedPath: encryptionEnabled ? encryptedPath : null,
      primaryPath,
      fileName: primaryFileName,
      encrypted: encryptionEnabled,
      summary: {
        doctorName: backupBundle.payload?.meta?.practice?.doctorName || '',
        exportedAt: backupBundle.payload?.meta?.exportedAt || '',
        totalTables: backupBundle.payload?.meta?.statistics?.totalTables || 0,
        totalRecords: backupBundle.payload?.meta?.statistics?.totalRecords || 0,
        totalFiles: backupBundle.payload?.meta?.statistics?.totalFiles || 0
      },
      files: {
        json: backupBundle.files.json.fileName,
        csv: backupBundle.files.csv.fileName,
        markdown: backupBundle.files.markdown.fileName,
        zip: backupBundle.files.zip.fileName,
        encrypted: encryptionEnabled ? path.basename(encryptedPath) : null
      }
    };
  } catch (e) {
    console.error('Error creating local backup:', e);
    return { success: false, error: e.message };
  }
}

async function listLocalBackups() {
  try {
    const backupDir = getBackupDirectory();
    if (!fs.existsSync(backupDir)) return { success: true, data: [] };

    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('backup_') && (f.endsWith('.json') || f.endsWith('.medbackup')))
      .sort()
      .reverse()
      .map(f => {
        const isEncrypted = f.endsWith('.medbackup');
        const baseName = f.replace(/\.(json|medbackup)$/i, '');
        const { jsonPath, csvPath, markdownPath, zipPath, encryptedPath } = getBackupPaths(baseName);
        const primaryPath = isEncrypted ? encryptedPath : jsonPath;
        const primaryStats = fs.statSync(primaryPath);
        const csvStats = !isEncrypted && fs.existsSync(csvPath) ? fs.statSync(csvPath) : null;
        const markdownStats = !isEncrypted && fs.existsSync(markdownPath) ? fs.statSync(markdownPath) : null;
        const zipStats = !isEncrypted && fs.existsSync(zipPath) ? fs.statSync(zipPath) : null;
        const totalSize = primaryStats.size + (csvStats?.size || 0) + (markdownStats?.size || 0) + (zipStats?.size || 0);
        return {
          fileName: f,
          baseName,
          path: primaryPath,
          csvPath: fs.existsSync(csvPath) ? csvPath : null,
          markdownPath: fs.existsSync(markdownPath) ? markdownPath : null,
          zipPath: fs.existsSync(zipPath) ? zipPath : null,
          encryptedPath: fs.existsSync(encryptedPath) ? encryptedPath : null,
          encrypted: isEncrypted,
          formatLabel: isEncrypted ? 'Archive chiffrÃ©e' : 'ZIP / JSON / CSV / Markdown',
          size: totalSize,
          sizeHuman: (totalSize / 1024 / 1024).toFixed(2) + ' MB',
          createdAt: primaryStats.mtime.toISOString()
        };
      });

    return { success: true, data: files };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function restoreFromBackup(filePath, options = {}) {
  try {
    const { content, artifactMap } = readBackupPayloadFromPath(filePath, options);
    const backup = JSON.parse(content);

    if (!backup.data || !backup.meta) {
      return { success: false, error: 'Fichier de backup invalide' };
    }

    const currentMode = getCurrentMode() || 'sqlite';
    const backupEntries = Object.entries(backup.data || {}).map(([tableName, rows]) => {
      const prefixedMatch = tableName.match(/^(sqlite|mariadb)_(.+)$/);
      return {
        sourceMode: prefixedMatch ? prefixedMatch[1] : null,
        tableName: prefixedMatch ? prefixedMatch[2] : tableName,
        rows: Array.isArray(rows) ? rows : []
      };
    });
    const hasCurrentModeEntries = backupEntries.some((entry) => entry.sourceMode === currentMode);
    let restored = 0;
    for (const entry of backupEntries) {
      if (hasCurrentModeEntries && entry.sourceMode && entry.sourceMode !== currentMode) {
        continue;
      }

      for (const row of entry.rows) {
        try {
          const columns = Object.keys(row || {});
          if (!columns.length) continue;

          const placeholders = columns.map(() => '?').join(', ');
          const hydratedRow = Object.fromEntries(
            columns.map((column) => [column, restoreBackupArtifactsInValue(row[column], artifactMap)])
          );
          const values = columns.map((column) => hydratedRow[column]);
          const quotedTable = quoteIdentifier(entry.tableName, currentMode === 'mariadb' ? 'mariadb' : 'sqlite');
          const quotedColumns = columns.map((column) => quoteIdentifier(column, currentMode === 'mariadb' ? 'mariadb' : 'sqlite')).join(', ');

          if (currentMode === 'mariadb') {
            const updates = columns.map((column) => {
              const quotedColumn = quoteIdentifier(column, 'mariadb');
              return `${quotedColumn} = VALUES(${quotedColumn})`;
            }).join(', ');

            await run(
              `INSERT INTO ${quotedTable} (${quotedColumns}) VALUES (${placeholders})
               ON DUPLICATE KEY UPDATE ${updates}`,
              values
            );
          } else {
            await run(
              `INSERT OR REPLACE INTO ${quotedTable} (${quotedColumns}) VALUES (${placeholders})`,
              values
            );
          }

          restored++;
        } catch (e) {
          // Skip individual row errors (e.g. missing tables or FK constraints)
        }
      }
    }

    return { success: true, restoredRows: restored, from: backup.meta.exportedAt, restoredFiles: Object.keys(artifactMap || {}).length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ========== CLOUD SYNC - REST API ==========

async function syncToRESTAPI(config) {
  try {
    const backupBundle = await buildExportBundle('cloud_export');
    
    const response = await fetch(config.apiUrl + '/sync/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'X-Device-Id': getDeviceId()
      },
      body: JSON.stringify({
        ...backupBundle.payload,
        artifacts: {
          csvFileName: backupBundle.files.csv.fileName,
          markdownFileName: backupBundle.files.markdown.fileName,
          csvContent: backupBundle.files.csv.content,
          markdownContent: backupBundle.files.markdown.content
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function syncFromRESTAPI(config) {
  try {
    const response = await fetch(config.apiUrl + '/sync/pull', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'X-Device-Id': getDeviceId()
      }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const remote = await response.json();

    if (remote.data) {
      let merged = 0;
      for (const table of SYNC_TABLES) {
        if (remote.data[table]) {
          for (const row of remote.data[table]) {
            try {
              const columns = Object.keys(row);
              const placeholders = columns.map(() => '?').join(', ');
              await run(
                `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
                columns.map(c => row[c])
              );
              merged++;
            } catch (e) { /* skip conflicts */ }
          }
        }
      }
      return { success: true, mergedRows: merged };
    }
    return { success: true, mergedRows: 0 };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ========== CLOUD SYNC - REMOTE MARIADB ==========

async function syncToRemoteMariaDB(config) {
  return {
    success: false,
    error: 'Remote MariaDB sync is disabled in PostgreSQL-only runtime.'
  };
  try {
    const connection = null;

    const backupBundle = await buildExportBundle('cloud_export');
    const exported = backupBundle.payload;
    let synced = 0;

    for (const table of SYNC_TABLES) {
      if (exported.data[table] && exported.data[table].length > 0) {
        for (const row of exported.data[table]) {
          try {
            const columns = Object.keys(row);
            const placeholders = columns.map(() => '?').join(', ');
            const updates = columns.map(c => `${c} = VALUES(${c})`).join(', ');
            
            await connection.execute(
              `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
               ON DUPLICATE KEY UPDATE ${updates}`,
              columns.map(c => row[c])
            );
            synced++;
          } catch (e) { /* skip individual errors */ }
        }
      }
    }

    await ensureRemoteExportTable(connection);
    await connection.execute(
      `INSERT INTO cloud_sync_exports (
        id, exportId, exportedAt, doctorName, cabinetName, deviceId, hostname,
        databaseMode, tableCountsJson, jsonBackup, csvBackup, markdownBackup
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        exported?.meta?.exportId || uuidv4(),
        exported?.meta?.exportedAt || moment().format('YYYY-MM-DD HH:mm:ss'),
        exported?.meta?.practice?.doctorName || '',
        exported?.meta?.practice?.cabinetName || '',
        exported?.meta?.device?.deviceId || '',
        exported?.meta?.device?.hostname || '',
        exported?.meta?.database?.mode || '',
        JSON.stringify(exported?.meta?.tables || []),
        backupBundle.files.json.content,
        backupBundle.files.csv.content,
        backupBundle.files.markdown.content
      ]
    );

    await connection.end();
    return {
      success: true,
      syncedRows: synced,
      cloudBackup: {
        exportId: exported?.meta?.exportId,
        csvFileName: backupBundle.files.csv.fileName,
        markdownFileName: backupBundle.files.markdown.fileName
      }
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ========== FULL SYNC ORCHESTRATOR ==========

async function performSync(options = {}) {
  if (syncInProgress) return { success: false, error: 'Synchronisation dÃ©jÃ  en cours' };
  syncInProgress = true;

  try {
    const config = await loadSyncConfig();
    const allowWhenDisabled = !!options.allowWhenDisabled;
    const isEnabled = !!config?.enabled;

    // Always make a local backup first
    const backupResult = await createLocalBackup();
    if (!isEnabled && !allowWhenDisabled) {
      syncInProgress = false;
      return {
        success: true,
        backupOnly: true,
        message: 'Sync cloud non activÃ©. Backup local crÃ©Ã©.',
        backup: backupResult
      };
    }

    if (!isEnabled && allowWhenDisabled) {
      syncInProgress = false;
      return {
        success: true,
        backupOnly: true,
        message: 'Backup local crÃ©Ã© (sync cloud dÃ©sactivÃ©).',
        backup: backupResult
      };
    }

    let result;
    switch (config.provider) {
      case 'rest':
        result = await syncToRESTAPI(config);
        break;
      case 'mariadb':
        result = await syncToRemoteMariaDB(config);
        break;
      default:
        result = { success: false, error: 'Fournisseur non supportÃ©: ' + config.provider };
    }

    // Update last sync time
    if (result.success) {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      await run('UPDATE cloud_sync_config SET lastSyncAt = ? WHERE id = (SELECT id FROM cloud_sync_config LIMIT 1)', [now]);
      
      await run(
        'INSERT INTO sync_log (id, syncType, status, details, syncedAt) VALUES (?, ?, ?, ?, ?)',
        [uuidv4(), 'push', 'success', JSON.stringify(result.data || {}), now]
      );
    } else {
      await run(
        'INSERT INTO sync_log (id, syncType, status, details, syncedAt) VALUES (?, ?, ?, ?, ?)',
        [uuidv4(), 'push', 'failed', result.error || 'Sync failed', moment().format('YYYY-MM-DD HH:mm:ss')]
      );
    }

    syncInProgress = false;
    return {
      ...result,
      backup: backupResult
    };
  } catch (e) {
    syncInProgress = false;
    return { success: false, error: e.message };
  }
}

function getDeviceId() {
  return `${os.hostname()}-${os.platform()}-${os.userInfo().username}`;
}

function buildTelegramBackupCaption(summary = {}, fileName = '') {
  return [
    'Backup MedCareSO',
    `Docteur: ${summary.doctorName || '-'}`,
    `Date: ${summary.exportedAt || moment().format('YYYY-MM-DD HH:mm:ss')}`,
    `Tables: ${summary.totalTables || 0}`,
    `Enregistrements: ${summary.totalRecords || 0}`,
    `Fichiers: ${summary.totalFiles || 0}`,
    `Archive: ${fileName || '-'}`
  ].join('\n');
}

function startSyncScheduler() {
  if (syncInterval) clearInterval(syncInterval);
  const minutes = (syncConfig && syncConfig.syncIntervalMinutes) || 1440;
  syncInterval = setInterval(performSync, minutes * 60 * 1000);
  console.log(`Cloud sync scheduler started (every ${minutes} min)`);
}

function isNowAtTargetTime(timeString = '23:55') {
  const [h, m] = String(timeString || '23:55').split(':').map(v => parseInt(v, 10));
  const hour = Number.isInteger(h) ? h : 23;
  const minute = Number.isInteger(m) ? m : 55;
  const now = new Date();
  return now.getHours() === hour && now.getMinutes() === minute;
}

async function runEndOfDayBackupIfNeeded() {
  try {
    const config = await loadSyncConfig();
    if (!config?.dailyBackupEnabled) return;

    const todayKey = moment().format('YYYY-MM-DD');
    if (!isNowAtTargetTime(config.dailyBackupTime || '23:55')) return;
    if (lastEndOfDayRunDate === todayKey) return;

    const backupResult = await createLocalBackup();
    lastEndOfDayRunDate = todayKey;

    let details = {
      mode: 'daily-backup',
      backup: backupResult
    };

    if (config.autoPushEndOfDay) {
      const online = await checkOnlineStatus();
      if (online) {
        const syncRes = await performSync({ allowWhenDisabled: true });
        details.sync = syncRes;
      } else {
        details.sync = { success: false, error: 'Hors ligne - push cloud ignorÃ©' };
      }
    }

    const telegramBackupPath = backupResult?.primaryPath || backupResult?.encryptedPath || backupResult?.zipPath;
    if (config.telegramEnabled && backupResult?.success && telegramBackupPath) {
      details.telegram = await sendBackupToTelegram(
        config,
        telegramBackupPath,
        buildTelegramBackupCaption(backupResult.summary, backupResult.fileName)
      );
    }

    await run(
      'INSERT INTO sync_log (id, syncType, status, details, syncedAt) VALUES (?, ?, ?, ?, ?)',
      [
        uuidv4(),
        'daily',
        (details.sync?.success === false || details.telegram?.success === false) ? 'failed' : 'success',
        JSON.stringify(details),
        moment().format('YYYY-MM-DD HH:mm:ss')
      ]
    );
  } catch (e) {
    console.error('Daily backup task error:', e);
  }
}

function startEndOfDayScheduler() {
  if (endOfDayInterval) clearInterval(endOfDayInterval);
  endOfDayInterval = setInterval(runEndOfDayBackupIfNeeded, 60 * 1000);
  runEndOfDayBackupIfNeeded();
  console.log('End-of-day backup scheduler started (check every 1 min)');
}

function stopEndOfDayScheduler() {
  if (endOfDayInterval) {
    clearInterval(endOfDayInterval);
    endOfDayInterval = null;
  }
}

function stopSyncScheduler() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

// ========== CHECK INTERNET CONNECTIVITY ==========

async function checkOnlineStatus() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch('https://www.google.com/generate_204', { signal: controller.signal, method: 'HEAD' });
    clearTimeout(timeout);
    return true;
  } catch (e) {
    return false;
  }
}

// ========== IPC HANDLERS ==========

export function handleCloudSyncEvents() {
  // Get sync config
  ipcMain.handle('sync:getConfig', async () => {
    try {
      const config = await loadSyncConfig();
      return { success: true, data: config || {} };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // Save sync config
  ipcMain.handle('sync:saveConfig', async (event, config) => {
    try {
      const result = await saveSyncConfig(config);
      if (result.success && config.enabled && config.autoSync) {
        startSyncScheduler();
      } else {
        stopSyncScheduler();
      }
      if (result.success && (config.dailyBackupEnabled !== false)) {
        startEndOfDayScheduler();
      } else {
        stopEndOfDayScheduler();
      }
      return result;
    } catch (e) { return { success: false, error: e.message }; }
  });

  // Manual sync now
  ipcMain.handle('sync:now', async () => {
    try {
      const online = await checkOnlineStatus();
      if (!online) {
        const backupOnly = await createLocalBackup();
        return {
          success: backupOnly.success,
          backupOnly: true,
          message: backupOnly.success
            ? 'Pas de connexion internet. Backup local crÃ©Ã©.'
            : `Pas de connexion internet et backup Ã©chouÃ©: ${backupOnly.error}`,
          backup: backupOnly
        };
      }
      return await performSync({ allowWhenDisabled: true });
    } catch (e) { return { success: false, error: e.message }; }
  });

  // Create local backup
  ipcMain.handle('sync:createBackup', async () => {
    try { return await createLocalBackup(); }
    catch (e) { return { success: false, error: e.message }; }
  });

  // List local backups
  ipcMain.handle('sync:listBackups', async () => {
    try { return await listLocalBackups(); }
    catch (e) { return { success: false, error: e.message }; }
  });

  // Restore from backup
  ipcMain.handle('sync:restore', async (event, payload) => {
    try {
      const filePath = typeof payload === 'string' ? payload : payload?.filePath;
      const passphrase = typeof payload === 'object' && payload !== null ? payload.passphrase : '';
      return await restoreFromBackup(filePath, { passphrase });
    }
    catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('sync:exportBundle', async () => {
    try {
      const backupResult = await createLocalBackup();
      const exportSourcePath = backupResult?.primaryPath || backupResult?.encryptedPath || backupResult?.zipPath || backupResult?.path;
      if (!backupResult?.success || !exportSourcePath) {
        return { success: false, error: backupResult?.error || 'Bundle de sauvegarde introuvable' };
      }

      const saveResult = await dialog.showSaveDialog({
        defaultPath: backupResult.fileName || path.basename(exportSourcePath),
        filters: [
          { name: 'Bundle MedCareSO', extensions: ['medbackup', 'zip'] },
          { name: 'Tous les fichiers', extensions: ['*'] }
        ]
      });

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, cancelled: true, error: 'Export annulÃ©' };
      }

      fs.copyFileSync(exportSourcePath, saveResult.filePath);
      return { success: true, path: saveResult.filePath, fileName: path.basename(saveResult.filePath) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Export data as JSON file
  ipcMain.handle('sync:export', async () => {
    try {
      const backupBundle = await buildExportBundle('medcareso_export');
      return { success: true, data: backupBundle };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // Check online status
  ipcMain.handle('sync:checkOnline', async () => {
    try {
      const online = await checkOnlineStatus();
      return { success: true, online };
    } catch (e) { return { success: true, online: false }; }
  });

  // Get sync log
  ipcMain.handle('sync:getLog', async (event, limit) => {
    try {
      const logs = await query(
        'SELECT * FROM sync_log ORDER BY syncedAt DESC LIMIT ?',
        [limit || 20]
      );
      return { success: true, data: logs || [] };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // Get sync status
  ipcMain.handle('sync:getStatus', async () => {
    try {
      const config = await loadSyncConfig();
      const online = await checkOnlineStatus();
      return {
        success: true,
        data: {
          enabled: config ? config.enabled : false,
          provider: config ? config.provider : 'none',
          lastSyncAt: config ? config.lastSyncAt : null,
          autoSync: config ? config.autoSync : false,
          dailyBackupEnabled: config ? config.dailyBackupEnabled : true,
          dailyBackupTime: config ? config.dailyBackupTime : '23:55',
          autoPushEndOfDay: config ? config.autoPushEndOfDay : false,
          telegramEnabled: config ? config.telegramEnabled : false,
          online: online,
          syncInProgress: syncInProgress
        }
      };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('sync:getStorageInfo', async () => {
    try {
      await loadSyncConfig();
      const dbConfig = loadDatabaseConfig() || {};
      return {
        success: true,
        data: {
          backupDirectory: getBackupDirectory(),
          configuredBackupDirectory: syncConfig?.backupDirectory || '',
          backupEncryptionEnabled: !!syncConfig?.backupEncryptionEnabled,
          userDataDirectory: app.getPath('userData'),
          sqlitePath: dbConfig.path || dbConfig.sqlitePath || path.join(app.getPath('userData'), 'physiocare.db'),
          remoteTarget: dbConfig.database || dbConfig.remoteDatabase || ''
        }
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('sync:testTelegram', async () => {
    try {
      const config = await loadSyncConfig();
      if (!config?.telegramEnabled || !config?.telegramBotToken || !config?.telegramChatId) {
        return { success: false, error: 'Telegram non configurÃ©. Activez Telegram et renseignez Token + Chat ID.' };
      }

      const backupResult = await createLocalBackup();
      const backupPath = backupResult?.primaryPath || backupResult?.encryptedPath || backupResult?.zipPath;
      if (!backupResult.success || !backupPath) {
        return { success: false, error: backupResult.error || 'Backup introuvable' };
      }

      const zipBuffer = fs.readFileSync(backupPath);
      const sendResult = await sendBufferToTelegram(config, {
        fileName: path.basename(backupPath),
        mimeType: backupResult.encrypted ? 'application/octet-stream' : 'application/zip',
        content: zipBuffer,
        caption: buildTelegramBackupCaption(backupResult.summary, path.basename(backupPath))
      });

      if (!sendResult.success) {
        return sendResult;
      }

      await run(
        'INSERT INTO sync_log (id, syncType, status, details, syncedAt) VALUES (?, ?, ?, ?, ?)',
        [
          uuidv4(),
          'telegram-test',
          'success',
          JSON.stringify({ file: path.basename(backupPath) }),
          moment().format('YYYY-MM-DD HH:mm:ss')
        ]
      );

      return { success: true, fileName: path.basename(backupPath) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Init scheduler if config says so (delayed to ensure DB is ready)
  setTimeout(async () => {
    try {
      const config = await loadSyncConfig();
      if (config && config.enabled && config.autoSync) {
        startSyncScheduler();
      }
      if (config && config.dailyBackupEnabled !== false) {
        startEndOfDayScheduler();
      }
    } catch (e) {
      console.warn('Cloud sync config load deferred - DB not ready yet:', e.message);
    }
  }, 10000);

  console.log('Cloud Sync events registered');
}
