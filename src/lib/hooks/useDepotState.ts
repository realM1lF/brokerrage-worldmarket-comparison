'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { EtfData } from '@/lib/etf/types';
import type { PortfolioEtf } from '@/lib/optimizer/optimize';
import type {
  BenchmarkModel,
  Depot,
  DepotSession,
  DepotView,
  Holding,
  SavingsMode,
  Universe,
} from '@/lib/db/types';

const subscribeNoop = () => () => {};

function holdingsFromPortfolio(portfolio: PortfolioEtf[]): Holding[] {
  return portfolio.map(e => ({
    isin: e.isin,
    amountEur: e.amountEur,
    monthlyEur: e.monthlyEur && e.monthlyEur > 0 ? e.monthlyEur : null,
  }));
}

async function hydrateHoldings(holdings: Holding[]): Promise<{
  portfolio: PortfolioEtf[];
  errors: string[];
}> {
  const errors: string[] = [];
  const rows = await Promise.all(
    holdings.map(async (h): Promise<PortfolioEtf | null> => {
      try {
        const res = await fetch(`/api/etf/${h.isin}`);
        const json = (await res.json()) as { data?: EtfData; error?: string };
        if (!res.ok || !json.data) {
          errors.push(json.error ?? h.isin);
          return null;
        }
        return {
          isin: h.isin,
          amountEur: h.amountEur,
          monthlyEur: h.monthlyEur && h.monthlyEur > 0 ? h.monthlyEur : undefined,
          data: json.data,
        };
      } catch (err) {
        errors.push(err instanceof Error ? err.message : h.isin);
        return null;
      }
    }),
  );
  return { portfolio: rows.filter((e): e is PortfolioEtf => e !== null), errors };
}

