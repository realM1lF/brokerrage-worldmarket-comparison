import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getBenchmark, benchmarkModels } from '@/lib/benchmark';
import type { Benchmark, BenchmarkModel } from '@/lib/benchmark';
import type { EtfData } from '@/lib/etf/types';
import {
  isEquityEtf,
  optimize,
  countryWeights,
  projectSimplex,
  activeShareBetween,
  type PortfolioEtf,
} from './optimize';
import {
  suggestAdditions,
  suggestReplacement,
  withData,
  type CandidateWithData,
} from './candidates';
import { CANDIDATE_ETFS } from '@/data/candidates';

/* =====================================================================
 * RIns reales Portfolio (2026-08):
 *   IE00B4L5Y983  iShares Core MSCI World            6 000 €   (0 €/Monat)
 *   IE00B4ND3602  iShares Physical Gold ETC            938 €  (25 €/Monat)
 *   IE0003XJA0J9  Amundi Prime All Country World       792 € (150 €/Monat)
 *   IE00BTJRMP35  Xtrackers MSCI Emerging Markets     528 €   (0 €/Monat)
 *   LU0908500753  Amundi Stoxx Europe 600             399 €  (40 €/Monat)
 *   IE00BKM4GZ66  iShares Core MSCI EM IMI            373 €  (40 €/Monat)
 *   Summe 9 030 €, Sparrate 255 €/Monat.
 * ===================================================================== */

const WORLD = 'IE00B4L5Y983'; // MSCI World (nur Industrieländer)
const GOLD = 'IE00B4ND3602'; // physisches Gold (KEINE Aktien-Exposure)
const PRIME = 'IE0003XJA0J9'; // Amundi Prime All Country World
const XEM = 'IE00BTJRMP35'; // Xtrackers MSCI EM
const STOXX = 'LU0908500753'; // Stoxx Europe 600
const EMIMI = 'IE00BKM4GZ66'; // MSCI EM IMI

const RIN: [string, number][] = [
  [WORLD, 6000],
  [GOLD, 938],
  [PRIME, 792],
  [XEM, 528],
  [STOXX, 399],
  [EMIMI, 373],
];
const TOTAL_EUR = 9030;

const loadEtf = (isin: string): EtfData =>
  JSON.parse(readFileSync(path.join(__dirname, '__fixtures__', `${isin}.json`), 'utf-8'));

const etf = (isin: string, amountEur: number): PortfolioEtf => ({
  isin,
  amountEur,
  data: loadEtf(isin),
});

const rinPortfolio = (): PortfolioEtf[] =>
  RIN.map(([isin, amountEur]) => etf(isin, amountEur));

const rinCandidates = (): CandidateWithData[] =>
  withData(
    CANDIDATE_ETFS.map(c => ({ isin: c.isin, name: c.name, role: c.role, ter: c.ter })),
    new Map(CANDIDATE_ETFS.map(c => [c.isin, loadEtf(c.isin)])),
  );

/** Einzelnen Kandidaten direkt aus einem Fixture bauen (auch Nicht-Katalog-ISINs). */
const singleCandidate = (isin: string): CandidateWithData => ({
  isin,
  name: loadEtf(isin).profile.name,
  role: 'allworld',
  ter: loadEtf(isin).profile.ter,
  data: loadEtf(isin),
});

/** Active Share unabhängig nachgerechnet: ½·Σ|p_i − b_i| über ein Universum. */
function expectedActiveShare(
  portfolio: Map<string, number>,
  benchmark: Benchmark,
): number {
  const universe = new Set([...benchmark.countryMap.keys(), ...portfolio.keys()]);
  let sum = 0;
  for (const code of universe) {
    sum += Math.abs((portfolio.get(code) ?? 0) - (benchmark.countryMap.get(code) ?? 0));
  }
  return sum / 2;
}

/** Zielländer-Aggregat der Ziel-Gewichte x (was die Drift-Karten zeigen MÜSSEN). */
function targetAggregate(etfs: PortfolioEtf[], weights: number[]): Map<string, number> {
  const out = new Map<string, number>();
  for (let j = 0; j < etfs.length; j++) {
    if (weights[j] <= 0) continue;
    for (const [code, w] of countryWeights(etfs[j].data)) {
      out.set(code, (out.get(code) ?? 0) + weights[j] * w);
    }
  }
  return out;
}

