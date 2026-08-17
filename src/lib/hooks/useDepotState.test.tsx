// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { EtfData } from '@/lib/etf/types';
import type { DepotSession } from '@/lib/db/types';
import { useDepotState } from './useDepotState';
import type { PortfolioEtf } from '@/lib/optimizer/optimize';

const WORLD = 'IE00B4L5Y983';

const loadFixture = (isin: string): EtfData =>
  JSON.parse(
    readFileSync(path.join(__dirname, '../optimizer/__fixtures__', `${isin}.json`), 'utf-8'),
  );

const worldData = loadFixture(WORLD);

const session: DepotSession = {
  depots: [
    {
      id: 1,
      name: 'Mein Depot',
      model: 'marketcap',
      view: 'bestand',
      savingsMode: 'benchmark',
      universe: 'mine',
    },
  ],
  activeId: 1,
  holdings: [{ isin: WORLD, amountEur: 6000, monthlyEur: null }],
};

const fakeRes = (ok: boolean, payload: unknown, status = ok ? 200 : 500) => ({
  ok,
  status,
  json: async () => payload,
});

interface Harness {
  current: ReturnType<typeof useDepotState>;
  root: Root;
}

function renderDepot(): Harness {
  let current!: ReturnType<typeof useDepotState>;
  function Host() {
    current = useDepotState();
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Host />);
  });
  return { get current() { return current; }, root };
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise(res => setTimeout(res, 0));
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useDepotState', () => {
  it('lädt Session und hydriert ETF-Daten, ohne vorher leere Holdings zu speichern', async () => {
    const puts: unknown[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url === '/api/depots' && method === 'GET') return fakeRes(true, session);
      if (url === `/api/etf/${WORLD}` && method === 'GET') {
        return fakeRes(true, { data: worldData });
      }
      if (url === '/api/depots/1/holdings' && method === 'PUT') {
        puts.push(init?.body);
        return fakeRes(true, session);
      }
      throw new Error(`unerwarteter Fetch: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const h = renderDepot();
    await flush();
    await flush();

    expect(h.current.ready).toBe(true);
    expect(h.current.portfolio).toHaveLength(1);
    expect(h.current.portfolio[0].isin).toBe(WORLD);
    expect(h.current.portfolio[0].amountEur).toBe(6000);
    expect(h.current.portfolio[0].data.profile.name).toContain('MSCI World');
    expect(puts).toHaveLength(0);
    h.root.unmount();
  });

  it('speichert Holdings nach setPortfolio, sobald ready', async () => {
    const puts: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url === '/api/depots' && method === 'GET') return fakeRes(true, session);
      if (url.startsWith('/api/etf/') && method === 'GET') {
        return fakeRes(true, { data: worldData });
      }
      if (url === '/api/depots/1/holdings' && method === 'PUT') {
        puts.push(String(init?.body ?? ''));
        return fakeRes(true, session);
      }
      throw new Error(`unerwarteter Fetch: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const h = renderDepot();
    await flush();
    await flush();
    expect(h.current.ready).toBe(true);

    const next: PortfolioEtf[] = [
      ...h.current.portfolio,
      {
        isin: 'IE00B4ND3602',
        amountEur: 938,
        monthlyEur: 25,
        data: worldData,
      },
    ];
    act(() => {
      h.current.setPortfolio(next);
    });
    await flush();

    expect(puts).toHaveLength(1);
    const body = JSON.parse(puts[0]) as { holdings: { isin: string; amountEur: number; monthlyEur: number | null }[] };
    expect(body.holdings).toEqual([
      { isin: WORLD, amountEur: 6000, monthlyEur: null },
      { isin: 'IE00B4ND3602', amountEur: 938, monthlyEur: 25 },
    ]);
    h.root.unmount();
  });

  it('SSR und Hydration: loading-Controls sind disabled, keine Hydration-Warnung', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeRes(true, session)),
    );

    let ssrHydrated: boolean | undefined;
    function Probe() {
      const s = useDepotState();
      if (ssrHydrated === undefined) ssrHydrated = s.hydrated;
      return (
        <select
          id="depot-select"
          value={s.activeId ?? ''}
          disabled={s.hydrated ? s.loading || s.depots.length === 0 : undefined}
          onChange={() => undefined}
        />
      );
    }

    const html = renderToString(<Probe />);
    expect(ssrHydrated).toBe(false);
    // SSR darf loading-disabled nicht setzen: Next liefert die Attribute
    // sonst als null, der Client hydriert mit true → Mismatch.
    expect(html).not.toMatch(/disabled/);

    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;

    const hydrationErrors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      const text = args.map(String).join(' ');
      if (/hydrat/i.test(text) || /did not match/i.test(text)) hydrationErrors.push(text);
    });

    act(() => {
      hydrateRoot(container, <Probe />);
    });

    spy.mockRestore();
    expect(hydrationErrors).toEqual([]);
    container.remove();
  });
});