export function useDepotState(): {
  depots: Depot[];
  activeId: number | null;
  portfolio: PortfolioEtf[];
  setPortfolio: (next: PortfolioEtf[]) => void;
  model: BenchmarkModel;
  setModel: (m: BenchmarkModel) => void;
  view: DepotView;
  setView: (v: DepotView) => void;
  savingsMode: SavingsMode;
  setSavingsMode: (m: SavingsMode) => void;
  universe: Universe;
  setUniverse: (u: Universe) => void;
  hydrated: boolean;
  ready: boolean;
  loading: boolean;
  error: string | null;
  setError: (message: string | null) => void;
  createDepot: (name: string) => Promise<void>;
  switchDepot: (id: number) => Promise<void>;
  deleteActiveDepot: () => Promise<void>;
  renameActiveDepot: (name: string) => Promise<void>;
} {
  const [depots, setDepots] = useState<Depot[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [portfolio, setPortfolioState] = useState<PortfolioEtf[]>([]);
  const [model, setModelState] = useState<BenchmarkModel>('marketcap');
  const [view, setViewState] = useState<DepotView>('bestand');
  const [savingsMode, setSavingsModeState] = useState<SavingsMode>('benchmark');
  const [universe, setUniverseState] = useState<Universe>('mine');
  const [ready, setReady] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** false beim SSR und beim ersten Hydration-Render (getServerSnapshot).
   *  Sonst setzt loading=true disabled, Next liefert die Attribute aber als
   *  null → Hydration-Mismatch. */
  const hydrated = useSyncExternalStore(subscribeNoop, () => true, () => false);

  const readyRef = useRef(false);
  const activeIdRef = useRef<number | null>(null);

  useEffect(() => {
    readyRef.current = ready;
    activeIdRef.current = activeId;
  });

  const applySession = (session: DepotSession) => {
    setDepots(session.depots);
    setActiveId(session.activeId);
    activeIdRef.current = session.activeId;
    const depot = session.depots.find(d => d.id === session.activeId) ?? session.depots[0];
    if (depot) {
      setModelState(depot.model);
      setViewState(depot.view);
      setSavingsModeState(depot.savingsMode);
      setUniverseState(depot.universe);
    }
  };

  const persistHoldings = useCallback((next: PortfolioEtf[]) => {
    const id = activeIdRef.current;
    if (!readyRef.current || id == null) return;
    void fetch(`/api/depots/${id}/holdings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ holdings: holdingsFromPortfolio(next) }),
    }).then(async res => {
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? `Speichern fehlgeschlagen (${res.status})`);
      }
    });
  }, []);

  const persistPrefs = useCallback((patch: Record<string, unknown>) => {
    const id = activeIdRef.current;
    if (!readyRef.current || id == null) return;
    void fetch(`/api/depots/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }).then(async res => {
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? `Speichern fehlgeschlagen (${res.status})`);
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/depots', { cache: 'no-store' });
        const json = (await res.json()) as DepotSession & { error?: string };
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error ?? `Fehler ${res.status}`);
        applySession(json);
        const { portfolio: next, errors } = await hydrateHoldings(json.holdings);
        if (cancelled) return;
        setPortfolioState(next);
        setError(errors.length ? `Einige ETFs konnten nicht geladen werden: ${errors.join(', ')}` : null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) {
          readyRef.current = true;
          setReady(true);
          setFetching(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPortfolio = useCallback(
    (next: PortfolioEtf[]) => {
      setPortfolioState(next);
      persistHoldings(next);
    },
    [persistHoldings],
  );

  const setModel = useCallback(
    (m: BenchmarkModel) => {
      setModelState(m);
      persistPrefs({ model: m });
    },
    [persistPrefs],
  );
  const setView = useCallback(
    (v: DepotView) => {
      setViewState(v);
      persistPrefs({ view: v });
    },
    [persistPrefs],
  );
  const setSavingsMode = useCallback(
    (m: SavingsMode) => {
      setSavingsModeState(m);
      persistPrefs({ savingsMode: m });
    },
    [persistPrefs],
  );
  const setUniverse = useCallback(
    (u: Universe) => {
      setUniverseState(u);
      persistPrefs({ universe: u });
    },
    [persistPrefs],
  );

  const createDepot = useCallback(async (name: string) => {
    readyRef.current = false;
    setReady(false);
    setFetching(true);
    try {
      const res = await fetch('/api/depots', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = (await res.json()) as DepotSession & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Fehler ${res.status}`);
      applySession(json);
      setPortfolioState([]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      readyRef.current = true;
      setReady(true);
      setFetching(false);
    }
  }, []);

  const switchDepot = useCallback(async (id: number) => {
    readyRef.current = false;
    setReady(false);
    setFetching(true);
    try {
      const res = await fetch(`/api/depots/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ activate: true }),
      });
      const json = (await res.json()) as DepotSession & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Fehler ${res.status}`);
      applySession(json);
      const { portfolio: next, errors } = await hydrateHoldings(json.holdings);
      setPortfolioState(next);
      setError(errors.length ? `Einige ETFs konnten nicht geladen werden: ${errors.join(', ')}` : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      readyRef.current = true;
      setReady(true);
      setFetching(false);
    }
  }, []);

  const deleteActiveDepot = useCallback(async () => {
    const id = activeIdRef.current;
    if (id == null) return;
    readyRef.current = false;
    setReady(false);
    setFetching(true);
    try {
      const res = await fetch(`/api/depots/${id}`, { method: 'DELETE' });
      const json = (await res.json()) as DepotSession & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Fehler ${res.status}`);
      applySession(json);
      const { portfolio: next, errors } = await hydrateHoldings(json.holdings);
      setPortfolioState(next);
      setError(errors.length ? `Einige ETFs konnten nicht geladen werden: ${errors.join(', ')}` : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      readyRef.current = true;
      setReady(true);
      setFetching(false);
    }
  }, []);

  const renameActiveDepot = useCallback(async (name: string) => {
    const id = activeIdRef.current;
    if (id == null) return;
    const res = await fetch(`/api/depots/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const json = (await res.json()) as DepotSession & { error?: string };
    if (!res.ok) {
      setError(json.error ?? `Fehler ${res.status}`);
      return;
    }
    applySession(json);
  }, []);

  return {
    depots,
    activeId,
    portfolio,
    setPortfolio,
    model,
    setModel,
    view,
    setView,
    savingsMode,
    setSavingsMode,
    universe,
    setUniverse,
    hydrated,
    ready,
    loading: fetching,
    error,
    setError,
    createDepot,
    switchDepot,
    deleteActiveDepot,
    renameActiveDepot,
  };
}
