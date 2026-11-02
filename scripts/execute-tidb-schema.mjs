/**
 * Automated PingCAP TiDB Cloud Schema Migration & Table Provisioner
 * Delegates directly to the authoritative migration runner (scripts/migrate.mjs).
 * Enforces TLS certificate verification, rejects CLI credential injection,
 * and tracks migration history in schema_migrations.
 */

import { runMigrations } from './migrate.mjs';

async function main() {
  // Reject CLI argument credential overrides to prevent accidental credential leakage in process lists
  const args = process.argv.slice(2);
  const forbiddenFlags = ['--user', '--password', '--host', '--port', 'mysql://'];
  for (const arg of args) {
    for (const forbidden of forbiddenFlags) {
      if (arg.startsWith(forbidden)) {
        console.error(`\n❌ Error: Passing database credentials via command-line arguments (${arg}) is prohibited.`);
        console.error('Credentials must only be configured via environment variables (.env / config.ts).\n');
        process.exit(1);
      }
    }
  }

  try {
    await runMigrations();
  } catch (err) {
    console.error('\n❌ TiDB Cloud schema migration failed:', err.message);
    process.exit(1);
  }
}

main();
