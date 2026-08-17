'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Zustand über localStorage. Quelle der Wahrheit = React-State,
 * gespiegelt in localStorage. Hydrationssicher: Server und erster
 * Client-Render starten mit `initial`, der Store wird erst nach dem
 * Mount gelesen (Server kennt kein localStorage).
 */
export function useLocalStorageState<T>(
  key: string,
  initial: T,
  validate: (v: unknown) => v is T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem(key);
        if (raw !== null) {
          const parsed: unknown = JSON.parse(raw);
          if (validate(parsed)) setValue(parsed);
        }
      } catch {
        // beschädigter Eintrag -> initial
      }
    };
    read();
    // Cross-Tab-Sync: 'storage' feuert in anderen Tabs.
    window.addEventListener('storage', read);
    return () => window.removeEventListener('storage', read);
  }, [key, validate]);

  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Quota-Fehler ignorieren
      }
    },
    [key],
  );

  return [value, set];
}
