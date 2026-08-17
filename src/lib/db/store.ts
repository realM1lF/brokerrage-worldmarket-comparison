import { DatabaseSync } from 'node:sqlite';
import type {
  BenchmarkModel,
  Depot,
  DepotPrefs,
  DepotSnapshot,
  DepotView,
  Holding,
  SavingsMode,
  Universe,
} from './types';

export type {
  BenchmarkModel,
  Depot,
  DepotPrefs,
  DepotSnapshot,
  DepotView,
  Holding,
  SavingsMode,
  Universe,
} from './types';

export const MEIN_DEPOT_NAME = 'Mein Depot';

export const MEIN_DEPOT_HOLDINGS: Holding[] = [
  { isin: 'IE00B4L5Y983', amountEur: 6000, monthlyEur: null },
  { isin: 'IE00B4ND3602', amountEur: 938, monthlyEur: 25 },
  { isin: 'IE0003XJA0J9', amountEur: 792, monthlyEur: 150 },
  { isin: 'IE00BTJRMP35', amountEur: 528, monthlyEur: null },
  { isin: 'LU0908500753', amountEur: 399, monthlyEur: 40 },
  { isin: 'IE00BKM4GZ66', amountEur: 373, monthlyEur: 40 },
];

const ACTIVE_KEY = 'active_depot_id';

const DEFAULT_PREFS: DepotPrefs = {
  model: 'marketcap',
  view: 'bestand',
  savingsMode: 'benchmark',
  universe: 'mine',
  maxTer: 0.2,
};

export function migrate(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS depots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'marketcap',
      view TEXT NOT NULL DEFAULT 'bestand',
      savings_mode TEXT NOT NULL DEFAULT 'benchmark',
      universe TEXT NOT NULL DEFAULT 'mine',
      max_ter REAL
    );
    CREATE TABLE IF NOT EXISTS holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      depot_id INTEGER NOT NULL REFERENCES depots(id) ON DELETE CASCADE,
      isin TEXT NOT NULL,
      amount_eur REAL NOT NULL,
      monthly_eur REAL,
      position INTEGER NOT NULL,
      UNIQUE (depot_id, isin)
    );
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const cols = db.prepare('PRAGMA table_info(depots)').all() as { name: string }[];
  if (!cols.some(c => c.name === 'max_ter')) {
    db.exec('ALTER TABLE depots ADD COLUMN max_ter REAL DEFAULT 0.2');
  }
}

export function seedIfEmpty(db: DatabaseSync): void {
  const count = db.prepare('SELECT COUNT(*) AS n FROM depots').get() as { n: number };
  if (count.n > 0) return;
  const depot = insertDepot(db, MEIN_DEPOT_NAME, DEFAULT_PREFS);
  writeHoldings(db, depot.id, MEIN_DEPOT_HOLDINGS);
  writeMeta(db, ACTIVE_KEY, String(depot.id));
}

export function listDepots(db: DatabaseSync): Depot[] {
  const rows = db.prepare('SELECT * FROM depots ORDER BY id').all();
  return rows.map(mapDepot);
}

export function getActiveDepot(db: DatabaseSync): DepotSnapshot | null {
  const raw = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(ACTIVE_KEY) as
    | { value: string }
    | undefined;
  if (!raw) return null;
  const id = Number(raw.value);
  if (!Number.isInteger(id) || id <= 0) return null;
  const depot = getDepot(db, id);
  if (!depot) return null;
  return { ...depot, holdings: readHoldings(db, id) };
}

export function getSession(db: DatabaseSync): {
  depots: Depot[];
  activeId: number | null;
  holdings: Holding[];
} {
  const active = getActiveDepot(db);
  return {
    depots: listDepots(db),
    activeId: active?.id ?? null,
    holdings: active?.holdings ?? [],
  };
}

export function setActiveDepot(db: DatabaseSync, id: number): void {
  if (!getDepot(db, id)) throw new Error(`Depot ${id} nicht gefunden`);
  writeMeta(db, ACTIVE_KEY, String(id));
}

export function createDepot(db: DatabaseSync, name: string): Depot {
  const trimmed = requireName(name);
  const depot = insertDepot(db, trimmed, DEFAULT_PREFS);
  const active = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(ACTIVE_KEY);
  if (!active) writeMeta(db, ACTIVE_KEY, String(depot.id));
  return depot;
}

export function renameDepot(db: DatabaseSync, id: number, name: string): void {
  if (!getDepot(db, id)) throw new Error(`Depot ${id} nicht gefunden`);
  db.prepare('UPDATE depots SET name = ? WHERE id = ?').run(requireName(name), id);
}

