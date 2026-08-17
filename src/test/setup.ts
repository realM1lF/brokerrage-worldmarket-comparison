/**
 * Vitest-Setup.
 *
 * - React 19: `act()` aus 'react' braucht die IS_REACT_ACT_ENVIRONMENT-Kennung.
 * - Node ≥ 22 (Webstorage): Node liefert EIGENE localStorage-Globals, die ohne
 *   `--localstorage-file` methodenlos sind. In der vitest-jsdom-Umgebung
 *   ueberschreiben diese kaputten Instanzen die funktionierenden jsdom-
 *   Instanzen. Fix: funktionierende In-Memory-Implementierung installieren.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof window !== 'undefined' && typeof localStorage?.getItem !== 'function') {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: key => (store.has(key) ? store.get(key)! : null),
    key: index => Array.from(store.keys())[index] ?? null,
    removeItem: key => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
}
