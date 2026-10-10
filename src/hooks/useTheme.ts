import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type Theme = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'stacktracker_theme';
const QUERY = '(prefers-color-scheme: dark)';

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // storage blocked
  }
  return 'dark';
}

// One choice for the whole page, so the menu toggle and Settings stay in step.
let current: Theme | null = null;
const listeners = new Set<() => void>();

function getTheme(): Theme {
  if (current === null) current = readStoredTheme();
  return current;
}

function subscribeToTheme(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function subscribeToSystem(onChange: () => void): () => void {
  const mq = window.matchMedia?.(QUERY);
  mq?.addEventListener('change', onChange);
  return () => mq?.removeEventListener('change', onChange);
}

const systemIsDark = () => window.matchMedia?.(QUERY).matches ?? true;

/**
 * Dark, light, or follow the device. The choice is kept in this browser under
 * the key the site has always used, and index.html reads it before first paint.
 */
export function useTheme() {
  const theme = useSyncExternalStore(subscribeToTheme, getTheme, () => 'dark' as Theme);
  const prefersDark = useSyncExternalStore(subscribeToSystem, systemIsDark, () => true);
  const resolvedTheme: 'light' | 'dark' = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#0b0b0d' : '#f6f4ee');
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    current = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage blocked; the choice lasts for this visit
    }
    listeners.forEach((l) => l());
  }, []);

  return { theme, setTheme, resolvedTheme };
}
