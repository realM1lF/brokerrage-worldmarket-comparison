import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/connection';
import { createDepot, getSession, setActiveDepot } from '@/lib/db/store';
import { depotErrorResponse } from '@/lib/db/http';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json(getSession(getDb()));
  } catch (err) {
    return depotErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: unknown };
    const name = typeof body.name === 'string' ? body.name : '';
    const db = getDb();
    const depot = createDepot(db, name);
    setActiveDepot(db, depot.id);
    return NextResponse.json(getSession(db), { status: 201 });
  } catch (err) {
    return depotErrorResponse(err);
  }
}
