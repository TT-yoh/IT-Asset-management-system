/**
 * Legacy Migration Runner Shim
 * Delegates directly to scripts/migrate.mjs
 */

import { runMigrations } from './migrate.mjs';

runMigrations().catch(err => {
  console.error('Migration error:', err.message);
  process.exit(1);
});
