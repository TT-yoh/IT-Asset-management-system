import assert from 'assert';
import { validateConfig, isPlaceholder, isValid32ByteKey, parseCorsOrigins } from '../server/config';

console.log('🔒 Starting OmniAsset Phase 1: Validated Config Test Suite...\n');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

// 1. Placeholder detection
test('1. Detects forbidden placeholders and angle-bracket patterns', () => {
  assert(isPlaceholder('<your-cluster-host>.tidbcloud.com'), 'Catches angle bracket placeholder');
  assert(isPlaceholder('password'), 'Catches trivial password placeholder');
  assert(!isPlaceholder('prod-cluster-01.custom.internal'), 'Accepts valid real host');
  assert(!isPlaceholder('4a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b'), 'Accepts valid hex');
});

// 2. 32-byte key validation
test('2. Validates 32-byte keys (64 hex characters or 32 raw bytes)', () => {
  // 64 hex characters = 32 bytes
  const validHexKey = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
  assert(isValid32ByteKey(validHexKey), '64 hex chars is valid 32-byte key');

  // 32 ASCII characters = 32 bytes
  const valid32Ascii = '12345678901234567890123456789012';
  assert(isValid32ByteKey(valid32Ascii), '32 ascii chars is valid 32-byte key');

  // Short key
  assert(!isValid32ByteKey('too-short-key'), 'Rejects short key');
  // Placeholder
  assert(!isValid32ByteKey('change-this-to-a-secure-random-32-byte-hex-key'), 'Rejects placeholder key');
});

// 3. CORS origin parsing
test('3. Parses comma-separated CORS origins into string array', () => {
  const parsed = parseCorsOrigins('https://omniasset.app, https://admin.omniasset.app,http://localhost:3000');
  assert.deepStrictEqual(parsed, [
    'https://omniasset.app',
    'https://admin.omniasset.app',
    'http://localhost:3000'
  ]);
});

// 4. Frozen configuration object
test('4. Valid configuration returns deeply frozen immutable object', () => {
  const validDev = validateConfig({
    NODE_ENV: 'development',
    SESSION_SECRET: '4a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b'
  });
  assert(Object.isFrozen(validDev), 'Config object is frozen');
  assert(Object.isFrozen(validDev.CORS_ORIGINS), 'CORS_ORIGINS array is frozen');
  assert.strictEqual(validDev.isProduction, false);
  assert.strictEqual(validDev.isDevelopment, true);
  assert(validDev.CORS_ORIGINS.includes('http://localhost:3000'));
});

// 5. Production validation enforces all required fields
test('5. Production fails closed when required fields are missing', () => {
  assert.throws(
    () => {
      validateConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: '4a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b'
        // Missing TIDB, CORS, TOTP, AUDIT_HMAC_KEY
      });
    },
    /FATAL: (Server configuration validation failed|Missing or invalid production environment configuration)/
  );
});

// 6. Production validation rejects placeholders
test('6. Production fails closed when placeholder values are used', () => {
  assert.throws(
    () => {
      validateConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'generate-a-strong-random-32-byte-hex-secret', // Placeholder
        TIDB_HOST: '<your-cluster-host>.tidbcloud.com',       // Placeholder
        TIDB_PORT: '4000',
        TIDB_USER: 'admin',
        TIDB_PASSWORD: 'prod_password_123',
        TIDB_DATABASE: 'it_asset_ledger',
        CORS_ORIGINS: 'https://app.company.com',
        TOTP_ENCRYPTION_KEY: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
        AUDIT_HMAC_KEY: 'c4d8e2f1a3b5c7d9e0f2a4b6c8d0e1f3a5b7c9d1e2f4a6b8c0d2e3f5a7b9c1d3'
      });
    },
    /SESSION_SECRET must not use a placeholder value/
  );
});

// 7. Full production configuration succeeds
test('7. Complete valid production configuration passes validation', () => {
  const prodConfig = validateConfig({
    NODE_ENV: 'production',
    SESSION_SECRET: '4a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
    TIDB_HOST: 'cluster-prod.tidbcloud.internal',
    TIDB_PORT: '4000',
    TIDB_USER: 'app_user',
    TIDB_PASSWORD: 'secure_cluster_pass_123!',
    TIDB_DATABASE: 'omniasset_prod',
    CORS_ORIGINS: 'https://app.company.com,https://portal.company.com',
    TOTP_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    AUDIT_HMAC_KEY: 'c4d8e2f1a3b5c7d9e0f2a4b6c8d0e1f3a5b7c9d1e2f4a6b8c0d2e3f5a7b9c1d3',
    TRUST_PROXY: '1'
  });

  assert.strictEqual(prodConfig.isProduction, true);
  assert.strictEqual(prodConfig.TIDB_HOST, 'cluster-prod.tidbcloud.internal');
  assert.strictEqual(prodConfig.TIDB_PORT, 4000);
  assert.strictEqual(prodConfig.TIDB_DATABASE, 'omniasset_prod');
  assert.deepStrictEqual(prodConfig.CORS_ORIGINS, ['https://app.company.com', 'https://portal.company.com']);
  assert.strictEqual(prodConfig.TRUST_PROXY, '1');
});

// 8. npm start triggers production validation mode
test('8. npm start triggers production mode validation via npm_lifecycle_event', () => {
  assert.throws(
    () => {
      validateConfig({
        npm_lifecycle_event: 'start',
        SESSION_SECRET: '4a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b'
        // Missing prod credentials
      });
    },
    /FATAL: (Server configuration validation failed|Missing or invalid production environment configuration)/
  );
});

console.log(`\n==========================================`);
console.log(`Config Validation Summary: ${passed} Passed, ${failed} Failed`);
console.log(`==========================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
