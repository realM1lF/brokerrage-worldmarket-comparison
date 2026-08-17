import { getBenchmark, type Benchmark, type BenchmarkModel } from '@/lib/benchmark';
import type { EtfData } from '@/lib/etf/types';
import {
  activeShareBetween,
  countryWeights,
  isEquityEtf,
  optimize,
  projectSimplex,
  regionWeights,
  sectorWeights,
  solveWeights,
  type DriftEntry,
  type OptimizeResult,
  type PortfolioEtf,
  type RegionEntry,
} from './optimize';

/**
 * Sparplan-Kern: monatliche Flows (€/Monat) statt Bestand (€).
 *
 * Zwei Fragestellungen, beide mit dem vorhandenen Solver:
 * - F1 (Ist): Wie gut bildet mein aktueller Sparplan den Benchmark ab?
 * - F2 (Soll): Wie sähe der perfekte Sparplan aus?
 *   (a) benchmark-treu: Flow spiegelt direkt den Benchmark.
 *   (b) konvergenz-optimal: Bestand + 1 Monat Flow kommt dem Benchmark am
 *       nächsten (Lücken füllen). Geschlossene Form:
 *       b̂ = ((V+M)·b − V·w0)/M, dann Simplex-Projektion, dann Solve über ETFs.
 *       Grenzfall: V=0 oder M=0 → (b) ≡ (a). Langfristig (k→∞) konvergiert
 *       (b) ebenfalls gegen (a) — docs/plan-sparplan.md.
 */

export interface SavingsEtf {
  isin: string;
  monthlyEur: number;
  data: EtfData;
}

export type SavingsProposalMode = 'benchmark' | 'converge';

export interface SavingsAllocation {
  isin: string;
  name: string;
  currentMonthlyEur: number;
  suggestedMonthlyEur: number;
  suggestedWeight: number;
  deltaEur: number;
}

export interface SavingsProposalResult {
  mode: SavingsProposalMode;
  model: BenchmarkModel;
  totalMonthlyEur: number;
  totalPortfolioEur: number;
  allocations: SavingsAllocation[];
  coverageScore: number;
  activeShare: number;
  countryDrift: DriftEntry[];
}

/* ================= F1: Sparplan-Analyse (Ist) ================= */

const MISSING_REL = 0.001; // Portfolio-Anteil < 0.1% des Benchmark-Gewichts -> fehlend
const MISSING_MIN = 0.0005; // 0.05% Benchmark-Gewicht als Untergrenze

/**
 * Analysiert den aktuellen Sparplan gegen den Benchmark.
 *
 * Nicht-Aktien-Flows (z.B. Gold) bleiben unveraendert (Ist = Ziel, Delta 0);
 * Optimierung + Ist-Analyse laufen nur ueber die Aktien-Flows.
 * Scores: coverageScore/activeShare = OPTIMALER Aktien-Sparplan (aus
 * optimize()), currentCoverageScore/currentActiveShare = Sparplan HEUTE.
 * Drift-Karten zeigen die AKTUELLE Aktien-Aufteilung.
 */
export function analyzeSavings(savings: SavingsEtf[], model: BenchmarkModel): OptimizeResult {
  if (savings.length === 0) throw new Error('Keine Sparplan-ETFs angegeben');
  const etfs: PortfolioEtf[] = savings.map(s => ({
    isin: s.isin,
    amountEur: s.monthlyEur,
    data: s.data,
  }));
  const base = optimize(etfs, model);

  const benchmark = getBenchmark(model);
  // Ist-Analyse ueber die Aktien-Flows, normalisiert auf deren Summe.
  const equity = savings.filter(s => isEquityEtf(s.data));
  const M = equity.reduce((a, s) => a + s.monthlyEur, 0);
  if (M <= 0) throw new Error('Aktien-Sparrate muss > 0 sein');
  const w = equity.map(s => s.monthlyEur / M);
  const flowCountries = weightedAggregate(w, equity, countryWeights);
  const flowSectors = weightedAggregate(w, equity, sectorWeights);
  const flowRegions = weightedAggregate(w, equity, regionWeights);

  const countryUniverse = unionKeys(flowCountries, benchmark.countryMap);
  const countryDrift = buildCountryDrift(flowCountries, countryUniverse, benchmark);
  const topOverweight = countryDrift.filter(d => d.drift > 0).sort((a, b) => b.drift - a.drift);
  const topUnderweight = countryDrift.filter(d => d.drift < 0).sort((a, b) => a.drift - b.drift);
  const missingCountries = countryDrift.filter(
    d => d.benchmark > MISSING_MIN && d.portfolio <= d.benchmark * MISSING_REL,
  );

  const sectorUniverse = unionKeys(flowSectors, benchmark.sectorMap);
  const sectorDrift = buildGenericDrift(
    flowSectors,
    sectorUniverse,
    benchmark.sectorMap,
    code => benchmark.sectors.find(s => s.code === code)?.name ?? code,
  );

  const regionUniverse = unionKeys(flowRegions, benchmark.regionMap);
  const regions: RegionEntry[] = regionUniverse.map(code => ({
    code,
    name: benchmark.regions.find(r => r.code === code)?.name ?? code,
    benchmark: benchmark.regionMap.get(code) ?? 0,
    portfolio: flowRegions.get(code) ?? 0,
  }));

  return {
    ...base,
    countryDrift,
    topOverweight,
    topUnderweight,
    missingCountries,
    sectorDrift,
    regions,
  };
}

