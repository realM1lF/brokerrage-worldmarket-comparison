import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getBenchmark, benchmarkModels } from '@/lib/benchmark';
import type { BenchmarkModel } from '@/lib/benchmark';
import type { EtfData } from '@/lib/etf/types';
import { isEquityEtf, countryWeights, optimize, type PortfolioEtf } from './optimize';
import { analyzeSavings, proposeSavings, type SavingsEtf } from './savings';
import { suggestAdditionsSavings, withData } from './candidates';
import { CANDIDATE_ETFS } from '@/data/candidates';

/* =====================================================================
 * RIns Sparplan (2026-08): Summe 255 €/Monat, Bestand 9 030 €.
 *   IE00B4L5Y983  MSCI World                0 €/Monat  (Bestand 6 000 €)
 *   IE00B4ND3602  Gold ETC                 25 €/Monat  (Bestand   938 €)
 *   IE0003XJA0J9  Amundi Prime All Country 150 €/Monat (Bestand   792 €)
 *   IE00BTJRMP35  Xtrackers EM              0 €/Monat  (Bestand   528 €)
 *   LU0908500753  Stoxx Europe 600         40 €/Monat  (Bestand   399 €)
 *   IE00BKM4GZ66  EM IMI                   40 €/Monat  (Bestand   373 €)
 * ===================================================================== */

const WORLD = 'IE00B4L5Y983';
const GOLD = 'IE00B4ND3602';
const PRIME = 'IE0003XJA0J9';
const XEM = 'IE00BTJRMP35';
const STOXX = 'LU0908500753';
const EMIMI = 'IE00BKM4GZ66';

const M = 255; // Gesamt-Monatsrate (Anzeige)
const V_EQ = 8092; // Aktien-Bestand (ohne Gold, in den Metriken)
const M_EQ = 230; // Aktien-Flow (ohne Gold, in den Metriken)

const loadEtf = (isin: string): EtfData =>
  JSON.parse(readFileSync(path.join(__dirname, '__fixtures__', `${isin}.json`), 'utf-8'));

const RIN_SAVINGS: SavingsEtf[] = [
  { isin: WORLD, monthlyEur: 0, data: loadEtf(WORLD) },
  { isin: GOLD, monthlyEur: 25, data: loadEtf(GOLD) },
  { isin: PRIME, monthlyEur: 150, data: loadEtf(PRIME) },
  { isin: XEM, monthlyEur: 0, data: loadEtf(XEM) },
  { isin: STOXX, monthlyEur: 40, data: loadEtf(STOXX) },
  { isin: EMIMI, monthlyEur: 40, data: loadEtf(EMIMI) },
];

const RIN_PORTFOLIO: PortfolioEtf[] = [
  { isin: WORLD, amountEur: 6000, data: loadEtf(WORLD) },
  { isin: GOLD, amountEur: 938, data: loadEtf(GOLD) },
  { isin: PRIME, amountEur: 792, data: loadEtf(PRIME) },
  { isin: XEM, amountEur: 528, data: loadEtf(XEM) },
  { isin: STOXX, amountEur: 399, data: loadEtf(STOXX) },
  { isin: EMIMI, amountEur: 373, data: loadEtf(EMIMI) },
];

/** Unabhängige AKTIEN-Flow-Ländergewichte der AKTUELLEN Aufteilung (rate/M_EQ). */
function istFlowCountries(): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of RIN_SAVINGS) {
    if (!isEquityEtf(s.data)) continue; // Gold zaehlt nicht zum Aktien-Flow
    const w = s.monthlyEur / M_EQ;
    if (w <= 0) continue;
    for (const [code, cw] of countryWeights(s.data)) {
      map.set(code, (map.get(code) ?? 0) + w * cw);
    }
  }
  return map;
}

/** Unabhängige AKTIEN-Bestands-Ländergewichte (amount/V_EQ). */
function bestandCountries(): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of RIN_PORTFOLIO) {
    if (!isEquityEtf(e.data)) continue; // Gold zaehlt nicht zum Aktien-Bestand
    const w = e.amountEur / V_EQ;
    if (w <= 0) continue;
    for (const [code, cw] of countryWeights(e.data)) {
      map.set(code, (map.get(code) ?? 0) + w * cw);
    }
  }
  return map;
}

