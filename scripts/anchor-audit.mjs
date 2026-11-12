#!/usr/bin/env node
/**
 * External Audit Anchor Reference Implementation
 * Periodically snapshots audit_chain_heads to an append-only destination
 * (e.g. WORM storage, S3 Object Lock, RFC 3161 timestamp authority, or local anchor log).
 *
 * Usage:
 *   node scripts/anchor-audit.mjs [--out=path/to/anchors.log] [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const outArg = args.find(a => a.startsWith('--out='));
const outputPath = outArg ? outArg.split('=')[1] : null;

const hmacKey = process.env.AUDIT_HMAC_KEY || process.env.SESSION_SECRET;
if (!hmacKey) {
  console.error('FATAL: AUDIT_HMAC_KEY is required for external anchoring.');
  process.exit(1);
}

const host = process.env.TIDB_HOST;
const port = Number(process.env.TIDB_PORT || 4000);
const user = process.env.TIDB_USER;
const password = process.env.TIDB_PASSWORD;
const database = process.env.TIDB_DATABASE;
const ssl = process.env.TIDB_SSL !== 'false';

if (!host || !user || !password || !database) {
  console.error('FATAL: Database configuration missing (TIDB_HOST, TIDB_USER, TIDB_PASSWORD, TIDB_DATABASE).');
  process.exit(1);
}

async function runAnchor() {
  console.log('⚓ Starting OmniAsset Audit Chain Anchoring Job...');
  
  const connection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    ssl: ssl ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
    dateStrings: true
  });

  try {
    const [rows] = await connection.execute(
      'SELECT `org_id`, `last_seq`, `last_hash`, `updated_at` FROM `audit_chain_heads` ORDER BY `org_id` ASC;'
    );

    const now = new Date().toISOString();
    const anchorRecords = [];

    for (const row of rows) {
      const payload = {
        orgId: row.org_id,
        seq: Number(row.last_seq),
        hash: row.last_hash,
        timestamp: now
      };

      // Cryptographically sign anchor payload with AUDIT_HMAC_KEY
      const signature = crypto
        .createHmac('sha256', hmacKey)
        .update(JSON.stringify(payload))
        .digest('hex');

      anchorRecords.push({
        ...payload,
        signature
      });
    }

    console.log(`✓ Generated ${anchorRecords.length} signed tenant anchor record(s).`);

    if (isDryRun || !outputPath) {
      console.log('\n--- Anchor Snapshot (JSON Lines) ---');
      for (const rec of anchorRecords) {
        console.log(JSON.stringify(rec));
      }
    }

    if (outputPath && !isDryRun) {
      const resolvedPath = path.resolve(outputPath);
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      for (const rec of anchorRecords) {
        fs.appendFileSync(resolvedPath, JSON.stringify(rec) + '\n', 'utf8');
      }
      console.log(`✓ Successfully appended anchor records to ${resolvedPath}`);
    }

    console.log('⚓ Anchoring job completed successfully.\n');
  } finally {
    await connection.end();
  }
}

runAnchor().catch(err => {
  console.error('Anchoring failed:', err);
  process.exit(1);
});

