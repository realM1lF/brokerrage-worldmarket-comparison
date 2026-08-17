import type { BenchmarkModel } from '@/lib/benchmark';
import type { EtfData } from '@/lib/etf/types';
import { isEquityEtf, optimize } from './optimize';
import type { PortfolioEtf } from './optimize';
import { pickBestDepotEtfs, proposeSavings } from './savings';
import type { SavingsEtf, SavingsProposalMode } from './savings';

/**
 * Stufe B: fehlende ETFs vorschlagen.
 *
 * - suggestAdditions: gierige Selektion (Treppe, max 3 Stufen). Jede Stufe
 *   wählt den Kandidaten mit der größten Score-Verbesserung. Abbruch unter
 *   0,5 Prozentpunkte.
 * - suggestReplacement: bester Einzeltausch (1 vorhandener ETF → 1 Kandidat).
 *   Wird nur vorgeschlagen bei Deckungs-Gewinn ≥ 0,5 pp oder bei
 *   quasi-gleichem Score (Δ < 0,1 pp) mit TER-Vorteil ≥ 0,05 pp.
 *
 * Score = Deckungs-Score der OPTIMALEN Allokation (Bestand: optimize(),
 * Sparplan: proposeSavings() p(1); Modus bestDepot: Baukasten von leer,
 * pickBestDepotEtfs() bis Δ < 0,5 pp, höchstens 6 Aktien-ETFs). Kandidaten
 * gehen mit 0 € / 0 €/Monat ein — der Optimierer entscheidet selbst, wie
 * viel er in sie umschichtet.
 */

export interface CandidateWithData {
  isin: string;
  name: string;
  role: string;
  ter: number | null;
  data: EtfData;
}

export interface AdditionStep {
  isin: string;
  name: string;
  ter: number | null;
  /** Deckungs-Score NACH diesem Schritt. */
  score: number;
  /** Verbesserung gegenüber vorherigem Schritt (Prozentpunkte, 0..1). */
  improvement: number;
}

export interface AdditionsResult {
  baseScore: number;
  steps: AdditionStep[];
}

export interface ReplacementHint {
  fromIsin: string;
  fromName: string;
  toIsin: string;
  toName: string;
  toTer: number | null;
  /** Score nach dem Tausch. */
  scoreAfter: number;
  improvement: number;
}

/** Schmerzgrenze: Vorschlag darf nichts Teureres neu besparen. */
export const TER_CAP = 0.2;

export function liveTer(c: { ter?: number | null; data?: { profile: { ter: number | null } } }): number {
  return c.data?.profile.ter ?? c.ter ?? Number.POSITIVE_INFINITY;
}

/** Gold und andere Nicht-Aktien bleiben. maxTer null = kein Deckel. */
export function cheapEnough(
  item: { ter?: number | null; data?: EtfData },
  maxTer: number | null,
): boolean {
  if (maxTer == null) return true;
  if (item.data && !isEquityEtf(item.data)) return true;
  const ter = liveTer(item);
  if (!Number.isFinite(ter) || ter <= 0) return false;
  return ter <= maxTer + 1e-9;
}

export function filterByMaxTer<T extends { isin: string; ter: number | null; data?: EtfData }>(
  candidates: T[],
  maxTer: number | null,
): T[] {
  if (maxTer == null) return candidates;
  return candidates.filter(c => cheapEnough(c, maxTer));
}

/** Baukasten: teure Aktien-ETFs raus, auch wenn sie schon im Depot liegen. */
export function proposalPool<T extends { isin: string; ter?: number | null; data: EtfData }>(
  held: T[],
  extras: Array<{ isin: string; ter?: number | null; data: EtfData }>,
  maxTer: number | null,
): Array<T | { isin: string; ter?: number | null; data: EtfData }> {
  const cheapHeld = held.filter(h => cheapEnough({ ter: h.ter ?? h.data.profile.ter, data: h.data }, maxTer));
  const seen = new Set(cheapHeld.map(h => h.isin));
  return [
    ...cheapHeld,
    ...extras.filter(
      e => !seen.has(e.isin) && cheapEnough({ ter: e.ter ?? e.data.profile.ter, data: e.data }, maxTer),
    ),
  ];
}

const MAX_STEPS = 3;
const MIN_IMPROVEMENT = 0.005; // 0,5 pp
const TER_FLAT_PP = 0.001; // |ΔScore| < 0,1 pp => "quasi-gleich"
const TER_ADVANTAGE_PP = 0.05; // 0,05 pp TER-Vorteil nötig für Tausch-Hinweis

/* ================= gieriger Kern (beide Varianten) ================= */

function greedySteps(
  candidates: CandidateWithData[],
  existingIsins: string[],
  baseScore: number,
  evaluate: (addedIsins: string[]) => number | null,
): AdditionStep[] {
  const steps: AdditionStep[] = [];
  const added: string[] = [];
  let currentScore = baseScore;

  for (let step = 0; step < MAX_STEPS; step++) {
    let best: { candidate: CandidateWithData; improvement: number; score: number } | null =
      null;
    for (const c of candidates) {
      if (existingIsins.includes(c.isin) || added.includes(c.isin)) continue;
      const score = evaluate([...added, c.isin]);
      if (score === null) continue;
      const improvement = score - currentScore;
      if (!best || improvement > best.improvement) {
        best = { candidate: c, improvement, score };
      }
    }
    if (!best || best.improvement < MIN_IMPROVEMENT) break;
    added.push(best.candidate.isin);
    currentScore = best.score;
    steps.push({
      isin: best.candidate.isin,
      name: best.candidate.name,
      ter: best.candidate.ter,
      score: currentScore,
      improvement: best.improvement,
    });
  }
  return steps;
}

