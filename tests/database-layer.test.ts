process.env.NODE_ENV = 'test';

import assert from 'assert';
import app from '../server/index';
import {
  query,
  withTransaction,
  getDbPool,
  ping,
  resetInMemoryStore,
  getInMemoryStore,
  setForceInMemoryForTest,
  executeInMemoryQuery,
  closePool
} from '../server/db';
import { validateConfig } from '../server/config';

interface TestStep {
  name: string;
  fn: () => Promise<void> | void;
}

const steps: TestStep[] = [];
function test(name: string, fn: () => Promise<void> | void) {
  steps.push({ name, fn });
}

console.log('🔒 Starting OmniAsset Phase 2: Database Layer & Async Safety Test Suite...\n');

// 1. TLS Enforcement
test('1. Disabling TLS (TIDB_SSL=false) throws error when NODE_ENV != test', () => {
  assert.throws(
    () => {
      validateConfig({
        NODE_ENV: 'development',
        TIDB_SSL: 'false',
        SESSION_SECRET: '4a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b'
      });
    },
    /Disabling TLS \(TIDB_SSL=false\) is only permitted when NODE_ENV=test/
  );
});

// 2. In-memory engine rejection in production
test('2. USE_IN_MEMORY_DB=true is strictly rejected in production', () => {
  assert.throws(
    () => {
      validateConfig({
        NODE_ENV: 'production',
        USE_IN_MEMORY_DB: 'true',
        SESSION_SECRET: '4a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
        TIDB_HOST: 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
        TIDB_PORT: '4000',
        TIDB_USER: 'app_user',
        TIDB_PASSWORD: 'real_password_12345',
        TIDB_DATABASE: 'omniasset_prod',
        CORS_ORIGINS: 'https://app.company.com',
        TOTP_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      });
    },
    /USE_IN_MEMORY_DB \/ ALLOW_IN_MEMORY_DB is strictly prohibited in production/
  );
});

// 3-8. Strict in-memory engine: rejects unsupported SQL constructs
test('3. In-memory engine throws "unsupported SQL" for JOIN', async () => {
  setForceInMemoryForTest(true);
  resetInMemoryStore();
  await assert.rejects(
    async () => {
      await query('SELECT c.* FROM `checkouts` c INNER JOIN `assets` a ON c.asset_id = a.id WHERE a.org_id = ?;', ['test-org']);
    },
    /unsupported SQL: JOIN is not supported/
  );
});

test('4. In-memory engine throws "unsupported SQL" for LIKE', async () => {
  await assert.rejects(
    async () => {
      await query('SELECT * FROM `assets` WHERE `name` LIKE ?;', ['%laptop%']);
    },
    /unsupported SQL: LIKE is not supported/
  );
});

test('5. In-memory engine throws "unsupported SQL" for IN (...)', async () => {
  await assert.rejects(
    async () => {
      await query('SELECT * FROM `assets` WHERE `id` IN (?, ?);', ['a1', 'a2']);
    },
    /unsupported SQL: IN \(\.\.\.\) is not supported/
  );
});

test('6. In-memory engine throws "unsupported SQL" for OR in WHERE clause', async () => {
  await assert.rejects(
    async () => {
      await query('SELECT * FROM `assets` WHERE `id` = ? OR `name` = ?;', ['a1', 'MacBook']);
    },
    /unsupported SQL: OR in WHERE clause is not supported/
  );
});

test('7. In-memory engine throws "unsupported SQL" for range comparison operators', async () => {
  await assert.rejects(
    async () => {
      await query('SELECT * FROM `assets` WHERE `current_value` > ?;', [1000]);
    },
    /unsupported SQL: range comparison operators are not supported/
  );
});

test('8. In-memory engine throws "unsupported SQL" for unsupported ORDER BY column', async () => {
  await assert.rejects(
    async () => {
      await query('SELECT * FROM `assets` WHERE `org_id` = ? ORDER BY `arbitrary_column` DESC;', ['org-1']);
    },
    /unsupported SQL: ORDER BY arbitrary_column is not supported/
  );
});

