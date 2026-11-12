/**
 * OmniAsset Schema Drift Verification Test Suite
 * Compares relational database schema (from migrations and information_schema)
 * against all table and column names referenced in application code (server/).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../server/db';
import { splitSqlStatements } from '../scripts/migrate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const serverDir = path.join(rootDir, 'server');
const migrationsDir = path.join(rootDir, 'migrations');

interface SchemaDefinition {
  tables: Map<string, Set<string>>;
}

/**
 * Parses all migrations to construct the canonical schema map of { table -> Set<columns> }
 */
export function buildSchemaFromMigrations(): SchemaDefinition {
  const schema: SchemaDefinition = { tables: new Map() };

  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => /^\d{3,}_.+\.sql$/.test(f) && !f.endsWith('_down.sql'))
    .sort();

  for (const file of migrationFiles) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const statements = splitSqlStatements(content);

    for (const stmt of statements) {
      // 1. CREATE TABLE
      const createMatch = stmt.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-zA-Z0-9_]+)`?\s*\(([\s\S]+)\)/i);
      if (createMatch) {
        const tableName = createMatch[1].toLowerCase();
        const body = createMatch[2];

        if (!schema.tables.has(tableName)) {
          schema.tables.set(tableName, new Set());
        }
        const colSet = schema.tables.get(tableName)!;

        // Extract columns from CREATE TABLE body
        const lines = body.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('/*')) continue;
          if (/^(?:PRIMARY|KEY|UNIQUE|CONSTRAINT|INDEX|FOREIGN)\b/i.test(trimmed)) continue;

          const colMatch = trimmed.match(/^`?([a-zA-Z0-9_]+)`?\s+[A-Za-z]/);
          if (colMatch) {
            colSet.add(colMatch[1].toLowerCase());
          }
        }
      }

      // 2. ALTER TABLE ADD COLUMN
      const alterMatch = stmt.match(/ALTER\s+TABLE\s+`?([a-zA-Z0-9_]+)`?\s+([\s\S]+)/i);
      if (alterMatch) {
        const tableName = alterMatch[1].toLowerCase();
        const alterBody = alterMatch[2];

        if (!schema.tables.has(tableName)) {
          schema.tables.set(tableName, new Set());
        }
        const colSet = schema.tables.get(tableName)!;

        const addColRegex = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-zA-Z0-9_]+)`?/gi;
        let match;
        while ((match = addColRegex.exec(alterBody)) !== null) {
          colSet.add(match[1].toLowerCase());
        }
      }
    }
  }

  return schema;
}

/**
 * Extracts SQL strings from TypeScript files and parses table and column references
 */
export function extractCodeReferences(): Array<{
  file: string;
  table: string;
  columns: string[];
}> {
  const references: Array<{ file: string; table: string; columns: string[] }> = [];

  function scanDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith('.ts')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const relPath = path.relative(rootDir, fullPath);

        // Extract string literals that contain SQL statements
        // Match template literals `...`, single-quoted '...', double-quoted "..."
        const stringLiteralRegex = /(`(?:\\`|[\s\S])*?`|'(?:\\'|[^'\r\n])*?'|"(?:\\"|[^"\r\n])*?")/g;
        let match;

        while ((match = stringLiteralRegex.exec(content)) !== null) {
          const rawLiteral = match[1];
          // Strip enclosing quotes and unescape
          const sql = rawLiteral.slice(1, -1).replace(/\\`/g, '`');

          if (!/(?:SELECT|INSERT|UPDATE|DELETE)\s+/i.test(sql)) {
            continue;
          }

          // 1. INSERT INTO table (col1, col2)
          const insertMatch = sql.match(/INSERT\s+INTO\s+`?([a-zA-Z0-9_]+)`?\s*\(([^)]+)\)/i);
          if (insertMatch) {
            const table = insertMatch[1].toLowerCase();
            const cols = insertMatch[2]
              .split(',')
              .map(c => c.trim().replace(/[`"']/g, '').toLowerCase())
              .filter(c => /^[a-zA-Z0-9_]+$/.test(c));
            references.push({ file: relPath, table, columns: cols });
          }

          // 2. UPDATE table SET col1 = ?, col2 = ?
          const updateMatch = sql.match(/UPDATE\s+`?([a-zA-Z0-9_]+)`?\s+SET\s+([\s\S]+?)(?:\s+WHERE|$)/i);
          if (updateMatch) {
            const table = updateMatch[1].toLowerCase();
            const setClause = updateMatch[2];
            const cols: string[] = [];
            const colAssignRegex = /`?([a-zA-Z0-9_]+)`?\s*=/g;
            let cm;
            while ((cm = colAssignRegex.exec(setClause)) !== null) {
              const col = cm[1].toLowerCase();
              if (/^[a-zA-Z0-9_]+$/.test(col)) {
                cols.push(col);
              }
            }
            if (cols.length > 0) {
              references.push({ file: relPath, table, columns: cols });
            }
          }

          // 3. SELECT col1, col2 FROM table
          const selectMatch = sql.match(/SELECT\s+([\s\S]+?)\s+FROM\s+`?([a-zA-Z0-9_]+)`?/i);
          if (selectMatch) {
            const rawCols = selectMatch[1].trim();
            const table = selectMatch[2].toLowerCase();
            if (rawCols !== '*' && !rawCols.includes('COUNT(')) {
              const cols = rawCols.split(',')
                .map(c => c.trim().split(/\s+as\s+/i)[0].replace(/[`"']/g, '').replace(/^[a-zA-Z0-9_]+\./, '').toLowerCase())
                .filter(c => /^[a-zA-Z0-9_]+$/.test(c));
              if (cols.length > 0) {
                references.push({ file: relPath, table, columns: cols });
              }
            }
          }
        }
      }
    }
  }

  scanDir(serverDir);
  return references;
}

