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
        return await originalFetch(input, {
          ...init,
          credentials: init?.credentials || 'include',
          headers
        });
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

