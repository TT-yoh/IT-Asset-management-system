import dotenv from 'dotenv';
import path from 'path';
import net from 'net';
import { z } from 'zod';

// Load .env once at process entry
dotenv.config();

const FORBIDDEN_PLACEHOLDERS = new Set([
  'generate-a-strong-random-32-byte-hex-secret',
  'change-this-to-a-secure-random-32-byte-hex-key',
  'omni_asset_secure_session_secret_key_2026_prod',
  'your-cluster-host.tidbcloud.com',
  '<your-cluster-host>.tidbcloud.com',
  '<your-tidb-cluster-password>',
  '<your-tidb-cluster-user>',
  '<configured-admin-email>',
  '<configured-admin-password>',
  'default',
  'secret',
  'changeme',
  'password'
]);

export function isPlaceholder(val: string | undefined): boolean {
  if (!val) return false;
  const lower = val.trim().toLowerCase();
  return (
    FORBIDDEN_PLACEHOLDERS.has(lower) ||
    lower.includes('placeholder') ||
    (lower.startsWith('<') && lower.endsWith('>'))
  );
}

export function parseBoolean(val: unknown, defaultVal = false): boolean {
  if (val === undefined || val === null || val === '') return defaultVal;
  if (typeof val === 'boolean') return val;
  const lower = String(val).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(lower)) return true;
  if (['0', 'false', 'no', 'off'].includes(lower)) return false;
  return defaultVal;
}

/**
 * Validate that a secret key meets strict enterprise entropy requirements:
 * - 64 hex characters (32 bytes) OR base64 encoding representing >= 32 bytes (43-44 chars)
 * - Minimum 8 distinct characters (entropy check)
 * - No repeating sequence patterns (e.g. 010101..., aaaa...)
 * - Not a placeholder
 */
export function validateSecretStrength(val: string, name: string): void {
  if (!val || typeof val !== 'string') {
    throw new Error(`${name} is required and must be a string.`);
  }

  const trimmed = val.trim();

  if (isPlaceholder(trimmed)) {
    throw new Error(`${name} must not use a forbidden placeholder value.`);
  }

  const is64Hex = /^[0-9a-fA-F]{64}$/.test(trimmed);
  let isBase64_32Bytes = false;

  if (!is64Hex && (trimmed.length === 43 || trimmed.length === 44) && /^[A-Za-z0-9+/=_-]{43,44}$/.test(trimmed)) {
    try {
      const buf = Buffer.from(trimmed, 'base64');
      if (buf.length >= 32) {
        isBase64_32Bytes = true;
      }
    } catch {
      isBase64_32Bytes = false;
    }
  }

  if (!is64Hex && !isBase64_32Bytes) {
    throw new Error(
      `${name} must be either 64 hexadecimal characters (32 bytes) or base64 representing at least 32 bytes. Raw passphrases and short secrets are prohibited.`
    );
  }

  // Minimum character diversity check
  const distinctChars = new Set(trimmed).size;
  if (distinctChars < 8) {
    throw new Error(`${name} has insufficient entropy (${distinctChars} distinct characters, minimum 8 required).`);
  }

  // Check for repeating chunk patterns (e.g., "01010101", "abcdefabcdefabcdef")
  if (/(.{1,8})\1{3,}/.test(trimmed)) {
    throw new Error(`${name} contains a repeating sequence pattern and lacks cryptographic entropy.`);
  }
}

export function isValid32ByteKey(val: string): boolean {
  try {
    validateSecretStrength(val, 'KEY');
    return true;
  } catch {
    return false;
  }
}