/** Active Share ½·Σ|p−b| über ein Universum, unabhängig nachgerechnet. */
function handActiveShare(p: Map<string, number>, model: BenchmarkModel): number {
  const bm = getBenchmark(model);
  const universe = new Set([...bm.countryMap.keys(), ...p.keys()]);
  let sum = 0;
  for (const c of universe)
    sum += Math.abs((p.get(c) ?? 0) - (bm.countryMap.get(c) ?? 0));
  return sum / 2;
}

describe('analyzeSavings mit RIns Sparplan (alle 4 Modelle)', () => {
  it('Flow-Gewichte: Sparraten summieren zu 255 € (100 %)', () => {
    expect(RIN_SAVINGS.reduce((a, s) => a + s.monthlyEur, 0)).toBe(M);
  });

  it('currentCoverageScore = heutige Aufteilung (Ist), unabhängig nachgerechnet', () => {
    for (const model of benchmarkModels()) {
      const res = analyzeSavings(RIN_SAVINGS, model);
      const istAs = handActiveShare(istFlowCountries(), model);
      expect(res.currentActiveShare, model).toBeCloseTo(istAs, 6);
      expect(res.currentCoverageScore, model).toBeCloseTo(1 - istAs, 6);
    }
  });

  it('Drift-Karten zeigen die AKTUELLE Aktien-Aufteilung (Ist), nicht die optimalen Ziel-Gewichte', () => {
    const res = analyzeSavings(RIN_SAVINGS, 'marketcap');
    const ist = istFlowCountries();
    // US: Ist-Flow = 41.05 % (nur Aktien-Flows Prime/Stoxx/EM IMI, Gold raus)
    const us = res.countryDrift.find(c => c.code === 'US')!;
    expect(us.portfolio).toBeCloseTo(ist.get('US') ?? 0, 9);
    expect(us.portfolio).toBeCloseTo(0.4105, 2);
    // _OTHER: nur Reste der Aktien-ETFs (Gold nicht mehr Teil der Drift)
    const other = res.countryDrift.find(c => c.code === '_OTHER')!;
    expect(other.portfolio).toBeCloseTo(ist.get('_OTHER') ?? 0, 9);
    expect(other.portfolio).toBeLessThan(0.01);
    // Drift-Karte ≠ Ziel-Aggregat (Ziel hätte ~62.8 % US)
    expect(us.portfolio).not.toBeCloseTo(0.62, 1);
  });

  it('coverageScore = OPTIMALER Sparplan: Umschichten der Raten verbessert in allen Modellen', () => {
    for (const model of benchmarkModels()) {
      const res = analyzeSavings(RIN_SAVINGS, model);
      expect(res.coverageScore, model).toBeGreaterThan(res.currentCoverageScore);
      // Ziel-Gewichte des optimalen Sparplans ergeben das Ziel-Aggregat im Score
      expect(res.coverageScore, model).toBeCloseTo(1 - res.activeShare, 10);
    }
  });

  it('ist identisch zur Bestands-Optimierung mit Monatsbeträgen als "Bestand"', () => {
    const asStock = analyzeSavings(RIN_SAVINGS, 'marketcap');
    const asFlow = optimize(
      RIN_SAVINGS.map(s => ({ isin: s.isin, amountEur: s.monthlyEur, data: s.data })),
      'marketcap',
    );
    expect(asStock.coverageScore).toBeCloseTo(asFlow.coverageScore, 10);
    expect(asStock.activeShare).toBeCloseTo(asFlow.activeShare, 10);
  });
});

