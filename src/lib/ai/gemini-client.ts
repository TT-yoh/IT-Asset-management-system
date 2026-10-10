import { GoogleGenAI } from '@google/genai';

/**
 * Gemini AI Client Initializer
 * Uses VITE_GEMINI_API_KEY from environment variables.
 */
let aiInstance: GoogleGenAI | null = null;
let currentKey = '';

export const getGeminiApiKey = (): string => {
  const envMeta = (import.meta as any).env || {};
  const processEnv = typeof process !== 'undefined' && process.env ? process.env : {};

  const candidates = [
    envMeta.VITE_GEMINI_API_KEY,
    envMeta.GEMINI_API_KEY,
    processEnv.GEMINI_API_KEY,
    processEnv.VITE_GEMINI_API_KEY
  ];

  for (const candidate of candidates) {
    if (
      candidate &&
      typeof candidate === 'string' &&
      candidate.trim().length > 10 &&
      !candidate.includes('MY_GEMINI_API_KEY') &&
      !candidate.includes('placeholder') &&
      !candidate.includes('YOUR_KEY')
    ) {
      return candidate.trim();
    }
  }

  // Check localStorage for runtime user override
  try {
    const saved = localStorage.getItem('gemini_api_key');
    if (saved && saved.trim().length > 10) return saved.trim();
  } catch {}

  return '';
};

export const isGeminiAvailable = (): boolean => {
  return getGeminiApiKey().length > 0;
};

export const setGeminiApiKey = (key: string): void => {
  try {
    localStorage.setItem('gemini_api_key', key.trim());
    aiInstance = null;
    currentKey = '';
  } catch (e) {
    console.warn('Failed to save Gemini API key:', e);
  }
};

export const getGeminiClient = (): GoogleGenAI | null => {
  const key = getGeminiApiKey();
  if (!key) return null;
  if (!aiInstance || currentKey !== key) {
    currentKey = key;
    aiInstance = new GoogleGenAI({ apiKey: key });
  }
  return aiInstance;
};

/**
 * Robust generate helper that cascades through recommended models
 */
export async function generateContentWithFallback(prompt: string): Promise<string> {
  const client = getGeminiClient();
  if (!client) {
    throw new Error('Gemini API key is not configured.');
  }

  const modelCandidates = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  let lastError: any = null;

  for (const model of modelCandidates) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: prompt
      });
      if (response && response.text) {
        return response.text;
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`Gemini generation failed on model ${model}, trying next model...`, err?.message || err);
    }
  }

  throw lastError || new Error('Failed to generate content with Gemini');
}
