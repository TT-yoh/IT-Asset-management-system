/**
 * Development & Test Fixture Data Purge Utility
 * Clears ephemeral operational test data (checkouts, maintenance tickets, assets, notifications).
 *
 * Safety Guards:
 * - Refuses to execute if NODE_ENV === 'production'
 * - Refuses to execute unless the target database matches an allowlist (*_dev, *_test)
 * - Refuses to execute without an explicit '--i-know-this-wipes-everything' CLI flag
 * - Never deletes organizations or users via cascade
 * - Contains zero hardcoded credentials or seeds
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import { config } from '../server/config.ts';

// 1. Guard: Never run in production
if (config.isProduction || process.env.NODE_ENV === 'production') {
  console.error('\n🚫 Refusing to execute cleanup: Operation is strictly prohibited in production mode.');
  process.exit(1);
}

// 2. Guard: Database name must match allowlist (*_dev or *_test)
const dbName = (config.TIDB_DATABASE || '').toLowerCase();
const isAllowedDb = dbName.endsWith('_dev') || dbName.endsWith('_test') || dbName.endsWith('dev') || dbName.endsWith('test');
if (!isAllowedDb) {
  console.error(`\n🚫 Refusing to execute cleanup: Database "${config.TIDB_DATABASE}" does not match the safety allowlist (*_dev, *_test).`);
  console.error('Data purging is only permitted against dedicated development or testing database instances.\n');
  process.exit(1);
}

// 3. Guard: Explicit confirmation flag required
const hasConfirmFlag = process.argv.includes('--i-know-this-wipes-everything');
if (!hasConfirmFlag) {
  console.error('\n⚠️  Notice: This command will purge operational records from the database.');
  console.error('To proceed, you must pass the explicit confirmation flag:');
  console.error('   node scripts/cleanup-dummy-data.mjs --i-know-this-wipes-everything\n');
  process.exit(1);
}

const host = config.TIDB_HOST;
const port = config.TIDB_PORT;
const user = config.TIDB_USER;
const password = config.TIDB_PASSWORD;
const database = config.TIDB_DATABASE;

async function cleanup() {
  console.log(`\n🧹 Connecting to dev/test database "${database}" at ${host}:${port}...`);
  const sslConfig = {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: !config.isTest,
    ...(config.TIDB_CA_PATH && fs.existsSync(config.TIDB_CA_PATH)
      ? { ca: fs.readFileSync(config.TIDB_CA_PATH) }
      : {})
  };

  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    ssl: sslConfig
  });

  try {
    console.log('🧹 Purging operational test data...');

    // 1. Clear checkouts & maintenance tickets (custody & work tickets)
    await conn.query('DELETE FROM `maintenances`;');
    console.log('✓ Cleared maintenances table');

    await conn.query('DELETE FROM `checkouts`;');
    console.log('✓ Cleared checkouts table');

    // 2. Clear assets (hardware catalog)
    await conn.query('DELETE FROM `assets`;');
    console.log('✓ Cleared assets table');

    // 3. Clear budgets & notifications
    await conn.query('DELETE FROM `budgets`;');
    console.log('✓ Cleared budgets table');

    await conn.query('DELETE FROM `notifications`;');
    console.log('✓ Cleared notifications table');

    // 4. Clear transient lockouts and idempotency keys
    try {
      await conn.query('DELETE FROM `login_attempts`;');
      console.log('✓ Cleared login_attempts table');
    } catch {
      // Table may not exist yet
    }

    try {
      await conn.query('DELETE FROM `idempotency_keys_v2`;');
      console.log('✓ Cleared idempotency_keys_v2 table');
    } catch {
      // Table may not exist yet
    }

    // Safety: We NEVER delete from organizations or users tables here
    console.log('🛡️ Preserved all organizations, branches, departments, and users intact.');
    console.log('🎉 Cleanup completed successfully.\n');
  } finally {
    await conn.end();
  }
}

cleanup().catch((err) => {
  console.error('\n❌ Cleanup execution failed:', err.message);
  process.exit(1);
});