describe('optimize mit RIns Portfolio (alle 4 Benchmark-Modelle)', () => {
  it('erfüllt Nebenbedingungen: w ≥ 0, Summe ≈ 1, €-Umschichtung summiert ≈ 0, Gold unverändert', () => {
    for (const model of benchmarkModels()) {
      const res = optimize(rinPortfolio(), model);
      expect(res.allocations, model).toHaveLength(6);
      expect(res.allocations.every(a => a.targetWeight >= -1e-9), model).toBe(true);
      const wSum = res.allocations.reduce((a, x) => a + x.targetWeight, 0);
      const dSum = res.allocations.reduce((a, x) => a + x.deltaEur, 0);
      expect(wSum, model).toBeCloseTo(1, 8);
      expect(Math.abs(dSum), model).toBeLessThan(0.01);
      // Nicht-Aktien-Werte (Gold) bleiben unveraendert: Ist = Ziel, Delta 0.
      const gold = res.allocations.find(a => a.isin === GOLD)!;
      expect(gold.targetWeight, model).toBeCloseTo(938 / 9030, 10);
      expect(gold.deltaEur, model).toBeCloseTo(0, 6);
    }
  });

  it('Semantik: currentCoverageScore = heute, coverageScore = nach Umschichtung, Umschichten verbessert', () => {
    for (const model of benchmarkModels()) {
      const res = optimize(rinPortfolio(), model);
      // Konsistenz: Score = 1 − Active Share, jeweils Ist und Ziel
      expect(res.currentCoverageScore, model).toBeCloseTo(1 - res.currentActiveShare, 10);
      expect(res.coverageScore, model).toBeCloseTo(1 - res.activeShare, 10);
      // Umschichten verbessert den Deckungs-Score in allen 4 Modellen
      expect(res.coverageScore, model).toBeGreaterThan(res.currentCoverageScore);
    }
  });

  it('Drift-Karten zeigen das Ziel-Aggregat des AKTIEN-Teils (nach Umschichtung)', () => {
    for (const model of benchmarkModels()) {
      const res = optimize(rinPortfolio(), model);
      const equity = rinPortfolio().filter(e => isEquityEtf(e.data));
      const equityShare = equity.reduce((a, e) => a + e.amountEur, 0) / res.totalEur;
      // x rekonstruieren: equity targetWeight = x · equityShare
      const x = equity.map(e => {
        const a = res.allocations.find(al => al.isin === e.isin)!;
        return a.targetWeight / equityShare;
      });
      const agg = targetAggregate(equity, x);
      for (const entry of res.countryDrift) {
        const expected = agg.get(entry.code) ?? 0;
        expect(entry.portfolio, `${model}:${entry.code}`).toBeCloseTo(expected, 9);
      }
    }
  });

  it('RIn marketcap: Umschichtung reduziert MSCI World stark, Gold bleibt unveraendert', () => {
    const res = optimize(rinPortfolio(), 'marketcap');
    const world = res.allocations.find(a => a.isin === WORLD)!;
    const gold = res.allocations.find(a => a.isin === GOLD)!;
    const prime = res.allocations.find(a => a.isin === PRIME)!;
    expect(world.targetWeight).toBeLessThan(0.4); // heute 66.4 %
    expect(world.deltaEur).toBeLessThan(-2500); // Verkauf > 2 500 €
    expect(prime.targetWeight).toBeGreaterThan(0.5); // Amundi wird Kern
    // Gold ist kein Aktien-ETF: bleibt komplett unveraendert (Ist = Ziel, Delta 0)
    expect(gold.targetWeight).toBeCloseTo(938 / 9030, 10);
    expect(gold.deltaEur).toBeCloseTo(0, 6);
  });
});