describe('proposeSavings benchmark-Modus mit RIns Bestand (alle 4 Modelle)', () => {
  it('Kauf-Liste: Summe ≈ 255 €, Gewichte ≥ 0, Summe ≈ 1', () => {
    for (const model of benchmarkModels()) {
      const res = proposeSavings(RIN_SAVINGS, RIN_PORTFOLIO, model, 'benchmark');
      expect(res.allocations.every(a => a.suggestedWeight >= -1e-9), model).toBe(true);
      const euro = res.allocations.reduce((a, x) => a + x.suggestedMonthlyEur, 0);
      const w = res.allocations.reduce((a, x) => a + x.suggestedWeight, 0);
      expect(euro, model).toBeCloseTo(M, 0);
      expect(w, model).toBeCloseTo(1, 8);
    }
  });

  it('Metrik = p(1) (Portfolio nach 1 Monat, Aktien-Teil): per Hand nachrechenbar', () => {
    const res = proposeSavings(RIN_SAVINGS, RIN_PORTFOLIO, 'marketcap', 'benchmark');
    // Aktien-Flow-Ländergewichte aus den Vorschlags-€ (normalisiert auf M_EQ)
    const flow = new Map<string, number>();
    res.allocations.forEach(a => {
      if (a.suggestedMonthlyEur <= 0 || !isEquityEtf(loadEtf(a.isin))) return;
      const w = a.suggestedMonthlyEur / M_EQ;
      for (const [code, cw] of countryWeights(loadEtf(a.isin)))
        flow.set(code, (flow.get(code) ?? 0) + w * cw);
    });
    const w0 = bestandCountries();
    const bm = getBenchmark('marketcap');
    const universe = Array.from(
      new Set([...bm.countryMap.keys(), ...flow.keys(), ...w0.keys()]),
    );
    for (const code of universe) {
      const p1 = (V_EQ * (w0.get(code) ?? 0) + M_EQ * (flow.get(code) ?? 0)) / (V_EQ + M_EQ);
      const entry = res.countryDrift.find(c => c.code === code)!;
      // suggestedMonthlyEur ist auf 2 Nachkommastellen gerundet → Toleranz 1e-5
      expect(entry.portfolio, code).toBeCloseTo(p1, 5);
    }
    // Konkreter Wert: p(1)-US ≈ 59.6 % (Aktien-Teil nach 1 Monat)
    const us = res.countryDrift.find(c => c.code === 'US')!;
    expect(us.portfolio).toBeGreaterThan(0.58);
    expect(us.portfolio).toBeLessThan(0.61);
  });

  it('kann ETFs mit aktueller Sparrate 0 empfehlen (Xtrackers EM)', () => {
    const res = proposeSavings(RIN_SAVINGS, RIN_PORTFOLIO, 'gdp', 'benchmark');
    const xem = res.allocations.find(a => a.isin === XEM)!;
    expect(xem.currentMonthlyEur).toBe(0);
    expect(xem.suggestedMonthlyEur).toBeGreaterThan(0); // ~24 €/Monat
  });

  it('Gold bleibt im Sparplan-Vorschlag unveraendert (25 €/Monat, Delta 0)', () => {
    for (const model of benchmarkModels()) {
      for (const mode of ['benchmark', 'converge'] as const) {
        const res = proposeSavings(RIN_SAVINGS, RIN_PORTFOLIO, model, mode);
        const gold = res.allocations.find(a => a.isin === GOLD)!;
        expect(gold.suggestedMonthlyEur, `${model}/${mode}`).toBeCloseTo(25, 6);
        expect(gold.deltaEur, `${model}/${mode}`).toBeCloseTo(0, 6);
        expect(gold.suggestedWeight, `${model}/${mode}`).toBeCloseTo(25 / M, 8);
      }
    }
  });
});

