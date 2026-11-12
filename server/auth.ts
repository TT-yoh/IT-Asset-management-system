import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import config from './config';
import { query } from './db';

export const BCRYPT_ROUNDS = config.BCRYPT_ROUNDS || 12;
export const SESSION_TTL_SECONDS = config.SESSION_TTL_SECONDS || 3600;
export const MAX_FAILED_ATTEMPTS = 5;

// Precomputed cost-12 bcrypt hash used for timing equalization on non-existent users
export const DUMMY_BCRYPT_HASH = '$2a$12$e8nz14/o1a3L4oXz1u2uXe1p9YqI0n/fMqvZ.eA3Y9Qj0JqK0e2Oe';

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

// ============================================================================
// Session Tokens: exactly two dot-separated parts (base64url payload . signature)
// Claims: userId, ver (users.token_version), jti, iat, exp
// ============================================================================

export interface SessionClaims {
  userId: string;
  ver: number;
  jti: string;
  iat: number;
  exp: number;
}

export function createSessionToken(claims: { userId: string; ver: number }): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + SESSION_TTL_SECONDS;
  const jti = crypto.randomUUID();

  const payload: SessionClaims = {
    userId: claims.userId,
    ver: Number(claims.ver || 1),
    jti,
    iat,
    exp
  };

  const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', config.SESSION_SECRET).update(b64Payload).digest('base64url');
  return `${b64Payload}.${signature}`;
}

export function verifySessionToken(token: string): SessionClaims | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [b64Payload, signature] = parts;
  if (!b64Payload || !signature) return null;

  const sigBuf = Buffer.from(signature);
  let isValid = false;

  const expectedSignature = crypto.createHmac('sha256', config.SESSION_SECRET).update(b64Payload).digest('base64url');
  const expSigBuf = Buffer.from(expectedSignature);

  if (sigBuf.length === expSigBuf.length && crypto.timingSafeEqual(sigBuf, expSigBuf)) {
    isValid = true;
  } else if (config.SESSION_SECRET_PREVIOUS) {
    const prevExpected = crypto.createHmac('sha256', config.SESSION_SECRET_PREVIOUS).update(b64Payload).digest('base64url');
    const prevSigBuf = Buffer.from(prevExpected);
    if (sigBuf.length === prevSigBuf.length && crypto.timingSafeEqual(sigBuf, prevSigBuf)) {
      isValid = true;
    }
  }

  if (!isValid) {
    return null;
  }

  try {
    const claims = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8')) as SessionClaims;
    if (!claims.userId || typeof claims.ver !== 'number' || !claims.exp) {
      return null;
    }
    const now = Math.floor(Date.now() / 1000);
    if (claims.exp < now) {
      return null; // Expired
    }
    return claims;
  } catch {
    return null;
  }
}

// ============================================================================
// 2FA Pending Challenge Tokens (5-minute single-use signed tokens)
// ============================================================================

export function create2FAPendingToken(userId: string): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 300; // 5 minutes
  const jti = crypto.randomUUID();

  const payload = {
    userId,
    type: '2fa_pending',
    jti,
    iat,
    exp
  };

  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', config.SESSION_SECRET).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

export function verify2FAPendingToken(token: string): { userId: string } | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [b64, sig] = parts;
  if (!b64 || !sig) return null;

  const sBuf = Buffer.from(sig);
  let isValid = false;
  const expectedSig = crypto.createHmac('sha256', config.SESSION_SECRET).update(b64).digest('base64url');
  const expBuf = Buffer.from(expectedSig);
  if (sBuf.length === expBuf.length && crypto.timingSafeEqual(sBuf, expBuf)) {
    isValid = true;
  } else if (config.SESSION_SECRET_PREVIOUS) {
    const prevExpected = crypto.createHmac('sha256', config.SESSION_SECRET_PREVIOUS).update(b64).digest('base64url');
    const prevBuf = Buffer.from(prevExpected);
    if (sBuf.length === prevBuf.length && crypto.timingSafeEqual(sBuf, prevBuf)) {
      isValid = true;
    }
  }

  if (!isValid) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    if (payload.type !== '2fa_pending' || !payload.userId) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

