import { NextResponse } from 'next/server';

export function depotErrorResponse(err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : String(err);
  const status = /nicht gefunden/i.test(message) ? 404 : 400;
  return NextResponse.json({ error: message }, { status });
}
