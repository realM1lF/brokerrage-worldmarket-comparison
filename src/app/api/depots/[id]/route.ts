import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/connection';
import {
  deleteDepot,
  getSession,
  renameDepot,
  setActiveDepot,
  updatePrefs,
  type DepotPrefs,
} from '@/lib/db/store';
import { depotErrorResponse } from '@/lib/db/http';

export const runtime = 'nodejs';

async function idFrom(params: Promise<{ id: string }>): Promise<number> {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Depot ${id} nicht gefunden`);
  return n;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = await idFrom(params);
    const body = (await request.json()) as {
      name?: unknown;
      activate?: unknown;
      model?: unknown;
      view?: unknown;
      savingsMode?: unknown;
      universe?: unknown;
      maxTer?: unknown;
    };
    const db = getDb();
    if (typeof body.name === 'string') renameDepot(db, id, body.name);
    const prefs: Partial<DepotPrefs> = {};
    if (
      body.model === 'marketcap' || body.model === 'gdp' || body.model === 'ppp' ||
      body.model === 'blend' || body.model === 'pillars'
    ) {
      prefs.model = body.model;
    }
    if (body.view === 'bestand' || body.view === 'sparplan') prefs.view = body.view;
    if (
      body.savingsMode === 'benchmark' ||
      body.savingsMode === 'converge' ||
      body.savingsMode === 'bestDepot'
    ) {
      prefs.savingsMode = body.savingsMode;
    }
    if (body.universe === 'mine' || body.universe === 'new' || body.universe === 'few') {
      prefs.universe = body.universe;
    }
    if (body.maxTer === null) prefs.maxTer = null;
    if (body.maxTer === 0.2) prefs.maxTer = 0.2;
    if (Object.keys(prefs).length > 0) updatePrefs(db, id, prefs);
    if (body.activate === true) setActiveDepot(db, id);
    return NextResponse.json(getSession(db));
  } catch (err) {
    return depotErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = await idFrom(params);
    const db = getDb();
    deleteDepot(db, id);
    return NextResponse.json(getSession(db));
  } catch (err) {
    return depotErrorResponse(err);
  }
}
