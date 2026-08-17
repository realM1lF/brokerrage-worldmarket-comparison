import { getBenchmark } from '@/lib/benchmark';
import type { Benchmark, BenchmarkModel } from '@/lib/benchmark';
import type { EtfData } from '@/lib/etf/types';

/**
 * Rechenkern: konvexe Optimierung (Σw=1, w≥0) + Metriken.
 * Minimiere ||A·w − b||² über das Land-Universum (Benchmark ∪ ETFs ∪ Rest).
 */

const OTHER = '_OTHER';
/** Restposten unter diesem Anteil wird ignoriert (Mess-/Cash-Rauschen). */
const OTHER_EPS = 1e-4;

export interface PortfolioEtf {
  isin: string;
  amountEur: number;
  /** Monatliche Sparrate (optional, Sparplan-Analyse). */
  monthlyEur?: number;
  data: EtfData;
}

export interface EtfAllocation {
  isin: string;
  name: string;
  amountEur: number;
  currentWeight: number;
  targetWeight: number;
  deltaEur: number;
}

export interface DriftEntry {
  code: string;
  name: string;
  benchmark: number;
  portfolio: number;
  drift: number;
}

export interface RegionEntry {
  code: string;
  name: string;
  benchmark: number;
  portfolio: number;
}

export interface OptimizeResult {
  model: BenchmarkModel;
  totalEur: number;
  allocations: EtfAllocation[];
  coverageScore: number;
  activeShare: number;
  /** Ist-Zustand (vor Umschichtung): wie nah ist das Portfolio HEUTE am Benchmark. */
  currentCoverageScore: number;
  currentActiveShare: number;
  objectiveValue: number;
  iterations: number;
  converged: boolean;
  countryDrift: DriftEntry[];
  topOverweight: DriftEntry[];
  topUnderweight: DriftEntry[];
  missingCountries: DriftEntry[];
  sectorDrift: DriftEntry[];
  regions: RegionEntry[];
}

/* ================= Länder-Vektor je ETF ================= */

/** Länderanteile 0..1, Rest (Cash/Derivate) unter `_OTHER`. */
export function countryWeights(data: EtfData): Map<string, number> {
  const map = new Map<string, number>();
  let total = 0;
  for (const c of data.exposures.countries) {
    const code = c.code ?? c.name;
    const w = c.value / 100;
    map.set(code, (map.get(code) ?? 0) + w);
    total += w;
  }
  if (total < 1 - OTHER_EPS) {
    map.set(OTHER, round(1 - total));
  }
  return map;
}

/** Sektoranteile 0..1, Rest unter `_OTHER`. */
export function sectorWeights(data: EtfData): Map<string, number> {
  return exposureMap(data.exposures.sectors);
}

/** Regionenanteile 0..1, Rest unter `_OTHER`. */
export function regionWeights(data: EtfData): Map<string, number> {
  return exposureMap(data.exposures.regions);
}

