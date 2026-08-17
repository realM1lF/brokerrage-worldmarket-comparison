import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/connection';
import { getSession, replaceHoldings, type Holding } from '@/lib/db/store';
import { depotErrorResponse } from '@/lib/db/http';

export const runtime = 'nodejs';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const depotId = Number(id);
    if (!Number.isInteger(depotId) || depotId <= 0) {
      throw new Error(`Depot ${id} nicht gefunden`);
    }
    const body = (await request.json()) as { holdings?: unknown };
    if (!Array.isArray(body.holdings)) throw new Error('holdings fehlt');
    const holdings: Holding[] = body.holdings.map(row => {
      if (!row || typeof row !== 'object') throw new Error('Ungültiges Holding');
      const h = row as Record<string, unknown>;
      if (typeof h.isin !== 'string') throw new Error('ISIN fehlt');
      if (typeof h.amountEur !== 'number') throw new Error(`Ungültiger Betrag für ${h.isin}`);
      const monthly =
        h.monthlyEur === null || h.monthlyEur === undefined
          ? null
          : typeof h.monthlyEur === 'number'
            ? h.monthlyEur
            : null;
      return { isin: h.isin, amountEur: h.amountEur, monthlyEur: monthly };
    });
    const db = getDb();
    replaceHoldings(db, depotId, holdings);
    return NextResponse.json(getSession(db));
  } catch (err) {
    return depotErrorResponse(err);
  }
}