// ============================================================================
// RFC 4648 Base32 & RFC 6238 TOTP Implementation
// >= 160-bit secrets (20 random bytes => 32 Base32 characters)
// ============================================================================

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function encodeBase32(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]!;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function decodeBase32(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_ALPHABET.indexOf(clean[i]!);
    if (val === -1) continue;
    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateBase32Secret(byteLength = 20): string {
  // 20 bytes = 160 bits => exactly 32 Base32 characters
  const bytes = crypto.randomBytes(Math.max(20, byteLength));
  return encodeBase32(bytes);
}

export function generateTOTPCode(secretBase32: string, timeStepWindow = 0): string {
  const epoch = Math.floor(Date.now() / 1000);
  const timeStep = Math.floor(epoch / 30) + timeStepWindow;
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(timeStep));

  const keyBuffer = decodeBase32(secretBase32);
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
 * Validates 6-digit TOTP code with replay protection via totp_last_step.
 * Strictly validates /^\d{6}$/ format before Buffer creation to avoid RangeError.
 */
export function verifyTOTPCode(
  secretBase32: string,
  userCode: string,
  lastStep?: number | null
): { valid: boolean; step?: number } {
  if (!secretBase32 || typeof userCode !== 'string') return { valid: false };
  const cleanCode = userCode.trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    return { valid: false };
  }

  const currentEpoch = Math.floor(Date.now() / 1000);
  const baseStep = Math.floor(currentEpoch / 30);
  const cleanBuf = Buffer.from(cleanCode, 'ascii');

  // Check windows: 0 (current), -1 (30s ago), +1 (30s future)
  for (const window of [0, -1, 1]) {
    const step = baseStep + window;
    // Replay Protection: Reject codes whose step is <= last accepted step
    if (lastStep !== null && lastStep !== undefined && step <= Number(lastStep)) {
      continue;
    }

    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeBigInt64BE(BigInt(step));
    const keyBuffer = decodeBase32(secretBase32);
    const hmac = crypto.createHmac('sha1', keyBuffer).update(timeBuffer).digest();
    const offset = hmac[hmac.length - 1]! & 0x0f;
    const binary =
      ((hmac[offset]! & 0x7f) << 24) |
      ((hmac[offset + 1]! & 0xff) << 16) |
      ((hmac[offset + 2]! & 0xff) << 8) |
      (hmac[offset + 3]! & 0xff);
    const generated = (binary % 1000000).toString().padStart(6, '0');
    const genBuf = Buffer.from(generated, 'ascii');

    if (genBuf.length === cleanBuf.length && crypto.timingSafeEqual(genBuf, cleanBuf)) {
      return { valid: true, step };
    }
  }

  return { valid: false };
}

// ============================================================================
// AES-256-GCM Encryption for TOTP Secrets at Rest
// ============================================================================

export function getTotpEncryptionKey(): Buffer {
  const rawKey = config.TOTP_ENCRYPTION_KEY;
  if (rawKey) {
    const trimmed = rawKey.trim();
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      return Buffer.from(trimmed, 'hex');
    }
    const buf = Buffer.from(trimmed, 'utf8');
    if (buf.length === 32) return buf;
  }
  // Fallback in dev/test only: derive deterministic 32-byte key from SESSION_SECRET
  return crypto.createHash('sha256').update(`${config.SESSION_SECRET}:totp-encryption-key`).digest();
}

export function encryptTotpSecret(secret: string): string {
  const key = getTotpEncryptionKey();
  const iv = crypto.randomBytes(12); // Standard 96-bit IV
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptTotpSecret(encryptedString: string): string {
  if (!encryptedString) return '';
  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    // Unencrypted legacy base32 string: return as-is
    return encryptedString;
  }
  const [ivHex, tagHex, cipherHex] = parts;
  const key = getTotpEncryptionKey();
  const iv = Buffer.from(ivHex!, 'hex');
  const tag = Buffer.from(tagHex!, 'hex');
  const cipherBuffer = Buffer.from(cipherHex!, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(cipherBuffer), decipher.final()]);
  return decrypted.toString('utf8');
}

