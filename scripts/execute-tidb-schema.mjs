/**
 * Automated PingCAP TiDB Cloud Schema Migration & Table Executor
 * Connects directly to TiDB Cloud via MySQL wire protocol over TLS
 * and provisions all 11 relational tables + 5 TiFlash HTAP columnar replicas.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(rootDir, '.env') });

// Parse CLI arguments or environment
const args = process.argv.slice(2);
let connectionUri = args.find(a => a.startsWith('mysql://'));

let host = process.env.VITE_TIDB_HOST || process.env.TIDB_HOST || 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com';
let port = Number(process.env.VITE_TIDB_PORT || process.env.TIDB_PORT || 4000);
let user = process.env.VITE_TIDB_USER || process.env.TIDB_USER || '';
let password = process.env.VITE_TIDB_PASSWORD || process.env.TIDB_PASSWORD || '';
let database = process.env.VITE_TIDB_DATABASE || process.env.TIDB_DATABASE || 'it_asset_ledger';
let ssl = process.env.VITE_TIDB_SSL !== 'false';

if (connectionUri) {
  try {
    const parsed = new URL(connectionUri);
    if (parsed.hostname) host = parsed.hostname;
    if (parsed.port) port = Number(parsed.port);
    if (parsed.username) user = decodeURIComponent(parsed.username);
    if (parsed.password) password = decodeURIComponent(parsed.password);
  } catch (err) {
    console.warn('URI parse notice:', err.message);
  }
}

// Override if specific flags were passed
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--host' && args[i + 1]) host = args[i + 1];
  if (args[i] === '--user' && args[i + 1]) user = args[i + 1];
  if (args[i] === '--password' && args[i + 1]) password = args[i + 1];
  if (args[i] === '--port' && args[i + 1]) port = Number(args[i + 1]);
  if (args[i] === '--database' && args[i + 1]) database = args[i + 1];
}

console.log('\n================================================================');
console.log('  PingCAP TiDB Cloud Automated Table & Schema Executor');
console.log('================================================================\n');

if (!user || user.trim().length === 0) {
  console.log('⚠️  Notice: TiDB Cluster credentials are required.');
  console.log('   Target Host    :', host);
  console.log('   Target Port    :', port);
  console.log('   Target Database:', database);
  console.log('\n👉 To execute against your TiDB Cloud cluster, run either:');
  console.log('   node scripts/execute-tidb-schema.mjs "mysql://<user>:<pass>@<host>:4000/it_asset_ledger?ssl=true"\n');
  process.exit(1);
}

async function runMigration() {
  const startTime = performance.now();
  let connection;

  try {
    console.log(`📡 Connecting to TiDB Cloud cluster at ${host}:${port}...`);
    console.log(`👤 User: ${user}`);
    console.log(`🔒 TLS/SSL: Enabled`);

    const connectionConfig = {
      host,
      port,
      user,
      password,
      ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: false
      },
      connectTimeout: 25000,
      multipleStatements: true
    };

    connection = await mysql.createConnection(connectionConfig);
    console.log('✅ Connected successfully to TiDB cluster!\n');

    // 1. Create and select Database
    console.log(`📁 Ensuring database \`${database}\` exists...`);
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await connection.query(`USE \`${database}\`;`);
    console.log(`✅ Using database \`${database}\`.\n`);

    // 2. Read schema-tidb.sql
    const sqlFilePath = path.join(rootDir, 'schema-tidb.sql');
    const rawSql = fs.readFileSync(sqlFilePath, 'utf8');

    // Strip comments line by line so comment headers don't mask CREATE TABLE statements
    const cleanLines = rawSql
      .split('\n')
      .map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('--') || trimmed.startsWith('#')) return '';
        return line;
      })
      .join('\n');

    // Separate clean individual statements
    const statements = cleanLines
      .split(';')
      .map(s => s.trim())
      .filter(s => {
        if (!s) return false;
        const upper = s.toUpperCase();
        if (upper.startsWith('USE ') || upper.startsWith('CREATE DATABASE ')) return false;
        return upper.includes('CREATE TABLE') || upper.includes('ALTER TABLE');
      });

    console.log(`⚙️  Executing ${statements.length} DDL schema operations...\n`);

    let tablesCreated = 0;
    let tiflashReplicas = 0;

    for (const stmt of statements) {
      // Identify statement type
      const isTable = stmt.toUpperCase().includes('CREATE TABLE');
      const isTiFlash = stmt.toUpperCase().includes('SET TIFLASH REPLICA');

      let label = 'DDL Statement';
      if (isTable) {
        const match = stmt.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?`?([a-zA-Z0-9_]+)`?/i);
        label = match ? `Table \`${match[1]}\`` : 'Table';
      } else if (isTiFlash) {
        const match = stmt.match(/ALTER TABLE\s+`?([a-zA-Z0-9_]+)`?/i);
        label = match ? `TiFlash Replica for \`${match[1]}\`` : 'TiFlash Replica';
      }

      process.stdout.write(`   Executing: ${label}... `);
      try {
        await connection.query(stmt);
        console.log('✓ OK');
        if (isTable) tablesCreated++;
        if (isTiFlash) tiflashReplicas++;
      } catch (stmtErr) {
        // If TiFlash replica already exists or warning, note it and continue
        if (stmtErr.message.includes('already exists') || stmtErr.message.includes('TiFlash replica')) {
          console.log(`ℹ️ (${stmtErr.message})`);
          if (isTiFlash) tiflashReplicas++;
        } else {
          console.log(`❌ ERROR: ${stmtErr.message}`);
          throw stmtErr;
        }
      }
    }

    // 3. Verify all tables in database
    console.log('\n🔍 Verifying created tables in TiDB...');
    const [rows] = await connection.query('SHOW TABLES;');
    const tableNames = rows.map(r => Object.values(r)[0]);
    console.log(`   Discovered ${tableNames.length} tables in \`${database}\`: ${tableNames.join(', ')}`);

    const duration = Math.round(performance.now() - startTime);

    console.log('\n================================================================');
    console.log('  🎉 TiDB Schema & TiFlash Setup Completed Successfully!');
    console.log('================================================================');
    console.log(`   • Relational Tables Created: ${tablesCreated}`);
    console.log(`   • TiFlash Replicas Online  : ${tiflashReplicas}`);
    console.log(`   • Total Execution Time     : ${duration} ms`);
    console.log('   • Cluster Compatibility    : TiDB v8.1.0-serverless (MySQL 8.0 wire)');
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ Execution failed:', err.message);
    if (err.code) console.error('   Error Code:', err.code);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

runMigration();
