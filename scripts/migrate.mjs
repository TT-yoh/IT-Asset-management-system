/**
 * OmniAsset Authoritative Migration Runner
 * Connects to TiDB/MySQL via TLS with verified certificates.
 * Records schema migrations with cryptographic SHA-256 checksums in schema_migrations.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { config } from '../server/config.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const migrationsDir = path.join(rootDir, 'migrations');

/**
 * Robust SQL Statement Splitter
 * Tokenizes SQL statements correctly without naively splitting on semicolons inside
 * single quotes, double quotes, backticks, or comments.
 */
export function splitSqlStatements(sqlText) {
  const statements = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sqlText.length; i++) {
    const ch = sqlText[i];
    const next = sqlText[i + 1] || '';

    // Handle line comments (-- or #)
    if (inLineComment) {
      if (ch === '\n' || ch === '\r') {
        inLineComment = false;
      }
      continue;
    }

    // Handle block comments (/* ... */)
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++; // skip /
      }
      continue;
    }

    // Handle single quote string literal
    if (inSingleQuote) {
      current += ch;
      if (ch === '\\') {
        // Escaped character inside single quote
        i++;
        if (i < sqlText.length) current += sqlText[i];
      } else if (ch === '\'') {
        if (next === '\'') {
          // SQL escaped single quote: ''
          current += next;
          i++;
        } else {
          inSingleQuote = false;
        }
      }
      continue;
    }

    // Handle double quote string literal
    if (inDoubleQuote) {
      current += ch;
      if (ch === '\\') {
        i++;
        if (i < sqlText.length) current += sqlText[i];
      } else if (ch === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    // Handle backtick identifier
    if (inBacktick) {
      current += ch;
      if (ch === '`') {
        inBacktick = false;
      }
      continue;
    }

    // Not inside any quote or comment: check start of comment
    if (ch === '-' && next === '-') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '#') {
      inLineComment = true;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    // Check quotes entry
    if (ch === '\'') {
      inSingleQuote = true;
      current += ch;
      continue;
    }
    if (ch === '"') {
      inDoubleQuote = true;
      current += ch;
      continue;
    }
    if (ch === '`') {
      inBacktick = true;
      current += ch;
      continue;
    }

    // Semicolon delimiter outside quotes
    if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed.length > 0 && !trimmed.toUpperCase().startsWith('USE ')) {
        statements.push(trimmed);
      }
      current = '';
      continue;
    }

    current += ch;
  }

  const trailing = current.trim();
  if (trailing.length > 0 && !trailing.toUpperCase().startsWith('USE ')) {
    statements.push(trailing);
  }

  return statements;
}

/**
 * Calculates SHA-256 checksum for a file
 */
export function calculateChecksum(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Establishes TLS-verified connection strictly from validated config
 */
export async function createMigrationConnection() {
  const host = config.TIDB_HOST;
  const port = config.TIDB_PORT;
  const user = config.TIDB_USER;
  const password = config.TIDB_PASSWORD;
  const database = config.TIDB_DATABASE;

  if (!host || !user || !password || !database) {
    throw new Error('Database connection credentials missing from validated configuration.');
  }

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
    ssl: sslConfig,
    multipleStatements: false
  });

  // Ensure target database exists and select it
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await conn.query(`USE \`${database}\`;`);

  // Ensure schema_migrations table exists
  await conn.query(`
    CREATE TABLE IF NOT EXISTS \`schema_migrations\` (
      \`version\` VARCHAR(64) NOT NULL,
      \`name\` VARCHAR(255) NOT NULL,
      \`checksum\` VARCHAR(64) NOT NULL,
      \`applied_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`version\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  return conn;
}

/**
 * Main migration execution logic
 */
