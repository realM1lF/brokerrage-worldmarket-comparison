import { getBenchmark, type Benchmark, type BenchmarkModel } from '@/lib/benchmark';
import type { EtfData } from '@/lib/etf/types';
import {
  activeShareBetween,
  countryWeights,
  isAgainstMarket,
  isEquityEtf,
  isReserveAsset,
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
 * Fragestellungen, alle mit dem vorhandenen Solver:
 * - F1 (Ist): Wie gut bildet mein aktueller Sparplan den Benchmark ab?
 * - F2 (Soll): Wie sähe der perfekte Sparplan aus?
 *   (a) benchmark-treu: Flow spiegelt direkt den Benchmark.
 *   (b) konvergenz-optimal: Bestand + 1 Monat Flow kommt dem Benchmark am
 *       nächsten (Lücken füllen). Geschlossene Form:
 *       b̂ = ((V+M)·b − V·w0)/M, dann Simplex-Projektion, dann Solve über ETFs.
 *       Grenzfall: V=0 oder M=0 → (b) ≡ (a). Langfristig (k→∞) konvergiert
 *       (b) ebenfalls gegen (a) — docs/plan-sparplan.md.
 *   (c) bestDepot: dieselben Monatsgewichte wie (a), aber nur auf einem
 *       sparsamen Baukasten (gierig von leer, Abbruch < 0,5 pp, höchstens
 *       6 Aktien-ETFs). Ungewählte Bestands-ETFs bekommen 0 €/Monat.
 *       V=0 → (c) ≡ (a).
 */

export interface SavingsEtf {
  isin: string;
  monthlyEur: number;
  data: EtfData;
}

export type SavingsProposalMode = 'benchmark' | 'converge' | 'bestDepot';

export interface SavingsAllocation {
  isin: string;
  name: string;
  currentMonthlyEur: number;
  suggestedMonthlyEur: number;
  suggestedWeight: number;
  deltaEur: number;
  /** true = Short-/Inverse-ETF ohne Länder-Exposure (s. isAgainstMarket). */
  againstMarket?: boolean;
  /** true = Gold/ETC: Reserve, Ist = Ziel. */
  reserve?: boolean;
}

export interface SavingsProposalResult {
  mode: SavingsProposalMode;
  model: BenchmarkModel;
  totalMonthlyEur: number;
  totalPortfolioEur: number;
  allocations: SavingsAllocation[];
  coverageScore: number;
  activeShare: number;
  /** Anteil der Aktien-ETFs an Bestand + Monatsrate (0..1). Score + Drift
   *  nach 1 Monat beziehen sich NUR auf diesen Teil. */
  equityShare: number;
  countryDrift: DriftEntry[];
  /** Länder der vorgeschlagenen Käufe (€/Monat), ohne Depot. */
  flowCountryDrift: DriftEntry[];
  /** Regionen der vorgeschlagenen Käufe (€/Monat), ohne Depot. */
  flowRegions: RegionEntry[];
  /** Deckungs-Score nur der vorgeschlagenen Käufe (ohne Depot). */
  flowCoverageScore: number;
  /** Länder des Depots heute. null ohne Bestand. */
  depotCountryDrift: DriftEntry[] | null;
  /** Aktien-Bestand €, ohne Reserve. Für p(k). */
  equityPortfolioEur: number;
  /** Aktien-Sparrate €/Monat, ohne Reserve. Für p(k). */
  equityMonthlyEur: number;
}

export type HorizonUnit = 'months' | 'years';

export interface DepotProjection {
  months: number;
  coverageScore: number;
  activeShare: number;
  equityShare: number;
  countryDrift: DriftEntry[];
}

const HORIZON_MONTHS_MAX = 600;

/** Monate aus der Laien-Eingabe. Jahre × 12, negativ → 0, höchstens 50 Jahre. */
export function horizonToMonths(value: number, unit: HorizonUnit): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  const months = unit === 'years' ? value * 12 : value;
  return Math.min(HORIZON_MONTHS_MAX, Math.round(months));
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

  // L1/L2-Mismatch (Bug 6, 2026-08-17): Der Solver minimiert L2
  // (||A·w−b||²), die Anzeige-Metrik ist aber L1 (Active Share). In seltenen
  // Fällen (1,6 % der Flow-Kombis, max. 0,16 pp) ist die Ist-Aufteilung in
  // L1 minimal besser als die L2-optimale Lösung. Dann zeigt die
  // Anzeige-Metrik die bessere der beiden Lösungen, damit "Optimaler
  // Sparplan" nie UNTER "Sparplan heute" liegt.
  if (base.coverageScore < base.currentCoverageScore) {
    base.coverageScore = base.currentCoverageScore;
    base.activeShare = base.currentActiveShare;
  }

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
  opts?: { keepIsins?: ReadonlySet<string>; maxTer?: number | null },
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
    mode === 'converge' && V > 0
      ? 'converge'
      : mode === 'bestDepot' && V > 0
        ? 'bestDepot'
        : 'benchmark';

  const universe = buildUniverse(equitySavings, equityPortfolio, benchmark);
  const b = universe.map(code => benchmark.countryMap.get(code) ?? 0);

  let target: number[];
  if (effectiveMode === 'converge') {
    const w0 = portfolioCountryWeights(equityPortfolio, universe);
    const bHat = universe.map((_, i) => ((V + M) * b[i] - V * w0[i]) / M);
    target = projectSimplex(bHat);
  } else {
    // benchmark und bestDepot: Flow = Weltmarkt, so gut es die ETFs können.
    target = b;
  }

  let solveSavings = equitySavings;
  const maxTer = opts?.maxTer ?? null;
  const cheapEquity =
    maxTer == null
      ? equitySavings
      : equitySavings.filter(s => {
          const ter = s.data.profile.ter;
          return ter != null && Number.isFinite(ter) && ter > 0 && ter <= maxTer + 1e-9;
        });
  const pickFrom = cheapEquity.length > 0 ? cheapEquity : equitySavings;
  const keepIsins = opts?.keepIsins;
  if (keepIsins && keepIsins.size > 0) {
    const sparse = pickFrom.filter(s => keepIsins.has(s.isin));
    if (sparse.length > 0) solveSavings = sparse;
  } else if (effectiveMode === 'bestDepot') {
    const keep = new Set(pickBestDepotEtfs(pickFrom, model).map(p => p.isin));
    const sparse = pickFrom.filter(s => keep.has(s.isin));
    if (sparse.length > 0) solveSavings = sparse;
  } else if (pickFrom !== equitySavings) {
    solveSavings = pickFrom;
  }

  const A = buildMatrix(solveSavings, universe);
  const { x } = solveWeights(A, target);

  // Allokationen: equity ueber Aktien-Flow verteilt, nonEquity bleibt fix.
  // bestDepot: ungewählte Aktien-ETFs bekommen 0 €/Monat.
  const eqIsinToW = new Map(solveSavings.map((s, j) => [s.isin, x[j]]));
  const allocations: SavingsAllocation[] = savings.map(s => {
    if (!isEquityEtf(s.data)) {
      return {
        isin: s.isin, name: s.data.profile.name,
        currentMonthlyEur: s.monthlyEur,
        suggestedMonthlyEur: s.monthlyEur,
        suggestedWeight: s.monthlyEur / Mtotal,
        deltaEur: 0,
        againstMarket: isAgainstMarket(s.data),
        reserve: isReserveAsset(s.data),
      };
    }
    const w = eqIsinToW.get(s.isin) ?? 0;
    const suggested = round2(w * M);
    return {
      isin: s.isin, name: s.data.profile.name,
      currentMonthlyEur: s.monthlyEur,
      suggestedMonthlyEur: suggested,
      suggestedWeight: w * M / Mtotal,
      deltaEur: round2(suggested - s.monthlyEur),
    };
  });

  // p(1)-Metrik: Portfolio nach 1 Monat, nur Aktien-Teil.
  const w0 = V > 0 ? portfolioCountryWeights(equityPortfolio, universe) : universe.map(() => 0);
  const flowC = flowCountryWeights(solveSavings, x);
  const p1Book = universe.map((code, i) => {
    const fw = flowC.get(code) ?? 0;
    return V > 0 ? (V * w0[i] + M * fw) / (V + M) : fw;
  });
  const portfolioAfter = new Map(universe.map((code, i) => [code, p1Book[i]]));

  const bm = benchmark.countryMap;
  const suggestedActiveShare = activeShareBetween(portfolioAfter, bm, universe);

  // L1/L2-Mismatch (Bug 6, 2026-08-17): Solver minimiert L2, Anzeige ist L1
  // (Active Share). In seltenen Fällen (1,6 % der Flow-Kombis, max. 0,16 pp)
  // ist die Ist-Aufteilung in L1 minimal besser als die L2-optimale Lösung.
  // Dann zeigt die Anzeige-Metrik die bessere der beiden Lösungen.
  const wCur = equitySavings.map(s => s.monthlyEur / M);
  const flowCur = flowCountryWeights(equitySavings, wCur);
  const portfolioCur = new Map(universe.map((code, i) => {
    const fw = flowCur.get(code) ?? 0;
    return [code, V > 0 ? (V * w0[i] + M * fw) / (V + M) : fw];
  }));
  const currentActiveShare = activeShareBetween(portfolioCur, bm, universe);

  const activeShare = Math.min(suggestedActiveShare, currentActiveShare);
  const coverageScore = Math.max(0, Math.min(1, 1 - activeShare));
  const countryDrift = buildCountryDrift(portfolioAfter, universe, benchmark);
  const flowCountryDrift = buildCountryDrift(flowC, universe, benchmark);
  const flowRegionWeights = weightedAggregate(x, solveSavings, regionWeights);
  const regionUniverse = unionKeys(flowRegionWeights, benchmark.regionMap);
  const flowRegions: RegionEntry[] = regionUniverse.map(code => ({
    code,
    name: benchmark.regions.find(r => r.code === code)?.name ?? code,
    benchmark: benchmark.regionMap.get(code) ?? 0,
    portfolio: flowRegionWeights.get(code) ?? 0,
  }));
  const flowCoverageScore = Math.max(
    0,
    Math.min(1, 1 - activeShareBetween(flowC, bm, universe)),
  );
  const depotCountryDrift =
    V > 0
      ? buildCountryDrift(new Map(universe.map((code, i) => [code, w0[i]])), universe, benchmark)
      : null;

  const totalPortfolioEur = portfolio.reduce((a, e) => a + e.amountEur, 0);
  return {
    mode: effectiveMode,
    model,
    totalMonthlyEur: Mtotal,
    totalPortfolioEur,
    allocations,
    coverageScore,
    activeShare,
    equityShare: (V + M) / (totalPortfolioEur + Mtotal),
    countryDrift,
    flowCountryDrift,
    flowRegions,
    flowCoverageScore,
    depotCountryDrift,
    equityPortfolioEur: V,
    equityMonthlyEur: M,
  };
}