describe('Gold-ETC IE00B4ND3602 (leere Exposure-Listen)', () => {
  it('extraETF liefert 0 Länder / 0 Sektoren / 0 Regionen → countryWeights = 100 % _OTHER', () => {
    const data = loadEtf(GOLD);
    expect(data.exposures.countries).toHaveLength(0);
    expect(data.exposures.sectors).toHaveLength(0);
    expect(data.exposures.regions).toHaveLength(0);
    const cw = countryWeights(data);
    expect(cw.size).toBe(1);
    expect(cw.get('_OTHER')).toBeCloseTo(1, 10);
  });

  it('Nur Gold (kein Aktien-ETF): optimize wirft einen klaren Fehler', () => {
    expect(() => optimize([etf(GOLD, 1000)], 'marketcap')).toThrow(/Aktien-ETF/);
  });

  it('World + Gold: Gold bleibt unveraendert, nur der Aktien-Teil wird optimiert (Marktkap)', () => {
    const res = optimize([etf(WORLD, 6000), etf(GOLD, 938)], 'marketcap');
    const gold = res.allocations.find(a => a.isin === GOLD)!;
    const world = res.allocations.find(a => a.isin === WORLD)!;
    expect(gold.targetWeight).toBeCloseTo(938 / 6938, 10);
    expect(gold.deltaEur).toBeCloseTo(0, 6);
    expect(world.targetWeight).toBeCloseTo(6000 / 6938, 10); // einziger Aktien-ETF
    // Score misst den Aktien-Teil: 1 − AS(World vs Benchmark)
    const expected = expectedActiveShare(countryWeights(loadEtf(WORLD)), getBenchmark('marketcap'));
    expect(res.coverageScore).toBeCloseTo(1 - expected, 6);
  });

  it('RIns Portfolio: Gold bleibt in ALLEN Modellen unveraendert (kein Rest-Artefakt mehr)', () => {
    for (const model of benchmarkModels()) {
      const res = optimize(rinPortfolio(), model);
      const gold = res.allocations.find(a => a.isin === GOLD)!;
      expect(gold.targetWeight, model).toBeCloseTo(938 / 9030, 10);
      expect(gold.deltaEur, model).toBeCloseTo(0, 6);
    }
  });
});

describe('Handrechnungs-Cross-Checks', () => {
  it('1-ETF-Portfolio: w = 100 %, Score = 1 − AS(ETF vs. Benchmark) exakt aus countryWeights', () => {
    for (const model of benchmarkModels()) {
      const res = optimize([etf(WORLD, 10_000)], model);
      expect(res.allocations[0].targetWeight, model).toBeCloseTo(1, 6);
      const expected = expectedActiveShare(countryWeights(loadEtf(WORLD)), getBenchmark(model));
      expect(res.activeShare, model).toBeCloseTo(expected, 6);
      expect(res.coverageScore, model).toBeCloseTo(1 - expected, 6);
    }
  });

  it('2-ETF-Portfolio (World + EM IMI): A·w = gewichtetes Mittel, AS per Hand nachgerechnet', () => {
    const res = optimize([etf(WORLD, 6000), etf(EMIMI, 373)], 'marketcap');
    const w = res.allocations.map(a => a.targetWeight);
    // Gewichtetes Mittel der Länder
    const agg = new Map<string, number>();
    for (const [code, cw] of countryWeights(loadEtf(WORLD)))
      agg.set(code, w[0] * cw);
    for (const [code, cw] of countryWeights(loadEtf(EMIMI)))
      agg.set(code, (agg.get(code) ?? 0) + w[1] * cw);
    const benchmark = getBenchmark('marketcap');
    const handAs = expectedActiveShare(agg, benchmark);
    expect(res.activeShare).toBeCloseTo(handAs, 6);
    expect(res.coverageScore).toBeCloseTo(1 - handAs, 6);
    // Kontrollwert (fixture-abhängig, Stand 2026-08): ~87.5 % World, ~12.5 % EM IMI
    expect(w[0]).toBeGreaterThan(0.85);
    expect(w[0]).toBeLessThan(0.9);
  });

  it('Idempotenz: identisches Portfolio erneut optimieren liefert dieselben Gewichte', () => {
    for (const model of ['marketcap', 'blend'] as BenchmarkModel[]) {
      const first = optimize([etf(WORLD, 6000), etf(EMIMI, 373)], model);
      const w = first.allocations.map(a => a.targetWeight);
      const second = optimize(
        [etf(WORLD, w[0] * TOTAL_EUR), etf(EMIMI, w[1] * TOTAL_EUR)],
        model,
      );
      second.allocations.forEach((a, j) => {
        expect(a.targetWeight, model).toBeCloseTo(w[j], 6);
      });
      expect(second.coverageScore, model).toBeCloseTo(first.coverageScore, 9);
    }
  });

  it('Grid-Search: 1-parametriges Raster (World vs. EM IMI) findet dasselbe Optimum wie der Solver', () => {
    // Brute-Force über w ∈ [0,1] in 0.001er-Schritten — unabhängig vom PGD.
    for (const model of ['marketcap', 'blend'] as BenchmarkModel[]) {
      const benchmark = getBenchmark(model);
      const universe = new Set<string>();
      for (const c of benchmark.countries) universe.add(c.code);
      for (const cw of [countryWeights(loadEtf(WORLD)), countryWeights(loadEtf(EMIMI))])
        for (const code of cw.keys()) universe.add(code);
      const codes = Array.from(universe).sort();
      const b = codes.map(code => benchmark.countryMap.get(code) ?? 0);
      const a1 = codes.map(code => countryWeights(loadEtf(WORLD)).get(code) ?? 0);
      const a2 = codes.map(code => countryWeights(loadEtf(EMIMI)).get(code) ?? 0);

      let bestW = 0;
      let bestObj = Infinity;
      for (let k = 0; k <= 1000; k++) {
        const w1 = k / 1000;
        let obj = 0;
        for (let i = 0; i < codes.length; i++) {
          const d = w1 * a1[i] + (1 - w1) * a2[i] - b[i];
          obj += d * d;
        }
        if (obj < bestObj) {
          bestObj = obj;
          bestW = w1;
        }
      }
      const res = optimize([etf(WORLD, 6000), etf(EMIMI, 373)], model);
      expect(res.allocations[0].targetWeight, model).toBeCloseTo(bestW, 2);
      // Solver-Objektwert darf das Raster-Optimum nicht nennenswert überschreiten
      expect(res.objectiveValue, model).toBeLessThanOrEqual(bestObj + 1e-4);
    }
  });
});

