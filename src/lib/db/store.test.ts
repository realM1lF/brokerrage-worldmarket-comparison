import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  createDepot,
  deleteDepot,
  getActiveDepot,
  listDepots,
  migrate,
  renameDepot,
  replaceHoldings,
  seedIfEmpty,
  setActiveDepot,
  updatePrefs,
} from './store';

function mem(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  return db;
}

describe('seedIfEmpty', () => {
  it('legt "Mein Depot" mit den sechs RIn-Positionen an und setzt es aktiv', () => {
    const db = mem();
    seedIfEmpty(db);

    const depots = listDepots(db);
    expect(depots).toHaveLength(1);
    expect(depots[0].name).toBe('Mein Depot');
    expect(depots[0].savingsMode).toBe('benchmark');

    const active = getActiveDepot(db);
    expect(active).not.toBeNull();
    expect(active!.id).toBe(depots[0].id);
    expect(active!.holdings).toEqual([
      { isin: 'IE00B4L5Y983', amountEur: 6000, monthlyEur: null },
      { isin: 'IE00B4ND3602', amountEur: 938, monthlyEur: 25 },
      { isin: 'IE0003XJA0J9', amountEur: 792, monthlyEur: 150 },
      { isin: 'IE00BTJRMP35', amountEur: 528, monthlyEur: null },
      { isin: 'LU0908500753', amountEur: 399, monthlyEur: 40 },
      { isin: 'IE00BKM4GZ66', amountEur: 373, monthlyEur: 40 },
    ]);
    db.close();
  });

  it('ist no-op, wenn schon ein Depot existiert', () => {
    const db = mem();
    createDepot(db, 'Anderes');
    seedIfEmpty(db);
    expect(listDepots(db).map(d => d.name)).toEqual(['Anderes']);
    db.close();
  });
});

describe('Depots', () => {
  it('legt ein zweites leeres Depot an und kann umschalten', () => {
    const db = mem();
    seedIfEmpty(db);
    const first = getActiveDepot(db)!;
    const second = createDepot(db, 'Sparplan-Test');
    expect(second.name).toBe('Sparplan-Test');
    expect(second.savingsMode).toBe('benchmark');
    expect(listDepots(db)).toHaveLength(2);

    setActiveDepot(db, second.id);
    const active = getActiveDepot(db)!;
    expect(active.id).toBe(second.id);
    expect(active.holdings).toEqual([]);

    setActiveDepot(db, first.id);
    expect(getActiveDepot(db)!.id).toBe(first.id);
    expect(getActiveDepot(db)!.holdings).toHaveLength(6);
    db.close();
  });

  it('benennt ein Depot um', () => {
    const db = mem();
    seedIfEmpty(db);
    const id = listDepots(db)[0].id;
    renameDepot(db, id, 'Haupt');
    expect(listDepots(db)[0].name).toBe('Haupt');
    db.close();
  });

  it('lehnt Löschen des letzten Depots ab', () => {
    const db = mem();
    seedIfEmpty(db);
    const id = listDepots(db)[0].id;
    expect(() => deleteDepot(db, id)).toThrow(/letzte/i);
    expect(listDepots(db)).toHaveLength(1);
    db.close();
  });

  it('löscht ein Depot inkl. Holdings und wechselt das aktive', () => {
    const db = mem();
    seedIfEmpty(db);
    const keep = listDepots(db)[0];
    const extra = createDepot(db, 'Weg');
    replaceHoldings(db, extra.id, [{ isin: 'IE00B4L5Y983', amountEur: 1, monthlyEur: null }]);
    setActiveDepot(db, extra.id);

    deleteDepot(db, extra.id);
    const left = listDepots(db);
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe(keep.id);
    expect(getActiveDepot(db)!.id).toBe(keep.id);
    db.close();
  });

  it('speichert Prefs pro Depot', () => {
    const db = mem();
    seedIfEmpty(db);
    const id = listDepots(db)[0].id;
    updatePrefs(db, id, { model: 'blend', view: 'sparplan', savingsMode: 'benchmark', universe: 'new' });
    const depot = listDepots(db)[0];
    expect(depot.model).toBe('blend');
    expect(depot.view).toBe('sparplan');
    expect(depot.savingsMode).toBe('benchmark');
    expect(depot.universe).toBe('new');
    db.close();
  });

  it('speichert Universum few', () => {
    const db = mem();
    seedIfEmpty(db);
    const id = listDepots(db)[0].id;
    updatePrefs(db, id, { universe: 'few' });
    expect(listDepots(db)[0].universe).toBe('few');
    db.close();
  });

  it('speichert Sparplan-Modus bestDepot', () => {
    const db = mem();
    seedIfEmpty(db);
    const id = listDepots(db)[0].id;
    updatePrefs(db, id, { savingsMode: 'bestDepot' });
    expect(listDepots(db)[0].savingsMode).toBe('bestDepot');
    db.close();
  });
});

describe('Holdings', () => {
  it('ersetzt Holdings atomar (kein Duplikat-ISIN)', () => {
    const db = mem();
    const depot = createDepot(db, 'Leer');
    replaceHoldings(db, depot.id, [
      { isin: 'IE00B4L5Y983', amountEur: 100, monthlyEur: 10 },
      { isin: 'IE00B4ND3602', amountEur: 0, monthlyEur: 25 },
    ]);
    replaceHoldings(db, depot.id, [
      { isin: 'IE00B4L5Y983', amountEur: 200, monthlyEur: null },
    ]);
    expect(getActiveDepot(db)!.holdings).toEqual([
      { isin: 'IE00B4L5Y983', amountEur: 200, monthlyEur: null },
    ]);
    db.close();
  });

  it('lehnt doppelte ISIN in einem Write ab', () => {
    const db = mem();
    const depot = createDepot(db, 'Leer');
    expect(() =>
      replaceHoldings(db, depot.id, [
        { isin: 'IE00B4L5Y983', amountEur: 1, monthlyEur: null },
        { isin: 'IE00B4L5Y983', amountEur: 2, monthlyEur: null },
      ]),
    ).toThrow(/ISIN/i);
    db.close();
  });
});