export function parseCorsOrigins(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String).map(s => s.trim()).filter(Boolean);
  if (typeof val === 'string' && val.trim().length > 0) {
    return val
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Parse TRUST_PROXY into boolean | number | string[]
 * Rejects invalid strings or negative hop counts.
 */
export function parseTrustProxy(val: unknown): boolean | number | string[] {
  if (val === undefined || val === null || val === '') {
    return false;
  }
  if (typeof val === 'boolean') {
    return val;
  }
  if (typeof val === 'number') {
    if (val >= 0 && Number.isInteger(val)) {
      return val;
    }
    throw new Error(`Invalid TRUST_PROXY number value: ${val}. Hop count must be a non-negative integer.`);
  }

  const str = String(val).trim();
  const lower = str.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;

  // Non-negative integer hop count
  if (/^\d+$/.test(str)) {
    return parseInt(str, 10);
  }

  // Comma-separated list of IPs, CIDRs, or Express named subnets
  const items = str.split(',').map(s => s.trim()).filter(Boolean);
  if (items.length === 0) {
    throw new Error(`Invalid TRUST_PROXY value: "${str}". Must be boolean, integer hop count, or CIDR/IP list.`);
  }

  const allowedKeywords = new Set(['loopback', 'linklocal', 'uniquelocal']);

  for (const item of items) {
    if (allowedKeywords.has(item.toLowerCase())) {
      continue;
    }

    if (item.includes('/')) {
      const [ip, prefixStr] = item.split('/');
      const ipVersion = net.isIP(ip);
      const prefix = parseInt(prefixStr, 10);
      if (!ipVersion || isNaN(prefix)) {
        throw new Error(`Invalid TRUST_PROXY CIDR entry: "${item}".`);
      }
      if (ipVersion === 4 && (prefix < 0 || prefix > 32)) {
        throw new Error(`Invalid IPv4 CIDR prefix in TRUST_PROXY: "${item}". Must be 0-32.`);
      }
      if (ipVersion === 6 && (prefix < 0 || prefix > 128)) {
        throw new Error(`Invalid IPv6 CIDR prefix in TRUST_PROXY: "${item}". Must be 0-128.`);
      }
    } else {
      if (net.isIP(item) === 0) {
        throw new Error(`Invalid TRUST_PROXY IP address entry: "${item}". Must be valid IPv4, IPv6, or subnet keyword.`);
      }
    }
  }

  return items;
}

const baseConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  isProduction: z.boolean(),
  isDevelopment: z.boolean(),
  isTest: z.boolean(),
  PORT: z.number().int().positive().default(3001),
  SESSION_SECRET: z.string().min(32),
  SESSION_SECRET_PREVIOUS: z.string().optional(),
  SESSION_TTL_SECONDS: z.number().int().min(300).max(86400).default(3600),
  BCRYPT_ROUNDS: z.number().int().min(12).default(12),
  DB_POOL_LIMIT: z.number().int().min(1).max(100),
  TIDB_HOST: z.string().optional().refine(val => !val || !isPlaceholder(val), {
    message: 'TIDB_HOST must not use a placeholder value'
  }),
  TIDB_PORT: z.number().int().positive().default(4000),
  TIDB_USER: z.string().optional(),
  TIDB_PASSWORD: z.string().optional(),
  TIDB_DATABASE: z.string().optional(),
  TIDB_SSL: z.boolean().default(true),
  TIDB_CA_PATH: z.string().optional(),
  CORS_ORIGINS: z.array(z.string()),
  TOTP_ENCRYPTION_KEY: z.string().optional(),
  AUDIT_HMAC_KEY: z.string().min(32),
  AUDIT_ANCHOR_ENABLED: z.boolean().default(false),
  AUDIT_ANCHOR_SINK: z.enum(['none', 'file', 'webhook']).default('none'),
  AUDIT_ANCHOR_PATH: z.string().optional(),
  AUDIT_ANCHOR_WEBHOOK_URL: z.string().optional(),
  TRUST_PROXY: z.union([z.boolean(), z.number(), z.array(z.string())]).default(false),
  MAIL_HOST: z.string().optional(),
  MAIL_PORT: z.number().int().positive().optional(),
  MAIL_USER: z.string().optional(),
  MAIL_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  APP_BASE_URL: z.string().url().optional(),
  IDEMPOTENCY_REQUIRED: z.boolean().default(false),
  ALLOW_ROOT_ROUTES: z.boolean().default(false),
  ALLOW_IN_MEMORY_DB: z.boolean().default(false),
  USE_IN_MEMORY_DB: z.boolean().default(false),
  COOKIE_SECURE: z.boolean().default(true),
  TEST_DATABASE_URL: z.string().optional(),
  VERCEL: z.boolean().default(false),
  isVercel: z.boolean().default(false)
});