export async function runMigrations(options = {}) {
  const isDryRun = options.dryRun || process.argv.includes('--dry-run');
  const isStatus = options.status || process.argv.includes('--status');

  console.log('================================================================');
  console.log('  OmniAsset Authoritative Migration Runner');
  console.log('================================================================');
  console.log(`Database Host : ${config.TIDB_HOST}:${config.TIDB_PORT}`);
  console.log(`Target Schema : ${config.TIDB_DATABASE}`);
  console.log(`Execution Mode: ${isDryRun ? 'DRY-RUN' : isStatus ? 'STATUS CHECK' : 'APPLY'}`);
  console.log('----------------------------------------------------------------\n');

  let conn;
  try {
    conn = await createMigrationConnection();

    // Fetch applied migrations
    const [appliedRows] = await conn.query('SELECT `version`, `name`, `checksum`, `applied_at` FROM `schema_migrations` ORDER BY `version` ASC;');
    const appliedMap = new Map();
    for (const row of appliedRows) {
      appliedMap.set(row.version, row);
    }

    // Discover migration files
    const allFiles = fs.readdirSync(migrationsDir)
      .filter(f => /^\d{3,}_.+\.sql$/.test(f) && !f.endsWith('_down.sql'))
      .sort();

    if (allFiles.length === 0) {
      console.log('No migration files found in migrations directory.');
      return { appliedCount: 0, totalFiles: 0 };
    }

    if (isStatus) {
      console.log('Migration Status:');
      for (const file of allFiles) {
        const version = file.split('_')[0];
        const record = appliedMap.get(version);
        if (record) {
          console.log(`  [APPLIED]  ${file} (applied: ${record.applied_at})`);
        } else {
          console.log(`  [PENDING]  ${file}`);
        }
      }
      return { totalFiles: allFiles.length, appliedCount: appliedMap.size };
    }

    let appliedCount = 0;

    for (const file of allFiles) {
      const version = file.split('_')[0];
      const filePath = path.join(migrationsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const checksum = calculateChecksum(content);

      if (appliedMap.has(version)) {
        const record = appliedMap.get(version);
        if (record.checksum !== checksum) {
          console.warn(`⚠️  Warning: Migration ${file} was previously applied with checksum ${record.checksum.slice(0, 8)} but file checksum is ${checksum.slice(0, 8)}.`);
        } else {
          console.log(`⏭️  Skipping ${file} (already applied)`);
        }
        continue;
      }

      console.log(`\n📦 Processing migration: ${file}`);
      const statements = splitSqlStatements(content);
      console.log(`   Discovered ${statements.length} SQL statement(s).`);

      if (isDryRun) {
        console.log(`   [DRY RUN] Would execute ${statements.length} statement(s) and register version ${version}.`);
        appliedCount++;
        continue;
      }

      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        const snippet = stmt.replace(/\s+/g, ' ').slice(0, 70);
        try {
          await conn.query(stmt);
          console.log(`   ✓ [${i + 1}/${statements.length}] ${snippet}...`);
        } catch (err) {
          // Check for benign idempotent errors (duplicate column / duplicate key)
          const isBenign = (
            err.errno === 1060 || // ER_DUP_FIELDNAME
            err.errno === 1061 || // ER_DUP_KEYNAME
            err.errno === 1091 || // ER_CANT_DROP_FIELD_OR_KEY
            err.errno === 1022 || // ER_DUP_KEY
            err.errno === 1828 || // ER_DROP_INDEX_FK
            /Duplicate column name/i.test(err.message) ||
            /Duplicate key name/i.test(err.message) ||
            /Can't DROP/i.test(err.message) ||
            /doesn't exist/i.test(err.message) ||
            /already exists/i.test(err.message)
          );

          if (isBenign) {
            console.log(`   ℹ️ [${i + 1}/${statements.length}] Notice: Already exists (${err.code || err.message})`);
          } else {
            console.error(`\n❌ Error executing statement in ${file}:`);
            console.error(`   Statement: ${stmt}`);
            console.error(`   Error    : ${err.message}`);
            throw err;
          }
        }
      }

      // Record migration in schema_migrations
      await conn.query(
        'INSERT INTO `schema_migrations` (`version`, `name`, `checksum`, `applied_at`) VALUES (?, ?, ?, NOW());',
        [version, file, checksum]
      );
      console.log(`✅ Successfully applied and registered migration ${file}`);
      appliedCount++;
    }

    console.log(`\n🎉 Migrations complete. Total applied: ${appliedCount}`);
    return { appliedCount, totalFiles: allFiles.length };
  } finally {
    if (conn) {
      await conn.end();
    }
  }
}

// Auto-run if executed directly
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\nFatal migration runner error:', err.message);
      process.exit(1);
    });
}
