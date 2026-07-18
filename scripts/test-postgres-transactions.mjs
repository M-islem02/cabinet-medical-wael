import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { createTransactionManager } from '../src/main/database/transaction-manager.js';

const connectionString = process.env.MEDCARESO_TEST_DATABASE_URL;
if (!connectionString) throw new Error('MEDCARESO_TEST_DATABASE_URL is required');
const databaseName = decodeURIComponent(new URL(connectionString).pathname.replace(/^\//, ''));
if (!databaseName || !databaseName.toLowerCase().includes('test')) {
  throw new Error('Refusing transaction tests: database name must contain "test"');
}

const pool = new Pool({ connectionString, max: 6 });
const transactionManager = createTransactionManager(() => pool);

function convertPlaceholders(sql) {
  let index = 0;
  return String(sql).replace(/\?/g, () => `$${++index}`);
}

const database = {
  withTransaction: (task, options) => transactionManager.withTransaction(task, options),
  async run(sql, params = []) {
    return transactionManager.getQueryTarget().query(convertPlaceholders(sql), params);
  },
  async queryOne(sql, params = []) {
    const result = await transactionManager.getQueryTarget().query(convertPlaceholders(sql), params);
    return result.rows[0] || null;
  }
};

const tables = [
  'transaction_test_sale_items',
  'transaction_test_movements',
  'transaction_test_payments',
  'transaction_test_sales',
  'transaction_test_lots',
  'transaction_test_accounts'
];

async function cleanup() {
  await pool.query(`DROP TABLE IF EXISTS ${tables.join(', ')} CASCADE`);
}

async function setup() {
  await cleanup();
  await pool.query(`
    CREATE TABLE transaction_test_accounts (
      id TEXT PRIMARY KEY,
      balance INTEGER NOT NULL CHECK (balance >= 0)
    );
    CREATE TABLE transaction_test_lots (
      id TEXT PRIMARY KEY,
      remaining_quantity INTEGER NOT NULL CHECK (remaining_quantity >= 0)
    );
    CREATE TABLE transaction_test_sales (id TEXT PRIMARY KEY);
    CREATE TABLE transaction_test_sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL REFERENCES transaction_test_sales(id)
    );
    CREATE TABLE transaction_test_movements (id TEXT PRIMARY KEY, sale_id TEXT NOT NULL);
    CREATE TABLE transaction_test_payments (id TEXT PRIMARY KEY, sale_id TEXT NOT NULL);
  `);
}

async function count(table) {
  const row = await database.queryOne(`SELECT COUNT(*)::int AS count FROM ${table}`);
  return row.count;
}

async function testCommitAndRollback() {
  await database.withTransaction(async () => {
    await database.run('INSERT INTO transaction_test_accounts (id, balance) VALUES (?, ?)', ['committed', 10]);
  });
  assert.equal(await count('transaction_test_accounts'), 1);

  await assert.rejects(
    database.withTransaction(async () => {
      await database.run('INSERT INTO transaction_test_accounts (id, balance) VALUES (?, ?)', ['rolled-back', 20]);
      await database.run('INSERT INTO transaction_test_accounts (id, balance) VALUES (?, ?)', ['committed', 30]);
    })
  );
  assert.equal(await database.queryOne(
    'SELECT COUNT(*)::int AS count FROM transaction_test_accounts WHERE id = ?',
    ['rolled-back']
  ).then((row) => row.count), 0);
}

async function testNestedSavepoint() {
  await database.withTransaction(async () => {
    await database.run('INSERT INTO transaction_test_accounts VALUES (?, ?)', ['outer-before', 1]);
    await assert.rejects(database.withTransaction(async () => {
      await database.run('INSERT INTO transaction_test_accounts VALUES (?, ?)', ['inner-rollback', 1]);
      throw new Error('force nested rollback');
    }));
    await database.run('INSERT INTO transaction_test_accounts VALUES (?, ?)', ['outer-after', 1]);
  });
  assert.equal(await database.queryOne(
    `SELECT COUNT(*)::int AS count FROM transaction_test_accounts
     WHERE id IN ('outer-before', 'outer-after')`
  ).then((row) => row.count), 2);
  assert.equal(await database.queryOne(
    `SELECT COUNT(*)::int AS count FROM transaction_test_accounts WHERE id='inner-rollback'`
  ).then((row) => row.count), 0);
}

async function testSameClientAndConcurrentLotLock() {
  await database.withTransaction(async () => {
    const first = await database.queryOne('SELECT pg_backend_pid() AS pid');
    const second = await database.queryOne('SELECT pg_backend_pid() AS pid');
    assert.equal(first.pid, second.pid, 'transaction queries changed PostgreSQL client');
  });

  await database.run('INSERT INTO transaction_test_lots VALUES (?, ?)', ['lot-concurrent', 5]);
  const sellFour = () => database.withTransaction(async () => {
    const lot = await database.queryOne(
      'SELECT remaining_quantity FROM transaction_test_lots WHERE id = ? FOR UPDATE',
      ['lot-concurrent']
    );
    if (lot.remaining_quantity < 4) return false;
    await database.run(
      'UPDATE transaction_test_lots SET remaining_quantity = remaining_quantity - 4 WHERE id = ?',
      ['lot-concurrent']
    );
    return true;
  });
  const results = await Promise.all([sellFour(), sellFour()]);
  assert.deepEqual(results.sort(), [false, true]);
  assert.equal(await database.queryOne(
    'SELECT remaining_quantity FROM transaction_test_lots WHERE id = ?',
    ['lot-concurrent']
  ).then((row) => row.remaining_quantity), 1);
}

async function testPosLikeAtomicRollback() {
  await database.run('INSERT INTO transaction_test_lots VALUES (?, ?)', ['lot-pos', 5]);
  await assert.rejects(database.withTransaction(async () => {
    await database.run('INSERT INTO transaction_test_sales VALUES (?)', ['sale-rollback']);
    await database.run('INSERT INTO transaction_test_sale_items VALUES (?, ?)', ['item-rollback', 'sale-rollback']);
    await database.run('UPDATE transaction_test_lots SET remaining_quantity=remaining_quantity-2 WHERE id=?', ['lot-pos']);
    await database.run('INSERT INTO transaction_test_movements VALUES (?, ?)', ['movement-rollback', 'sale-rollback']);
    await database.run('INSERT INTO transaction_test_payments VALUES (?, ?)', ['payment-rollback', 'sale-rollback']);
    await database.run('INSERT INTO transaction_test_sales VALUES (?)', ['sale-rollback']);
  }));

  for (const table of ['transaction_test_sales', 'transaction_test_sale_items', 'transaction_test_movements', 'transaction_test_payments']) {
    assert.equal(await count(table), 0, `${table} was partially committed`);
  }
  assert.equal(await database.queryOne(
    'SELECT remaining_quantity FROM transaction_test_lots WHERE id=?', ['lot-pos']
  ).then((row) => row.remaining_quantity), 5);
}

let succeeded = false;
try {
  await setup();
  await testCommitAndRollback();
  await testNestedSavepoint();
  await testSameClientAndConcurrentLotLock();
  await testPosLikeAtomicRollback();
  succeeded = true;
  console.log('[test:transactions] PASS: commit, rollback, savepoint, client affinity, row lock, atomic POS flow');
} finally {
  await cleanup();
  await pool.end();
  if (!succeeded) console.error('[test:transactions] FAILED');
}
