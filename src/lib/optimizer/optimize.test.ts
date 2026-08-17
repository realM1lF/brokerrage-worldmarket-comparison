import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getBenchmark, benchmarkModels } from '@/lib/benchmark';
import type { BenchmarkModel } from '@/lib/benchmark';
import type { EtfData } from '@/lib/etf/types';
import {
  optimize,
  solveWeights,
  projectSimplex,
  countryWeights,
  type PortfolioEtf,
} from './optimize';
import {
  analyzeSavings,
  proposeSavings,
  type SavingsEtf,
} from './savings';

const loadEtf = (isin: string): EtfData =>
  JSON.parse(readFileSync(path.join(__dirname, '__fixtures__', `${isin}.json`), 'utf-8'));

const IWDA = 'IE00B4L5Y983'; // MSCI World (developed)
const VWRL = 'IE00B3RBWM25'; // FTSE All-World
const SPDR = 'IE00B3YLTY66'; // MSCI ACWI IMI
const XTRACKERS = 'IE00BJ0KDQ92'; // MSCI World
const AMUNDI = 'LU1681043599'; // MSCI World (Swap)

const etf = (isin: string, amountEur: number): PortfolioEtf => ({
  isin,
  amountEur,
  data: loadEtf(isin),
});

/** Active Share unabhängig nachgerechnet (0..1). */
function expectedActiveShare(singleIsin: string): number {
  const data = loadEtf(singleIsin);
  const benchmark = getBenchmark('marketcap');
  const weights = countryWeights(data);
  const universe = new Set([...benchmark.countryMap.keys(), ...weights.keys()]);
  let sum = 0;
  for (const code of universe) {
    sum += Math.abs((weights.get(code) ?? 0) - (benchmark.countryMap.get(code) ?? 0));
  }
  return sum / 2;
}

describe('projectSimplex', () => {
  it('projiziert einen Punkt ausserhalb auf den Simplex', () => {
    const out = projectSimplex([1.5, 0.5, -0.5]);
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(out.every(v => v >= 0)).toBe(true);
  });

  it('lässt einen Simplex-Punkt unverändert', () => {
    const p = [0.2, 0.3, 0.5];
    const out = projectSimplex(p);
    out.forEach((v, i) => expect(v).toBeCloseTo(p[i], 10));
  });

  it('kennt Randfall n=1', () => {
    expect(projectSimplex([-2])).toEqual([1]);
  });
});

describe('solveWeights', () => {
  it('findet exakte Lösung für einen 2-ETF-Fall', () => {
    // Benchmark: Land X 60%, Land Y 40%. ETF1 = 100% X, ETF2 = 100% Y.
    const A = [
      [1, 0], // X
      [0, 1], // Y
    ];
    const b = [0.6, 0.4];
    const { x, obj } = solveWeights(A, b);
    expect(x[0]).toBeCloseTo(0.6, 6);
    expect(x[1]).toBeCloseTo(0.4, 6);
    expect(obj).toBeLessThan(1e-12);
  });

  it('konvergiert und erfüllt die Nebenbedingungen', () => {
    const A = [
      [0.8, 0.3, 0.1],
      [0.1, 0.6, 0.2],
      [0.05, 0.05, 0.5],
      [0.05, 0.05, 0.2],
    ];
    const b = [0.5, 0.3, 0.1, 0.1];
    const { x, converged } = solveWeights(A, b);
    expect(converged).toBe(true);
    expect(x.reduce((a, v) => a + v, 0)).toBeCloseTo(1, 8);
    expect(x.every(v => v >= -1e-12)).toBe(true);
  });

  it('konvergiert auch bei flacher Zielfunktion (fast identische ETFs)', () => {
    // Zwei nahezu identische ETFs: jedes w-Paar mit Σw=1 ist gleich gut —
    // die Zielfunktion ist flach, x wandert ohne f-Änderung.
    const A = [
      [0.63, 0.629],
      [0.07, 0.071],
      [0.30, 0.30],
    ];
    const b = [0.63, 0.07, 0.30];
    const { x, obj, converged, iterations } = solveWeights(A, b);
    expect(converged).toBe(true);
    expect(iterations).toBeLessThan(10_000);
    expect(x.reduce((a, v) => a + v, 0)).toBeCloseTo(1, 8);
    expect(obj).toBeLessThan(1e-6);
  });
});

