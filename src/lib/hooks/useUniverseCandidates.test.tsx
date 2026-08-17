// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { EtfData } from '@/lib/etf/types';
import { useUniverseCandidates, type Universe } from './useUniverseCandidates';

/* =====================================================================
 * Bug 1 (2026-08-17, Universe-Toggle Stale-State): universe='new' aus
 * localStorage, aber Kandidaten null nach Reload -> der Toggle zeigte
 * "Mit neuen ETFs", gerechnet wurde ohne Kandidaten. Fix: Kandidaten
 * beim Mount laden, wenn universe='new'; Ladefehler -> Toggle zurück
 * auf 'mine'. UI zeigt nie "Mit neuen ETFs" ohne geladene Kandidaten.
 * ===================================================================== */

const SPDR = 'IE00B3YLTY66';

const loadFixture = (isin: string): EtfData =>
  JSON.parse(
    readFileSync(path.join(__dirname, '../optimizer/__fixtures__', `${isin}.json`), 'utf-8'),
  );

const fakeRes = (ok: boolean, payload: unknown) => ({
  ok,
  status: ok ? 200 : 502,
  json: async () => payload,
});

/** fetch-Mock für GET /api/candidates; URL wird mitgeprüft. */
const mockCandidatesFetch = (payload: unknown, ok = true) =>
  vi.fn(async (url: string) => {
    if (url !== '/api/candidates') throw new Error(`unerwarteter Fetch: ${url}`);
    return fakeRes(ok, payload);
  });

interface Harness {
  current: ReturnType<typeof useUniverseCandidates>;
  rerender: () => void;
  root: Root;
}

function renderUniverse(
  props: {
    universe: Universe;
    setUniverse: (u: Universe) => void;
    onFailed: (message: string) => void;
  },
): Harness {
  let current!: ReturnType<typeof useUniverseCandidates>;
  function Host() {
    current = useUniverseCandidates(props.universe, props.setUniverse, props.onFailed);
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Host />);
  });
  return {
    get current() { return current; },
    rerender: () => {
      act(() => {
        root.render(<Host />);
      });
    },
    root,
  };
}

/** Pending Microtasks + Effekte flushen. */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise(res => setTimeout(res, 0));
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useUniverseCandidates (Bug 1: Mount-Autoload)', () => {
  it('universe="mine": kein Fetch, candidates null', async () => {
    const fetchMock = mockCandidatesFetch({ candidates: [] });
    vi.stubGlobal('fetch', fetchMock);
    const setUniverse = vi.fn();
    const onFailed = vi.fn();
    const h = renderUniverse({ universe: 'mine', setUniverse, onFailed });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.current.candidates).toBeNull();
    expect(h.current.candidatesLoading).toBe(false);
    expect(setUniverse).not.toHaveBeenCalled();
    h.root.unmount();
  });

  it('universe="few" beim Mount: Kandidaten werden automatisch geladen', async () => {
    const fetchMock = mockCandidatesFetch({ candidates: [{ isin: SPDR, data: loadFixture(SPDR) }] });
    vi.stubGlobal('fetch', fetchMock);
    const setUniverse = vi.fn();
    const onFailed = vi.fn();
    const h = renderUniverse({ universe: 'few', setUniverse, onFailed });
    await flush();
    expect(fetchMock).toHaveBeenCalled();
    expect(h.current.candidates?.map(c => c.isin)).toEqual([SPDR]);
    expect(setUniverse).not.toHaveBeenCalled();
    h.root.unmount();
  });

  it('universe="new" beim Mount: Kandidaten werden automatisch geladen', async () => {
    const fetchMock = mockCandidatesFetch({ candidates: [{ isin: SPDR, data: loadFixture(SPDR) }] });
    vi.stubGlobal('fetch', fetchMock);
    const setUniverse = vi.fn();
    const onFailed = vi.fn();
    const h = renderUniverse({ universe: 'new', setUniverse, onFailed });
    await flush();
    // Payload hat nur SPDR, Katalog hat mehr → ein zweiter no-store Fetch.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(h.current.candidates?.map(c => c.isin)).toEqual([SPDR]);
    expect(h.current.candidatesLoading).toBe(false);
    expect(setUniverse).not.toHaveBeenCalled(); // Toggle bleibt korrekt auf 'new'
    h.root.unmount();
  });

  it('universe="new" + Ladefehler: Toggle fällt auf "mine" zurück, onFailed feuert', async () => {
    const fetchMock = mockCandidatesFetch({ error: 'Kaputt' }, false);
    vi.stubGlobal('fetch', fetchMock);
    const setUniverse = vi.fn();
    const onFailed = vi.fn();
    const h = renderUniverse({ universe: 'new', setUniverse, onFailed });
    await flush();
    expect(setUniverse).toHaveBeenCalledWith('mine');
    expect(onFailed).toHaveBeenCalledWith(expect.stringContaining('Kaputt'));
    expect(h.current.candidates).toBeNull();
    h.root.unmount();
  });

  it('universe="new" + leere Kandidatenliste: wie Fehler behandelt (Toggle zurück auf "mine")', async () => {
    const fetchMock = mockCandidatesFetch({ candidates: [] });
    vi.stubGlobal('fetch', fetchMock);
    const setUniverse = vi.fn();
    const onFailed = vi.fn();
    const h = renderUniverse({ universe: 'new', setUniverse, onFailed });
    await flush();
    expect(setUniverse).toHaveBeenCalledWith('mine');
    expect(onFailed).toHaveBeenCalled();
    h.root.unmount();
  });
});