// ============================================================================
// One-Time Backup Recovery Codes
// ============================================================================

export function generateRecoveryCodes(count = 8): { plainCodes: string[]; hashedCodes: string[] } {
  const plainCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(5).toString('hex'); // 10 hex characters
    plainCodes.push(code);
    hashedCodes.push(crypto.createHash('sha256').update(code).digest('hex'));
  }

  return { plainCodes, hashedCodes };
}

// ============================================================================
// Token Hashing & Safe Generation (SHA-256)
// ============================================================================

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

export function generateSecureToken(prefix = 'tok'): string {
  return `${prefix}_${crypto.randomBytes(32).toString('base64url')}`;
}

export function timingSafeTokenEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ============================================================================
// Corporate Password Policy Validator (delegates to shared module)
// ============================================================================

export { COMMON_PASSWORDS, validatePasswordPolicy } from '../shared/password-policy';


// ============================================================================
// Database-Backed Login Throttling & Account Lockout
// ============================================================================

export function parseDbDate(val: any): Date {
  if (!val) return new Date(0);
  if (val instanceof Date) return val;
  const str = String(val).trim();
  if (str.endsWith('Z') || /[+-]\d{2}(:\d{2})?$/.test(str)) {
    return new Date(str);
  }
  return new Date(str.replace(' ', 'T') + 'Z');
}

export async function checkLockout(email: string, ip?: string): Promise<{ isLocked: boolean; remainingMinutes?: number }> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanIp = ip ? ip.trim() : '';

  try {
    // 1. Check (email, ip) or email-specific lockout
    let rows = await query<any>(
      'SELECT failures, locked_until FROM login_attempts WHERE email = ? AND ip = ? LIMIT 1;',
      [cleanEmail, cleanIp || '0.0.0.0']
    );

    if (rows.length === 0 && !cleanIp) {
      rows = await query<any>(
        'SELECT failures, locked_until FROM login_attempts WHERE email = ? LIMIT 1;',
        [cleanEmail]
      );
    }

    if (rows.length > 0 && rows[0]?.locked_until) {
      const lockedUntil = parseDbDate(rows[0].locked_until).getTime();
      const now = Date.now();
      if (lockedUntil > now) {
        return { isLocked: true, remainingMinutes: Math.max(1, Math.ceil((lockedUntil - now) / 60000)) };
      }
    }

    // 2. Check global IP lockout
    if (cleanIp) {
      const ipRows = await query<any>(
        'SELECT failures, locked_until FROM login_attempts WHERE email = "__GLOBAL_IP__" AND ip = ? LIMIT 1;',
        [cleanIp]
      );
      if (ipRows.length > 0 && ipRows[0]?.locked_until) {
        const lockedUntil = parseDbDate(ipRows[0].locked_until).getTime();
        const now = Date.now();
        if (lockedUntil > now) {
          return { isLocked: true, remainingMinutes: Math.max(1, Math.ceil((lockedUntil - now) / 60000)) };
        }
      }
    }
  } catch (err: any) {
    console.error('[AUTH LOCKOUT CHECK ERROR]', err.message);
  }

  return { isLocked: false };
}

