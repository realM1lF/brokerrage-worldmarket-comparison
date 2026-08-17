import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resetDbConnection } from '@/lib/db/connection';

function tempDb(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'finance-db-'));
  return path.join(dir, 'finance.db');
}

describe('GET/POST /api/depots', () => {
  let dbFile = '';

  beforeEach(() => {
    dbFile = tempDb();
    process.env.FINANCE_DB_PATH = dbFile;
    resetDbConnection();
  });

  afterEach(() => {
    resetDbConnection();
    delete process.env.FINANCE_DB_PATH;
    try {
      rmSync(path.dirname(dbFile), { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('liefert beim ersten GET das geseedete "Mein Depot"', async () => {
    const { GET } = await import('@/app/api/depots/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.depots).toHaveLength(1);
    expect(json.depots[0].name).toBe('Mein Depot');
    expect(json.activeId).toBe(json.depots[0].id);
    expect(json.holdings).toHaveLength(6);
    expect(json.holdings[0]).toEqual({
      isin: 'IE00B4L5Y983',
      amountEur: 6000,
      monthlyEur: null,
    });
  });

  it('legt per POST ein neues Depot an und macht es aktiv', async () => {
    const { GET, POST } = await import('@/app/api/depots/route');
    await GET();
    const res = await POST(
      new Request('http://localhost/api/depots', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Zweitdepot' }),
      }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.depots).toHaveLength(2);
    expect(json.depots.map((d: { name: string }) => d.name)).toContain('Zweitdepot');
    const created = json.depots.find((d: { name: string }) => d.name === 'Zweitdepot');
    expect(json.activeId).toBe(created.id);
    expect(json.holdings).toEqual([]);
  });
});
