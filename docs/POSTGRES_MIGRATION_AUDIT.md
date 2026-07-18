# PostgreSQL Migration Audit

Generated during the PostgreSQL-only migration pass.

## Runtime Database Entry Points

- `src/main/database-unified.js`: now PostgreSQL-only facade.
- `src/main/database-postgresql.js`: active runtime adapter using `pg`.
- `src/main/database/migration-runner.js`: checksum-verified native PostgreSQL migration runner.
- `src/main/database-schema-postgresql.js`: compatibility facade; it no longer converts or executes the legacy schema source.
- `src/main/postgres-local-service.js`: starts/stops bundled local PostgreSQL binaries.
- `src/main/handlers/db-config-handler.js`: PostgreSQL-only configuration/status IPC.

## Legacy Engines Found

### SQLite / `better-sqlite3`

- `tools/migration-legacy/database-sqlite-legacy.js`: old SQLite implementation and dev seed/clear helpers.
- `tools/migration-legacy/database-sqlite3-legacy.js`: compatibility wrapper around old SQLite implementation.
- `src/main/handlers/cloud-sync-handler.js`: old SQLite backup discovery path; disabled in runtime.
- `tools/migration-legacy/migrate-to-postgresql.mjs`: migration-only source reader.
- `tools/migration-legacy/seed-large-dataset.mjs`: dev seed utility, not used by runtime.

### MariaDB / `mysql2`

- `tools/migration-legacy/database-mariadb.js`: old MariaDB schema/adapter; no longer imported by runtime.
- `src/main/handlers/cloud-sync-handler.js`: old remote MariaDB replication path; disabled in runtime.
- `tools/migration-legacy/migrate-to-postgresql.mjs`: migration-only source reader.
- `tools/migration-legacy/custom-users.mjs`, `tools/migration-legacy/update-specifics.mjs`, `tools/migration-legacy/insert-staff.mjs`, `tools/migration-legacy/custom-drr-settings.mjs`, `tools/migration-legacy/seed-large-dataset.mjs`: legacy/dev utilities.

## Hybrid Mode Logic Found

- Former `database-config.json` shapes: `{ type: "sqlite" }`, `{ type: "mariadb", mariadb: {...} }`, `{ type: "postgresql", postgresql: {...} }`.
- New canonical shape: `{ "database": { "mode": "local" | "network", "host": "localhost", "port": 5432, "database": "cabinet_db", "user": "cabinet_app", "password": "..." } }`.
- The PostgreSQL adapter normalizes old config shapes on read for compatibility.

## SQL Dialect-Specific Runtime Areas

- Date functions in `src/main/main.js` and `src/main/handlers/payment-handler.js` were switched to PostgreSQL expressions.
- Inventory, POS, supplier and equipment handlers now use native PostgreSQL date, boolean, search, upsert and JSONB behavior. The general adapter keeps unrelated legacy compatibility only.
- Cloud sync still contains dormant legacy code after early returns; it must be deleted after migration tooling is fully validated.

## Migration Boundary

- Legacy database readers live under `tools/migration-legacy/`.
- Runtime code must not import `better-sqlite3` or `mysql2`.
- Production migrations must be run only on copied client databases and must produce a report before any real deployment.
