// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useLocalStorageState } from './useLocalStorageState';

/* =====================================================================
 * Bug 3 (2026-08-17, Hydration-Race): Schreibt der User, BEVOR der erste
 * localStorage-Read im Effect passiert, wurde der frische Wert bisher vom
 * alten localStorage-Stand überschrieben. Fix: User-Write vor dem ersten
 * Read gewinnt; Cross-Tab-Reads danach bleiben unberührt.
 * ===================================================================== */

const KEY = 'test.finance.hook.v1';

type Item = { id: string };

const isItems = (v: unknown): v is Item[] =>
  Array.isArray(v) &&
  v.every(
    x =>
      x !== null &&
      typeof x === 'object' &&
      typeof (x as { id?: unknown }).id === 'string',
  );

interface Harness<T> {
  /** Live-Zugriff: der Getter liefert den Zustand des LETZTEN Renders. */
  current: T;
  root: Root;
}

/** Hook rendern; Effekte werden via act geflusht. */
function renderHook<T>(render: () => T): Harness<T> {
  let current!: T;
  function Host() {
    current = render();
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

beforeEach(() => {
  localStorage.clear();
});

describe('useLocalStorageState', () => {
  it('leerer localStorage -> initial', () => {
    const h = renderHook(() => useLocalStorageState<Item[]>(KEY, [], isItems));
    expect(h.current[0]).toEqual([]);
    h.root.unmount();
  });

  it('gespeicherter Wert wird beim Mount gelesen', () => {
    localStorage.setItem(KEY, JSON.stringify([{ id: 'a' }, { id: 'b' }]));
    const h = renderHook(() => useLocalStorageState<Item[]>(KEY, [], isItems));
    expect(h.current[0]).toEqual([{ id: 'a' }, { id: 'b' }]);
    h.root.unmount();
  });

  it('ungültiger Eintrag -> initial (kein Crash)', () => {
    localStorage.setItem(KEY, JSON.stringify({ kaputt: true }));
    const h = renderHook(() => useLocalStorageState<Item[]>(KEY, [], isItems));
    expect(h.current[0]).toEqual([]);
    h.root.unmount();
  });

  it('korrupter JSON-Eintrag -> initial (kein Crash)', () => {
    localStorage.setItem(KEY, '{nix');
    const h = renderHook(() => useLocalStorageState<Item[]>(KEY, [], isItems));
    expect(h.current[0]).toEqual([]);
    h.root.unmount();
  });

  it('set() schreibt nach localStorage und aktualisiert den State', () => {
    const h = renderHook(() => useLocalStorageState<Item[]>(KEY, [], isItems));
    act(() => {
      h.current[1]([{ id: 'neu' }]);
    });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([{ id: 'neu' }]);
    expect(h.current[0]).toEqual([{ id: 'neu' }]);
    h.root.unmount();
  });

  it('Cross-Tab-Sync: storage-Event aktualisiert den State nach dem ersten Read', () => {
    const h = renderHook(() => useLocalStorageState<Item[]>(KEY, [], isItems));
    expect(h.current[0]).toEqual([]);
    const stored = JSON.stringify([{ id: 'anderer-tab' }]);
    localStorage.setItem(KEY, stored);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: stored }));
    });
    expect(h.current[0]).toEqual([{ id: 'anderer-tab' }]);
    h.root.unmount();
  });

  it('Bug 3: User-Write vor dem Hydration-Read gewinnt (Add direkt nach Page-Load)', async () => {
    // localStorage hat einen ALTEN Stand; der Hydration-Read soll ihn
    // NICHT zurueckholen, weil der User schon selbst geschrieben hat.
    localStorage.setItem(KEY, JSON.stringify([{ id: 'alter-stand' }]));
    let current!: [Item[], (next: Item[]) => void];
    function Host() {
      current = useLocalStorageState<Item[]>(KEY, [], isItems);
      return null;
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    // Render synchron committen, passive Effekte (Hydration-Read) aber
    // noch NICHT ausfuehren — genau das Fenster zwischen Page-Load und
    // dem ersten localStorage-Read.
    flushSync(() => {
      root.render(<Host />);
    });
    expect(current[0]).toEqual([]); // initial, Read steht noch aus
    // User schreibt, BEVOR der Read passiert.
    act(() => {
      current[1]([{ id: 'frischer-user-write' }]);
    });
    // act flusht jetzt die pending Effekte: der Hydration-Read sieht den
    // User-Write und darf den alten Stand NICHT zurueckschreiben.
    expect(current[0]).toEqual([{ id: 'frischer-user-write' }]);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([
      { id: 'frischer-user-write' },
    ]);
    // Und: der alte Stand darf nicht zurueckkommen.
    await act(async () => {
      await new Promise(res => setTimeout(res, 0));
    });
    expect(current[0]).toEqual([{ id: 'frischer-user-write' }]);
    root.unmount();
  });
});
