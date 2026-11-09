/**
 * OmniAsset Idempotency Keys Maintenance & Cleanup Script
 * Safely purges expired idempotency records from idempotency_keys_v2 in small batches
 * to prevent table locking and long transaction stalls.
 *
 * Usage:
 *   node scripts/cleanup-idempotency.mjs [--batch-size=1000] [--dry-run]
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import { config } from '../server/config.ts';

const isDryRun = process.argv.includes('--dry-run');
const batchSizeArg = process.argv.find(a => a.startsWith('--batch-size='));
const BATCH_SIZE = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : 1000;

if (isNaN(BATCH_SIZE) || BATCH_SIZE <= 0 || BATCH_SIZE > 10000) {
  console.error('Invalid --batch-size parameter. Must be an integer between 1 and 10000.');
  process.exit(1);
}

const host = config.TIDB_HOST;
const port = config.TIDB_PORT;
const user = config.TIDB_USER;
const password = config.TIDB_PASSWORD;
const database = config.TIDB_DATABASE;

let sslConfig = undefined;
if (config.TIDB_SSL !== false) {
  if (config.TIDB_CA_PATH && fs.existsSync(config.TIDB_CA_PATH)) {
    sslConfig = {
      ca: fs.readFileSync(config.TIDB_CA_PATH),
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true
    };
  } else {
    sslConfig = {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true
    };
  }
}

async function runCleanup() {
  console.log('================================================================');
  console.log('  OmniAsset Idempotency Ledger Cleanup Utility');
  console.log('================================================================');
  console.log(`Database Host : ${host}:${port}`);
  console.log(`Target Schema : ${database}`);
  console.log(`Batch Size    : ${BATCH_SIZE}`);
  console.log(`Mode          : ${isDryRun ? 'DRY-RUN (Simulated)' : 'EXECUTE'}`);
  console.log('----------------------------------------------------------------\n');

  let connection;
  try {
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
      ssl: sslConfig,
      timezone: 'Z',
      dateStrings: true
    });

    // Check count of expired records
    const [countRows] = await connection.execute(
      'SELECT COUNT(*) as expiredCount FROM `idempotency_keys_v2` WHERE `expires_at` < NOW();'
    );
    const totalExpired = Number(countRows[0]?.expiredCount || 0);
    console.log(`Found ${totalExpired} expired idempotency record(s) pending purge.`);

    if (totalExpired === 0) {
      console.log('✨ No expired records found. Ledger is clean.\n');
      await connection.end();
      process.exit(0);
    }

    if (isDryRun) {
      console.log(`[DRY-RUN] Would purge ${totalExpired} expired record(s) in batches of ${BATCH_SIZE}.\n`);
      await connection.end();
      process.exit(0);
    }

    let purgedTotal = 0;
    let iteration = 0;

    while (true) {
      iteration++;
      const [result] = await connection.execute(
        'DELETE FROM `idempotency_keys_v2` WHERE `expires_at` < NOW() LIMIT ?;',
        [BATCH_SIZE]
      );
      const affected = (result && result.affectedRows) || 0;
      purgedTotal += affected;

      console.log(`  Batch #${iteration}: Purged ${affected} record(s) (Cumulative: ${purgedTotal}/${totalExpired})`);

      if (affected === 0) {
        break;
      }

      // Small 50ms pause to yield CPU and connection time
      await new Promise(r => setTimeout(r, 50));
    }

    console.log(`\n🎉 Successfully purged ${purgedTotal} expired idempotency record(s) across ${iteration} batches.\n`);
  } catch (err) {
    console.error('\n❌ Idempotency cleanup failed with error:', err.message);
    process.exitCode = 1;
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch {}
    }
  }
}

runCleanup();
