import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'omni_theme';

export function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Apply a theme to the document. Dark is the default and needs no attribute. */
export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

/** Call once before the app renders so the saved theme is applied without a flash. */
export function initTheme() {
  applyTheme(getStoredTheme());
}

export const ThemeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Preference simply won't persist (private mode / storage disabled).
    }
  }, [theme]);

  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={`p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer ${className}`}
    >
      {theme === 'dark' ? <Sun className="w-4 h-4" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}
    </button>
  );
};