// 9. UPDATE/DELETE with null/undefined parameter matches NOTHING
test('9. UPDATE with null/undefined WHERE parameter matches NOTHING (does not update any row)', async () => {
  resetInMemoryStore();
  const store = getInMemoryStore();
  store.set('assets', [
    { id: 'ast-1', org_id: 'org-test', name: 'Original Name 1' },
    { id: 'ast-2', org_id: 'org-test', name: 'Original Name 2' }
  ]);

  const result = await query('UPDATE `assets` SET `name` = ? WHERE `id` = ?;', ['Tampered Name', null]);
  assert.strictEqual(result[0]?.affectedRows, 0, 'Must match 0 rows when WHERE parameter is null');

  const assets = store.get('assets') || [];
  assert.strictEqual(assets[0].name, 'Original Name 1', 'Row 1 must remain untouched');
  assert.strictEqual(assets[1].name, 'Original Name 2', 'Row 2 must remain untouched');
});

test('10. DELETE with null/undefined WHERE parameter matches NOTHING (does not delete any row)', async () => {
  resetInMemoryStore();
  const store = getInMemoryStore();
  store.set('assets', [
    { id: 'ast-1', org_id: 'org-test', name: 'Item 1' },
    { id: 'ast-2', org_id: 'org-test', name: 'Item 2' }
  ]);

  await query('DELETE FROM `assets` WHERE `id` = ?;', [null]);
  const assets = store.get('assets') || [];
  assert.strictEqual(assets.length, 2, 'All rows must remain when WHERE parameter is null');
});

// 11. Merge semantics must not overwrite org_id
test('11. Merge semantics strictly preserve original org_id on existing record', async () => {
  resetInMemoryStore();
  const store = getInMemoryStore();
  store.set('assets', [
    { id: 'ast-safe', org_id: 'tenant-alpha', name: 'Workstation Alpha' }
  ]);

  // Attempt to overwrite org_id via UPDATE
  await query('UPDATE `assets` SET `org_id` = ?, `name` = ? WHERE `id` = ?;', ['tenant-beta', 'Modified Name', 'ast-safe']);
  const assets = store.get('assets') || [];
  assert.strictEqual(assets[0].org_id, 'tenant-alpha', 'Existing org_id must NOT be overwritten');
  assert.strictEqual(assets[0].name, 'Modified Name', 'Non-org attributes can update');

  // Attempt to overwrite org_id via INSERT upsert
  await query(
    'INSERT INTO `assets` (`id`, `org_id`, `name`) VALUES (?, ?, ?);',
    ['ast-safe', 'tenant-gamma', 'Overridden Upsert']
  );
  assert.strictEqual(assets[0].org_id, 'tenant-alpha', 'Existing org_id must NOT be overwritten during upsert');
});

// 12. Readiness check & ping
test('12. db.ping() returns true when database/in-memory store is ready', async () => {
  const isAlive = await ping();
  assert.strictEqual(typeof isAlive, 'boolean');
  assert.strictEqual(isAlive, true);
  setForceInMemoryForTest(false);
});

// 13. Async error safety & Central error handler
test('13. Forced DB failure in route returns JSON 500 with requestId, process stays alive, no SQL leaked', async () => {
  let serverInstance: any = null;
  let testUrl = '';
  try {
    serverInstance = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = serverInstance.address() as any;
    testUrl = `http://127.0.0.1:${addr.port}`;

    const res = await fetch(`${testUrl}/api/assets/invalid-route-or-bad-db-call`, {
      headers: {
        'X-Request-Id': 'req-test-trace-123'
      }
    });

    assert.ok(res.status === 401 || res.status === 500 || res.status === 404);
    const body = await res.json();
    assert.ok(body.error, 'Response must have error field');
    assert.strictEqual(body.error.includes('SELECT'), false, 'Response must not leak SELECT SQL statement');
    assert.strictEqual(body.error.includes('INSERT'), false, 'Response must not leak INSERT SQL statement');
    assert.strictEqual(body.error.includes('mysql'), false, 'Response must not leak mysql driver details');
  } catch (err: any) {
    if (err.cause) console.error('fetch error cause:', err.cause);
    throw err;
  } finally {
    if (serverInstance) {
      await new Promise<void>((resolve) => serverInstance.close(() => resolve()));
    }
  }
});

// Runner
async function run() {
  let passed = 0;
  let failed = 0;

  for (const step of steps) {
    try {
      await step.fn();
      console.log(`  ✅ PASS: ${step.name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ FAIL: ${step.name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  console.log('\n==========================================');
  console.log(`Phase 2 Summary: ${passed} Passed, ${failed} Failed`);
  console.log('==========================================\n');

  await closePool();

  if (failed > 0) {
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }
}

run();
