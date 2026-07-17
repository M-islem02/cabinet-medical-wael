import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function extractLegacyCreateStatements() {
  const schemaPath = path.join(__dirname, 'database-schema-source.sql');
  return fs
    .readFileSync(schemaPath, 'utf-8')
    .split(/\n\s*-- statement-break\s*\n/g)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function convertColumnTypes(sql) {
  return sql
    .replace(/ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci/gi, '')
    .replace(/\\`([^`]+)\\`/g, '"$1"')
    .replace(/`([^`]+)`/g, '"$1"')
    .replace(/\bLONGTEXT\b/gi, 'TEXT')
    .replace(/\bLONGBLOB\b/gi, 'BYTEA')
    .replace(/\bDATETIME\b/gi, 'TIMESTAMP')
    .replace(/\bDOUBLE\b/gi, 'NUMERIC')
    .replace(/\bDECIMAL\s*\((\d+)\s*,\s*(\d+)\)/gi, 'NUMERIC($1,$2)')
    .replace(/\bINT\b/gi, 'INTEGER')
    .replace(/\bTINYINT\b/gi, 'INTEGER')
    .replace(/\bBIGINT\b/gi, 'BIGINT')
    .replace(/\bBOOLEAN\b/gi, 'BOOLEAN')
    .replace(/\bVARCHAR\s*\((\d+)\)/gi, 'VARCHAR($1)')
    .replace(/\bTEXT\s+DEFAULT\s+\(''\)/gi, "TEXT DEFAULT ''")
    .replace(/\bTIMESTAMP\s+DEFAULT\s+CURRENT_TIMESTAMP\s+ON UPDATE CURRENT_TIMESTAMP/gi, 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
    .replace(/\bUNIQUE KEY\s+\w+\s*\(([^)]+)\)/gi, 'UNIQUE ($1)')
    .replace(/\bENUM\s*\(([^)]+)\)/gi, 'VARCHAR(50)')
    .replace(/,\s*\)/g, '\n    )');
}