describe('optimize gegen 5 Spike-ETFs', () => {
  it('SPDR ACWI IMI allein ≈ perfekte Abdeckung (AS fast 0)', () => {
    const res = optimize([etf(SPDR, 10_000)], 'marketcap');
    expect(res.coverageScore).toBeGreaterThan(0.99);
    expect(res.activeShare).toBeLessThan(0.01);
    expect(res.allocations[0].targetWeight).toBeCloseTo(1, 6);
  });

  it('IWDA allein: Active Share exakt nachgerechnet', () => {
    const expected = expectedActiveShare(IWDA);
    const res = optimize([etf(IWDA, 10_000)], 'marketcap');
    expect(res.activeShare).toBeCloseTo(expected, 6);
    expect(res.coverageScore).toBeCloseTo(1 - expected, 6);
  });

  it('MSCI-World-ETF (entwickelt) markiert EM-Länder als fehlend', () => {
    const res = optimize([etf(IWDA, 10_000)], 'marketcap');
    const missing = res.missingCountries.map(m => m.code);
    expect(missing).toContain('KR'); // Südkorea
    expect(missing).toContain('IN'); // Indien
    expect(missing).toContain('TW'); // Taiwan
  });

  it('Rebalance IWDA + Vanguard All-World verbessert die Abdeckung', () => {
    const single = optimize([etf(VWRL, 10_000)], 'marketcap');
    const blend = optimize([etf(IWDA, 5_000), etf(VWRL, 5_000)], 'marketcap');
    const vwrl = blend.allocations.find(a => a.isin === VWRL)!;
    expect(vwrl.targetWeight).toBeGreaterThan(0.8); // breiterer ETF dominiert
    // Blend ist mindestens so gut wie der beste Einzel-ETF
    expect(blend.coverageScore).toBeGreaterThanOrEqual(single.coverageScore - 1e-9);
    // Delta summiert sich zu 0
    const totalDelta = blend.allocations.reduce((a, x) => a + x.deltaEur, 0);
    expect(totalDelta).toBeCloseTo(0, 4);
  });

  it('drei fast identische MSCI-World-ETFs: Summe der Gewichte = 1', () => {
    const res = optimize(
      [etf(IWDA, 4_000), etf(XTRACKERS, 3_000), etf(AMUNDI, 3_000)],
      'marketcap',
    );
    expect(res.allocations.reduce((a, x) => a + x.targetWeight, 0)).toBeCloseTo(1, 8);
    expect(res.allocations.every(x => x.targetWeight >= -1e-9)).toBe(true);
  });

  it('liefert Ist-Score (vor Umschichtung) getrennt vom Ziel-Score', () => {
    const res = optimize([etf(IWDA, 5_000), etf(VWRL, 5_000)], 'marketcap');
    // Konsistenz: Ist-Score = 1 − Ist-Active-Share
    expect(res.currentActiveShare).toBeCloseTo(1 - res.currentCoverageScore, 10);
    // Umschichten verbessert: Ziel-Score > Ist-Score (50/50 ist nicht optimal)
    expect(res.coverageScore).toBeGreaterThan(res.currentCoverageScore);
    // Einzel-ETF: Ist = Ziel
    const single = optimize([etf(SPDR, 10_000)], 'marketcap');
    expect(single.currentCoverageScore).toBeCloseTo(single.coverageScore, 6);
  });

  it('Umschichtung in €: Kauf und Verkauf heben sich auf', () => {
    const res = optimize([etf(IWDA, 5_000), etf(VWRL, 5_000)], 'marketcap');
    const iwda = res.allocations.find(a => a.isin === IWDA)!;
    const vwrl = res.allocations.find(a => a.isin === VWRL)!;
    expect(iwda.deltaEur).toBeLessThan(0); // IWDA reduzieren
    expect(vwrl.deltaEur).toBeGreaterThan(0); // Vanguard aufstocken
    expect(iwda.deltaEur + vwrl.deltaEur).toBeCloseTo(0, 2);
  });

  it('liefert Sektor- und Regionen-Drift', () => {
    const res = optimize([etf(SPDR, 10_000)], 'marketcap');
    expect(res.sectorDrift.length).toBeGreaterThan(10);
    expect(res.regions.length).toBeGreaterThan(5);
    const tech = res.sectorDrift.find(s => s.code === 'technology');
    expect(tech).toBeDefined();
    expect(Math.abs(tech!.drift)).toBeLessThan(0.02);
  });

  it('GDP- und PPP-Modelle liefern andere US-Gewichtung', () => {
    const gdp = optimize([etf(SPDR, 10_000)], 'gdp');
    const ppp = optimize([etf(SPDR, 10_000)], 'ppp');
    const usGdp = gdp.countryDrift.find(c => c.code === 'US')!.benchmark;
    const usPpp = ppp.countryDrift.find(c => c.code === 'US')!.benchmark;
    expect(usGdp).toBeGreaterThan(usPpp); // USA nominal > PPP
  });
});