export function deleteDepot(db: DatabaseSync, id: number): void {
  const depots = listDepots(db);
  if (depots.length <= 1) throw new Error('Das letzte Depot kann nicht gelöscht werden');
  if (!depots.some(d => d.id === id)) throw new Error(`Depot ${id} nicht gefunden`);

  const active = getActiveDepot(db);
  db.prepare('DELETE FROM depots WHERE id = ?').run(id);
  if (active?.id === id) {
    const next = listDepots(db)[0];
    writeMeta(db, ACTIVE_KEY, String(next.id));
  }
}

export function updatePrefs(db: DatabaseSync, id: number, prefs: Partial<DepotPrefs>): void {
  const current = getDepot(db, id);
  if (!current) throw new Error(`Depot ${id} nicht gefunden`);
  const next: DepotPrefs = {
    model: prefs.model ?? current.model,
    view: prefs.view ?? current.view,
    savingsMode: prefs.savingsMode ?? current.savingsMode,
    universe: prefs.universe ?? current.universe,
    maxTer: 'maxTer' in prefs ? (prefs.maxTer ?? null) : current.maxTer,
  };
  db.prepare(
    'UPDATE depots SET model = ?, view = ?, savings_mode = ?, universe = ?, max_ter = ? WHERE id = ?',
  ).run(next.model, next.view, next.savingsMode, next.universe, next.maxTer, id);
}

export function replaceHoldings(db: DatabaseSync, depotId: number, holdings: Holding[]): void {
  if (!getDepot(db, depotId)) throw new Error(`Depot ${depotId} nicht gefunden`);
  const seen = new Set<string>();
  const normalized = holdings.map(h => {
    const isin = h.isin.trim().toUpperCase();
    if (!isin) throw new Error('ISIN fehlt');
    if (seen.has(isin)) throw new Error(`Doppelte ISIN: ${isin}`);
    seen.add(isin);
    if (!Number.isFinite(h.amountEur) || h.amountEur < 0) {
      throw new Error(`Ungültiger Betrag für ${isin}`);
    }
    const monthly =
      h.monthlyEur === null || h.monthlyEur === undefined
        ? null
        : h.monthlyEur;
    if (monthly !== null && (!Number.isFinite(monthly) || monthly < 0)) {
      throw new Error(`Ungültige Sparrate für ${isin}`);
    }
    return {
      isin,
      amountEur: h.amountEur,
      monthlyEur: monthly !== null && monthly > 0 ? monthly : null,
    };
  });

  db.exec('BEGIN');
  try {
    writeHoldings(db, depotId, normalized);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function insertDepot(db: DatabaseSync, name: string, prefs: DepotPrefs): Depot {
  const result = db
    .prepare(
      'INSERT INTO depots (name, model, view, savings_mode, universe, max_ter) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(name, prefs.model, prefs.view, prefs.savingsMode, prefs.universe, prefs.maxTer);
  return {
    id: Number(result.lastInsertRowid),
    name,
    ...prefs,
  };
}

function getDepot(db: DatabaseSync, id: number): Depot | null {
  const row = db.prepare('SELECT * FROM depots WHERE id = ?').get(id);
  return row ? mapDepot(row) : null;
}

function readHoldings(db: DatabaseSync, depotId: number): Holding[] {
  const rows = db
    .prepare(
      'SELECT isin, amount_eur, monthly_eur FROM holdings WHERE depot_id = ? ORDER BY position, id',
    )
    .all(depotId);
  return rows.map(r => ({
    isin: String(r.isin),
    amountEur: Number(r.amount_eur),
    monthlyEur: r.monthly_eur === null || r.monthly_eur === undefined ? null : Number(r.monthly_eur),
  }));
}

function writeHoldings(db: DatabaseSync, depotId: number, holdings: Holding[]): void {
  db.prepare('DELETE FROM holdings WHERE depot_id = ?').run(depotId);
  const insert = db.prepare(
    'INSERT INTO holdings (depot_id, isin, amount_eur, monthly_eur, position) VALUES (?, ?, ?, ?, ?)',
  );
  holdings.forEach((h, i) => {
    insert.run(depotId, h.isin, h.amountEur, h.monthlyEur, i);
  });
}

function writeMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value);
}

function mapDepot(row: Record<string, unknown>): Depot {
  return {
    id: Number(row.id),
    name: String(row.name),
    model: row.model as BenchmarkModel,
    view: row.view as DepotView,
    savingsMode: row.savings_mode as SavingsMode,
    universe: row.universe as Universe,
    maxTer: row.max_ter === null || row.max_ter === undefined ? null : Number(row.max_ter),
  };
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Depotname fehlt');
  return trimmed;
}
