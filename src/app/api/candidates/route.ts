import { NextResponse } from 'next/server';
import { fetchExtraEtfData, ExtraEtfError } from '@/lib/etf/extraetf';
import { cacheGet, cacheSet } from '@/lib/etf/cache';
import { readCatalogFixture } from '@/lib/etf/catalog-fallback';
import { CANDIDATE_ETFS } from '@/data/candidates';
import type { EtfData } from '@/lib/etf/types';

/**
 * GET /api/candidates — Exposure-Daten aller Stufe-B-Kandidaten.
 * Gleicher Cache (7 Tage) wie /api/etf/[isin]. Einzelne Kandidaten können
 * fehlschlagen; dann Fixture, sonst failed[]. HTTP nicht stundenlang cachen:
 * ein neuer Katalog-Eintrag muss sofort sichtbar sein.
 */
export async function GET() {
  const candidates: {
    isin: string;
    name: string;
    role: string;
    ter: number;
    index: string;
    source: 'cache' | 'live' | 'fixture';
    data: EtfData;
  }[] = [];
  const failed: { isin: string; error: string }[] = [];

  for (const c of CANDIDATE_ETFS) {
    try {
      const cached = await cacheGet(c.isin);
      if (cached) {
        candidates.push({ ...c, source: 'cache', data: cached.data });
        continue;
      }
      const data = await fetchExtraEtfData(c.isin);
      await cacheSet(c.isin, data);
      candidates.push({ ...c, source: 'live', data });
    } catch (err) {
      const fixture = readCatalogFixture(c.isin);
      if (fixture) {
        await cacheSet(c.isin, fixture);
        candidates.push({ ...c, source: 'fixture', data: fixture });
        continue;
      }
      const message =
        err instanceof ExtraEtfError || err instanceof Error ? err.message : String(err);
      failed.push({ isin: c.isin, error: message });
    }
  }

  return NextResponse.json(
    { candidates, failed },
    { headers: { 'cache-control': 'no-store' } },
  );
}