describe('Blend-Benchmark', () => {
  it('ist in benchmarkModels() enthalten', () => {
    expect(benchmarkModels()).toContain('blend');
  });

  it('Ländergewichte summieren zu 1', () => {
    const blend = getBenchmark('blend');
    const sum = blend.countries.reduce((a, c) => a + c.weight, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(blend.countries.length).toBeGreaterThan(50);
  });

  it('US-Gewicht liegt strikt zwischen Marktkap und GDP nominal', () => {
    const usOf = (m: BenchmarkModel) => getBenchmark(m).countryMap.get('US')!;
    const usBlend = usOf('blend');
    const usMc = usOf('marketcap');
    const usGdp = usOf('gdp');
    expect(usBlend).toBeGreaterThan(usGdp);
    expect(usBlend).toBeLessThan(usMc);
  });

  it('optimize gegen Blend läuft durch und liefert model: blend', () => {
    const res = optimize([etf(SPDR, 10_000)], 'blend');
    expect(res.model).toBe('blend');
    expect(res.allocations).toHaveLength(1);
    expect(res.allocations[0].targetWeight).toBeCloseTo(1, 6);
  });

  it('SPDR allein: höherer Active Share gegen Blend als gegen Marktkap', () => {
    const mc = optimize([etf(SPDR, 10_000)], 'marketcap');
    const blend = optimize([etf(SPDR, 10_000)], 'blend');
    expect(blend.activeShare).toBeGreaterThan(mc.activeShare);
  });
});

describe('Eingabe-Validierung', () => {
  it('wirft bei leerer ETF-Liste', () => {
    expect(() => optimize([], 'marketcap')).toThrow();
  });

  it('wirft bei Gesamtwert 0', () => {
    expect(() => optimize([etf(SPDR, 0)], 'marketcap')).toThrow(/Gesamtwert/);
  });
});

describe('Sparplan (savings)', () => {
  const saving = (isin: string, monthlyEur: number): SavingsEtf => ({
    isin,
    monthlyEur,
    data: loadEtf(isin),
  });

  it('Analyse: SPDR-Flow allein ≈ perfekte Abdeckung des Marktkap-Benchmarks', () => {
    const res = analyzeSavings([saving(SPDR, 1_000)], 'marketcap');
    expect(res.coverageScore).toBeGreaterThan(0.99);
    expect(res.allocations[0].targetWeight).toBeCloseTo(1, 6);
  });

  it('Analyse: Flow-Gewichte liefern dieselben Metriken wie Bestands-Optimierung', () => {
    const flow = analyzeSavings([saving(IWDA, 700), saving(VWRL, 300)], 'marketcap');
    const stock = optimize([etf(IWDA, 700), etf(VWRL, 300)], 'marketcap');
    expect(flow.activeShare).toBeCloseTo(stock.activeShare, 10);
    expect(flow.coverageScore).toBeCloseTo(stock.coverageScore, 10);
  });

  it('Analyse: Drift-Karten zeigen die AKTUELLE Aufteilung (Ist)', () => {
    const res = analyzeSavings([saving(IWDA, 1_000)], 'marketcap');
    const us = res.countryDrift.find(c => c.code === 'US')!;
    // IWDA ~72 % US vs. Benchmark ~62.7 % → Ist-Flow hat US-Übergewicht
    expect(us.drift).toBeGreaterThan(0.05);
    // currentCoverageScore = Score des aktuellen Flows (100 % IWDA)
    expect(res.currentCoverageScore).toBeCloseTo(1 - expectedActiveShare(IWDA), 6);
  });

  it('Vorschlag benchmark-treu: gleiche Ziel-Gewichte wie Bestands-Optimierung', () => {
    const prop = proposeSavings(
      [saving(IWDA, 500), saving(VWRL, 500)],
      [],
      'marketcap',
      'benchmark',
    );
    const stock = optimize([etf(IWDA, 500), etf(VWRL, 500)], 'marketcap');
    prop.allocations.forEach((a, i) => {
      expect(a.suggestedWeight).toBeCloseTo(stock.allocations[i].targetWeight, 6);
    });
    // Monats-€ = Gewicht × Monatsrate
    const total = prop.allocations.reduce((s, a) => s + a.suggestedMonthlyEur, 0);
    expect(total).toBeCloseTo(1_000, 0);
  });

  it('Vorschlag konvergenz-optimal: EM-Lücke im IWDA-Bestand wird gefüllt', () => {
    const portfolio = [etf(IWDA, 10_000)];
    const savings = [saving(IWDA, 500), saving(VWRL, 500)];
    const bench = proposeSavings(savings, portfolio, 'marketcap', 'benchmark');
    const conv = proposeSavings(savings, portfolio, 'marketcap', 'converge');

    const vwrlBench = bench.allocations.find(a => a.isin === VWRL)!.suggestedWeight;
    const vwrlConv = conv.allocations.find(a => a.isin === VWRL)!.suggestedWeight;
    // Konvergenz-Modus kauft mehr All-World (deckt EM ab) als benchmark-treu
    expect(vwrlConv).toBeGreaterThan(vwrlBench);

    // Beide Vorschläge haben valide Gewichte (Summe ≈ 1, nicht-negativ)
    [bench, conv].forEach(r => {
      expect(r.allocations.reduce((a, x) => a + x.suggestedWeight, 0)).toBeCloseTo(1, 8);
      expect(r.allocations.every(x => x.suggestedWeight >= -1e-9)).toBe(true);
    });
    // Beide Metriken gültig
    expect(conv.coverageScore).toBeGreaterThan(0);
    expect(bench.coverageScore).toBeGreaterThan(0);
  });

  it('Vorschlag konvergenz-optimal ohne Bestand ≡ benchmark-treu (Fallback)', () => {
    const savings = [saving(IWDA, 500), saving(VWRL, 500)];
    const conv = proposeSavings(savings, [], 'marketcap', 'converge');
    const bench = proposeSavings(savings, [], 'marketcap', 'benchmark');
    expect(conv.mode).toBe('benchmark');
    conv.allocations.forEach((a, i) => {
      expect(a.suggestedWeight).toBeCloseTo(bench.allocations[i].suggestedWeight, 8);
    });
  });

  it('Vorschlag empfiehlt ETF ohne aktuelle Sparrate (Δ > 0)', () => {
    const portfolio = [etf(IWDA, 10_000)];
    const savings = [saving(IWDA, 1_000), saving(VWRL, 0)];
    const conv = proposeSavings(savings, portfolio, 'marketcap', 'converge');
    const vwrl = conv.allocations.find(a => a.isin === VWRL)!;
    expect(vwrl.currentMonthlyEur).toBe(0);
    expect(vwrl.suggestedMonthlyEur).toBeGreaterThan(0);
  });

  it('projiziert negative b̂-Anteile (US-Übergewicht im Bestand, Blend-Modell)', () => {
    const portfolio = [etf(IWDA, 10_000)]; // US-Anteil ~72 % im Bestand
    const conv = proposeSavings([saving(IWDA, 1_000)], portfolio, 'blend', 'converge');
    expect(conv.allocations.reduce((a, x) => a + x.suggestedWeight, 0)).toBeCloseTo(1, 8);
    expect(conv.allocations.every(x => x.suggestedWeight >= -1e-9)).toBe(true);
    const us = conv.countryDrift.find(c => c.code === 'US')!;
    expect(us).toBeDefined();
    expect(Number.isFinite(us.portfolio)).toBe(true);
  });

  it('wirft bei Sparrate 0', () => {
    expect(() => proposeSavings([saving(IWDA, 0)], [], 'marketcap', 'benchmark')).toThrow(
      /Sparrate/,
    );
  });
});
