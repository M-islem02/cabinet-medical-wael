import assert from 'node:assert/strict';
import { Pool } from 'pg';
import {
  listPostgreSqlMigrations,
  runPostgreSqlMigrations
} from '../src/main/database/migration-runner.js';

const connectionString = process.env.MEDCARESO_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error('MEDCARESO_TEST_DATABASE_URL is required');
}

const databaseName = decodeURIComponent(new URL(connectionString).pathname.replace(/^\//, ''));
if (!databaseName || !databaseName.toLowerCase().includes('test')) {
  throw new Error('Refusing migration tests: database name must contain "test"');
}

const pool = new Pool({ connectionString, max: 4 });
const expectedModuleTables = [
  'suppliers',
  'inventory_lots',
  'purchase_orders',
  'purchase_order_items',
  'act_consumables',
  'pos_sales',
  'pos_sale_items',
  'equipment',
  'equipment_maintenance'
];

const expectedIndexes = [
  'idx_inventory_lots_fefo',
  'idx_purchase_orders_supplier',
  'idx_pos_sales_sale_date',
  'idx_pos_sale_items_inventory',
  'idx_equipment_next_maintenance',
  'idx_equipment_maintenance_equipment',
  'idx_inventory_movements_pos_sale',
  'idx_plan_equipment_usage_equipment'
];

const expectedSystemLicenseKeys = [
  'MEDPRO-TRIAL-5JOURS',
  'MEDPRO-TRIAL-7JOURS',
  'MEDPRO-TRIAL-15JOURS',
  'MEDPRO-ANNUELLE-1AN',
  'MEDPRO-ILLIMITEE-ACTIVE'
];

async function resetPublicSchema() {
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
}

async function scalar(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] ? Object.values(result.rows[0])[0] : undefined;
}

async function schemaSignature() {
  const result = await pool.query(`
    SELECT md5(string_agg(definition, E'\n' ORDER BY definition)) AS signature
    FROM (
      SELECT 'column:' || table_name || ':' || column_name || ':' || data_type || ':' || is_nullable AS definition
      FROM information_schema.columns
      WHERE table_schema = 'public'
      UNION ALL
      SELECT 'constraint:' || conrelid::regclass::text || ':' || conname || ':' || pg_get_constraintdef(oid)
      FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
      UNION ALL
      SELECT 'index:' || tablename || ':' || indexname || ':' || indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
    ) definitions
  `);
  return result.rows[0].signature;
}

async function assertCoreSchema() {
  const tableResult = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const tables = new Set(tableResult.rows.map((row) => row.table_name));
  for (const table of expectedModuleTables) assert(tables.has(table), `missing table ${table}`);

  const requiredColumns = [
    ['inventory', 'supplierid'],
    ['inventory', 'photopath'],
    ['inventory_movements', 'lotid'],
    ['inventory_movements', 'possaleid'],
    ['inventory_movements', 'purchaseorderid'],
    ['plan_equipment_usage', 'equipmentid']
  ];
  for (const [table, column] of requiredColumns) {
    const exists = await scalar(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1 AND column_name=$2
       )`,
      [table, column]
    );
    assert.equal(exists, true, `missing column ${table}.${column}`);
  }

  const indexResult = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname = ANY($1::text[])`,
    [expectedIndexes]
  );
  assert.deepEqual(
    new Set(indexResult.rows.map((row) => row.indexname)),
    new Set(expectedIndexes),
    'required indexes differ'
  );

  const constraintNames = [
    'fk_inventory_supplier',
    'fk_inventory_movements_lot',
    'fk_inventory_movements_pos_sale',
    'fk_inventory_movements_purchase_order',
    'fk_plan_equipment_usage_equipment',
    'ck_plan_equipment_usage_resource',
    'uq_act_consumables_scope'
  ];
  const constraintResult = await pool.query(
    `SELECT conname, convalidated FROM pg_constraint
     WHERE connamespace='public'::regnamespace AND conname = ANY($1::text[])`,
    [constraintNames]
  );
  assert.equal(constraintResult.rows.length, constraintNames.length, 'required constraints differ');
  assert(constraintResult.rows.every((row) => row.convalidated), 'all required constraints must be validated');
}

async function assertSystemLicenses() {
  const result = await pool.query(
    `SELECT "key", expirationdate, machineid
     FROM licenses
     WHERE "key" = ANY($1::text[])
     ORDER BY "key"`,
    [expectedSystemLicenseKeys]
  );
  assert.deepEqual(
    new Set(result.rows.map((row) => row.key)),
    new Set(expectedSystemLicenseKeys),
    'built-in license keys differ'
  );
  const unlimited = result.rows.find((row) => row.key === 'MEDPRO-ILLIMITEE-ACTIVE');
  assert.equal(unlimited.expirationdate, null, 'unlimited license must not expire');
  assert.equal(unlimited.machineid, null, 'unlimited license must be shared by the cabinet database');
}

async function testFreshDatabase() {
  console.log('[test:migrations] scenario A: fresh database');
  await resetPublicSchema();
  const first = await runPostgreSqlMigrations(pool);
  assert.deepEqual(first.applied, listPostgreSqlMigrations().map((migration) => migration.version));
  assert.equal(first.adoptedBaseline, false);
  await assertCoreSchema();
  await assertSystemLicenses();

  const before = await schemaSignature();
  const second = await runPostgreSqlMigrations(pool);
  const after = await schemaSignature();
  assert.deepEqual(second.applied, []);
  assert.deepEqual(second.skipped, listPostgreSqlMigrations().map((migration) => migration.version));
  assert.equal(after, before, 'second startup changed the schema');
}

async function testUnrelatedDatabaseRejection() {
  console.log('[test:migrations] scenario C: unrelated database rejection');
  await resetPublicSchema();
  await pool.query('CREATE TABLE unrelated_business_data (id INTEGER PRIMARY KEY)');
  await assert.rejects(
    runPostgreSqlMigrations(pool),
    /not a supported MedCareSO PostgreSQL database/
  );
  assert.equal(
    await scalar(`SELECT to_regclass('public.schema_migrations') IS NULL`),
    true,
    'rejected database must not be marked as migrated'
  );
}

async function createRepresentativeExistingDatabase() {
  await pool.query(`
    CREATE TABLE users (id VARCHAR(36) PRIMARY KEY, username TEXT NOT NULL);
    CREATE TABLE patients (id VARCHAR(36) PRIMARY KEY, firstName TEXT, lastName TEXT);
    CREATE TABLE consultations (id VARCHAR(36) PRIMARY KEY, patientId VARCHAR(36));
    CREATE TABLE settings (id VARCHAR(36) PRIMARY KEY);
    CREATE TABLE payments (id VARCHAR(36) PRIMARY KEY, patientId VARCHAR(36));
    CREATE TABLE inventory (
      id VARCHAR(36) PRIMARY KEY, name TEXT NOT NULL, category TEXT,
      quantity INTEGER NOT NULL DEFAULT 0, minQuantity INTEGER NOT NULL DEFAULT 0,
      unit TEXT, purchasePrice NUMERIC(12,2) DEFAULT 0,
      sellingPrice NUMERIC(12,2) DEFAULT 0, isActive BOOLEAN NOT NULL DEFAULT TRUE
    );
    CREATE TABLE treatment_plans (id VARCHAR(36) PRIMARY KEY, patientId VARCHAR(36), title TEXT);
    CREATE TABLE inventory_movements (id VARCHAR(36) PRIMARY KEY, inventoryId VARCHAR(36));
    CREATE TABLE plan_equipment_usage (
      id VARCHAR(36) PRIMARY KEY, planId VARCHAR(36), inventoryId VARCHAR(36) NOT NULL,
      usageDate TIMESTAMP, notes TEXT, createdAt TIMESTAMP
    );

    INSERT INTO users VALUES ('user-existing', 'legacy-admin');
    INSERT INTO patients VALUES ('patient-existing', 'Patient', 'Existant');
    INSERT INTO consultations VALUES ('consult-existing', 'patient-existing');
    INSERT INTO settings VALUES ('settings-existing');
    INSERT INTO payments VALUES ('payment-existing', 'patient-existing');
    INSERT INTO inventory
      (id, name, category, quantity, minQuantity, unit, purchasePrice, sellingPrice, isActive)
      VALUES ('inventory-existing', 'Gants', 'consommable', 10, 2, 'boite', 4, 7, TRUE);
    INSERT INTO treatment_plans VALUES ('plan-existing', 'patient-existing', 'Plan existant');
    INSERT INTO inventory_movements VALUES ('movement-existing', 'inventory-existing');
    INSERT INTO plan_equipment_usage
      (id, planId, inventoryId, usageDate, createdAt)
      VALUES ('usage-existing', 'plan-existing', 'inventory-existing', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  `);
}

async function assertRejected(sql, params, message) {
  await assert.rejects(pool.query(sql, params), undefined, message);
}

async function testExistingDatabase() {
  console.log('[test:migrations] scenario B: representative existing database');
  await resetPublicSchema();
  await createRepresentativeExistingDatabase();
  const result = await runPostgreSqlMigrations(pool);
  assert.equal(result.adoptedBaseline, true);
  assert.deepEqual(
    result.applied,
    listPostgreSqlMigrations().map((migration) => migration.version).filter((version) => version > 1)
  );
  await assertCoreSchema();
  await assertSystemLicenses();

  assert.equal(await scalar(`SELECT COUNT(*)::int FROM patients WHERE id='patient-existing'`), 1);
  assert.equal(await scalar(`SELECT COUNT(*)::int FROM inventory WHERE id='inventory-existing'`), 1);
  assert.equal(await scalar(`SELECT COUNT(*)::int FROM inventory_movements WHERE id='movement-existing'`), 1);
  assert.equal(await scalar(`SELECT COUNT(*)::int FROM plan_equipment_usage WHERE id='usage-existing'`), 1);
  assert.equal(await scalar(`SELECT adopted FROM schema_migrations WHERE version=1`), true);

  await pool.query(`INSERT INTO suppliers (id, name) VALUES ('supplier-test', 'Dental Supply')`);
  await pool.query(`UPDATE inventory SET supplierId='supplier-test', photoPath='item.png' WHERE id='inventory-existing'`);
  await pool.query(`
    INSERT INTO inventory_lots
      (id, inventoryId, supplierId, lotNumber, purchaseDate, expirationDate, initialQuantity, remainingQuantity, unitPrice)
    VALUES ('lot-test', 'inventory-existing', 'supplier-test', 'LOT-1', CURRENT_DATE, CURRENT_DATE + 30, 10, 8, 4)
  `);
  await pool.query(`
    INSERT INTO purchase_orders (id, supplierId, status, totalAmount, createdBy)
    VALUES ('order-test', 'supplier-test', 'received', 40, 'user-existing')
  `);
  await pool.query(`
    INSERT INTO purchase_order_items (id, purchaseOrderId, inventoryId, orderedQuantity, receivedQuantity, unitPrice)
    VALUES ('order-item-test', 'order-test', 'inventory-existing', 10, 10, 4)
  `);
  await pool.query(`
    INSERT INTO pos_sales (id, patientId, totalAmount, finalAmount, paymentId, createdBy)
    VALUES ('sale-test', 'patient-existing', 7, 7, 'payment-existing', 'user-existing')
  `);
  await pool.query(`
    INSERT INTO pos_sale_items (id, posSaleId, inventoryId, lotId, quantity, unitPrice, purchasePrice, totalPrice)
    VALUES ('sale-item-test', 'sale-test', 'inventory-existing', 'lot-test', 1, 7, 4, 7)
  `);
  await pool.query(`
    INSERT INTO act_consumables (id, actType, inventoryId, quantity, specialty)
    VALUES ('act-test', 'detartrage', 'inventory-existing', 1, 'dentistry')
    ON CONFLICT (actType, inventoryId, specialty)
    DO UPDATE SET quantity=EXCLUDED.quantity
  `);
  await pool.query(`
    INSERT INTO equipment (id, name, category, assignedDoctorId, specificFields)
    VALUES ('equipment-test', 'Autoclave', 'sterilization', 'user-existing', '{"cycles": 12}'::jsonb)
  `);
  await pool.query(`
    INSERT INTO equipment_maintenance
      (id, equipmentId, maintenanceDate, maintenanceType, supplierId, performedBy)
    VALUES ('maintenance-test', 'equipment-test', CURRENT_DATE, 'preventive', 'supplier-test', 'user-existing')
  `);
  await pool.query(`
    INSERT INTO plan_equipment_usage (id, planId, inventoryId, equipmentId, usageDate, createdAt)
    VALUES ('equipment-usage-test', 'plan-existing', NULL, 'equipment-test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  await pool.query(`
    UPDATE inventory_movements
    SET lotId='lot-test', posSaleId='sale-test', purchaseOrderId='order-test'
    WHERE id='movement-existing'
  `);

  for (const table of expectedModuleTables) {
    assert(Number(await scalar(`SELECT COUNT(*) FROM ${table}`)) > 0, `${table} flow did not persist`);
  }
  const specificFields = await scalar(`SELECT specificFields FROM equipment WHERE id='equipment-test'`);
  assert.deepEqual(specificFields, { cycles: 12 });

  await assertRejected(
    `INSERT INTO inventory_lots
      (id, inventoryId, initialQuantity, remainingQuantity, unitPrice)
     VALUES ('lot-invalid', 'inventory-existing', 1, -1, 0)`,
    [],
    'negative lot quantity must fail'
  );
  await assertRejected(
    `UPDATE inventory SET supplierId='missing-supplier' WHERE id='inventory-existing'`,
    [],
    'invalid supplier foreign key must fail'
  );
  await assertRejected(
    `INSERT INTO plan_equipment_usage (id, planId, inventoryId, equipmentId)
     VALUES ('usage-invalid', 'plan-existing', NULL, NULL)`,
    [],
    'resource check must fail'
  );

  const second = await runPostgreSqlMigrations(pool);
  assert.deepEqual(second.applied, []);
}

let succeeded = false;
try {
  await testFreshDatabase();
  await testExistingDatabase();
  await testUnrelatedDatabaseRejection();
  succeeded = true;
  console.log('[test:migrations] PASS: fresh, idempotent, adoption, module flows, constraints, and rejection');
} finally {
  if (process.env.MEDCARESO_TEST_KEEP_DATABASE !== '1') {
    await resetPublicSchema();
  }
  await pool.end();
  if (!succeeded) console.error('[test:migrations] FAILED');
}
