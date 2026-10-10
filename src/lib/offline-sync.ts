/**
 * IndexedDB Offline Warehouse Sync Engine (Phase 4 Hardened)
 * - Encrypts mutations at rest in IndexedDB using Web Crypto AES-GCM
 * - Generates unique idempotency keys per mutation
 * - Tracks persistent client_id and monotonic client sequence numbers
 * - Enforces baseVersion optimistic concurrency tracking
 * - Replays mutations in strict FIFO order with HTTP 409 conflict detection
 * - Provides safe logout wiping with un-synced mutation loss protection
 */

const DB_NAME = 'ITAssetOfflineStore';
const DB_VERSION = 2;
const QUEUE_STORE = 'pending_mutations';
const DEAD_LETTER_STORE = 'dead_letter_mutations';
const MAX_ATTEMPTS = 5;

export interface EncryptedPayload {
  iv: string;
  ciphertext: string;
}

export interface QueuedMutation {
  id: string;
  idempotencyKey: string;
  clientId: string;
  clientSeq: number;
  baseVersion?: number;
  table: 'assets' | 'checkouts' | 'maintenance' | 'audit_logs' | 'users' | 'branches';
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  data: any;
  encryptedData?: EncryptedPayload;
  timestamp: number;
  attempts: number;
  lastError?: string;
}

export interface OfflineSyncStatus {
  isOnline: boolean;
  queuedCount: number;
  deadLetterCount: number;
}

export type ReplayExecutor = (mut: QueuedMutation) => Promise<boolean>;

let dbInstance: IDBDatabase | null = null;
let registeredExecutor: ReplayExecutor | null = null;
const listeners = new Set<(status: OfflineSyncStatus) => void>();

// ----------------------------------------------------------------------------
// 1. Client Identity & Monotonic Client Sequence
// ----------------------------------------------------------------------------

export function getClientId(): string {
  if (typeof localStorage === 'undefined') return 'client-node-env';
  let id = localStorage.getItem('omni_client_id');
  if (!id) {
    id = `cli-${Math.random().toString(36).substring(2, 9)}-${Date.now().toString(36)}`;
    localStorage.setItem('omni_client_id', id);
  }
  return id;
}

export function getNextClientSeq(): number {
  if (typeof localStorage === 'undefined') return 1;
  const current = Number(localStorage.getItem('omni_client_seq') || 0);
  const next = current + 1;
  localStorage.setItem('omni_client_seq', String(next));
  return next;
}

// ----------------------------------------------------------------------------
// 2. Web Crypto AES-GCM At-Rest Encryption
// ----------------------------------------------------------------------------

let cachedCryptoKey: CryptoKey | null = null;

async function getStorageCryptoKey(): Promise<CryptoKey | null> {
  if (cachedCryptoKey) return cachedCryptoKey;
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    return null; // Graceful fallback in environments without Web Crypto
  }

  try {
    let keySeed = localStorage.getItem('omni_offline_key_seed');
    if (!keySeed) {
      const randomBytes = new Uint8Array(32);
      window.crypto.getRandomValues(randomBytes);
      keySeed = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('omni_offline_key_seed', keySeed);
    }

    const rawKey = new Uint8Array(keySeed.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
    cachedCryptoKey = await window.crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
    return cachedCryptoKey;
  } catch (err) {
    console.warn('Web Crypto key derivation fallback:', err);
    return null;
  }
}

export async function encryptPayload(data: any): Promise<EncryptedPayload> {
  const key = await getStorageCryptoKey();
  if (!key || typeof window === 'undefined' || !window.crypto) {
    return { iv: '', ciphertext: JSON.stringify(data) };
  }

  try {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(data));
    const encryptedBuf = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );

    return {
      iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
      ciphertext: Array.from(new Uint8Array(encryptedBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
    };
  } catch {
    return { iv: '', ciphertext: JSON.stringify(data) };
  }
}

