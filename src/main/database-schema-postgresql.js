/**
 * Narrow compatibility facade for the former PostgreSQL schema initializer.
 * Native, immutable DDL lives only in database/migrations.
 */

import { getCanonicalColumnNameMap } from './database-column-map.js';
import { runPostgreSqlMigrations } from './database/migration-runner.js';

export { getCanonicalColumnNameMap, runPostgreSqlMigrations };

export function ensurePostgreSqlSchema(pool) {
  return runPostgreSqlMigrations(pool);
}
