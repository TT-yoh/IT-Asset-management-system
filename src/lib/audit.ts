import { AuditLogItem, User, UserRole } from '../types';
import { queueOfflineMutation } from './offline-sync';

/**
 * Standard FIPS 180-4 SHA-256 implementation
 * Produces authentic 256-bit cryptographic hex digests
 */
function sha256Sync(ascii: string): string {
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = 'length';
  let i = 0, j = 0;
  let result = '';
  const words: number[] = [];
  const asciiBitLength = ascii[lengthProperty] * 8;

  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  let compositeCount = 0;
  for (let candidate = 2; compositeCount < 64; candidate++) {
    let isPrime = true;
    for (let factor = 2; factor <= Math.sqrt(candidate); factor++) {
      if (candidate % factor === 0) { isPrime = false; break; }
    }
    if (isPrime) compositeCount++;
  }

  ascii += '\x80';
  while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return '';
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
  words[words[lengthProperty]] = (asciiBitLength);

  for (j = 0; j < words[lengthProperty];) {
    const w = words.slice(j, j += 16);
    const oldHash = hash;
    hash = hash.slice(0, 8);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const s0 = (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3));
      const s1 = (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10));
      w[i] = (i < 16) ? w[i] : ((w[i - 16] + s0 + w[i - 7] + s1) | 0);

      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const sA = (rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22));
      const sE = (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25));

      const temp1 = (hash[7] + sE + ch + k[i] + w[i]) | 0;
      const temp2 = (sA + maj) | 0;

      hash = [(temp1 + temp2) | 0, hash[0], hash[1], hash[2], (hash[3] + temp1) | 0, hash[4], hash[5], hash[6]];
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (let b = 3; b >= 0; b--) {
      const byteVal = (hash[i] >> (8 * b)) & 255;
      result += (byteVal < 16 ? '0' : '') + byteVal.toString(16);
    }
  }
  return result;

  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
}

/**
 * Generate genuine SHA-256 cryptographic digest across audit event content
 */
export const generateAuditHash = (log: Omit<AuditLogItem, 'id'>): string => {
  const payload = `${log.orgId}|${log.userName}|${log.action}|${log.entityType}|${log.entityName}|${log.timestamp}|${log.changes}`;
  return sha256Sync(payload);
};

/**
 * Commits an immutable audit log entry via server tier
 */
export async function commitAuditEvent(params: {
  orgId: string;
  user: User | { fullName: string; role: UserRole };
  action: string;
  entityType: 'Asset' | 'User' | 'Maintenance' | 'Checkout' | 'Budget' | 'Organization';
  entityName: string;
  changes: string | Record<string, any>;
}): Promise<AuditLogItem> {
  const now = new Date().toISOString();
  const changesStr = typeof params.changes === 'object' ? JSON.stringify(params.changes) : String(params.changes);

  const logItem: AuditLogItem = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    orgId: params.orgId,
    userName: params.user.fullName,
    userRole: params.user.role,
    action: params.action,
    entityType: params.entityType,
    entityName: params.entityName,
    changes: changesStr,
    timestamp: now,
    ipAddress: 'Server-Verified'
  };

  try {
    const res = await fetch('/api/audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(logItem)
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.record) {
        return {
          ...logItem,
          seq: data.record.seq,
          prevHash: data.record.prev_hash,
          hash: data.record.hash
        };
      }
    }
  } catch {
    // Queue offline mutation if server is unreachable
    queueOfflineMutation('audit_logs', 'INSERT', logItem);
  }

  return logItem;
}

/**
 * Validates cryptographic chain integrity by querying the server verification endpoint
 */
export async function verifyServerAuditChain(): Promise<{
  valid: boolean;
  totalRecords: number;
  chainLength: number;
  genesisHash: string;
  latestHash: string;
  errors: string[];
}> {
  try {
    const res = await fetch('/api/audit-logs/verify', { credentials: 'include' });
    if (res.ok) {
      return await res.json();
    }
  } catch {}

  return {
    valid: false,
    totalRecords: 0,
    chainLength: 0,
    genesisHash: '',
    latestHash: '',
    errors: ['Unable to reach server to verify audit chain']
  };
}
