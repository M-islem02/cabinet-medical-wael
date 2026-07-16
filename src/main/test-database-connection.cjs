'use strict';

const fs = require('node:fs');
const { Client } = require('pg');

function writeResult(result, logPath) {
  if (logPath) {
    fs.writeFileSync(logPath, JSON.stringify(result, null, 2), 'utf8');
  }
}

async function testDatabaseConnection(configPath, logPath) {
  if (!configPath) throw new Error('Database test configuration is missing');

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const config = raw.database && typeof raw.database === 'object'
      ? raw.database
      : raw;
    if (typeof config.password !== 'string') {
      throw new Error('Database password must be a string');
    }

    const client = new Client({
      host: config.host,
      port: Number(config.port),
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl === true ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 10000
    });

    try {
      await client.connect();
      const queryResult = await client.query(
        'SELECT current_database() AS database, current_user AS user, NOW() AS server_time'
      );
      const row = queryResult.rows[0] || {};
      if (row.database !== config.database || row.user !== config.user) {
        throw new Error('PostgreSQL returned an unexpected database or user');
      }
      const result = {
        success: true,
        host: config.host,
        port: Number(config.port),
        database: row.database,
        user: row.user
      };
      writeResult(result, logPath);
      return result;
    } finally {
      await client.end().catch(() => {});
    }
  } catch (error) {
    const result = {
      success: false,
      code: error.code || 'DATABASE_CONNECTION_FAILED',
      message: error.message || 'Database connection failed'
    };
    writeResult(result, logPath);
    return result;
  }
}

module.exports = { testDatabaseConnection };

if (require.main === module) {
  testDatabaseConnection(process.argv[2], process.argv[3]).then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.success ? 0 : 1;
  });
}