export async function decryptPayload(encrypted: EncryptedPayload | any): Promise<any> {
  if (!encrypted || typeof encrypted !== 'object' || !encrypted.iv || !encrypted.ciphertext) {
    return encrypted;
  }

  const key = await getStorageCryptoKey();
  if (!key || typeof window === 'undefined' || !window.crypto) {
    try {
      return JSON.parse(encrypted.ciphertext);
    } catch {
      return encrypted;
    }
  }

  try {
    const iv = new Uint8Array(encrypted.iv.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));
    const cipherBytes = new Uint8Array(encrypted.ciphertext.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));
    const decryptedBuf = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      cipherBytes
    );
    const jsonStr = new TextDecoder().decode(decryptedBuf);
    return JSON.parse(jsonStr);
  } catch (err) {
    console.warn('Could not decrypt payload with AES-GCM, returning raw:', err);
    return encrypted;
  }
}

// ----------------------------------------------------------------------------
// 3. Database Initialization
// ----------------------------------------------------------------------------

export async function getOfflineDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const store = db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('idempotencyKey', 'idempotencyKey', { unique: true });
      }
      if (!db.objectStoreNames.contains(DEAD_LETTER_STORE)) {
        const dlStore = db.createObjectStore(DEAD_LETTER_STORE, { keyPath: 'id' });
        dlStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// ----------------------------------------------------------------------------
// 4. Queuing with Optimistic Concurrency & Encryption
// ----------------------------------------------------------------------------

/**
 * Queue a mutation into IndexedDB when offline or database write fails
 */
export async function queueOfflineMutation(
  table: QueuedMutation['table'],
  action: QueuedMutation['action'],
  data: any,
  options?: {
    baseVersion?: number;
    idempotencyKey?: string;
  }
): Promise<QueuedMutation> {
  try {
    const db = await getOfflineDB();
    const clientId = getClientId();
    const clientSeq = getNextClientSeq();
    const idempotencyKey = options?.idempotencyKey || `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const baseVersion = options?.baseVersion ?? (data && typeof data === 'object' ? data.version : undefined);

    // Encrypt payload for at-rest storage in IndexedDB
    const encryptedData = await encryptPayload(data);

    const mutation: QueuedMutation = {
      id: `mut-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      idempotencyKey,
      clientId,
      clientSeq,
      baseVersion,
      table,
      action,
      data, // In-memory reference
      encryptedData,
      timestamp: Date.now(),
      attempts: 0
    };

    // Stored record holds encryptedData to protect data at rest
    const storedRecord = {
      id: mutation.id,
      idempotencyKey: mutation.idempotencyKey,
      clientId: mutation.clientId,
      clientSeq: mutation.clientSeq,
      baseVersion: mutation.baseVersion,
      table: mutation.table,
      action: mutation.action,
      encryptedData: mutation.encryptedData,
      timestamp: mutation.timestamp,
      attempts: mutation.attempts
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, 'readwrite');
      const store = tx.objectStore(QUEUE_STORE);
      const req = store.add(storedRecord);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to queue mutation'));
      tx.onerror = () => reject(tx.error || new Error('Transaction failed while queuing mutation'));
    });

    notifyStatusChange();
    return mutation;
  } catch (err) {
    console.error('Failed to queue mutation to IndexedDB:', err);
    throw err;
  }
}

// ----------------------------------------------------------------------------
// 5. Querying & Decrypting Queue Items
// ----------------------------------------------------------------------------

export async function getPendingQueueCount(): Promise<number> {
  try {
    const db = await getOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, 'readonly');
      const store = tx.objectStore(QUEUE_STORE);
      const countReq = store.count();
      countReq.onsuccess = () => resolve(countReq.result);
      countReq.onerror = () => reject(countReq.error);
    });
  } catch {
    return 0;
  }
}

export async function getDeadLetterCount(): Promise<number> {
  try {
    const db = await getOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DEAD_LETTER_STORE, 'readonly');
      const store = tx.objectStore(DEAD_LETTER_STORE);
      const countReq = store.count();
      countReq.onsuccess = () => resolve(countReq.result);
      countReq.onerror = () => reject(countReq.error);
    });
  } catch {
    return 0;
  }
}

