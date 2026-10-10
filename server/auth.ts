import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { AuthContextPayload } from './permissions';

const BCRYPT_ROUNDS = 12;
const SESSION_TTL_SECONDS = 2 * 60 * 60; // 2 hours
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

const SESSION_SECRET = process.env.SESSION_SECRET || 'omni_asset_secure_session_secret_key_2026_prod';

/**
 * Hash a password using bcrypt with cost 12
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * Verify a plaintext password against a bcrypt hash
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Create a cryptographically signed session token
 */
export function createSessionToken(payload: AuthContextPayload): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + SESSION_TTL_SECONDS;
  const data = JSON.stringify({ ...payload, exp: expiresAt, iat: issuedAt });
  const b64Data = Buffer.from(data).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(b64Data).digest('base64url');
  return `${b64Data}.${signature}`;
}

/**
 * Verifies a session token signature and expiration
 */
export function verifySessionToken(token: string): (AuthContextPayload & { exp: number }) | null {
  if (!token || !token.includes('.')) return null;
  const [b64Data, signature] = token.split('.');
  if (!b64Data || !signature) return null;

  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(b64Data).digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const json = JSON.parse(Buffer.from(b64Data, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (!json.exp || json.exp < now) {
      return null; // Expired
    }
    return json;
  } catch {
    return null;
  }
}

// ============================================================================
// Standard RFC 6238 TOTP (Time-Based One-Time Password) Implementation
// Uses Node.js crypto HMAC-SHA1 and Base32 encoding
// ============================================================================

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateBase32Secret(length = 20): string {
  const bytes = crypto.randomBytes(length);
  let secret = '';
  for (let i = 0; i < bytes.length; i++) {
    secret += BASE32_ALPHABET[bytes[i]! % 32];
  }
  return secret;
}

function base32ToBuffer(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = '';
  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_ALPHABET.indexOf(clean[i]!);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTOTPCode(secretBase32: string, timeStepWindow = 0): string {
  const epoch = Math.floor(Date.now() / 1000);
  const timeStep = Math.floor(epoch / 30) + timeStepWindow;
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(timeStep));

  const keyBuffer = base32ToBuffer(secretBase32);
  const hmac = crypto.createHmac('sha1', keyBuffer).update(timeBuffer).digest();

  // Dynamic truncation (RFC 4226)
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

/**
 * Verifies a 6-digit TOTP code with -1, 0, +1 window tolerance
 */
export function verifyTOTPCode(secretBase32: string, userCode: string): boolean {
  if (!secretBase32 || !userCode || userCode.trim().length !== 6) return false;
  const cleanCode = userCode.trim();

  // Check windows: 0 (current), -1 (30s ago), +1 (30s future)
  for (const window of [0, -1, 1]) {
    const valid = generateTOTPCode(secretBase32, window);
    if (crypto.timingSafeEqual(Buffer.from(valid), Buffer.from(cleanCode))) {
      return true;
    }
  }
  return false;
}

// In-memory lockout and rate limiting table
interface LoginTracker {
  attempts: number;
  lockedUntil: number | null;
}
const loginAttempts = new Map<string, LoginTracker>();

export function checkLockout(email: string): { isLocked: boolean; remainingMinutes?: number } {
  const record = loginAttempts.get(email.toLowerCase());
  if (!record || !record.lockedUntil) return { isLocked: false };

  const now = Date.now();
  if (record.lockedUntil > now) {
    const remaining = Math.ceil((record.lockedUntil - now) / (60 * 1000));
    return { isLocked: true, remainingMinutes: remaining };
  } else {
    // Lockout expired: reset
    loginAttempts.delete(email.toLowerCase());
    return { isLocked: false };
  }
}

export function recordFailedLogin(email: string): { lockedNow: boolean; attempts: number } {
  const key = email.toLowerCase();
  const current = loginAttempts.get(key) || { attempts: 0, lockedUntil: null };
  current.attempts += 1;

  if (current.attempts >= MAX_FAILED_ATTEMPTS) {
    current.lockedUntil = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
    loginAttempts.set(key, current);
    return { lockedNow: true, attempts: current.attempts };
  }

  loginAttempts.set(key, current);
  return { lockedNow: false, attempts: current.attempts };
}

export function recordSuccessfulLogin(email: string): void {
  loginAttempts.delete(email.toLowerCase());
}

/**
 * Generate secure random token (for reset or invite)
 */
export function generateSecureToken(prefix = 'tok'): string {
  return `${prefix}_${crypto.randomBytes(24).toString('base64url')}`;
}
