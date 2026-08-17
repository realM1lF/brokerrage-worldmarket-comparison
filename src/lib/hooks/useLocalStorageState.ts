'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Zustand über localStorage. Quelle der Wahrheit = React-State,
 * gespiegelt in localStorage. Hydrationssicher: Server und erster
 * Client-Render starten mit `initial`, der Store wird erst nach dem
 * Mount gelesen (Server kennt kein localStorage).
 *
 * Bug 3 (2026-08-17, Hydration-Race): Schreibt der User, BEVOR der erste
 * Read aus localStorage passiert (z.B. schnelles Add direkt nach dem
 * Laden), gewinnt der User-Write: der erste Read wird dann ignoriert.
 * Sonst überschrieb der alte localStorage-Stand den frischen Wert.
 * Cross-Tab-Reads ('storage'-Event) nach dem ersten Read bleiben unberührt.
 */
export function useLocalStorageState<T>(
  key: string,
  initial: T,
  validate: (v: unknown) => v is T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(initial);
  const firstReadDone = useRef(false);
  const userWrote = useRef(false);

  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem(key);
        if (raw !== null) {
          const parsed: unknown = JSON.parse(raw);
          if (validate(parsed) && (firstReadDone.current || !userWrote.current)) {
            setValue(parsed);
          }
        }
      } catch {
        // beschädigter Eintrag -> initial
      }
    };
    read();
    firstReadDone.current = true;
    // Cross-Tab-Sync: 'storage' feuert in anderen Tabs.
    window.addEventListener('storage', read);
    return () => window.removeEventListener('storage', read);
  }, [key, validate]);

  const set = useCallback(
    (next: T) => {
      userWrote.current = true;
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