/* ================= F2: Sparplan-Vorschlag ================= */

/**
 * Berechnet den optimalen Sparplan.
 *
 * benchmark-treu: w = Lösung von ||A·w − b||² s.t. w ∈ Δ.
 * konvergenz-optimal: b̂ = ((V+M)·b − V·w0)/M,
 *   dann w = Lösung von ||A·w − projΔ(b̂)||².
 *   p(1) = (V·w0 + M·A·w)/(V+M) = Portfolio nach 1 Monat.
 *
 * savings: Flows aller im Universum verfügbaren ETFs (currentMonthlyEur
 *   darf 0 sein — der Vorschlag kann ETFs empfehlen, die noch nicht bespart
 *   werden).
 * portfolio: Bestand (darf leer sein → converge ≡ benchmark).
 * Ist V=0 oder M=0, fällt converge-Modus automatisch auf benchmark zurück.
 */
export function proposeSavings(
  savings: SavingsEtf[],
  portfolio: PortfolioEtf[],
  model: BenchmarkModel,
  mode: SavingsProposalMode,
): SavingsProposalResult {
  if (savings.length === 0) throw new Error('Keine Sparplan-ETFs angegeben');
  const Mtotal = savings.reduce((a, s) => a + s.monthlyEur, 0);
  if (Mtotal <= 0) throw new Error('Sparrate muss > 0 sein');

  // Nur Aktien-ETFs werden optimiert; Nicht-Aktien (Gold, ...) bleiben fix.
  const equitySavings = savings.filter(s => isEquityEtf(s.data));
  if (equitySavings.length === 0) throw new Error('Sparplan ohne Aktien-ETFs');
  const M = equitySavings.reduce((a, s) => a + s.monthlyEur, 0);
  if (M <= 0) throw new Error('Aktien-Sparrate muss > 0 sein');
  const equityPortfolio = portfolio.filter(e => isEquityEtf(e.data));
  const V = equityPortfolio.reduce((a, e) => a + e.amountEur, 0);

  const benchmark = getBenchmark(model);
  const effectiveMode: SavingsProposalMode =
    mode === 'converge' && V > 0 ? 'converge' : 'benchmark';

  const universe = buildUniverse(equitySavings, equityPortfolio, benchmark);
  const b = universe.map(code => benchmark.countryMap.get(code) ?? 0);

  let target: number[];
  if (effectiveMode === 'benchmark') {
    target = b;
  } else {
    const w0 = portfolioCountryWeights(equityPortfolio, universe);
    const bHat = universe.map((_, i) => ((V + M) * b[i] - V * w0[i]) / M);
    target = projectSimplex(bHat);
  }

  const A = buildMatrix(equitySavings, universe);
  const { x } = solveWeights(A, target);

  // Allokationen: equity ueber Aktien-Flow verteilt, nonEquity bleibt fix.
  const eqIsinToX = new Map(equitySavings.map((s, j) => [s.isin, j]));
  const allocations: SavingsAllocation[] = savings.map(s => {
    const j = eqIsinToX.get(s.isin);
    if (j === undefined) {
      return {
        isin: s.isin, name: s.data.profile.name,
        currentMonthlyEur: s.monthlyEur,
        suggestedMonthlyEur: s.monthlyEur,
        suggestedWeight: s.monthlyEur / Mtotal,
        deltaEur: 0,
      };
    }
    const suggested = round2(x[j] * M);
    return {
      isin: s.isin, name: s.data.profile.name,
      currentMonthlyEur: s.monthlyEur,
      suggestedMonthlyEur: suggested,
      suggestedWeight: x[j] * M / Mtotal,
      deltaEur: round2(suggested - s.monthlyEur),
    };
  });

  // p(1)-Metrik: Portfolio nach 1 Monat, nur Aktien-Teil.
  const w0 = V > 0 ? portfolioCountryWeights(equityPortfolio, universe) : universe.map(() => 0);
  const flowC = flowCountryWeights(equitySavings, x);
  const p1Book = universe.map((code, i) => {
    const fw = flowC.get(code) ?? 0;
    return V > 0 ? (V * w0[i] + M * fw) / (V + M) : fw;
  });
  const portfolioAfter = new Map(universe.map((code, i) => [code, p1Book[i]]));

  const bm = benchmark.countryMap;
  const activeShare = activeShareBetween(portfolioAfter, bm, universe);
  const coverageScore = Math.max(0, Math.min(1, 1 - activeShare));
  const countryDrift = buildCountryDrift(portfolioAfter, universe, benchmark);

  return {
    mode: effectiveMode,
    model,
    totalMonthlyEur: Mtotal,
    totalPortfolioEur: portfolio.reduce((a, e) => a + e.amountEur, 0),
    allocations,
    coverageScore,
    activeShare,
    countryDrift,
  };
}

