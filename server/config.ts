import dotenv from 'dotenv';
import path from 'path';
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

export function isValid32ByteKey(val: string): boolean {
  if (isPlaceholder(val)) return false;
  const trimmed = val.trim();
  // 64-character hexadecimal representation (32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return true;
  // 32-character raw byte buffer
  const buf = Buffer.from(trimmed, 'utf8');
  return buf.length === 32;
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

const baseConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  isProduction: z.boolean(),
  isDevelopment: z.boolean(),
  isTest: z.boolean(),
  PORT: z.number().int().positive().default(3001),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters long').refine(val => !isPlaceholder(val), {
    message: 'SESSION_SECRET must not use a placeholder value'
  }),
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
  TOTP_ENCRYPTION_KEY: z.string().optional().refine(val => !val || isValid32ByteKey(val), {
    message: 'TOTP_ENCRYPTION_KEY must be a valid 32-byte key (64 hex characters or 32 raw bytes) and not a placeholder'
  }),
  TRUST_PROXY: z.union([z.boolean(), z.string(), z.number()]).optional(),
  MAIL_HOST: z.string().optional(),
  MAIL_PORT: z.number().int().positive().optional(),
  MAIL_USER: z.string().optional(),
  MAIL_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  IDEMPOTENCY_REQUIRED: z.boolean().default(false),
  ALLOW_ROOT_ROUTES: z.boolean().default(false),
  ALLOW_IN_MEMORY_DB: z.boolean().default(false),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_ID: z.string().optional(),
  ADMIN_NAME: z.string().optional(),
  DEBUG_AUDIT: z.boolean().default(false),
  VERCEL: z.boolean().default(false),
  isVercel: z.boolean().default(false)
});

export type AppConfig = z.infer<typeof baseConfigSchema>;

export function validateConfig(raw: Record<string, any>): Readonly<AppConfig> {
  const rawNodeEnv = String(raw.NODE_ENV || 'development').trim().toLowerCase();
  const isStartScript = raw.npm_lifecycle_event === 'start';
  const isProduction = rawNodeEnv === 'production' || isStartScript;
  const isTest = rawNodeEnv === 'test';
  const isDevelopment = !isProduction && !isTest;

  // Never read secrets from VITE_* variables
  for (const key of Object.keys(raw)) {
    if (key.startsWith('VITE_') && (key.includes('SECRET') || key.includes('PASS') || key.includes('KEY'))) {
      console.warn(`SECURITY WARNING: ${key} detected. Backend secrets must never use VITE_* prefixes.`);
    }
  }

  const portVal = raw.API_PORT || raw.PORT || 3001;
  const tidbPortVal = raw.TIDB_PORT || 4000;
  const mailPortVal = raw.MAIL_PORT ? Number(raw.MAIL_PORT) : undefined;

  let corsOrigins = parseCorsOrigins(raw.CORS_ORIGINS);
  if (corsOrigins.length === 0 && !isProduction) {
    corsOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    ];
  }

  const intermediate = {
    NODE_ENV: isProduction ? 'production' : (isTest ? 'test' : 'development'),
    isProduction,
    isDevelopment,
    isTest,
    PORT: Number(portVal),
    SESSION_SECRET: raw.SESSION_SECRET ? String(raw.SESSION_SECRET).trim() : '',
    TIDB_HOST: raw.TIDB_HOST ? String(raw.TIDB_HOST).trim() : undefined,
    TIDB_PORT: Number(tidbPortVal),
    TIDB_USER: raw.TIDB_USER ? String(raw.TIDB_USER).trim() : undefined,
    TIDB_PASSWORD: raw.TIDB_PASSWORD ? String(raw.TIDB_PASSWORD).trim() : undefined,
    TIDB_DATABASE: raw.TIDB_DATABASE ? String(raw.TIDB_DATABASE).trim() : undefined,
    TIDB_SSL: raw.TIDB_SSL !== false && raw.TIDB_SSL !== 'false',
    TIDB_CA_PATH: raw.TIDB_CA_PATH ? String(raw.TIDB_CA_PATH).trim() : undefined,
    CORS_ORIGINS: corsOrigins,
    TOTP_ENCRYPTION_KEY: raw.TOTP_ENCRYPTION_KEY ? String(raw.TOTP_ENCRYPTION_KEY).trim() : undefined,
    TRUST_PROXY: raw.TRUST_PROXY !== undefined ? raw.TRUST_PROXY : undefined,
    MAIL_HOST: raw.MAIL_HOST ? String(raw.MAIL_HOST).trim() : undefined,
    MAIL_PORT: mailPortVal,
    MAIL_USER: raw.MAIL_USER ? String(raw.MAIL_USER).trim() : undefined,
    MAIL_PASS: raw.MAIL_PASS ? String(raw.MAIL_PASS).trim() : undefined,
    MAIL_FROM: raw.MAIL_FROM ? String(raw.MAIL_FROM).trim() : undefined,
    IDEMPOTENCY_REQUIRED: raw.IDEMPOTENCY_REQUIRED === true || raw.IDEMPOTENCY_REQUIRED === 'true',
    ALLOW_ROOT_ROUTES: raw.ALLOW_ROOT_ROUTES === true || raw.ALLOW_ROOT_ROUTES === 'true',
    ALLOW_IN_MEMORY_DB: raw.ALLOW_IN_MEMORY_DB === true || raw.ALLOW_IN_MEMORY_DB === 'true',
    ADMIN_EMAIL: raw.ADMIN_EMAIL ? String(raw.ADMIN_EMAIL).trim() : undefined,
    ADMIN_PASSWORD: raw.ADMIN_PASSWORD ? String(raw.ADMIN_PASSWORD).trim() : undefined,
    ADMIN_ID: raw.ADMIN_ID ? String(raw.ADMIN_ID).trim() : undefined,
    ADMIN_NAME: raw.ADMIN_NAME ? String(raw.ADMIN_NAME).trim() : undefined,
    DEBUG_AUDIT: raw.DEBUG_AUDIT === true || raw.DEBUG_AUDIT === 'true',
    VERCEL: Boolean(raw.VERCEL),
    isVercel: Boolean(raw.VERCEL)
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
    if (!valid.SESSION_SECRET || valid.SESSION_SECRET.length < 32 || isPlaceholder(valid.SESSION_SECRET)) {
      prodErrors.push('SESSION_SECRET is required in production (min 32 chars, no placeholders)');
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
    if (!valid.TOTP_ENCRYPTION_KEY || !isValid32ByteKey(valid.TOTP_ENCRYPTION_KEY)) {
      prodErrors.push('TOTP_ENCRYPTION_KEY is required in production (32-byte key: 64 hex characters or 32 raw bytes)');
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
