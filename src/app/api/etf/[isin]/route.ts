import { NextResponse } from 'next/server';
import { fetchExtraEtfData, ExtraEtfError } from '@/lib/etf/extraetf';
import { cacheGet, cacheSet } from '@/lib/etf/cache';
import type { EtfData } from '@/lib/etf/types';

const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{10}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ isin: string }> },
) {
  const { isin } = await params;
  const normalized = isin.trim().toUpperCase();

  if (!ISIN_PATTERN.test(normalized)) {
    return NextResponse.json(
      { error: `Ungültige ISIN: ${isin}` },
      { status: 400 },
    );
  }

  const cached = await cacheGet(normalized);
  if (cached) {
    return NextResponse.json(
      { isin: normalized, source: 'cache', fetchedAt: cached.storedAt, data: cached.data },
      { headers: { 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
    );
  }

  try {
    const data: EtfData = await fetchExtraEtfData(normalized);
    await cacheSet(normalized, data);
    return NextResponse.json(
      { isin: normalized, source: 'live', fetchedAt: Date.now(), data },
      { headers: { 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
    );
  } catch (err) {
    if (err instanceof ExtraEtfError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`ETF-Abruf fehlgeschlagen (${normalized}):`, err);
    return NextResponse.json(
      { error: `Abruf fehlgeschlagen: ${message}` },
      { status: 502 },
    );
  }
}
