/**
 * Corporate API Client & Fetch Interceptor
 * Enforces credentials: 'include' and custom header 'X-Requested-With' for CSRF protection.
 */

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers || {});
  if (!headers.has('X-Requested-With')) {
    headers.set('X-Requested-With', 'XMLHttpRequest');
  }

  return fetch(input, {
    ...init,
    credentials: init?.credentials || 'include',
    headers
  });
}

// Write tracking: lets data loaders tell whether a save was in flight while they were
// fetching, in which case their snapshot may be missing that save.
let writesInFlight = 0;
let writeEpoch = 0;

/** inFlight: saves currently being sent. epoch: changes whenever a save starts or finishes. */
export function getWriteActivity(): { inFlight: number; epoch: number } {
  return { inFlight: writesInFlight, epoch: writeEpoch };
}

// Server health as seen by the app: 'database-unreachable' after the server answers
// 503 DB_UNAVAILABLE, 'server-unreachable' when /api requests fail outright, and back to
// 'ok' on the next successful /api response. The header shows it next to "Connected".
export type ServerHealth = 'ok' | 'database-unreachable' | 'server-unreachable';
let serverHealth: ServerHealth = 'ok';
const healthListeners = new Set<(health: ServerHealth) => void>();

function setServerHealth(next: ServerHealth) {
  if (next === serverHealth) return;
  serverHealth = next;
  healthListeners.forEach((listener) => listener(next));
}

export function subscribeServerHealth(listener: (health: ServerHealth) => void): () => void {
  healthListeners.add(listener);
  listener(serverHealth);
  return () => healthListeners.delete(listener);
}

async function noteServerHealth(res: Response) {
  if (res.ok) {
    setServerHealth('ok');
  } else if (res.status === 503) {
    const body = await res.clone().json().catch(() => null);
    if (body?.code === 'DB_UNAVAILABLE') setServerHealth('database-unreachable');
  } else if (res.status === 502 || res.status === 504) {
    setServerHealth('server-unreachable');
  }
}

// Global browser fetch interceptor for all /api calls
if (typeof window !== 'undefined' && window.fetch) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let urlStr = '';
    if (typeof input === 'string') {
      urlStr = input;
    } else if (input instanceof URL) {
      urlStr = input.href;
    } else if (input && typeof (input as any).url === 'string') {
      urlStr = (input as any).url;
    }

    if (urlStr.startsWith('/api') || urlStr.includes('/api/')) {
      const headers = new Headers(init?.headers || {});
      if (!headers.has('X-Requested-With')) {
        headers.set('X-Requested-With', 'XMLHttpRequest');
      }
      const method = (init?.method || (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET') || 'GET').toUpperCase();
      const isWrite = method !== 'GET' && method !== 'HEAD';
      if (isWrite) {
        writesInFlight++;
        writeEpoch++;
      }
      try {
        const res = await originalFetch(input, {
          ...init,
          credentials: init?.credentials || 'include',
          headers
        });
        void noteServerHealth(res);
        return res;
      } catch (err: any) {
        // A cancelled request says nothing about the server; a failed one does.
        if (err?.name !== 'AbortError') setServerHealth('server-unreachable');
        throw err;
      } finally {
        if (isWrite) {
          writesInFlight--;
          writeEpoch++;
        }
      }
    }

    return originalFetch(input, init);
  };
}