/**
 * Depot nach k Monaten mit dem vorgeschlagenen Sparplan.
 * p(k) = (V·w0 + k·M·s) / (V + k·M). Ohne Kurse, ohne Zinsen.
 */
export function projectDepotAfterMonths(
  proposal: SavingsProposalResult,
  months: number,
): DepotProjection {
  const k = Math.max(0, Math.round(months));
  const V = proposal.equityPortfolioEur;
  const M = proposal.equityMonthlyEur;
  const denom = V + k * M;
  const benchmark = getBenchmark(proposal.model);
  const w0 = weightsFromDrift(proposal.depotCountryDrift);
  const flow = weightsFromDrift(proposal.flowCountryDrift);
  const universe = Array.from(
    new Set([...w0.keys(), ...flow.keys(), ...benchmark.countryMap.keys()]),
  ).sort();

  const portfolio = new Map<string, number>();
  if (denom <= 0) {
    for (const code of universe) portfolio.set(code, 0);
  } else {
    for (const code of universe) {
      portfolio.set(
        code,
        (V * (w0.get(code) ?? 0) + k * M * (flow.get(code) ?? 0)) / denom,
      );
    }
  }

  const activeShare = denom <= 0 ? 1 : activeShareBetween(portfolio, benchmark.countryMap, universe);
  const coverageScore = Math.max(0, Math.min(1, 1 - activeShare));
  const book = proposal.totalPortfolioEur + k * proposal.totalMonthlyEur;
  const equityShare = book > 0 ? denom / book : 0;

  return {
    months: k,
    coverageScore,
    activeShare,
    equityShare,
    countryDrift: buildCountryDrift(portfolio, universe, benchmark),
  };
}