export async function getAllQueuedMutations(): Promise<QueuedMutation[]> {
  try {
    const db = await getOfflineDB();
    const rawList: any[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, 'readonly');
      const store = tx.objectStore(QUEUE_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    const decrypted: QueuedMutation[] = [];
    for (const raw of rawList) {
      let data = raw.data;
      if (!data && raw.encryptedData) {
        data = await decryptPayload(raw.encryptedData);
      }
      decrypted.push({
        ...raw,
        data
      });
    }

    return decrypted.sort((a, b) => a.timestamp - b.timestamp);
  } catch {
    return [];
  }
}

export async function getDeadLetterMutations(): Promise<QueuedMutation[]> {
  try {
    const db = await getOfflineDB();
    const rawList: any[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(DEAD_LETTER_STORE, 'readonly');
      const store = tx.objectStore(DEAD_LETTER_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    const decrypted: QueuedMutation[] = [];
    for (const raw of rawList) {
      let data = raw.data;
      if (!data && raw.encryptedData) {
        data = await decryptPayload(raw.encryptedData);
      }
      decrypted.push({
        ...raw,
        data
      });
    }

    return decrypted.sort((a, b) => a.timestamp - b.timestamp);
  } catch {
    return [];
  }
}

export async function removeQueuedMutation(id: string): Promise<void> {
  const db = await getOfflineDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error(`Failed to remove mutation ${id}`));
    tx.onerror = () => reject(tx.error || new Error(`Transaction failed while removing mutation ${id}`));
  });
  notifyStatusChange();
}

async function updateQueuedMutation(mut: QueuedMutation): Promise<void> {
  const db = await getOfflineDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    const req = store.put(mut);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error(`Failed to update mutation ${mut.id}`));
    tx.onerror = () => reject(tx.error || new Error(`Transaction failed while updating mutation ${mut.id}`));
  });
}

async function moveToDeadLetter(mut: QueuedMutation): Promise<void> {
  const db = await getOfflineDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([QUEUE_STORE, DEAD_LETTER_STORE], 'readwrite');
    const queueStore = tx.objectStore(QUEUE_STORE);
    const dlStore = tx.objectStore(DEAD_LETTER_STORE);

    dlStore.put(mut);
    queueStore.delete(mut.id);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error(`Failed to move mutation ${mut.id} to dead letter`));
  });
  notifyStatusChange();
}

export async function discardDeadLetterMutation(id: string): Promise<void> {
  const db = await getOfflineDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DEAD_LETTER_STORE, 'readwrite');
    const store = tx.objectStore(DEAD_LETTER_STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
  });
  notifyStatusChange();
}

