import { AsyncLocalStorage } from 'async_hooks';

function normalizeIsolationLevel(value) {
  const normalized = String(value || 'READ COMMITTED').trim().toUpperCase();
  const supported = new Set(['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE']);
  if (!supported.has(normalized)) {
    throw new Error(`Unsupported PostgreSQL isolation level: ${value}`);
  }
  return normalized;
}

/**
 * Build a transaction context whose query target follows the current async
 * workflow. The pool getter is evaluated lazily after database startup.
 *
 * @param {() => import('pg').Pool|null} getPool
 */
export function createTransactionManager(getPool) {
  const storage = new AsyncLocalStorage();

  function requirePool() {
    const pool = getPool();
    if (!pool) throw new Error('Base de donnees PostgreSQL non initialisee');
    return pool;
  }

  async function runNested(transaction, task) {
    transaction.savepointCounter += 1;
    const savepoint = `medcareso_sp_${transaction.savepointCounter}`;
    await transaction.client.query(`SAVEPOINT ${savepoint}`);
    try {
      const result = await task();
      await transaction.client.query(`RELEASE SAVEPOINT ${savepoint}`);
      return result;
    } catch (error) {
      await transaction.client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await transaction.client.query(`RELEASE SAVEPOINT ${savepoint}`);
      throw error;
    }
  }

  return {
    getQueryTarget() {
      return storage.getStore()?.client || requirePool();
    },

    async withTransaction(task, options = {}) {
      if (typeof task !== 'function') throw new TypeError('Transaction task must be a function');
      const active = storage.getStore();
      if (active?.client) return runNested(active, task);

      const client = await requirePool().connect();
      const transaction = { client, savepointCounter: 0 };
      try {
        await client.query(`BEGIN ISOLATION LEVEL ${normalizeIsolationLevel(options.isolationLevel)}`);
        const result = await storage.run(transaction, task);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error(`[PostgreSQL transaction] rollback failed: ${rollbackError.message}`);
        }
        throw error;
      } finally {
        client.release();
      }
    }
  };
}