describe('projectSimplex (Bekanntes Problem dokumentiert)', () => {
  it('projiziert Punkte mit Summe ≠ 1 korrekt (Duchi-Verhalten)', () => {
    const out = projectSimplex([1.5, 0.5, -0.5]);
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(out.every(v => v >= 0)).toBe(true);
  });

  it('projiziert Punkt mit Summe 1 und negativen Einträgen korrekt (Duchi-Fix)', () => {
    // theta aus der Teilsumme der rho groessten Elemente (optimize.ts:145).
    // Gegenbeispiel, das den alten Bug aufdeckte: [1, 0.5, -0.5] → [0.75, 0.25, 0].
    const out = projectSimplex([1, 0.5, -0.5]);
    expect(out).toEqual([0.75, 0.25, 0]);
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });
});

describe('Stufe B: suggestAdditions mit RIns Portfolio', () => {
  it('max. 3 Stufen, monoton steigende Scores, jede Stufe ≥ 0,5 pp, Abbruch respektiert', () => {
    for (const model of benchmarkModels()) {
      const res = suggestAdditions(rinPortfolio(), rinCandidates(), model);
      expect(res.steps.length, model).toBeLessThanOrEqual(3);
      let prev = res.baseScore;
      for (const s of res.steps) {
        expect(s.score, model).toBeGreaterThan(prev);
        expect(s.improvement, model).toBeGreaterThanOrEqual(0.005);
        prev = s.score;
      }
    }
  });

  it('KRITISCH: schlägt KEINEN ETF vor, der schon im Portfolio ist (EM IMI + Amundi Prime sind im Katalog!)', () => {
    const held = new Set(RIN.map(([isin]) => isin));
    // Plausibilität des Test-Setups: beide kritischen ISINs sind wirklich im Katalog
    expect(CANDIDATE_ETFS.some(c => c.isin === EMIMI)).toBe(true);
    expect(CANDIDATE_ETFS.some(c => c.isin === PRIME)).toBe(true);
    for (const model of benchmarkModels()) {
      const res = suggestAdditions(rinPortfolio(), rinCandidates(), model);
      for (const s of res.steps) {
        expect(held.has(s.isin), `${model}:${s.isin}`).toBe(false);
      }
    }
  });

  it('marketcap: erste Stufe ist der breite All-World-ETF SPDR ACWI IMI (EM-Lücke ist schon gedeckt)', () => {
    const res = suggestAdditions(rinPortfolio(), rinCandidates(), 'marketcap');
    expect(res.baseScore).toBeGreaterThan(0.98); // Portfolio deckt Marktkap fast perfekt
    expect(res.steps[0].isin).toBe('IE00B3YLTY66');
  });

  it('gdp/ppp/blend: erste Stufe ist Small Cap (größte Restlücke bei RIns Portfolio)', () => {
    for (const model of ['gdp', 'ppp', 'blend'] as BenchmarkModel[]) {
      const res = suggestAdditions(rinPortfolio(), rinCandidates(), model);
      expect(res.steps[0].isin, model).toBe('IE00BF4RFH31');
    }
  });

  it('schlägt nichts vor, wenn der Benchmark schon abgedeckt ist (SPDR-only)', () => {
    const res = suggestAdditions([etf('IE00B3YLTY66', 10000)], rinCandidates(), 'marketcap');
    expect(res.steps).toEqual([]);
  });
});