export async function recordFailedLogin(
  email: string,
  ip?: string
): Promise<{ lockedNow: boolean; remainingMinutes?: number; attempts: number }> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanIp = ip ? ip.trim() : '0.0.0.0';

  let maxFailures = 0;
  let isLocked = false;
  let remainingMinutes = 0;

  try {
    const pairRows = await query<any>(
      'SELECT id, failures FROM login_attempts WHERE email = ? AND ip = ? LIMIT 1;',
      [cleanEmail, cleanIp]
    );
    let pairFailures = 1;
    if (pairRows.length > 0) {
      pairFailures = (pairRows[0]!.failures || 0) + 1;
    }
    maxFailures = pairFailures;

    let lockedUntilStr: string | null = null;
    if (pairFailures >= 5) {
      const lockMinutes = Math.min(60, Math.pow(2, pairFailures - 5) * 5); // 5, 10, 20, 40, 60
      const lockTime = new Date(Date.now() + lockMinutes * 60000);
      lockedUntilStr = lockTime.toISOString().slice(0, 19).replace('T', ' ');
      isLocked = true;
      remainingMinutes = lockMinutes;
    }

    if (pairRows.length > 0) {
      await query('UPDATE login_attempts SET failures = ?, locked_until = ?, updated_at = NOW() WHERE id = ?;', [
        pairFailures,
        lockedUntilStr,
        pairRows[0]!.id
      ]);
    } else {
      await query('INSERT INTO login_attempts (id, email, ip, failures, locked_until) VALUES (?, ?, ?, ?, ?);', [
        `att-${crypto.randomUUID()}`,
        cleanEmail,
        cleanIp,
        pairFailures,
        lockedUntilStr
      ]);
    }

    // IP-wide brute-force tracking
    if (cleanIp && cleanIp !== '0.0.0.0') {
      const ipRows = await query<any>(
        'SELECT id, failures FROM login_attempts WHERE email = "__GLOBAL_IP__" AND ip = ? LIMIT 1;',
        [cleanIp]
      );
      let ipFailures = 1;
      if (ipRows.length > 0) {
        ipFailures = (ipRows[0]!.failures || 0) + 1;
      }

      let ipLockedUntilStr: string | null = null;
      if (ipFailures >= 15) {
        const lockMinutes = Math.min(60, Math.pow(2, ipFailures - 15) * 5);
        ipLockedUntilStr = new Date(Date.now() + lockMinutes * 60000).toISOString().slice(0, 19).replace('T', ' ');
        isLocked = true;
        remainingMinutes = Math.max(remainingMinutes, lockMinutes);
      }

      if (ipRows.length > 0) {
        await query('UPDATE login_attempts SET failures = ?, locked_until = ?, updated_at = NOW() WHERE id = ?;', [
          ipFailures,
          ipLockedUntilStr,
          ipRows[0]!.id
        ]);
      } else {
        await query('INSERT INTO login_attempts (id, email, ip, failures, locked_until) VALUES (?, ?, ?, ?, ?);', [
          `att-${crypto.randomUUID()}`,
          '__GLOBAL_IP__',
          cleanIp,
          ipFailures,
          ipLockedUntilStr
        ]);
      }
    }
  } catch (err: any) {
    console.error('[RECORD FAILED LOGIN ERROR]', err.message);
  }

  return { lockedNow: isLocked, remainingMinutes, attempts: maxFailures };
}

export async function recordSuccessfulLogin(email: string, ip?: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanIp = ip ? ip.trim() : '';

  try {
    await query('DELETE FROM login_attempts WHERE email = ? AND ip = ?;', [cleanEmail, cleanIp || '0.0.0.0']);
    await query('DELETE FROM login_attempts WHERE email = ?;', [cleanEmail]);
    if (cleanIp) {
      await query('DELETE FROM login_attempts WHERE email = "__GLOBAL_IP__" AND ip = ?;', [cleanIp]);
    }
  } catch (err: any) {
    console.error('[CLEAR LOGIN ATTEMPTS ERROR]', err.message);
  }
}

export async function recordFailedTotpAttempt(userId: string): Promise<{ locked: boolean; remainingAttempts: number }> {
  try {
    const rows = await query<any>('SELECT failed_login_attempts FROM users WHERE id = ? LIMIT 1;', [userId]);
    const current = (rows[0]?.failed_login_attempts || 0) + 1;

    if (current >= 5) {
      const lockedUntil = new Date(Date.now() + 15 * 60000).toISOString().slice(0, 19).replace('T', ' ');
      await query('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?;', [current, lockedUntil, userId]);
      return { locked: true, remainingAttempts: 0 };
    }

    await query('UPDATE users SET failed_login_attempts = ? WHERE id = ?;', [current, userId]);
    return { locked: false, remainingAttempts: 5 - current };
  } catch (err: any) {
    console.error('[RECORD FAILED TOTP ERROR]', err.message);
    return { locked: false, remainingAttempts: 4 };
  }
}

export async function clearFailedTotpAttempts(userId: string): Promise<void> {
  try {
    await query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?;', [userId]);
  } catch (err: any) {
    console.error('[CLEAR FAILED TOTP ERROR]', err.message);
  }
}