/* ================= Bestand ================= */

export function suggestAdditions(
  etfs: PortfolioEtf[],
  candidates: CandidateWithData[],
  model: BenchmarkModel,
): AdditionsResult {
  const baseScore = optimize(etfs, model).coverageScore;
  const byIsin = new Map(candidates.map(c => [c.isin, c]));
  const steps = greedySteps(
    candidates,
    etfs.map(e => e.isin),
    baseScore,
    addedIsins => {
      const extended = [...etfs];
      for (const isin of addedIsins) {
        const c = byIsin.get(isin);
        if (!c) return null;
        extended.push({ isin: c.isin, amountEur: 0, data: c.data });
      }
      return optimize(extended, model).coverageScore;
    },
  );
  return { baseScore, steps };
}

/* ================= Sparplan ================= */

export function suggestAdditionsSavings(
  savings: SavingsEtf[],
  portfolio: PortfolioEtf[],
  candidates: CandidateWithData[],
  model: BenchmarkModel,
  mode: SavingsProposalMode,
  maxTer: number | null = null,
): AdditionsResult {
  const cheapCands = filterByMaxTer(candidates, maxTer);
  const holdings = portfolio.filter(e => e.amountEur > 0);
  if (mode === 'bestDepot' && holdings.some(e => isEquityEtf(e.data))) {
    const pool = proposalPool(savings, cheapCands, maxTer);
    return suggestFewestEtfs(pool, model);
  }

  const baseScore = proposeSavings(savings, portfolio, model, mode, { maxTer }).coverageScore;
  const byIsin = new Map(cheapCands.map(c => [c.isin, c]));
  const steps = greedySteps(
    cheapCands,
    savings.map(s => s.isin),
    baseScore,
    addedIsins => {
      const extended = [...savings];
      for (const isin of addedIsins) {
        const c = byIsin.get(isin);
        if (!c) return null;
        extended.push({ isin: c.isin, monthlyEur: 0, data: c.data });
      }
      return proposeSavings(extended, portfolio, model, mode, { maxTer }).coverageScore;
    },
  );
  return { baseScore, steps };
}

/** Baukasten von leer: bestes Ergebnis mit möglichst wenigen ETFs. */
export function suggestFewestEtfs(
  pool: { isin: string; name?: string; ter?: number | null; data: EtfData }[],
  model: BenchmarkModel,
): AdditionsResult {
  const picks = pickBestDepotEtfs(pool, model);
  const byIsin = new Map(pool.map(p => [p.isin, p]));
  return {
    baseScore: 0,
    steps: picks.map(p => {
      const meta = byIsin.get(p.isin);
      return {
        isin: p.isin,
        name: meta?.name ?? meta?.data.profile.name ?? p.isin,
        ter: meta?.ter ?? meta?.data.profile.ter ?? null,
        score: p.score,
        improvement: p.improvement,
      };
    }),
  };
}

/* ================= Tausch-Hinweis ================= */

export function suggestReplacement(
  etfs: PortfolioEtf[],
  candidates: CandidateWithData[],
  model: BenchmarkModel,
): ReplacementHint | null {
  if (etfs.length === 0) return null;
  const base = optimize(etfs, model);
  const baseScore = base.coverageScore;
  let best: ReplacementHint | null = null;

  for (let i = 0; i < etfs.length; i++) {
    // Nicht-Aktien-Werte (Gold, ...) werden nie getauscht.
    if (!isEquityEtf(etfs[i].data)) continue;
    for (const c of candidates) {
      if (etfs.some(e => e.isin === c.isin)) continue; // schon im Portfolio
      const swapped = etfs.map((e, j) =>
        j === i ? { isin: c.isin, amountEur: e.amountEur, data: c.data } : e,
      );
      const score = optimize(swapped, model).coverageScore;
      const improvement = score - baseScore;
      const fromTer = etfs[i].data.profile.ter;
      const terGain = fromTer !== null && c.ter !== null ? fromTer - c.ter : 0;

      const worthShowing =
        improvement >= MIN_IMPROVEMENT ||
        (Math.abs(improvement) < TER_FLAT_PP && terGain >= TER_ADVANTAGE_PP);
      if (!worthShowing) continue;

      if (!best || improvement > best.improvement) {
        best = {
          fromIsin: etfs[i].isin,
          fromName: etfs[i].data.profile.name,
          toIsin: c.isin,
          toName: c.name,
          toTer: c.ter,
          scoreAfter: score,
          improvement,
        };
      }
    }
  }
  return best;
}

/* ================= Daten-Anreicherung ================= */

/** Kombiniert statischen Katalog mit geladenen EtfData. Kandidaten ohne
 *  Daten (API-Fehler) werden übersprungen. */
export function withData(
  catalog: { isin: string; name: string; role: string; ter: number }[],
  dataByIsin: Map<string, EtfData>,
): CandidateWithData[] {
  const out: CandidateWithData[] = [];
  for (const c of catalog) {
    const data = dataByIsin.get(c.isin);
    if (!data) continue;
    out.push({
      isin: c.isin,
      name: c.name,
      role: c.role,
      ter: data.profile.ter ?? c.ter,
      data,
    });
  }
  return out;
}