describe('Stufe B: suggestReplacement mit RIns Portfolio', () => {
  it('marketcap: Tausch Prime All Country → SPDR ACWI IMI (breiter, ΔScore ≥ 0,5 pp)', () => {
    const hint = suggestReplacement(rinPortfolio(), rinCandidates(), 'marketcap');
    expect(hint).not.toBeNull();
    expect(hint!.fromIsin).toBe(PRIME);
    expect(hint!.toIsin).toBe('IE00B3YLTY66');
    expect(hint!.improvement).toBeGreaterThanOrEqual(0.005);
    expect(hint!.improvement).toBeLessThan(0.02);
    // Score nach Tausch: Basis 98.5 % → ~99.3 %
    expect(hint!.scoreAfter).toBeGreaterThan(0.99);
  });

  it('KRITISCH: Tauschziel ist nie ein bereits gehaltener ETF (EM IMI / Amundi Prime im Katalog)', () => {
    for (const model of benchmarkModels()) {
      const hint = suggestReplacement(rinPortfolio(), rinCandidates(), model);
      if (hint) {
        const held = new Set(RIN.map(([isin]) => isin));
        expect(held.has(hint.toIsin), model).toBe(false);
      }
    }
  });

  it('gdp: Tausch Xtrackers EM → Small Cap (groesste Restluecke)', () => {
    // Gold wird nie getauscht (isEquityEtf-Filter in suggestReplacement).
    const hint = suggestReplacement(rinPortfolio(), rinCandidates(), 'gdp');
    expect(hint).not.toBeNull();
    expect(hint!.fromIsin).toBe(XEM);
    expect(hint!.toIsin).toBe('IE00BF4RFH31');
    expect(hint!.improvement).toBeGreaterThan(0.005);
  });

  it('KRITISCH: Gold (Nicht-Aktien-Wert) wird NIE als Tausch-Quelle vorgeschlagen', () => {
    for (const model of benchmarkModels()) {
      const hint = suggestReplacement(rinPortfolio(), rinCandidates(), model);
      if (hint) expect(hint.fromIsin, model).not.toBe(GOLD);
    }
  });

  it('TER-Regel: quasi-gleicher Score + TER-Vorteil ≥ 0,05 pp → Tausch wird gezeigt', () => {
    // World (TER 0.20) → Xtrackers MSCI World (TER 0.12): fast identische Exposure
    const hint = suggestReplacement(
      [etf(WORLD, 10000)],
      [singleCandidate('IE00BJ0KDQ92')],
      'marketcap',
    );
    expect(hint).not.toBeNull();
    expect(hint!.toIsin).toBe('IE00BJ0KDQ92');
    expect(Math.abs(hint!.improvement)).toBeLessThan(0.001); // quasi-gleich
  });

  it('TER-Regel: quasi-gleicher Score, aber TEURERER Kandidat → kein Tausch', () => {
    // Amundi MSCI World Swap (TER 0.38) ist teurer als World (0.20), gleiche Exposure
    const hint = suggestReplacement(
      [etf(WORLD, 10000)],
      [singleCandidate('LU1681043599')],
      'marketcap',
    );
    // Entweder kein Vorschlag oder der Vorschlag ist nicht der teurere Swap
    if (hint) expect(hint.toIsin).not.toBe('LU1681043599');
  });
});

describe('Referenz: activeShareBetween-Helfer', () => {
  it('berechnet Active Share konsistent mit der Handformel', () => {
    const bm = getBenchmark('marketcap');
    const p = countryWeights(loadEtf(WORLD));
    const universe = Array.from(new Set([...bm.countryMap.keys(), ...p.keys()]));
    const as = activeShareBetween(p, bm.countryMap, universe);
    expect(as).toBeCloseTo(expectedActiveShare(p, bm), 10);
  });
});