function addCanonicalConstraints(sql) {
  let out = sql;
  if (/CREATE TABLE IF NOT EXISTS debts\s*\(/i.test(out)) {
    out = out.replace(/\n\s*FOREIGN KEY/, '\n      CHECK (paidAmount <= amount),\n      CHECK (remainingAmount >= 0),\n      FOREIGN KEY');
  }
  if (/CREATE TABLE IF NOT EXISTS dental_treatments\s*\(/i.test(out)) {
    out = out.replace(/\n\s*FOREIGN KEY/, '\n      CHECK (paid <= cost),\n      CHECK (cost >= 0),\n      FOREIGN KEY');
  }
  if (/CREATE TABLE IF NOT EXISTS treatment_plans\s*\(/i.test(out)) {
    out = out.replace(/\n\s*FOREIGN KEY/, '\n      CHECK (completedSessions <= sessions),\n      FOREIGN KEY');
  }
  return out;
}

function buildIndexStatements() {
  return [
    'CREATE INDEX IF NOT EXISTS idx_consultations_patient_date ON consultations(patientId, consultationDate DESC)',
    'CREATE INDEX IF NOT EXISTS idx_patients_primary_doctor ON patients(primaryDoctorId)',
    'CREATE INDEX IF NOT EXISTS idx_patients_created_by_user ON patients(createdByUserId)',
    'CREATE INDEX IF NOT EXISTS idx_patient_medecins_patient ON patient_medecins(patientId)',
    'CREATE INDEX IF NOT EXISTS idx_patient_medecins_medecin ON patient_medecins(medecinId)',
    'CREATE INDEX IF NOT EXISTS idx_consultations_doctor ON consultations(doctorId)',
    'CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_date ON prescriptions(patientId, prescriptionDate DESC)',
    'CREATE INDEX IF NOT EXISTS idx_sick_leaves_patient_start ON sick_leaves(patientId, startDate DESC)',
    'CREATE INDEX IF NOT EXISTS idx_documents_patient_type ON documents(patientId, documentType)',
    'CREATE INDEX IF NOT EXISTS idx_documents_consultation ON documents(consultationId)',
    'CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(paymentDate DESC)',
    'CREATE INDEX IF NOT EXISTS idx_payments_consultation ON payments(consultationId)',
    'CREATE INDEX IF NOT EXISTS idx_functional_evaluations_patient_date ON functional_evaluations(patientId, evaluationDate DESC)',
    'CREATE INDEX IF NOT EXISTS idx_rehabilitation_plans_patient_date ON rehabilitation_plans(patientId, startDate DESC)',
    'CREATE INDEX IF NOT EXISTS idx_rehabilitation_sessions_plan_date ON rehabilitation_sessions(rehabilitationPlanId, sessionDate DESC)'
  ];
}

function buildCompatibilityStatements() {
  return [
    'ALTER TABLE package_config ADD COLUMN IF NOT EXISTS cabinetType VARCHAR(20)',
    'ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS treatmentType VARCHAR(100)',
    "ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS specialty VARCHAR(100) DEFAULT 'dentistry'",
    'ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS totalCost NUMERIC(10,2) DEFAULT 0',
    'ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS totalPaid NUMERIC(10,2) DEFAULT 0',
    'ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS sessionsCount INTEGER DEFAULT 1',
    'ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS createdBy VARCHAR(36)',
    "UPDATE treatment_plans SET specialty = COALESCE(NULLIF(specialty, ''), 'dentistry') WHERE specialty IS NULL OR specialty = ''",
    'UPDATE treatment_plans SET sessionsCount = COALESCE(sessionsCount, sessions, 1) WHERE sessionsCount IS NULL OR sessionsCount < 1',
    'UPDATE treatment_plans SET totalCost = COALESCE(totalCost, 0), totalPaid = COALESCE(totalPaid, 0)',

    'ALTER TABLE dental_treatments ADD COLUMN IF NOT EXISTS material TEXT',
    'ALTER TABLE dental_treatments ADD COLUMN IF NOT EXISTS color TEXT',
    'ALTER TABLE dental_treatments ADD COLUMN IF NOT EXISTS isPaid BOOLEAN DEFAULT FALSE',
    'ALTER TABLE dental_treatments ADD COLUMN IF NOT EXISTS dentistId VARCHAR(36)',
    'ALTER TABLE dental_treatments ADD COLUMN IF NOT EXISTS planId VARCHAR(36)',
    'ALTER TABLE dental_treatments ADD COLUMN IF NOT EXISTS doctorId VARCHAR(36)',
    'UPDATE dental_treatments SET isPaid = COALESCE(isPaid, paid > 0)'
  ];
}

export function getPostgreSqlSchemaStatements() {
  const createStatements = extractLegacyCreateStatements()
    .map(convertColumnTypes)
    .map(addCanonicalConstraints)
    .map((sql) => sql.trim())
    .filter(Boolean);

  return [
    ...createStatements,
    ...buildCompatibilityStatements(),
    ...buildIndexStatements()
  ];
}

export function getCanonicalColumnNameMap() {
  const columnMap = new Map();
  const createStatements = extractLegacyCreateStatements().map(convertColumnTypes);

  for (const statement of createStatements) {
    for (const rawLine of statement.split('\n')) {
      const line = rawLine.trim().replace(/,$/, '');
      if (!line || /^(CREATE|PRIMARY|FOREIGN|UNIQUE|CHECK|KEY|\))/i.test(line)) continue;

      const match = line.match(/^"([^"]+)"\s+|^([A-Za-z_][A-Za-z0-9_]*)\s+/);
      const columnName = match?.[1] || match?.[2];
      if (!columnName) continue;
      columnMap.set(columnName.toLowerCase(), columnName);
    }
  }

  return columnMap;
}

export async function ensurePostgreSqlSchema(pool) {
  const statements = getPostgreSqlSchemaStatements();
  for (const statement of statements) {
    await pool.query(statement);
  }
}