function weightsFromDrift(entries: DriftEntry[] | null): Map<string, number> {
  const map = new Map<string, number>();
  if (!entries) return map;
  for (const e of entries) map.set(e.code, e.portfolio);
  return map;
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

const MAX_BEST_DEPOT = 6;
const MIN_BEST_DEPOT_IMPROVEMENT = 0.005; // 0,5 pp

export interface BestDepotPick {
  isin: string;
  score: number;
  improvement: number;
}

const TER_TIE_PP = 0.0005; // 0,05 pp: dann die günstigere TER

function terOf(data: EtfData): number {
  return data.profile.ter ?? Number.POSITIVE_INFINITY;
}

/**
 * Gierig von leer: nächster ETF mit der größten Score-Verbesserung.
 * Bei fast gleichem Zugewinn (< 0,05 pp) gewinnt die niedrigere TER
 * (Preis-Leistung, Finanzfluss-Logik). Max. 6, Abbruch unter 0,5 pp.
 */
export function pickBestDepotEtfs(
  pool: { isin: string; data: EtfData }[],
  model: BenchmarkModel,
): BestDepotPick[] {
  const unique: { isin: string; data: EtfData }[] = [];
  const seen = new Set<string>();
  for (const p of pool) {
    if (!isEquityEtf(p.data) || seen.has(p.isin)) continue;
    seen.add(p.isin);
    unique.push(p);
  }
  const picks: BestDepotPick[] = [];
  const selected: { isin: string; data: EtfData }[] = [];
  let currentScore = 0;
  for (let step = 0; step < MAX_BEST_DEPOT; step++) {
    let best: { item: { isin: string; data: EtfData }; score: number; improvement: number } | null =
      null;
    for (const c of unique) {
      if (selected.some(s => s.isin === c.isin)) continue;
      const etfs = [...selected, c].map(e => ({ isin: e.isin, amountEur: 1000, data: e.data }));
      const score = optimize(etfs, model).coverageScore;
      const improvement = score - currentScore;
      if (!best) {
        best = { item: c, score, improvement };
        continue;
      }
      if (improvement > best.improvement + TER_TIE_PP) {
        best = { item: c, score, improvement };
        continue;
      }
      if (Math.abs(improvement - best.improvement) <= TER_TIE_PP && terOf(c.data) < terOf(best.item.data)) {
        best = { item: c, score, improvement };
      }
    }
    if (!best || best.improvement < MIN_BEST_DEPOT_IMPROVEMENT) break;
    selected.push(best.item);
    currentScore = best.score;
    picks.push({ isin: best.item.isin, score: best.score, improvement: best.improvement });
  }
  return picks;
}