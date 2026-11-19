/**
 * Pre-flight check for `npm test`.
 * Runs with NODE_ENV=test, so server/config.ts has loaded .env.test (never .env) and has
 * already refused a production target. This script additionally requires that a test
 * database is configured at all, and prints where the tests are about to write.
 */

import config, { resolveDbTarget, assertNotProductionDatabase } from '../server/config';

if (!config.isTest) {
  console.error('check-test-db: NODE_ENV must be "test".');
  process.exit(1);
}

const target = resolveDbTarget(config);

if (!target.host || !target.database) {
  console.error(
    '\n❌ No test database configured.\n' +
    '   Create .env.test with TIDB_HOST / TIDB_DATABASE (or TEST_DATABASE_URL) pointing at a\n' +
    '   dedicated test database, then run `npm run db:migrate:test`. See docs/TESTING.md.\n'
  );
  process.exit(1);
}

assertNotProductionDatabase(target);

console.log(`🧪 Test database: ${target.host} / ${target.database}\n`);