function exposureMap(entries: { code?: string; name: string; value: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  let total = 0;
  for (const e of entries) {
    const code = e.code ?? e.name;
    const w = e.value / 100;
    map.set(code, (map.get(code) ?? 0) + w);
    total += w;
  }
  if (total < 1 - OTHER_EPS) {
    map.set(OTHER, round(1 - total));
  }
  return map;
}

/* ================= Matrix + Zielfunktion ================= */

function buildCountryMatrix(
  etfs: PortfolioEtf[],
  benchmark: Benchmark,
): { universe: string[]; A: number[][]; b: number[] } {
  const codes = new Set<string>();
  for (const etf of etfs) {
    for (const code of countryWeights(etf.data).keys()) codes.add(code);
  }
  for (const c of benchmark.countries) codes.add(c.code);
  const universe = Array.from(codes).sort();

  const A: number[][] = universe.map(() => etfs.map(() => 0));
  for (let j = 0; j < etfs.length; j++) {
    const weights = countryWeights(etfs[j].data);
    for (let i = 0; i < universe.length; i++) {
      A[i][j] = weights.get(universe[i]) ?? 0;
    }
  }

  const b = universe.map(code => benchmark.countryMap.get(code) ?? 0);
  return { universe, A, b };
}

/* ================= Simplex-Projektion (Duchi et al.) ================= */

export function projectSimplex(y: number[]): number[] {
  const n = y.length;
  const u = [...y].sort((a, b) => b - a);
  let cssv = 0;
  let rho = 0;
  for (let i = 0; i < n; i++) {
    cssv += u[i];
    if (u[i] - (cssv - 1) / (i + 1) > 0) rho = i;
  }
  // Duchi: theta aus der Teilsumme der rho groessten Elemente, nicht aus der
  // Gesamtsumme (sonst Summe > 1, sobald negative Eintraege auftreten).
  const rhoSum = u.slice(0, rho + 1).reduce((acc, val) => acc + val, 0);
  const theta = (rhoSum - 1) / (rho + 1);
  return y.map(v => Math.max(v - theta, 0));
}

/* ================= Projected Gradient Descent ================= */

export interface SolveResult {
  x: number[];
  obj: number;
  iterations: number;
  converged: boolean;
}

/**
 * Minimiere ||A·x − b||² s.t. Σx=1, x≥0.
 * A: m×n (Länder × ETFs), b: Länge m.
 */
export function solveWeights(
  A: number[][],
  b: number[],
  maxIter = 10_000,
  tol = 1e-10,
): SolveResult {
  const n = A[0]?.length ?? 0;
  const m = A.length;
  if (n === 0) throw new Error('Leere ETF-Matrix');
  if (m === 0) throw new Error('Leeres Land-Universum');

  let x = Array(n).fill(1 / n);
  const f = (v: number[]) => {
    const r = matVec(A, v).map((val, i) => val - b[i]);
    return dot(r, r);
  };

  let converged = false;
  let iterations = 0;
  for (let it = 0; it < maxIter; it++) {
    iterations = it + 1;
    const r = matVec(A, x).map((val, i) => val - b[i]);
    const g = matTransVec(A, r);
    const fCur = dot(r, r);

    let alpha = 1;
    let xNew = x;
    let fNew = fCur;
    while (alpha > 1e-14) {
      xNew = projectSimplex(x.map((xj, j) => xj - alpha * g[j]));
      fNew = f(xNew);
      const d = xNew.map((xj, j) => xj - x[j]);
      const gd = dot(g, d);
      if (fNew <= fCur + 1e-4 * gd) break;
      alpha *= 0.5;
    }

    const diff = Math.max(...xNew.map((xj, j) => Math.abs(xj - x[j])));
    x = xNew;
    // Konvergenz: Gewichtsverschiebung < tol ODER Zielfunktion stationär
    // (flaches Optimum bei stark überlappenden ETFs — x bewegt sich ohne f-Änderung).
    if (diff < tol || Math.abs(fCur - fNew) <= 1e-12 * Math.max(1, fCur)) {
      converged = true;
      break;
    }
  }

  return { x, obj: f(x), iterations, converged };
}

/* ================= Aggregation ================= */

function aggregate(
  weights: number[],
  etfs: PortfolioEtf[],
  extract: (data: EtfData) => Map<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (let j = 0; j < etfs.length; j++) {
    if (weights[j] <= 0) continue;
    for (const [code, w] of extract(etfs[j].data)) {
      out.set(code, (out.get(code) ?? 0) + weights[j] * w);
    }
  }
  return out;
}

/* ================= Metriken ================= */

export function activeShareBetween(
  portfolio: Map<string, number>,
  benchmark: Map<string, number>,
  universe: string[],
): number {
  let sum = 0;
  for (const code of universe) {
    const p = portfolio.get(code) ?? 0;
    const b = benchmark.get(code) ?? 0;
    sum += Math.abs(p - b);
  }
  return sum / 2;
}

const MISSING_REL = 0.001; // Portfolio-Anteil < 0.1% des Benchmark-Gewichts -> fehlend
const MISSING_MIN = 0.0005; // 0.05% Benchmark-Gewicht als Untergrenze

function buildDrift(
  universe: string[],
  portfolio: Map<string, number>,
  benchmark: Map<string, number>,
  nameOf: (code: string) => string,
): DriftEntry[] {
  const entries: DriftEntry[] = [];
  for (const code of universe) {
    const bw = benchmark.get(code) ?? 0;
    const pw = portfolio.get(code) ?? 0;
    entries.push({ code, name: nameOf(code), benchmark: bw, portfolio: pw, drift: pw - bw });
  }
  return entries;
}

/* ================= Hauptfunktion ================= */

/**
 * true, wenn der ETF echte Länder-Exposure hat (Aktien-ETF).
 * Nicht-Aktien-Werte (Gold-ETC, Anleihen, Einzelaktien) haben keine
 * Länder-Exposure: sie werden NICHT in die Optimierung einbezogen,
 * Ziel = Ist, Delta = 0. Der Benchmark deckt nur den Aktien-Weltmarkt ab.
 */
export function isEquityEtf(data: EtfData): boolean {
  for (const [code, w] of countryWeights(data)) {
    if (code !== OTHER && w > 0) return true;
  }
  return false;
}

export function optimize(etfs: PortfolioEtf[], model: BenchmarkModel): OptimizeResult {
  if (etfs.length === 0) throw new Error('Keine ETFs angegeben');
  const totalEur = etfs.reduce((acc, e) => acc + e.amountEur, 0);
  if (totalEur <= 0) throw new Error('Portfolio-Gesamtwert muss > 0 sein');
  if (etfs.some(e => e.amountEur < 0)) throw new Error('Negative Beträge nicht erlaubt');

  const benchmark = getBenchmark(model);

  // Nicht-Aktien-ETFs (z.B. Gold) raus aus der Aktien-Optimierung.
  const equity = etfs.filter(e => isEquityEtf(e.data));
  if (equity.length === 0) {
    throw new Error('Keine Aktien-ETFs im Portfolio (nur Nicht-Aktien-Werte wie Gold)');
  }
  const equityEur = equity.reduce((acc, e) => acc + e.amountEur, 0);
  if (equityEur <= 0) throw new Error('Aktien-ETFs haben zusammen 0 €');
  const equityShare = equityEur / totalEur;

  const { A, b } = buildCountryMatrix(equity, benchmark);
  const { x, obj, iterations, converged } = solveWeights(A, b);

  // Allokation: equity Ziel-Gewichte = Lösung skaliert auf den Aktien-Anteil
  // des Depots; nonEquity bleibt unveraendert (Ist = Ziel, Delta 0).
  const eqX = new Map(equity.map((e, k) => [e, k]));
  const allocations: EtfAllocation[] = etfs.map(e => {
    const currentWeight = e.amountEur / totalEur;
    const k = eqX.get(e);
    if (k === undefined) {
      return {
        isin: e.isin,
        name: e.data.profile.name,
        amountEur: e.amountEur,
        currentWeight,
        targetWeight: currentWeight,
        deltaEur: 0,
      };
    }
    const targetWeight = x[k] * equityShare;
    return {
      isin: e.isin,
      name: e.data.profile.name,
      amountEur: e.amountEur,
      currentWeight,
      targetWeight,
      deltaEur: (targetWeight - currentWeight) * totalEur,
    };
  });

  // Aggregationen ueber den AKTIEN-Teil, normalisiert auf dessen Summe.
  const equityCurrentW = equity.map(e => e.amountEur / equityEur);

  // Portfolio-Ländergewichte (Ziel = Aktien-Teil nach Umschichtung)
  const portfolioCountries = aggregate(x, equity, countryWeights);
  const benchmarkCountries = new Map(benchmark.countries.map(c => [c.code, c.weight]));

  const countryUniverse = Array.from(
    new Set([...benchmarkCountries.keys(), ...portfolioCountries.keys()]),
  ).sort();

  // Ist-Zustand (vor Umschichtung): Aktien-Teil heute gegen Benchmark
  const currentCountries = aggregate(equityCurrentW, equity, countryWeights);
  const currentActiveShare = activeShareBetween(currentCountries, benchmarkCountries, countryUniverse);
  const currentCoverageScore = Math.max(0, Math.min(1, 1 - currentActiveShare));

  const activeShare = activeShareBetween(portfolioCountries, benchmarkCountries, countryUniverse);
  const coverageScore = Math.max(0, Math.min(1, 1 - activeShare));

  const nameOfCountry = (code: string): string => {
    if (code === OTHER) return 'Rest (Cash/Derivate)';
    return benchmark.countries.find(c => c.code === code)?.name ?? code;
  };

  const drift = buildDrift(countryUniverse, portfolioCountries, benchmarkCountries, nameOfCountry)
    .sort((a, b) => b.benchmark - a.benchmark);

  const topOverweight = drift.filter(d => d.drift > 0).sort((a, b) => b.drift - a.drift);
  const topUnderweight = drift.filter(d => d.drift < 0).sort((a, b) => a.drift - b.drift);
  const missingCountries = drift.filter(
    d => d.benchmark > MISSING_MIN && d.portfolio <= d.benchmark * MISSING_REL,
  );

  // Sektor-Drift (Aktien-Teil)
  const portfolioSectors = aggregate(x, equity, sectorWeights);
  const benchmarkSectors = new Map(benchmark.sectors.map(s => [s.code, s.weight]));
  const sectorUniverse = Array.from(
    new Set([...benchmarkSectors.keys(), ...portfolioSectors.keys()]),
  ).sort();
  const sectorDrift = buildDrift(
    sectorUniverse,
    portfolioSectors,
    benchmarkSectors,
    code => (code === OTHER ? 'Rest' : benchmark.sectors.find(s => s.code === code)?.name ?? code),
  ).sort((a, b) => b.benchmark - a.benchmark);

  // Regionen-Rollup (Aktien-Teil)
  const portfolioRegions = aggregate(x, equity, regionWeights);
  const benchmarkRegions = new Map(benchmark.regions.map(r => [r.code, r.weight]));
  const regionUniverse = Array.from(
    new Set([...benchmarkRegions.keys(), ...portfolioRegions.keys()]),
  ).sort();
  const regions: RegionEntry[] = regionUniverse.map(code => ({
    code,
    name: code === OTHER ? 'Rest' : benchmark.regions.find(r => r.code === code)?.name ?? code,
    benchmark: benchmarkRegions.get(code) ?? 0,
    portfolio: portfolioRegions.get(code) ?? 0,
  }));

  return {
    model,
    totalEur,
    allocations,
    coverageScore,
    activeShare,
    currentCoverageScore,
    currentActiveShare,
    objectiveValue: obj,
    iterations,
    converged,
    countryDrift: drift,
    topOverweight,
    topUnderweight,
    missingCountries,
    sectorDrift,
    regions,
  };
}

/* ================= Linalg-Helfer ================= */

function matVec(A: number[][], x: number[]): number[] {
  return A.map(row => dot(row, x));
}

function matTransVec(A: number[][], r: number[]): number[] {
  const n = A[0]?.length ?? 0;
  const out = new Array(n).fill(0);
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < n; j++) {
      out[j] += A[i][j] * r[i];
    }
  }
  return out;
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function round(n: number): number {
  return Math.round(n * 1e12) / 1e12;
}
