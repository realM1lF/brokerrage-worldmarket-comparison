/**
 * Tests für den ETF-Cache (src/lib/etf/cache.ts).
 *
 * Der lokale Datei-Backend-Cache wird gegen ein TEMP-Verzeichnis getestet:
 * process.cwd() wird vor dem dynamischen Modul-Import gemockt, damit
 * `.cache/etf` im Test nicht das echte Dev-Cache-Verzeichnis berührt.
 * Netlify-Umgebungsvariablen werden gestubbt, damit sicher der
 * Datei-Backend-Cache aktiv ist.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { EtfData } from './types';

const DAY_MS = 86_400_000;

let tmpDir: string;
let cache: typeof import('./cache');

function cacheFile(key: string): string {
  return path.join(tmpDir, '.cache', 'etf', `${key}.json`);
}

async function writeEntry(key: string, raw: string): Promise<void> {
  const file = cacheFile(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, raw, 'utf-8');
}

function makeData(isin: string): EtfData {
  return {
    profile: {
      isin,
      name: `${isin} Test`,
      provider: 'Test',
      index: 'Test Index',
      ter: 0.2,
      ongoingCharges: null,
      swapBased: false,
      launchDate: '2020-01-01',
      fundVolumeEur: 1_000_000,
      numberOfHoldings: 100,
    },
    exposures: {
      countries: [{ name: 'USA', value: 100, code: 'US' }],
      sectors: [],
      regions: [],
      msci: [],
      asOfDate: '2026-08-01',
      sums: { countries: 100, sectors: 0, regions: 0 },
    },
  };
}

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'etf-cache-test-'));
  // Netlify-Erkennung deaktivieren → Datei-Backend
  vi.stubEnv('NETLIFY', '');
  vi.stubEnv('NETLIFY_BLOBS_CONTEXT', '');
  vi.stubEnv('NETLIFY_SITE_ID', '');
  // CACHE_DIR wird beim Modul-Import aus process.cwd() gebildet
  vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  vi.resetModules();
  cache = await import('./cache');
});

afterAll(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('NETLIFY', '');
  vi.stubEnv('NETLIFY_BLOBS_CONTEXT', '');
  vi.stubEnv('NETLIFY_SITE_ID', '');
});

describe('cache (Datei-Backend)', () => {
  it('Roundtrip: cacheSet → cacheGet liefert Daten + storedAt zurück', async () => {
    const data = makeData('IE00B4L5Y983');
    const before = Date.now();
    await cache.cacheSet('IE00B4L5Y983', data);
    const entry = await cache.cacheGet('IE00B4L5Y983');
    expect(entry).not.toBeNull();
    expect(entry!.storedAt).toBeGreaterThanOrEqual(before);
    expect(entry!.storedAt).toBeLessThanOrEqual(Date.now());
    expect(entry!.data).toEqual(data);
  });

  it('unbekannter Key → null', async () => {
    expect(await cache.cacheGet('IE00B0UNBEKANNT')).toBeNull();
  });

  it('abgelaufener Eintrag (8 Tage, Default-TTL 7 Tage) → null', async () => {
    const entry = { storedAt: Date.now() - 8 * DAY_MS, data: makeData('IE00OLDTEST01') };
    await writeEntry('IE00OLDTEST01', JSON.stringify(entry));
    expect(await cache.cacheGet('IE00OLDTEST01')).toBeNull();
  });

  it('frischer Eintrag (6 Tage) → Treffer (Default-TTL 7 Tage)', async () => {
    const data = makeData('IE00FRESHTEST1');
    const entry = { storedAt: Date.now() - 6 * DAY_MS, data };
    await writeEntry('IE00FRESHTEST1', JSON.stringify(entry));
    const got = await cache.cacheGet('IE00FRESHTEST1');
    expect(got).not.toBeNull();
    expect(got!.data.profile.isin).toBe('IE00FRESHTEST1');
  });

  it('ETF_CACHE_TTL_HOURS=1: 2 h alter Eintrag → null, 30 min → Treffer', async () => {
    vi.stubEnv('ETF_CACHE_TTL_HOURS', '1');
    await writeEntry(
      'IE00TTLTEST001',
      JSON.stringify({ storedAt: Date.now() - 2 * 3_600_000, data: makeData('IE00TTLTEST001') }),
    );
    await writeEntry(
      'IE00TTLTEST002',
      JSON.stringify({ storedAt: Date.now() - 30 * 60_000, data: makeData('IE00TTLTEST002') }),
    );
    expect(await cache.cacheGet('IE00TTLTEST001')).toBeNull();
    const got = await cache.cacheGet('IE00TTLTEST002');
    expect(got).not.toBeNull();
    expect(got!.data.profile.isin).toBe('IE00TTLTEST002');
  });

  it('ungültige ETF_CACHE_TTL_HOURS (0/abc) → Default-TTL 7 Tage', async () => {
    vi.stubEnv('ETF_CACHE_TTL_HOURS', '0');
    await writeEntry(
      'IE00TTLDEFAUL1',
      JSON.stringify({ storedAt: Date.now() - 2 * DAY_MS, data: makeData('IE00TTLDEFAUL1') }),
    );
    expect(await cache.cacheGet('IE00TTLDEFAUL1')).not.toBeNull();

    vi.stubEnv('ETF_CACHE_TTL_HOURS', 'abc');
    await writeEntry(
      'IE00TTLDEFAUL2',
      JSON.stringify({ storedAt: Date.now() - 8 * DAY_MS, data: makeData('IE00TTLDEFAUL2') }),
    );
    expect(await cache.cacheGet('IE00TTLDEFAUL2')).toBeNull();
  });

  it('korrupte Cache-Datei → null (Fallback live), kein Throw', async () => {
    await writeEntry('IE00KORRUPT001', '{das ist kein JSON');
    await expect(cache.cacheGet('IE00KORRUPT001')).resolves.toBeNull();
  });

  it('Eintrag ohne storedAt → null', async () => {
    await writeEntry('IE00NOSTORED01', JSON.stringify({ data: makeData('IE00NOSTORED01') }));
    expect(await cache.cacheGet('IE00NOSTORED01')).toBeNull();
  });

  it('Eintrag mit storedAt als String statt Zahl → null', async () => {
    await writeEntry(
      'IE00STRSTORED1',
      JSON.stringify({ storedAt: 'gestern', data: makeData('IE00STRSTORED1') }),
    );
    expect(await cache.cacheGet('IE00STRSTORED1')).toBeNull();
  });

  it('Eintrag ohne data → null', async () => {
    await writeEntry('IE00NODATA0001', JSON.stringify({ storedAt: Date.now() }));
    expect(await cache.cacheGet('IE00NODATA0001')).toBeNull();
  });

  it('sanitisiert Keys für den Dateinamen (keine Pfad-Injection)', async () => {
    const evilKey = '../IE00B4L5Y983';
    await cache.cacheSet(evilKey, makeData('IE00B4L5Y983'));
    // Datei liegt im Cache-Verzeichnis unter dem sanitisierten Namen,
    // nicht außerhalb (../ würde sonst tmpDir verlassen; jeder der 3
    // Sonderzeichen ".", ".", "/" wird zu "_")
    const sanitized = '___IE00B4L5Y983.json';
    expect(await cache.cacheGet(evilKey)).not.toBeNull();
    const dir = await fs.readdir(path.join(tmpDir, '.cache', 'etf'));
    expect(dir).toContain(sanitized);
    // Außerhalb des Cache-Verzeichnisses darf nichts gelandet sein
    const top = await fs.readdir(tmpDir);
    expect(top).toEqual(['.cache']);
  });

  it('Cache-Schreibfehler ist nicht fatal (set wirft nicht)', async () => {
    // Verzeichnis unbenutzbar machen: Datei an Stelle des Verzeichnisses
    const cacheDir = path.join(tmpDir, '.cache', 'etf');
    await fs.rm(cacheDir, { recursive: true, force: true });
    await fs.writeFile(cacheDir, 'blockiert', 'utf-8');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(cache.cacheSet('IE00BLOCKED001', makeData('IE00BLOCKED001'))).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    await fs.rm(cacheDir, { force: true });
  });
});