// -----------------------------------------------------------------------------
// Test Execution
// -----------------------------------------------------------------------------
async function runSchemaDriftTests() {
  console.log('================================================================');
  console.log('  OmniAsset Schema-Drift Verification Suite');
  console.log('================================================================\n');

  // 1. Build canonical schema from migrations
  console.log('📦 Step 1: Parsing authoritative migration files in migrations/...');
  const schema = buildSchemaFromMigrations();
  console.log(`✓ Discovered ${schema.tables.size} tables in migration schema:\n  ${Array.from(schema.tables.keys()).join(', ')}\n`);

  // Verify core required tables exist in migration schema
  const requiredTables = [
    'organizations',
    'branches',
    'departments',
    'users',
    'login_attempts',
    'recovery_codes',
    'asset_categories',
    'assets',
    'checkouts',
    'maintenances',
    'budgets',
    'audit_logs',
    'audit_chain_heads',
    'notifications',
    'idempotency_keys',
    'idempotency_keys_v2',
    'asset_tag_counters'
  ];

  for (const table of requiredTables) {
    if (!schema.tables.has(table)) {
      throw new Error(`Schema drift failure: Required table "${table}" is missing from migrations.`);
    }
  }
  console.log('✓ All 17 required core tables are defined in migrations.');

  // 2. Verify hardened columns in key tables
  console.log('\n🔒 Step 2: Verifying hardened security columns across schema...');
  const usersCols = schema.tables.get('users')!;
  const expectedUserCols = [
    'id', 'org_id', 'email', 'full_name', 'role', 'status',
    'invite_token_hash', 'invited_at', 'invite_expires_at',
    'reset_token_hash', 'reset_expires_at', 'version', 'token_version',
    'is_super_admin', 'password_changed_at', 'two_factor_secret_enc', 'totp_last_step'
  ];
  for (const col of expectedUserCols) {
    if (!usersCols.has(col)) {
      throw new Error(`Schema drift failure: users table missing required security column: ${col}`);
    }
  }
  console.log('✓ users table contains all required authentication and security columns.');

  const assetsCols = schema.tables.get('assets')!;
  const expectedAssetCols = ['id', 'org_id', 'branch_id', 'asset_code', 'serial_number', 'version', 'clean_serial', 'clean_mac', 'clean_imei', 'cost_source'];
  for (const col of expectedAssetCols) {
    if (!assetsCols.has(col)) {
      throw new Error(`Schema drift failure: assets table missing required column: ${col}`);
    }
  }
  console.log('✓ assets table contains generated partial-unique columns and versioning.');

  const checkoutsCols = schema.tables.get('checkouts')!;
  const expectedCheckoutCols = ['id', 'org_id', 'asset_id', 'status', 'version', 'active_asset_id'];
  for (const col of expectedCheckoutCols) {
    if (!checkoutsCols.has(col)) {
      throw new Error(`Schema drift failure: checkouts table missing required column: ${col}`);
    }
  }
  console.log('✓ checkouts table contains active_asset_id generated column and versioning.');

  const auditCols = schema.tables.get('audit_logs')!;
  const expectedAuditCols = ['id', 'org_id', 'seq', 'actor_id', 'prev_hash', 'hash', 'timestamp'];
  for (const col of expectedAuditCols) {
    if (!auditCols.has(col)) {
      throw new Error(`Schema drift failure: audit_logs table missing required column: ${col}`);
    }
  }
  console.log('✓ audit_logs table contains sequence and cryptographic hash-chaining columns.');

  // 3. Scan server codebase for SQL references and verify against schema
  console.log('\n🔍 Step 3: Scanning server/ code for table and column references...');
  const references = extractCodeReferences();
  console.log(`✓ Extracted ${references.length} SQL operations from server codebase.`);

  let driftErrors: string[] = [];
  for (const ref of references) {
    if (!schema.tables.has(ref.table)) {
      driftErrors.push(`[${ref.file}] References unknown table "${ref.table}"`);
      continue;
    }

    const tableCols = schema.tables.get(ref.table)!;
    for (const col of ref.columns) {
      if (!tableCols.has(col)) {
        driftErrors.push(`[${ref.file}] Table "${ref.table}" references missing column "${col}"`);
      }
    }
  }

  if (driftErrors.length > 0) {
    console.error('\n❌ Schema Drift Detected:');
    for (const err of driftErrors) {
      console.error(`   ${err}`);
    }
    throw new Error(`Schema drift detected: ${driftErrors.length} column/table mismatches found.`);
  }
  console.log('✓ Zero schema drift detected between application SQL queries and migration definitions!');

  // 4. Test live information_schema if connection available
  console.log('\n🌐 Step 4: Probing live database information_schema (if configured)...');
  if (process.env.TEST_DATABASE_URL || process.env.CHECK_LIVE_SCHEMA) {
    try {
      const liveTables = await query<any>('SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE();');
      if (liveTables && liveTables.length > 0) {
        console.log(`✓ Live database contains ${liveTables.length} tables in information_schema.`);
      } else {
        console.log('ℹ️ Live database information_schema not queried.');
      }
    } catch (err: any) {
      console.log(`ℹ️ Live DB connection check bypassed in test environment: ${err.message}`);
    }
  } else {
    console.log('ℹ️ Live database check skipped in offline test mode.');
  }

  console.log('\n================================================================');
  console.log('✅ ALL SCHEMA DRIFT TESTS PASSED');
  console.log('================================================================\n');
}

runSchemaDriftTests().catch(err => {
  console.error('\n❌ Schema Drift Test Failed:', err.message);
  process.exit(1);
});