export type AppConfig = z.infer<typeof baseConfigSchema>;

export function validateConfig(raw: Record<string, any>): Readonly<AppConfig> {
  // A1: Secure by default: if NODE_ENV is unset, treat the process as PRODUCTION
  const rawNodeEnv = raw.NODE_ENV !== undefined && raw.NODE_ENV !== null && String(raw.NODE_ENV).trim().length > 0
    ? String(raw.NODE_ENV).trim().toLowerCase()
    : 'production';

  if (!['development', 'production', 'test'].includes(rawNodeEnv)) {
    throw new Error(`\n======================================================\nFATAL: Invalid NODE_ENV: "${raw.NODE_ENV}". Must be 'development', 'production', or 'test'.\n======================================================\n`);
  }

  const isProduction = rawNodeEnv === 'production';
  const isTest = rawNodeEnv === 'test';
  const isDevelopment = rawNodeEnv === 'development';

  // A2: USE_IN_MEMORY_DB / ALLOW_IN_MEMORY_DB: honoured ONLY when isTest; refuse to start otherwise
  const wantsInMemory = parseBoolean(raw.USE_IN_MEMORY_DB, false) || parseBoolean(raw.ALLOW_IN_MEMORY_DB, false);
  if (wantsInMemory && !isTest) {
    throw new Error('\n======================================================\nFATAL: USE_IN_MEMORY_DB / ALLOW_IN_MEMORY_DB is honoured ONLY when NODE_ENV=test. Refusing to start.\n======================================================\n');
  }

  // Disabling TLS is strictly permitted only in test environments
  if (!isTest && (raw.TIDB_SSL === false || raw.TIDB_SSL === 'false')) {
    throw new Error('\n======================================================\nFATAL: Disabling TLS (TIDB_SSL=false) is only permitted when NODE_ENV=test.\n======================================================\n');
  }

  // A7: Throw on any VITE_* variable containing secrets or credentials
  const forbiddenViteTerms = ['SECRET', 'PASS', 'KEY', 'TOKEN', 'TIDB', 'GEMINI'];
  for (const key of Object.keys(raw)) {
    if (key.startsWith('VITE_')) {
      const upperKey = key.toUpperCase();
      for (const term of forbiddenViteTerms) {
        if (upperKey.includes(term)) {
          throw new Error(`\n======================================================\nFATAL: Forbidden secret variable "${key}" detected in environment. VITE_* variables are bundled into the client build. Backend secrets must never use VITE_* prefixes.\n======================================================\n`);
        }
      }
    }
  }

  // A8: Test DB allowlist
  if (isTest) {
    let testDbName: string | undefined;
    if (raw.TEST_DATABASE_URL) {
      try {
        const u = new URL(raw.TEST_DATABASE_URL);
        testDbName = u.pathname.replace(/^\//, '');
      } catch {
        testDbName = undefined;
      }
    } else if (raw.TIDB_DATABASE) {
      testDbName = String(raw.TIDB_DATABASE).trim();
    }

    if (testDbName) {
      const lowerDb = testDbName.toLowerCase();
      const isAllowed =
        lowerDb.endsWith('_test') ||
        lowerDb.endsWith('_dev') ||
        lowerDb === 'test' ||
        lowerDb === 'dev' ||
        lowerDb === 'it_asset_ledger';
      const hasProd = lowerDb.includes('prod') || lowerDb.includes('production');

      if (!isAllowed || hasProd) {
        throw new Error(`\n======================================================\nFATAL: Refusing to run tests against database "${testDbName}". Test database must end with _test, _dev, or be test, dev, or it_asset_ledger, and must never contain "prod".\n======================================================\n`);
      }
    }
  }

  const isVercel = parseBoolean(raw.VERCEL, false);
  const portVal = raw.API_PORT || raw.PORT || 3001;
  const tidbPortVal = raw.TIDB_PORT || 4000;
  const mailPortVal = raw.MAIL_PORT ? Number(raw.MAIL_PORT) : undefined;
  const dbPoolLimitVal = raw.DB_POOL_LIMIT ? Number(raw.DB_POOL_LIMIT) : (isVercel ? 3 : 10);
  const sessionTtlVal = raw.SESSION_TTL_SECONDS ? Number(raw.SESSION_TTL_SECONDS) : 3600;
  const bcryptRoundsVal = raw.BCRYPT_ROUNDS ? Number(raw.BCRYPT_ROUNDS) : 12;

  let corsOrigins = parseCorsOrigins(raw.CORS_ORIGINS);
  if (corsOrigins.length === 0 && !isProduction) {
    corsOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    ];
  }

  // A3: Parse TRUST_PROXY
  const trustProxy = parseTrustProxy(raw.TRUST_PROXY);

  // A4: Secret strength validation
  const sessionSecret = raw.SESSION_SECRET ? String(raw.SESSION_SECRET).trim() : '';
  if (sessionSecret) {
    validateSecretStrength(sessionSecret, 'SESSION_SECRET');
  }

  const sessionSecretPrevious = raw.SESSION_SECRET_PREVIOUS ? String(raw.SESSION_SECRET_PREVIOUS).trim() : undefined;
  if (sessionSecretPrevious) {
    validateSecretStrength(sessionSecretPrevious, 'SESSION_SECRET_PREVIOUS');
  }

  const totpKey = raw.TOTP_ENCRYPTION_KEY ? String(raw.TOTP_ENCRYPTION_KEY).trim() : undefined;
  if (totpKey) {
    validateSecretStrength(totpKey, 'TOTP_ENCRYPTION_KEY');
  }

  const auditHmacKey = raw.AUDIT_HMAC_KEY
    ? String(raw.AUDIT_HMAC_KEY).trim()
    : (isProduction ? '' : 'c4d8e2f1a3b5c7d9e0f2a4b6c8d0e1f3a5b7c9d1e2f4a6b8c0d2e3f5a7b9c1d3');
  if (auditHmacKey) {
    validateSecretStrength(auditHmacKey, 'AUDIT_HMAC_KEY');
  }

  const intermediate = {
    NODE_ENV: rawNodeEnv as 'development' | 'production' | 'test',
    isProduction,
    isDevelopment,
    isTest,
    PORT: Number(portVal),
    SESSION_SECRET: sessionSecret,
    SESSION_SECRET_PREVIOUS: sessionSecretPrevious,
    SESSION_TTL_SECONDS: sessionTtlVal,
    BCRYPT_ROUNDS: bcryptRoundsVal,
    DB_POOL_LIMIT: dbPoolLimitVal,
    TIDB_HOST: raw.TIDB_HOST ? String(raw.TIDB_HOST).trim() : undefined,
    TIDB_PORT: Number(tidbPortVal),
    TIDB_USER: raw.TIDB_USER ? String(raw.TIDB_USER).trim() : undefined,
    TIDB_PASSWORD: raw.TIDB_PASSWORD ? String(raw.TIDB_PASSWORD).trim() : undefined,
    TIDB_DATABASE: raw.TIDB_DATABASE ? String(raw.TIDB_DATABASE).trim() : undefined,
    TIDB_SSL: isTest ? (raw.TIDB_SSL !== false && raw.TIDB_SSL !== 'false') : true,
    TIDB_CA_PATH: raw.TIDB_CA_PATH ? String(raw.TIDB_CA_PATH).trim() : undefined,
    CORS_ORIGINS: corsOrigins,
    TOTP_ENCRYPTION_KEY: totpKey,
    AUDIT_HMAC_KEY: auditHmacKey,
    AUDIT_ANCHOR_ENABLED: parseBoolean(raw.AUDIT_ANCHOR_ENABLED, false),
    AUDIT_ANCHOR_SINK: (['none', 'file', 'webhook'].includes(raw.AUDIT_ANCHOR_SINK) ? raw.AUDIT_ANCHOR_SINK : 'none') as 'none' | 'file' | 'webhook',
    AUDIT_ANCHOR_PATH: raw.AUDIT_ANCHOR_PATH ? String(raw.AUDIT_ANCHOR_PATH).trim() : undefined,
    AUDIT_ANCHOR_WEBHOOK_URL: raw.AUDIT_ANCHOR_WEBHOOK_URL ? String(raw.AUDIT_ANCHOR_WEBHOOK_URL).trim() : undefined,
    TRUST_PROXY: trustProxy,
    MAIL_HOST: raw.MAIL_HOST ? String(raw.MAIL_HOST).trim() : undefined,
    MAIL_PORT: mailPortVal,
    MAIL_USER: raw.MAIL_USER ? String(raw.MAIL_USER).trim() : undefined,
    MAIL_PASS: raw.MAIL_PASS ? String(raw.MAIL_PASS).trim() : undefined,
    MAIL_FROM: raw.MAIL_FROM ? String(raw.MAIL_FROM).trim() : undefined,
    APP_BASE_URL: raw.APP_BASE_URL ? String(raw.APP_BASE_URL).trim().replace(/\/+$/, '') : undefined,
    IDEMPOTENCY_REQUIRED: parseBoolean(raw.IDEMPOTENCY_REQUIRED, false),
    ALLOW_ROOT_ROUTES: parseBoolean(raw.ALLOW_ROOT_ROUTES, false),
    ALLOW_IN_MEMORY_DB: wantsInMemory,
    USE_IN_MEMORY_DB: wantsInMemory,
    COOKIE_SECURE: isProduction ? true : (raw.COOKIE_SECURE !== false && raw.COOKIE_SECURE !== 'false'),
    TEST_DATABASE_URL: raw.TEST_DATABASE_URL ? String(raw.TEST_DATABASE_URL).trim() : undefined,
    VERCEL: isVercel,
    isVercel: isVercel
  };

  const parsed = baseConfigSchema.safeParse(intermediate);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => ` - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`\n======================================================\nFATAL: Server configuration validation failed:\n${issues}\n======================================================\n`);
  }

  const valid = parsed.data;

  // Strict production-only validations
  if (isProduction) {
    const prodErrors: string[] = [];
    if (!valid.SESSION_SECRET) {
      prodErrors.push('SESSION_SECRET is required in production');
    }
    if (!valid.TIDB_HOST || isPlaceholder(valid.TIDB_HOST)) {
      prodErrors.push('TIDB_HOST is required in production and must not be a placeholder');
    }
    if (!valid.TIDB_PORT) {
      prodErrors.push('TIDB_PORT is required in production');
    }
    if (!valid.TIDB_USER) {
      prodErrors.push('TIDB_USER is required in production');
    }
    if (!valid.TIDB_PASSWORD) {
      prodErrors.push('TIDB_PASSWORD is required in production');
    }
    if (!valid.TIDB_DATABASE) {
      prodErrors.push('TIDB_DATABASE is required in production');
    }
    if (!raw.CORS_ORIGINS || valid.CORS_ORIGINS.length === 0) {
      prodErrors.push('CORS_ORIGINS is required in production (comma-separated list of allowed origins)');
    }
    if (!valid.TOTP_ENCRYPTION_KEY) {
      prodErrors.push('TOTP_ENCRYPTION_KEY is required in production (64 hex characters or base64 of >=32 bytes)');
    }
    if (!valid.AUDIT_HMAC_KEY) {
      prodErrors.push('AUDIT_HMAC_KEY is required in production (64 hex characters or base64 of >=32 bytes)');
    }
    if (valid.AUDIT_HMAC_KEY && valid.SESSION_SECRET && valid.AUDIT_HMAC_KEY === valid.SESSION_SECRET) {
      prodErrors.push('AUDIT_HMAC_KEY must be distinct from SESSION_SECRET in production');
    }

    if (prodErrors.length > 0) {
      const msg = `\n======================================================\nFATAL: Missing or invalid production environment configuration:\n${prodErrors.map(e => ` - ${e}`).join('\n')}\n======================================================\n`;
      console.error(msg);
      throw new Error(msg);
    }
  }

  return Object.freeze({
    ...valid,
    CORS_ORIGINS: Object.freeze([...valid.CORS_ORIGINS])
  }) as Readonly<AppConfig>;
}

export function loadConfig(envOverrides?: Record<string, any>): Readonly<AppConfig> {
  const source = envOverrides || process.env;
  return validateConfig(source);
}

// Global singleton frozen config instance
export const config: Readonly<AppConfig> = loadConfig();
export default config;