describe('proposeSavings converge-Modus mit RIns Bestand', () => {
  it('geschlossene Form b̂ = ((V+M)·b − V·w0)/M manuell nachgerechnet (Testfall US, marketcap)', () => {
    // b̂[US] = ((V_EQ+M_EQ)·0.6274 − V_EQ·w0Us)/M_EQ > 1 → der Solver
    // nimmt den ETF mit dem höchsten US-Anteil (MSCI World) für den Aktien-Flow.
    const bm = getBenchmark('marketcap');
    const w0Us = bestandCountries().get('US') ?? 0;
    const bHatUs = ((V_EQ + M_EQ) * (bm.countryMap.get('US') ?? 0) - V_EQ * w0Us) / M_EQ;
    expect(bHatUs).toBeGreaterThan(1);
    expect(bHatUs).toBeLessThan(2.5);
    // Konsistenz: World bekommt den gesamten Aktien-Flow
    const res = proposeSavings(RIN_SAVINGS, RIN_PORTFOLIO, 'marketcap', 'converge');
    const world = res.allocations.find(a => a.isin === WORLD)!;
    expect(world.suggestedMonthlyEur).toBeCloseTo(M_EQ, 0); // 230 €
    expect(world.suggestedWeight).toBeCloseTo(M_EQ / M, 6); // relativ zur Gesamtrate
    // p(1)-Metrik konsistent per Hand (Formel wie oben, nur Aktien-Teil)
    const flowUs = M_EQ * (countryWeights(loadEtf(WORLD)).get('US') ?? 0);
    const p1Us = (V_EQ * w0Us + flowUs) / (V_EQ + M_EQ);
    const usEntry = res.countryDrift.find(c => c.code === 'US')!;
    expect(usEntry.portfolio).toBeCloseTo(p1Us, 9);
  });

  it('Kauf-Liste summiert zu 255 € bei marketcap, Gewichte valide', () => {
    const res = proposeSavings(RIN_SAVINGS, RIN_PORTFOLIO, 'marketcap', 'converge');
    expect(res.mode).toBe('converge');
    expect(res.allocations.reduce((a, x) => a + x.suggestedWeight, 0)).toBeCloseTo(1, 6);
    expect(res.allocations.reduce((a, x) => a + x.suggestedMonthlyEur, 0)).toBeCloseTo(255, 0);
  });

  it('negative b̂ → Projektion korrekt → Kauf-Summe = 255 € in allen Modellen, Gold fix', () => {
    // gdp/ppp/blend haben b̂ < 0 für 13+ Länder. Duchi-korrekter projectSimplex
    // projiziert auf Σ=1; der Solver liefert valide Gewichte. Gold bleibt fix.
    for (const model of ['gdp', 'ppp', 'blend'] as BenchmarkModel[]) {
      const res = proposeSavings(RIN_SAVINGS, RIN_PORTFOLIO, model, 'converge');
      expect(res.allocations.every(a => a.suggestedWeight >= -1e-9), model).toBe(true);
      const euro = res.allocations.reduce((a, x) => a + x.suggestedMonthlyEur, 0);
      expect(euro, model).toBeCloseTo(M, 0);
      const w = res.allocations.reduce((a, x) => a + x.suggestedWeight, 0);
      expect(w, model).toBeCloseTo(1, 8);
      // Gold fix, mindestens 1 Aktien-ETF aktiv
      const gold = res.allocations.find(a => a.isin === GOLD)!;
      expect(gold.suggestedMonthlyEur, model).toBeCloseTo(25, 6);
      const active = res.allocations.filter(
        a => a.suggestedMonthlyEur > 0 && a.isin !== GOLD,
      );
      expect(active.length, model).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('proposeSavings: Grenzfälle', () => {
  it('OHNE Bestand (nur Sparplan): converge ≡ benchmark (Fallback V=0)', () => {
    const conv = proposeSavings(RIN_SAVINGS, [], 'marketcap', 'converge');
    const bench = proposeSavings(RIN_SAVINGS, [], 'marketcap', 'benchmark');
    expect(conv.mode).toBe('benchmark');
    conv.allocations.forEach((a, i) => {
      expect(a.suggestedWeight).toBeCloseTo(bench.allocations[i].suggestedWeight, 8);
    });
  });

  it('OHNE Bestand, benchmark-Modus: Σ€ = 255 in allen Modellen', () => {
    for (const model of benchmarkModels()) {
      const res = proposeSavings(RIN_SAVINGS, [], model, 'benchmark');
      expect(res.totalPortfolioEur).toBe(0);
      expect(res.allocations.reduce((a, x) => a + x.suggestedMonthlyEur, 0)).toBeCloseTo(M, 0);
      const w = res.allocations.reduce((a, x) => a + x.suggestedWeight, 0);
      expect(w).toBeCloseTo(1, 8);
    }
  });

  it('wirft bei Sparrate 0 (alle Raten 0)', () => {
    const zero = RIN_SAVINGS.map(s => ({ ...s, monthlyEur: 0 }));
    expect(() => proposeSavings(zero, [], 'marketcap', 'benchmark')).toThrow(/Sparrate/);
  });

  it('wirft bei leerem Sparplan', () => {
    expect(() => proposeSavings([], RIN_PORTFOLIO, 'marketcap', 'benchmark')).toThrow();
  });

  it('Metrik ohne Bestand: p(1) = Aktien-Flow (benchmark-Modus, gdp)', () => {
    const res = proposeSavings(RIN_SAVINGS, [], 'gdp', 'benchmark');
    const flow = new Map<string, number>();
    res.allocations.forEach(a => {
      if (a.suggestedMonthlyEur <= 0 || !isEquityEtf(loadEtf(a.isin))) return;
      const w = a.suggestedMonthlyEur / M_EQ;
      for (const [code, cw] of countryWeights(loadEtf(a.isin)))
        flow.set(code, (flow.get(code) ?? 0) + w * cw);
    });
    for (const entry of res.countryDrift) {
      // suggestedMonthlyEur ist auf 2 Nachkommastellen gerundet → Toleranz 1e-5
      expect(entry.portfolio, entry.code).toBeCloseTo(flow.get(entry.code) ?? 0, 5);
    }
  });
});

describe('suggestAdditionsSavings mit RIns Sparplan (alle 4 Modelle)', () => {
  const candidates = () =>
    withData(
      CANDIDATE_ETFS.map(c => ({ isin: c.isin, name: c.name, role: c.role, ter: c.ter })),
      new Map(CANDIDATE_ETFS.map(c => [c.isin, loadEtf(c.isin)])),
    );

  it('KRITISCH: schlägt KEINEN ETF vor, der schon bespart wird (EM IMI + Amundi Prime im Katalog)', () => {
    const held = new Set(RIN_SAVINGS.map(s => s.isin));
    expect(CANDIDATE_ETFS.some(c => c.isin === EMIMI)).toBe(true);
    expect(CANDIDATE_ETFS.some(c => c.isin === PRIME)).toBe(true);
    for (const model of benchmarkModels()) {
      for (const mode of ['benchmark', 'converge'] as const) {
        const res = suggestAdditionsSavings(RIN_SAVINGS, RIN_PORTFOLIO, candidates(), model, mode);
        for (const s of res.steps) {
          expect(held.has(s.isin), `${model}/${mode}:${s.isin}`).toBe(false);
        }
      }
    }
  });

  it('max. 3 Stufen, jede Stufe ≥ 0,5 pp, Scores monoton steigend', () => {
    for (const model of benchmarkModels()) {
      const res = suggestAdditionsSavings(RIN_SAVINGS, RIN_PORTFOLIO, candidates(), model, 'benchmark');
      expect(res.steps.length, model).toBeLessThanOrEqual(3);
      let prev = res.baseScore;
      for (const s of res.steps) {
        expect(s.score, model).toBeGreaterThan(prev);
        expect(s.improvement, model).toBeGreaterThanOrEqual(0.005);
        prev = s.score;
      }
    }
  });

  it('OHNE Bestand, benchmark-Modus: erste Stufe ist SPDR ACWI IMI (marketcap)', () => {
    const res = suggestAdditionsSavings(RIN_SAVINGS, [], candidates(), 'marketcap', 'benchmark');
    expect(res.steps.length).toBeGreaterThan(0);
    expect(res.steps[0].isin).toBe('IE00B3YLTY66');
  });

  it('MIT Bestand, converge-Modus: Treppe bleibt bei RIns Zahlen leer (Monatsrate zu klein)', () => {
    // 255 €/Monat auf 9 030 € Bestand bewegen p(1) nur max. ~2.7 % → kein
    // Kandidat erreicht +0.5 pp. Dokumentiert als erwartetes Verhalten.
    for (const model of benchmarkModels()) {
      const res = suggestAdditionsSavings(RIN_SAVINGS, RIN_PORTFOLIO, candidates(), model, 'converge');
      expect(res.steps, model).toEqual([]);
      // Basis-Score valide (Aktien-Teil, variiert je Modell)
      expect(res.baseScore, model).toBeGreaterThan(0.4);
      expect(res.baseScore, model).toBeLessThan(0.96);
    }
  });
});
