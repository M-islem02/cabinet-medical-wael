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
    'UPDATE dental_treatments SET isPaid = COALESCE(isPaid, paid > 0)',

    'ALTER TABLE inventory ADD COLUMN IF NOT EXISTS supplierId VARCHAR(36)',
    'ALTER TABLE inventory ADD COLUMN IF NOT EXISTS photoPath VARCHAR(500)',
    'ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS lotId VARCHAR(36)',
    'ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS posSaleId VARCHAR(36)',
    'ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS purchaseOrderId VARCHAR(36)',
    'ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS updatedAt TIMESTAMP',
    'ALTER TABLE plan_equipment_usage ADD COLUMN IF NOT EXISTS equipmentId VARCHAR(36)',
    'ALTER TABLE plan_equipment_usage ALTER COLUMN inventoryId DROP NOT NULL',

    'ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contactName VARCHAR(255)',
    'ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS phone VARCHAR(100)',
    'ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS email VARCHAR(255)',
    'ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address TEXT',
    'ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS specialty VARCHAR(120)',
    'ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS notes TEXT',
    'ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS isActive BOOLEAN DEFAULT TRUE',
    'ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS updatedAt TIMESTAMP',
    'ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS supplierId VARCHAR(36)',
    'ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS lotNumber VARCHAR(120)',
    'ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS purchaseDate DATE',
    'ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS expirationDate DATE',
    'ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS initialQuantity INTEGER DEFAULT 0',
    'ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS remainingQuantity INTEGER DEFAULT 0',
    'ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS unitPrice NUMERIC(10,2) DEFAULT 0',
    'ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS notes TEXT',
    'ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS isActive BOOLEAN DEFAULT TRUE',
    'ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS updatedAt TIMESTAMP',
    'ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS invoiceNumber VARCHAR(120)',
    'ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS invoiceAmount NUMERIC(10,2)',
    'ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS updatedAt TIMESTAMP',
    'ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS receivedQuantity INTEGER DEFAULT 0',
    'ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS notes TEXT',
    'ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS discountAmount NUMERIC(10,2) DEFAULT 0',
    'ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS discountPercent NUMERIC(5,2) DEFAULT 0',
    'ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS paymentId VARCHAR(36)',
    'ALTER TABLE pos_sale_items ADD COLUMN IF NOT EXISTS lotId VARCHAR(36)',
    'ALTER TABLE pos_sale_items ADD COLUMN IF NOT EXISTS purchasePrice NUMERIC(10,2) DEFAULT 0',
    'ALTER TABLE equipment ADD COLUMN IF NOT EXISTS specificFields TEXT',
    'ALTER TABLE equipment ADD COLUMN IF NOT EXISTS updatedAt TIMESTAMP',
    'ALTER TABLE equipment_maintenance ADD COLUMN IF NOT EXISTS supplierId VARCHAR(36)'
  ];
}

function buildInventoryModuleStatements() {
  return [
    `CREATE TABLE IF NOT EXISTS suppliers (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      contactName VARCHAR(255),
      phone VARCHAR(100),
      email VARCHAR(255),
      address TEXT,
      specialty VARCHAR(120),
      notes TEXT,
      isActive BOOLEAN DEFAULT TRUE,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_lots (
      id VARCHAR(36) PRIMARY KEY,
      inventoryId VARCHAR(36) NOT NULL,
      supplierId VARCHAR(36),
      lotNumber VARCHAR(120),
      purchaseDate DATE,
      expirationDate DATE,
      initialQuantity INTEGER DEFAULT 0,
      remainingQuantity INTEGER DEFAULT 0,
      unitPrice NUMERIC(10,2) DEFAULT 0,
      notes TEXT,
      isActive BOOLEAN DEFAULT TRUE,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS purchase_orders (
      id VARCHAR(36) PRIMARY KEY,
      supplierId VARCHAR(36),
      orderDate DATE,
      expectedDeliveryDate DATE,
      status VARCHAR(50) DEFAULT 'draft',
      totalAmount NUMERIC(10,2) DEFAULT 0,
      invoiceNumber VARCHAR(120),
      invoiceAmount NUMERIC(10,2),
      notes TEXT,
      createdBy VARCHAR(36),
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS purchase_order_items (
      id VARCHAR(36) PRIMARY KEY,
      purchaseOrderId VARCHAR(36) NOT NULL,
      inventoryId VARCHAR(36) NOT NULL,
      orderedQuantity INTEGER DEFAULT 0,
      receivedQuantity INTEGER DEFAULT 0,
      unitPrice NUMERIC(10,2) DEFAULT 0,
      notes TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS pos_sales (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36),
      customerName VARCHAR(255),
      saleDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      totalAmount NUMERIC(10,2) DEFAULT 0,
      discountAmount NUMERIC(10,2) DEFAULT 0,
      discountPercent NUMERIC(5,2) DEFAULT 0,
      finalAmount NUMERIC(10,2) DEFAULT 0,
      paymentMethod VARCHAR(80),
      paymentId VARCHAR(36),
      notes TEXT,
      createdBy VARCHAR(36),
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS pos_sale_items (
      id VARCHAR(36) PRIMARY KEY,
      posSaleId VARCHAR(36) NOT NULL,
      inventoryId VARCHAR(36) NOT NULL,
      lotId VARCHAR(36),
      quantity INTEGER DEFAULT 0,
      unitPrice NUMERIC(10,2) DEFAULT 0,
      purchasePrice NUMERIC(10,2) DEFAULT 0,
      totalPrice NUMERIC(10,2) DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS act_consumables (
      id VARCHAR(36) PRIMARY KEY,
      actType VARCHAR(255) NOT NULL,
      inventoryId VARCHAR(36) NOT NULL,
      quantity NUMERIC(10,2) DEFAULT 1,
      specialty VARCHAR(100) DEFAULT 'dentistry',
      isActive BOOLEAN DEFAULT TRUE,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS equipment (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(120) DEFAULT 'general',
      brand VARCHAR(255),
      model VARCHAR(255),
      serialNumber VARCHAR(255),
      purchaseDate DATE,
      warrantyEnd DATE,
      assignedRoom VARCHAR(255),
      assignedDoctorId VARCHAR(36),
      status VARCHAR(80) DEFAULT 'available',
      lastMaintenanceDate DATE,
      nextMaintenanceDate DATE,
      notes TEXT,
      specificFields TEXT,
      isActive BOOLEAN DEFAULT TRUE,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS equipment_maintenance (
      id VARCHAR(36) PRIMARY KEY,
      equipmentId VARCHAR(36) NOT NULL,
      maintenanceDate DATE,
      maintenanceType VARCHAR(120),
      cost NUMERIC(10,2) DEFAULT 0,
      technician VARCHAR(255),
      supplierId VARCHAR(36),
      notes TEXT,
      performedBy VARCHAR(36),
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
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
    ...buildInventoryModuleStatements(),
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