/* ================= Helfer ================= */

function buildUniverse(
  savings: SavingsEtf[],
  portfolio: PortfolioEtf[],
  benchmark: Benchmark,
): string[] {
  const codes = new Set<string>();
  for (const s of savings) for (const code of countryWeights(s.data).keys()) codes.add(code);
  for (const e of portfolio) for (const code of countryWeights(e.data).keys()) codes.add(code);
  for (const c of benchmark.countries) codes.add(c.code);
  return Array.from(codes).sort();
}

function buildMatrix(savings: SavingsEtf[], universe: string[]): number[][] {
  return universe.map(code =>
    savings.map(s => countryWeights(s.data).get(code) ?? 0),
  );
}

/** Bestands-Ländergewichte über das Universum (0..1 je Code, Summe≈1). */
function portfolioCountryWeights(portfolio: PortfolioEtf[], universe: string[]): number[] {
  const V = portfolio.reduce((a, e) => a + e.amountEur, 0);
  if (V <= 0) return universe.map(() => 0);
  const map = new Map<string, number>();
  for (const e of portfolio) {
    const w = e.amountEur / V;
    for (const [code, cw] of countryWeights(e.data)) {
      map.set(code, (map.get(code) ?? 0) + w * cw);
    }
  }
  return universe.map(code => map.get(code) ?? 0);
}

/** Ländergewichte des Flows (flow Wei ghts × ETF-Weights). */
function flowCountryWeights(savings: SavingsEtf[], x: number[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let j = 0; j < savings.length; j++) {
    if (x[j] <= 0) continue;
    for (const [code, w] of countryWeights(savings[j].data)) {
      map.set(code, (map.get(code) ?? 0) + x[j] * w);
    }
  }
  return map;
}

/** Gewichtete Aggregation über ETFs mit beliebiger Gewichts-/Exposure-Quelle. */
function weightedAggregate(
  w: number[],
  savings: SavingsEtf[],
  extract: (data: EtfData) => Map<string, number>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (let j = 0; j < savings.length; j++) {
    if (w[j] <= 0) continue;
    for (const [code, v] of extract(savings[j].data)) {
      map.set(code, (map.get(code) ?? 0) + w[j] * v);
    }
  }
  return map;
}

function unionKeys(a: Map<string, number>, b: Map<string, number>): string[] {
  return Array.from(new Set([...a.keys(), ...b.keys()])).sort();
}

/** Drift-Liste für beliebige Exposure-Kategorien (Sektoren etc.). */
function buildGenericDrift(
  portfolio: Map<string, number>,
  universe: string[],
  benchmark: Map<string, number>,
  nameOf: (code: string) => string,
): DriftEntry[] {
  return universe
    .map(code => {
      const bw = benchmark.get(code) ?? 0;
      const pw = portfolio.get(code) ?? 0;
      return { code, name: code === '_OTHER' ? 'Rest' : nameOf(code), benchmark: bw, portfolio: pw, drift: pw - bw };
    })
    .sort((a, b) => b.benchmark - a.benchmark);
}

function buildCountryDrift(
  portfolio: Map<string, number>,
  universe: string[],
  benchmark: Benchmark,
): DriftEntry[] {
  const nameOf = (code: string): string => {
    if (code === '_OTHER') return 'Rest (Cash/Derivate)';
    return benchmark.countries.find(c => c.code === code)?.name ?? code;
  };
  return universe
    .map(code => {
      const bw = benchmark.countryMap.get(code) ?? 0;
      const pw = portfolio.get(code) ?? 0;
      return { code, name: nameOf(code), benchmark: bw, portfolio: pw, drift: pw - bw };
    })
    .sort((a, b) => b.benchmark - a.benchmark);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}