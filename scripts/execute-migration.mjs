import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { config } from '../server/config.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const host = config.TIDB_HOST;
const port = config.TIDB_PORT;
const user = config.TIDB_USER;
const password = config.TIDB_PASSWORD;
const database = config.TIDB_DATABASE;

if (!host || !user || !password || !database) {
  throw new Error('Missing required TiDB environment variables in config (TIDB_HOST, TIDB_USER, TIDB_PASSWORD, TIDB_DATABASE).');
}

async function run() {
  console.log(`Applying migration to ${host}:${port}/${database}...`);
  const sslConfig = {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true,
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
    ssl: sslConfig,
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
