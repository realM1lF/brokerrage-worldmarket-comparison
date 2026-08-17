'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EtfData } from '@/lib/etf/types';
import { CANDIDATE_ETFS } from '@/data/candidates';
import { withData, type CandidateWithData } from '@/lib/optimizer/candidates';
import { usesCatalog, type Universe } from '@/lib/db/types';

export type { Universe };
export { usesCatalog };

/**
 * Stufe-B-Kandidaten über API laden + Mount-Autoload.
 *
 * Bug 1 (2026-08-17): universe='new' persistiert im localStorage, nach
 * Reload waren die Kandidaten null — der Toggle zeigte "Mit neuen ETFs",
 * gerechnet wurde aber ohne Kandidaten. Jetzt lädt der Hook die Kandidaten
 * beim Mount nach, wenn universe='new' ist; schlägt das Laden fehl, fällt
 * der Toggle auf 'mine' zurück. UI zeigt nie "Mit neuen ETFs" ohne
 * geladene Kandidaten.
 *
 * Laufende Loads werden über eine Promise-Referenz geteilt: parallele
 * Aufrufe (Doppel-Klick, StrictMode) hängen sich an denselben Lauf an.
 */
export function useUniverseCandidates(
  universe: Universe,
  setUniverse: (u: Universe) => void,
  onFailed: (message: string) => void,
): {
  candidates: CandidateWithData[] | null;
  candidatesLoading: boolean;
  loadCandidates: () => Promise<CandidateWithData[] | null>;
} {
  const [candidates, setCandidates] = useState<CandidateWithData[] | null>(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const inFlightRef = useRef<Promise<CandidateWithData[] | null> | null>(null);
  const missingRetryRef = useRef(false);
  // Callbacks immer aktuell halten (Page re-rendert oft).
  // Ref-Update im Effect: React-19-Regel 'react-hooks/refs' verbietet
  // Ref-Zugriffe waehrend des Renders.
  const onFailedRef = useRef(onFailed);
  const setUniverseRef = useRef(setUniverse);
  useEffect(() => {
    onFailedRef.current = onFailed;
    setUniverseRef.current = setUniverse;
  });

  const loadCandidates = useCallback((): Promise<CandidateWithData[] | null> => {
    if (inFlightRef.current) return inFlightRef.current;
    const run = (async () => {
      setCandidatesLoading(true);
      try {
        const res = await fetch('/api/candidates', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) {
          const errMsg = (json.error as string) ?? `Fehler ${res.status}`;
          throw new Error(errMsg);
        }
        const dataByIsin = new Map<string, EtfData>(
          (json.candidates as { isin: string; data: EtfData }[]).map(c => [c.isin, c.data]),
        );
        const loaded = withData(CANDIDATE_ETFS, dataByIsin);
        // API hat 0 brauchbare Kandidaten geliefert → wie Fehler behandeln,
        // sonst zeigt der Toggle "Mit neuen ETFs" ohne Kandidaten (Stale).
        if (loaded.length === 0) throw new Error('Keine Kandidaten verfügbar');
        setCandidates(loaded);
        return loaded;
      } catch (err) {
        onFailedRef.current(
          `Neue ETFs konnten nicht geladen werden: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      } finally {
        setCandidatesLoading(false);
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = run;
    return run;
  }, []);

  // Mount: Katalog-Universum aus localStorage, aber noch keine Kandidaten
  // (Bug 1 — automatisches Nachladen nach Reload).
  useEffect(() => {
    if (!usesCatalog(universe) || candidates !== null) return;
    let cancelled = false;
    void (async () => {
      const loaded = await loadCandidates();
      if (cancelled) return;
      if (loaded === null) {
        // Fehler beim Mount-Load: Toggle zurücksetzen, keine Analyse
        // (es gibt noch keine Ergebnisse, die aktualisiert werden könnten).
        setUniverseRef.current('mine');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [universe, candidates, loadCandidates]);

  // Katalog um eine ISIN gewachsen, aber der letzte Fetch kennt sie nicht
  // (HTTP-Cache oder Session vor dem Katalog-Update). Ein zweiter no-store
  // Fetch, danach nicht nochmal.
  useEffect(() => {
    if (!usesCatalog(universe) || candidates === null || missingRetryRef.current) return;
    const have = new Set(candidates.map(c => c.isin));
    if (!CANDIDATE_ETFS.some(c => !have.has(c.isin))) return;
    missingRetryRef.current = true;
    void loadCandidates();
  }, [universe, candidates, loadCandidates]);

  return { candidates, candidatesLoading, loadCandidates };
}
