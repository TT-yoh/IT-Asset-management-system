import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(rootDir, '.env') });

const host = process.env.TIDB_HOST || 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com';
const port = Number(process.env.TIDB_PORT || 4000);
const user = process.env.TIDB_USER || '';
const password = process.env.TIDB_PASSWORD || '';
const database = process.env.TIDB_DATABASE || 'it_asset_ledger';

async function run() {
  console.log(`Applying migration to ${host}:${port}/${database}...`);
  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    ssl: { rejectUnauthorized: false },
    multipleStatements: true
  });

  const targetFile = process.argv[2] || 'migrations/001_phase2_auth_and_schema.sql';
  const sqlPath = path.isAbsolute(targetFile) ? targetFile : path.join(rootDir, targetFile);
  console.log(`Executing migration file: ${sqlPath}`);
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Remove comments and execute statements
  const statements = sql
    .split('\n')
    .map(line => line.trim().startsWith('--') ? '' : line)
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.toUpperCase().startsWith('USE '));

  for (const stmt of statements) {
    try {
      console.log(`Executing: ${stmt.slice(0, 60)}...`);
      await conn.query(stmt);
      console.log('✓ Success');
    } catch (e) {
      console.log(`Note: ${e.message}`);
    }
  }

  await conn.end();
  console.log('Migration finished.');
}

run().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