describe('useUniverseCandidates (Bug 1: Load-Verhalten)', () => {
  it('parallele loadCandidates-Aufrufe teilen sich einen Fetch (Doppel-Klick)', async () => {
    let resolveFetch!: (v: unknown) => void;
    const fetchMock = vi.fn(
      (url: string) =>
        new Promise(res => {
          if (url !== '/api/candidates') throw new Error(`unerwarteter Fetch: ${url}`);
          resolveFetch = res;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const h = renderUniverse({ universe: 'mine', setUniverse: vi.fn(), onFailed: vi.fn() });
    const p1 = h.current.loadCandidates();
    const p2 = h.current.loadCandidates();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(fakeRes(true, { candidates: [{ isin: SPDR, data: loadFixture(SPDR) }] }));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(r2);
    expect(r1?.map(c => c.isin)).toEqual([SPDR]);
    await flush();
    expect(h.current.candidates?.map(c => c.isin)).toEqual([SPDR]);
    h.root.unmount();
  });

  it('erfolgreicher Load: candidates gesetzt, kein onFailed, kein setUniverse', async () => {
    const fetchMock = mockCandidatesFetch({ candidates: [{ isin: SPDR, data: loadFixture(SPDR) }] });
    vi.stubGlobal('fetch', fetchMock);
    const setUniverse = vi.fn();
    const onFailed = vi.fn();
    const h = renderUniverse({ universe: 'mine', setUniverse, onFailed });
    const loaded = await h.current.loadCandidates();
    expect(loaded?.map(c => c.isin)).toEqual([SPDR]);
    expect(onFailed).not.toHaveBeenCalled();
    expect(setUniverse).not.toHaveBeenCalled();
    h.root.unmount();
  });

  it('Ladefehler: null zurück, onFailed mit Meldung', async () => {
    const fetchMock = mockCandidatesFetch({ error: 'Timeout' }, false);
    vi.stubGlobal('fetch', fetchMock);
    const onFailed = vi.fn();
    const h = renderUniverse({ universe: 'mine', setUniverse: vi.fn(), onFailed });
    const loaded = await h.current.loadCandidates();
    expect(loaded).toBeNull();
    expect(onFailed).toHaveBeenCalledWith(expect.stringContaining('Timeout'));
    h.root.unmount();
  });
});