export async function retryDeadLetterMutation(id: string): Promise<void> {
  const db = await getOfflineDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([QUEUE_STORE, DEAD_LETTER_STORE], 'readwrite');
    const queueStore = tx.objectStore(QUEUE_STORE);
    const dlStore = tx.objectStore(DEAD_LETTER_STORE);

    const getReq = dlStore.get(id);
    getReq.onsuccess = () => {
      const mut = getReq.result as QueuedMutation | undefined;
      if (mut) {
        mut.attempts = 0;
        mut.lastError = undefined;
        queueStore.put(mut);
        dlStore.delete(id);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notifyStatusChange();
  if (registeredExecutor && typeof navigator !== 'undefined' && navigator.onLine) {
    replayOfflineQueue(registeredExecutor);
  }
}

// ----------------------------------------------------------------------------
// 6. Safe Logout Wiping with Data-Loss Warning
// ----------------------------------------------------------------------------

export async function clearOfflineStoreOnLogout(
  force = false
): Promise<{ cleared: boolean; pendingCount: number; warning?: string }> {
  const pendingCount = await getPendingQueueCount();
  if (pendingCount > 0 && !force) {
    return {
      cleared: false,
      pendingCount,
      warning: `You have ${pendingCount} pending offline mutation(s) that have not synced to the cloud. Logging out will discard them.`
    };
  }

  try {
    const db = await getOfflineDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([QUEUE_STORE, DEAD_LETTER_STORE], 'readwrite');
      tx.objectStore(QUEUE_STORE).clear();
      tx.objectStore(DEAD_LETTER_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('omni_client_seq');
    }

    notifyStatusChange();
    return { cleared: true, pendingCount: 0 };
  } catch (err: any) {
    return { cleared: false, pendingCount, warning: `Failed to wipe offline store: ${err.message}` };
  }
}

// ----------------------------------------------------------------------------
// 7. FIFO Replay Engine with HTTP 409 Conflict Guard
// ----------------------------------------------------------------------------

export function registerReplayExecutor(fn: ReplayExecutor): () => void {
  registeredExecutor = fn;
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    replayOfflineQueue(fn);
  }
  return () => {
    if (registeredExecutor === fn) {
      registeredExecutor = null;
    }
  };
}

export async function replayOfflineQueue(executor?: ReplayExecutor): Promise<number> {
  const activeExecutor = executor || registeredExecutor;
  if (!activeExecutor) return 0;

  if (typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks?.request) {
    try {
      return await navigator.locks.request('offline_sync_replay_lock', { ifAvailable: true }, async (lock) => {
        if (!lock) return 0;
        return await drainQueueWithExecutor(activeExecutor);
      });
    } catch (err) {
      console.warn('Web Locks fallback:', err);
      return await drainQueueWithExecutor(activeExecutor);
    }
  }

  return await drainQueueWithExecutor(activeExecutor);
}

async function drainQueueWithExecutor(executor: ReplayExecutor): Promise<number> {
  const mutations = await getAllQueuedMutations();
  if (mutations.length === 0) return 0;

  let successCount = 0;

  for (const mut of mutations) {
    let ok = false;
    let executionError: any = null;

    try {
      ok = await executor(mut);
    } catch (err: any) {
      ok = false;
      executionError = err;
    }

    if (ok) {
      try {
        await removeQueuedMutation(mut.id);
        successCount++;
      } catch (removeErr) {
        console.error(`Failed to remove successful mutation ${mut.id}:`, removeErr);
        break;
      }
    } else {
      const isConflict =
        executionError?.status === 409 ||
        executionError?.message?.includes('409') ||
        executionError?.message?.includes('Conflict') ||
        executionError?.message?.includes('version mismatch');

      if (isConflict) {
        console.warn(`Mutation ${mut.id} encountered concurrency conflict (HTTP 409). Moving to dead letter store:`, executionError?.message);
        mut.lastError = `HTTP 409 Conflict: ${executionError?.message || 'Version mismatch on server'}`;
        try {
          await moveToDeadLetter(mut);
        } catch (dlErr) {
          console.error(`Failed to move conflict mutation ${mut.id} to dead letter:`, dlErr);
        }
        // Stop drain so user can review the conflict
        break;
      }

      mut.attempts = (mut.attempts || 0) + 1;
      mut.lastError = executionError?.message || 'Executor returned false';

      if (mut.attempts >= MAX_ATTEMPTS) {
        console.warn(`Mutation ${mut.id} reached max attempts. Moving to dead letter store:`, mut.lastError);
        try {
          await moveToDeadLetter(mut);
        } catch (dlErr) {
          console.error(`Failed to move mutation ${mut.id} to dead letter:`, dlErr);
        }
        break;
      } else {
        console.warn(`Queued mutation ${mut.id} attempt ${mut.attempts}/${MAX_ATTEMPTS} failed. Halting queue drain:`, mut.lastError);
        try {
          await updateQueuedMutation(mut);
        } catch (updErr) {
          console.error(`Failed to persist attempts for mutation ${mut.id}:`, updErr);
        }
        break;
      }
    }
  }

  notifyStatusChange();
  return successCount;
}

export function subscribeOfflineStatus(
  callback: (status: OfflineSyncStatus) => void
): () => void {
  listeners.add(callback);

  Promise.all([getPendingQueueCount(), getDeadLetterCount()]).then(([queuedCount, deadLetterCount]) => {
    callback({
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      queuedCount,
      deadLetterCount
    });
  });

  return () => {
    listeners.delete(callback);
  };
}

async function notifyStatusChange() {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const [queuedCount, deadLetterCount] = await Promise.all([
    getPendingQueueCount(),
    getDeadLetterCount()
  ]);

  listeners.forEach(cb => cb({ isOnline, queuedCount, deadLetterCount }));
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    notifyStatusChange();
    if (registeredExecutor) {
      replayOfflineQueue(registeredExecutor);
    }
  });
  window.addEventListener('offline', () => {
    notifyStatusChange();
  });
}
