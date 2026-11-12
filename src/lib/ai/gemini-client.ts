/**
 * Server-Backed AI Assistant Client
 * Addendum 4 Section B1: Delegates AI generation to server POST /api/catalog/chat
 * Completely eliminates @google/genai SDK and credentials from client bundle.
 */

export const getGeminiApiKey = (): string => {
  return '';
};

export const isGeminiAvailable = (): boolean => {
  return true;
};

export const setGeminiApiKey = (_key: string): void => {
  // Client-side API key entry deprecated for enterprise security.
  // AI is managed exclusively via server-side configuration.
};

export const getGeminiClient = (): null => {
  return null;
};

/**
 * Delegates content generation to server-side AI catalog chat endpoint.
 */
export async function generateContentWithFallback(prompt: string): Promise<string> {
  try {
    const res = await fetch('/api/catalog/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      credentials: 'include',
      body: JSON.stringify({ prompt })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server AI endpoint error: ${res.status}`);
    }

    const data = await res.json();
    return data.reply || 'No response received from AI service.';
  } catch (err: any) {
    console.warn('[AI CLIENT] Server generation failed:', err.message);
    throw err;
  }
}
