import assert from 'assert';
import {
  validateConfig,
  isPlaceholder,
  isValid32ByteKey,
  validateSecretStrength,
  parseCorsOrigins,
  parseTrustProxy,
  parseBoolean
} from '../server/config';

console.log('🔒 Starting OmniAsset Addendum 3: Config Validation Test Suite...\n');

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

// 2. Secret strength & 32-byte key validation
test('2. Validates secret strength (64 hex or base64 of >=32 bytes, entropy, repeats)', () => {
  // 64 hex characters = 32 bytes
  const validHex = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
  assert.doesNotThrow(() => validateSecretStrength(validHex, 'TEST_KEY'));
  assert(isValid32ByteKey(validHex));

  // Valid base64 of 32 random bytes
  const validBase64 = 'uN7g4K2m8x9pQ1wL5vT3yZ6rA0bC4dE8fG2hJ6kM0oP=';
  assert.doesNotThrow(() => validateSecretStrength(validBase64, 'TEST_KEY'));

  // Short key
  assert.throws(() => validateSecretStrength('too-short-key', 'TEST_KEY'), /must be either 64 hexadecimal characters/);

  // Raw passphrase
  assert.throws(() => validateSecretStrength('correct-horse-battery-staple-please-change-me-12345', 'TEST_KEY'), /must be either 64 hexadecimal characters/);

  // Low entropy (<8 distinct characters)
  const lowEntropyHex = 'aaaaaaaaaaaaaaaa1111111111111111aaaaaaaaaaaaaaaa1111111111111111';
  assert.throws(() => validateSecretStrength(lowEntropyHex, 'TEST_KEY'), /insufficient entropy/);

  // Repeating patterns with >=8 distinct characters
  const repeatingHex = 'abcdef01abcdef01abcdef01abcdef01abcdef01abcdef01abcdef01abcdef01';
  assert.throws(() => validateSecretStrength(repeatingHex, 'TEST_KEY'), /repeating sequence pattern/);

  // Placeholder
  assert.throws(() => validateSecretStrength('change-this-to-a-secure-random-32-byte-hex-key', 'TEST_KEY'), /placeholder/);
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

// 4. TRUST_PROXY parser
test('4. parseTrustProxy handles boolean, integer hops, CIDR/IP list, and rejects invalid', () => {
  assert.strictEqual(parseTrustProxy(false), false);
  assert.strictEqual(parseTrustProxy('false'), false);
  assert.strictEqual(parseTrustProxy(undefined), false);
  assert.strictEqual(parseTrustProxy(true), true);
  assert.strictEqual(parseTrustProxy('true'), true);
  assert.strictEqual(parseTrustProxy('1'), 1);
  assert.strictEqual(parseTrustProxy(2), 2);

  const ipList = parseTrustProxy('loopback, 10.0.0.0/8, 192.168.1.1');
  assert.deepStrictEqual(ipList, ['loopback', '10.0.0.0/8', '192.168.1.1']);

  assert.throws(() => parseTrustProxy(-1), /non-negative integer/);
  assert.throws(() => parseTrustProxy('invalid_ip_host'), /Invalid TRUST_PROXY/);
  assert.throws(() => parseTrustProxy('10.0.0.1/40'), /Invalid IPv4 CIDR prefix/);
});

// 5. parseBoolean helper
test('5. parseBoolean parses truthy and falsy strings correctly', () => {
  assert.strictEqual(parseBoolean('1'), true);
  assert.strictEqual(parseBoolean('true'), true);
  assert.strictEqual(parseBoolean('yes'), true);
  assert.strictEqual(parseBoolean('0'), false);
  assert.strictEqual(parseBoolean('false'), false);
  assert.strictEqual(parseBoolean('no'), false);
  assert.strictEqual(parseBoolean(undefined, true), true);
});

// 6. Secure by default: unset NODE_ENV defaults to production and fails closed
test('6. Unset NODE_ENV defaults to production and fails closed if production vars missing', () => {
  assert.throws(
    () => {
      validateConfig({
        SESSION_SECRET: '4a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b'
      });
    },
    /FATAL: (Server configuration validation failed|Missing or invalid production environment configuration)/
  );
});

// 7. In-memory DB mode is strictly prohibited outside test
test('7. USE_IN_MEMORY_DB / ALLOW_IN_MEMORY_DB is prohibited when not in test', () => {
  assert.throws(
    () => {
      validateConfig({
        NODE_ENV: 'development',
        USE_IN_MEMORY_DB: 'true'
      });
    },
    /USE_IN_MEMORY_DB \/ ALLOW_IN_MEMORY_DB is honoured ONLY when NODE_ENV=test/
  );

  assert.throws(
    () => {
      validateConfig({
        NODE_ENV: 'production',
        ALLOW_IN_MEMORY_DB: 'true'
      });
    },
    /USE_IN_MEMORY_DB \/ ALLOW_IN_MEMORY_DB is honoured ONLY when NODE_ENV=test/
  );
});

// 8. VITE_* variable secret leak detection
test('8. Rejects any VITE_* variable containing secrets or credentials', () => {
  assert.throws(
    () => {
      validateConfig({
        NODE_ENV: 'development',
        VITE_APP_SECRET_TOKEN: 'some-secret-token'
      });
    },
    /Forbidden secret variable "VITE_APP_SECRET_TOKEN" detected/
  );

  assert.throws(
    () => {
      validateConfig({
        NODE_ENV: 'development',
        VITE_TIDB_PASSWORD: 'leaked-password'
      });
    },
    /Forbidden secret variable "VITE_TIDB_PASSWORD" detected/
  );
});

// 9. Test database allowlist
test('9. Test database allowlist rejects production database names under isTest', () => {
  assert.throws(
    () => {
      validateConfig({
        NODE_ENV: 'test',
        TIDB_DATABASE: 'omniasset_prod',
        SESSION_SECRET: '4a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b'
      });
    },
    /Refusing to run tests against database "omniasset_prod"/
  );

  assert.doesNotThrow(() => {
    validateConfig({
      NODE_ENV: 'test',
      TIDB_DATABASE: 'it_asset_ledger_test',
      SESSION_SECRET: '4a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b'
    });
  });
});

// 10. Complete valid production configuration succeeds
test('10. Complete valid production configuration passes validation with frozen output', () => {
  const prodConfig = validateConfig({
    NODE_ENV: 'production',
    SESSION_SECRET: '4a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
    SESSION_SECRET_PREVIOUS: 'e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b4a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3',
    TIDB_HOST: 'cluster-prod.tidbcloud.internal',
    TIDB_PORT: '4000',
    TIDB_USER: 'app_user',
    TIDB_PASSWORD: 'secure_cluster_pass_123!',
    TIDB_DATABASE: 'omniasset_enterprise_db',
    CORS_ORIGINS: 'https://app.company.com,https://portal.company.com',
    TOTP_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    AUDIT_HMAC_KEY: 'c4d8e2f1a3b5c7d9e0f2a4b6c8d0e1f3a5b7c9d1e2f4a6b8c0d2e3f5a7b9c1d3',
    TRUST_PROXY: '1',
    DB_POOL_LIMIT: '15',
    SESSION_TTL_SECONDS: '7200',
    BCRYPT_ROUNDS: '12',
    VERCEL: '1'
  });

  assert.strictEqual(prodConfig.isProduction, true);
  assert.strictEqual(prodConfig.TIDB_HOST, 'cluster-prod.tidbcloud.internal');
  assert.strictEqual(prodConfig.TIDB_PORT, 4000);
  assert.strictEqual(prodConfig.DB_POOL_LIMIT, 15);
  assert.strictEqual(prodConfig.SESSION_TTL_SECONDS, 7200);
  assert.strictEqual(prodConfig.BCRYPT_ROUNDS, 12);
  assert.strictEqual(prodConfig.isVercel, true);
  assert.strictEqual(prodConfig.TRUST_PROXY, 1);
  assert(Object.isFrozen(prodConfig));
});

console.log(`\n==========================================`);
console.log(`Config Validation Summary: ${passed} Passed, ${failed} Failed`);
console.log(`==========================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
