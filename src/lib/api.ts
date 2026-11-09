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
      return originalFetch(input, {
        ...init,
        credentials: init?.credentials || 'include',
        headers
      });
    }

    return originalFetch(input, init);
  };
}
