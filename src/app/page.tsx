'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EtfData } from '@/lib/etf/types';
import { getBenchmark } from '@/lib/benchmark';
import type { BenchmarkModel } from '@/lib/benchmark';
import { useUniverseCandidates, usesCatalog, type Universe } from '@/lib/hooks/useUniverseCandidates';
import { optimize, optimizeSparse, type OptimizeResult, type PortfolioEtf } from '@/lib/optimizer/optimize';
import {
  analyzeSavings,
  proposeSavings,
  projectDepotAfterMonths,
  horizonToMonths,
  type HorizonUnit,
  type SavingsProposalMode,
  type SavingsProposalResult,
} from '@/lib/optimizer/savings';
import { useDepotState } from '@/lib/hooks/useDepotState';
import {
  suggestAdditions,
  suggestAdditionsSavings,
  suggestFewestEtfs,
  suggestReplacement,
  type AdditionsResult,
  type CandidateWithData,
  type ReplacementHint,
} from '@/lib/optimizer/candidates';
import { DepotSwitcher } from '@/components/DepotSwitcher';
import { PortfolioInput } from '@/components/PortfolioInput';
import { CoverageGauge } from '@/components/CoverageGauge';
import { StaircaseCard } from '@/components/StaircaseCard';
import { AllocationChart } from '@/components/AllocationChart';
import { RebalancingTable } from '@/components/RebalancingTable';
import { DriftBars, type DriftDatum } from '@/components/DriftBars';
import { Donut } from '@/components/Donut';
import { TopDeltas, MissingCountries } from '@/components/TopDeltas';
import { SimpleTooltip } from '@/components/SimpleTooltip';
import { RegionDrilldown } from '@/components/RegionDrilldown';
import { Chapter } from '@/components/Chapter';
import styles from './page.module.css';

const MODELS: { value: BenchmarkModel; label: string }[] = [
  { value: 'marketcap', label: 'Marktkap. (ACWI IMI)' },
  { value: 'gdp', label: 'GDP (BIP)' },
  { value: 'ppp', label: 'GDP PPP' },
  { value: 'blend', label: 'Blend (MC+GDP)' },
  { value: 'pillars', label: 'Säulen' },
];

const SAVINGS_MODES: { value: SavingsProposalMode; label: string }[] = [
  { value: 'benchmark', label: 'Weltmarkt spiegeln' },
  { value: 'converge', label: 'Lücken füllen' },
  { value: 'bestDepot', label: 'Bestmögliches Depot' },
];

type View = 'bestand' | 'sparplan';

function toDriftData(entries: { code: string; name: string; portfolio: number; benchmark: number }[]): DriftDatum[] {
  return entries.map(e => ({
    code: e.code,
    label: e.name,
    portfolio: e.portfolio,
    benchmark: e.benchmark,
  }));
}

function afterHydrate(hydrated: boolean, locked: boolean): true | undefined {
  return hydrated && locked ? true : undefined;
}

function missingCodesDiffer(
  a: { code: string }[],
  b: { code: string }[],
): boolean {
  if (a.length !== b.length) return true;
  const codes = new Set(b.map(x => x.code));
  return a.some(x => !codes.has(x.code));
}

function eurMonth(n: number): string {
  return n.toLocaleString('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function depotAfterLabel(months: number, unit: HorizonUnit): string {
  if (months <= 0) return 'Depot heute';
  if (unit === 'years' && months % 12 === 0) {
    const years = months / 12;
    return years === 1 ? 'Depot nach 1 Jahr' : `Depot nach ${years} Jahren`;
  }
  return months === 1 ? 'Depot nach 1 Monat' : `Depot nach ${months} Monaten`;
}

function afterHorizonPhrase(months: number, unit: HorizonUnit): string {
  if (unit === 'years' && months % 12 === 0) {
    const years = months / 12;
    return years === 1 ? 'Nach 1 Jahr' : `Nach ${years} Jahren`;
  }
  return months === 1 ? 'Nach 1 Monat' : `Nach ${months} Monaten`;
}

function horizonSpanPhrase(months: number, unit: HorizonUnit): string {
  if (unit === 'years' && months % 12 === 0) {
    const years = months / 12;
    return years === 1 ? 'ein Jahr' : `${years} Jahre`;
  }
  return months === 1 ? 'einen Monat' : `${months} Monate`;
}

/** Hinweis, dass der Deckungs-Score nur den Aktien-Anteil misst (Bug 4). */
function EquityScoreHint({ share, scope }: { share: number; scope: string }) {
  if (share >= 1 - 1e-9) return null;
  return (
    <p className="muted">
      Hinweis: Gold und ähnliche Werte sind deine Reserve neben den Ländern.
      Dieser Score misst nur den Aktien-Anteil —{' '}
      {(share * 100).toFixed(0)} % {scope}. Die Reserve bleibt unverändert.
    </p>
  );
}

function UniverseToggle({
  universe,
  candidatesLoading,
  onSelect,
}: {
  universe: Universe;
  candidatesLoading: boolean;
  onSelect: (u: Universe) => void;
}) {
  return (
    <div className="modelRow">
      <label>Vorschlag:</label>
      <div className="segmented">
        <button className={universe === 'mine' ? 'active' : ''} onClick={() => onSelect('mine')}>
          Nur meine ETFs
        </button>
        <button
          className={universe === 'new' ? 'active' : ''}
          onClick={() => onSelect('new')}
          disabled={candidatesLoading}
        >
          Mit neuen ETFs
        </button>
        <button
          className={universe === 'few' ? 'active' : ''}
          onClick={() => onSelect('few')}
          disabled={candidatesLoading}
          title="Bestes Ergebnis mit möglichst wenigen ETFs"
        >
          Mit neuen ETFs (geringste Menge)
        </button>
      </div>
      {candidatesLoading && <span className="muted">lädt Kandidaten…</span>}
    </div>
  );
}

export default function Home() {
  const {
    depots,
    activeId,
    portfolio,
    setPortfolio,
    model,
    setModel,
    view,
    setView,
    savingsMode,
    setSavingsMode,
    universe,
    setUniverse,
    hydrated,
    loading: depotLoading,
    error,
    setError,
    createDepot,
    switchDepot,
    deleteActiveDepot,
  } = useDepotState();
  const [busy, setBusy] = useState(false);
  const loading = busy || depotLoading;
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [savingsResult, setSavingsResult] = useState<OptimizeResult | null>(null);
  const [proposalResult, setProposalResult] = useState<SavingsProposalResult | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [regionPane, setRegionPane] = useState<'current' | 'after' | 'flow' | 'flowProposed'>('current');

  const [additions, setAdditions] = useState<AdditionsResult | null>(null);
  const [replacement, setReplacement] = useState<ReplacementHint | null>(null);
  /** "Bestand heute"-Score (Sparplan-View, Bug 5): faire Vergleichsbasis
   *  für den Depot-Score nach k Monaten (= Bestand + k Monate Flow). */
  const [bestandScore, setBestandScore] = useState<number | null>(null);
  const [horizonValue, setHorizonValue] = useState(1);
  const [horizonUnit, setHorizonUnit] = useState<HorizonUnit>('months');

  // Kandidaten-Laden + Mount-Autoload (Bug 1: kein Stale-State nach
  // Reload mit universe='new'; Fehler → Toggle zurück auf 'mine').
  const { candidates, candidatesLoading, loadCandidates } = useUniverseCandidates(
    universe,
    setUniverse,
    setError,
  );

  /* ---- Abgeleitete Listen ---- */
  const bestandEtfs = portfolio.filter(e => e.amountEur > 0);
  const flowEtfs = portfolio.filter(e => (e.monthlyEur ?? 0) > 0);
  const hasBestand = bestandEtfs.length > 0;
  const hasFlow = flowEtfs.length > 0;

  /* ---- Live-Reanalyse bei Wechseln ----
       Modell-, View- und Sub-Modus-Wechsel laufen über die Klick-Handler
       (kein Effect): Wenn bereits ein Ergebnis vorliegt, wird sofort neu
       gerechnet — ohne extra Klick auf "Analysieren". */

    const extendWithCandidates = (etfs: PortfolioEtf[], cands: CandidateWithData[]): PortfolioEtf[] => {
      const existingIsins = new Set(etfs.map(e => e.isin));
      const newOnes = cands
        .filter(c => !existingIsins.has(c.isin))
        .map(c => ({ isin: c.isin, amountEur: 0, data: c.data }));
      return [...etfs, ...newOnes];
    };

  const analyzeBestand = useCallback(
    (
      m: BenchmarkModel,
      cands: CandidateWithData[] | null = candidates,
      uni: Universe = universe,
      etfs: PortfolioEtf[] = bestandEtfs,
    ) => {
      if (etfs.length === 0) {
        setResult(null);
        setAdditions(null);
        setReplacement(null);
        return;
      }
      const useExtended = usesCatalog(uni) && cands && cands.length > 0;
      try {
        if (useExtended && uni === 'few') {
          const pool = [
            ...etfs.filter(e => e.amountEur > 0),
            ...cands!.filter(c => !etfs.some(e => e.isin === c.isin)),
          ];
          const additionsRes = suggestFewestEtfs(pool, m);
          setAdditions(additionsRes);
          const keep = new Set(additionsRes.steps.map(s => s.isin));
          const extras = cands!
            .filter(c => keep.has(c.isin) && !etfs.some(e => e.isin === c.isin))
            .map(c => ({ isin: c.isin, amountEur: 0, data: c.data }));
          setResult(optimizeSparse(etfs, keep, extras, m));
          const replacementRes = suggestReplacement(etfs, cands!, m);
          setReplacement(
            replacementRes && !keep.has(replacementRes.toIsin) ? replacementRes : null,
          );
        } else if (useExtended) {
          // Treppe zuerst: nur die gierig gewählten ETFs gehen ins Universum,
          // damit Tabelle und Treppe dieselbe Empfehlung zeigen.
          const additionsRes = suggestAdditions(etfs, cands!, m);
          setAdditions(additionsRes);
          const selected = additionsRes.steps.map(s => s.isin);
          const extEtfs =
            selected.length > 0
              ? extendWithCandidates(
                  etfs,
                  cands!.filter(c => selected.includes(c.isin)),
                )
              : etfs;
          const res = optimize(extEtfs, m);
          setResult(res);
          const replacementRes = suggestReplacement(etfs, cands!, m);
          setReplacement(
            replacementRes && !selected.includes(replacementRes.toIsin)
              ? replacementRes
              : null,
          );
        } else {
          setResult(optimize(etfs, m));
          setAdditions(null);
          setReplacement(null);
        }
        setSelectedRegion(null);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setResult(null);
        setAdditions(null);
        setReplacement(null);
      }
    },
    [bestandEtfs, candidates, universe, setError],
  );

  const computeSavings = useCallback(
    (
      m: BenchmarkModel,
      mode: SavingsProposalMode,
      portf: PortfolioEtf[] = portfolio,
      cands: CandidateWithData[] | null = candidates,
      uni: Universe = universe,
    ) => {
      const flow = portf.filter(e => (e.monthlyEur ?? 0) > 0);
      if (flow.length === 0) {
        setSavingsResult(null);
        setProposalResult(null);
        setAdditions(null);
        setReplacement(null);
        setBestandScore(null);
        return;
      }
      const useExtended = usesCatalog(uni) && cands && cands.length > 0;
      try {
        // "Bestand heute"-Score (Bug 5): Ist-Zustand des Bestands, gleiche
        // Metrik wie "nach 1 Monat" (Aktien-Teil), ohne Flow.
        const bestand = portf.filter(e => e.amountEur > 0);
        let nextBestandScore: number | null = null;
        if (bestand.length > 0) {
          try {
            nextBestandScore = optimize(bestand, m).currentCoverageScore;
          } catch {
            nextBestandScore = null; // z.B. nur Gold im Bestand
          }
        }
        setBestandScore(nextBestandScore);
        // Ist-Analyse: immer nur tatsächlicher Flow (keine Kandidaten)
        setSavingsResult(
          analyzeSavings(
            flow.map(e => ({ isin: e.isin, monthlyEur: e.monthlyEur ?? 0, data: e.data })),
            m,
          ),
        );
        // Vorschlag: erweitertes Universum, wenn aktiviert
        const universeEtfs = portf.map(e => ({
          isin: e.isin,
          monthlyEur: e.monthlyEur ?? 0,
          data: e.data,
        }));
        if (useExtended && uni === 'few') {
          const pool = [
            ...universeEtfs,
            ...cands!.filter(c => !universeEtfs.some(u => u.isin === c.isin)),
          ];
          const additionsRes = suggestFewestEtfs(pool, m);
          setAdditions(additionsRes);
          const keep = new Set(additionsRes.steps.map(s => s.isin));
          const extras = cands!
            .filter(c => keep.has(c.isin) && !universeEtfs.some(u => u.isin === c.isin))
            .map(c => ({ isin: c.isin, monthlyEur: 0, data: c.data }));
          setProposalResult(
            proposeSavings([...universeEtfs, ...extras], bestand, m, mode, { keepIsins: keep }),
          );
          const replacementRes = suggestReplacement(bestand, cands!, m);
          setReplacement(
            replacementRes && !keep.has(replacementRes.toIsin) ? replacementRes : null,
          );
        } else if (useExtended) {
          const additionsRes = suggestAdditionsSavings(universeEtfs, bestand, cands!, m, mode);
          setAdditions(additionsRes);
          const selected = new Set(additionsRes.steps.map(s => s.isin));
          const extraAll = cands!
            .filter(c => !universeEtfs.some(u => u.isin === c.isin))
            .map(c => ({ isin: c.isin, monthlyEur: 0, data: c.data }));
          const newOnes =
            mode === 'bestDepot'
              ? extraAll
              : extraAll.filter(c => selected.has(c.isin));
          const extendedUniverse = [...universeEtfs, ...newOnes];
          setProposalResult(proposeSavings(extendedUniverse, bestand, m, mode));
          const replacementRes = suggestReplacement(bestand, cands!, m);
          setReplacement(
            replacementRes && !selected.has(replacementRes.toIsin) ? replacementRes : null,
          );
        } else {
          setProposalResult(proposeSavings(universeEtfs, bestand, m, mode));
          setAdditions(null);
          setReplacement(null);
        }
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setSavingsResult(null);
        setProposalResult(null);
        setAdditions(null);
        setReplacement(null);
      }
    },
    [portfolio, candidates, universe, setError],
  );

  const selectModel = (m: BenchmarkModel) => {
    const changed = m !== model;
    setModel(m);
    if (!changed) return;
    if (result !== null) {
      analyzeBestand(m);
    }
    if (savingsResult !== null || proposalResult !== null) {
      computeSavings(m, savingsMode);
    }
  };

  const selectView = (v: View) => {
    const changed = v !== view;
    setView(v);
    // Beim Wechsel in die Sparplan-Ansicht direkt rechnen (bzw. Ergebnisse
    // auffrischen), wenn Sparraten vorhanden sind.
    if (changed && v === 'sparplan') {
      computeSavings(model, savingsMode);
    }
    // Zurueck in die Bestand-Ansicht: Analyse auffrischen, damit z.B. die
    // Sparplan-Treppe nicht stale stehen bleibt (Bug-3-Befund UI-Test).
    if (changed && v === 'bestand') {
      analyzeBestand(model);
    }
  };

  const selectSavingsMode = (mode: SavingsProposalMode) => {
    const changed = mode !== savingsMode;
    setSavingsMode(mode);
    if (changed && proposalResult !== null) {
      computeSavings(model, mode);
    }
  };

  /* ---- ETF-Universum: nur eigene ETFs oder + Kandidaten (Stufe B) ---- */

  const universeRef = useRef(universe);
  useEffect(() => {
    universeRef.current = universe;
  });

  const applyUniverse = (u: Universe, cands: CandidateWithData[] | null) => {
    if (view === 'sparplan') {
      if (hasFlow) computeSavings(model, savingsMode, portfolio, cands, u);
    } else if (hasBestand) {
      analyzeBestand(model, cands, u);
    }
  };

  // Toggle-Wechsel: Kandidaten bei Bedarf laden, dann live reanalysieren.
  // Läuft schon ein Load (z.B. Mount-Autoload), hängt sich der Wechsel an
  // dieselbe Promise an (Hook teilt inFlight).
  const selectUniverse = (u: Universe) => {
    const changed = u !== universe;
    setUniverse(u);
    if (!changed) return;
    if (u === 'mine') {
      applyUniverse('mine', candidates);
      return;
    }
    if (candidates !== null) {
      applyUniverse(u, candidates);
      return;
    }
    void (async () => {
      const loaded = await loadCandidates();
      if (loaded === null) {
        // Fehler: UI-Toggle darf nicht auf Katalog stehen bleiben (Bug 1).
        if (usesCatalog(universeRef.current)) setUniverse('mine');
        return;
      }
      // Nur anwenden, wenn der Toggle noch auf einem Katalog-Modus steht
      // (sonst hat der User zwischenzeitlich zurückgeschaltet).
      if (usesCatalog(universeRef.current)) applyUniverse(universeRef.current, loaded);
    })();
  };

  /* ---- ETF hinzufügen/entfernen ---- */

  const addEtf = useCallback(
    async (isin: string, amountEur: number, monthlyEur?: number) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/etf/${isin}`);
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? `Fehler ${res.status}`);
          return;
        }
        const data = json.data as EtfData;
        const existing = portfolio.find(e => e.isin === data.profile.isin);
        let next: PortfolioEtf[];
        if (existing) {
          next = portfolio.map(e => {
            if (e.isin !== data.profile.isin) return e;
            const merged: PortfolioEtf = { ...e, amountEur: e.amountEur + amountEur };
            if (monthlyEur !== undefined && monthlyEur > 0) {
              merged.monthlyEur = (e.monthlyEur ?? 0) + monthlyEur;
            }
            return merged;
          });
        } else {
          next = [
            ...portfolio,
            {
              isin: data.profile.isin,
              amountEur,
              monthlyEur: monthlyEur !== undefined && monthlyEur > 0 ? monthlyEur : undefined,
              data,
            },
          ];
        }
        setPortfolio(next);
        // Auto-Re-Analyse (Bug 2): nach erfolgreichem Add ohne Klick auf
        // "Analysieren" neu rechnen, damit kein Stale-Stand stehen bleibt.
        if (view === 'sparplan') {
          computeSavings(model, savingsMode, next, candidates, universe);
        } else if (next.some(e => e.amountEur > 0)) {
          analyzeBestand(model, candidates, universe, next.filter(e => e.amountEur > 0));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [portfolio, setPortfolio, view, model, savingsMode, candidates, universe, computeSavings, analyzeBestand, setError],
  );

  const removeEtf = useCallback(
    (isin: string) => {
      const next = portfolio.filter(e => e.isin !== isin);
      setPortfolio(next);
      setSelectedRegion(null);
      // Auto-Re-Analyse (Bug 2): nach Remove ohne Klick auf "Analysieren"
      // neu rechnen. Leere Listen nullen die Ergebnis-States intern.
      if (view === 'sparplan') {
        computeSavings(model, savingsMode, next, candidates, universe);
      } else {
        analyzeBestand(model, candidates, universe, next.filter(e => e.amountEur > 0));
      }
    },
    [portfolio, setPortfolio, view, model, savingsMode, candidates, universe, computeSavings, analyzeBestand],
  );

  /* ---- Sparrate nachträglich ändern (inline in der Tabelle) ---- */

  const changeMonthly = useCallback(
    (isin: string, monthlyEur: number | undefined) => {
      const next = portfolio.map(e => (e.isin === isin ? { ...e, monthlyEur } : e));
      setPortfolio(next);
      // Live auffrischen, falls Sparplan-Ansicht aktiv
      if (view === 'sparplan') {
        computeSavings(model, savingsMode, next);
      } else {
        setSavingsResult(null);
        setProposalResult(null);
      }
    },
    [portfolio, setPortfolio, view, model, savingsMode, computeSavings],
  );

  const analyze = useCallback(() => {
    if (view === 'sparplan') {
      computeSavings(model, savingsMode);
    } else {
      analyzeBestand(model);
    }
  }, [view, model, savingsMode, computeSavings, analyzeBestand]);

  /* ---- Region selection helper ---- */
  const selectedRegCurrent = result?.currentRegions.find(r => r.code === selectedRegion) ?? null;
  const selectedRegAfter = result?.regions.find(r => r.code === selectedRegion) ?? null;
  const selectedRegFlow = savingsResult?.regions.find(r => r.code === selectedRegion) ?? null;
  const selectedRegFlowProposed = proposalResult?.flowRegions.find(r => r.code === selectedRegion) ?? null;
  const activeBm = getBenchmark(model);
  const showSectorDrift = !activeBm.sectorsFromMarketcap;
  const showMissingAfter =
    result !== null && missingCodesDiffer(result.currentMissingCountries, result.missingCountries);

  /* ---- Vorschlag: „Diesen Monat kaufen“ + Tabellen-Mapping ---- */
  const buyList = proposalResult
    ? [...proposalResult.allocations]
        .filter(a => a.suggestedMonthlyEur > 0)
        .sort((a, b) => b.suggestedMonthlyEur - a.suggestedMonthlyEur)
    : [];

  const proposalAllocations = proposalResult
    ? proposalResult.allocations
        .filter(
          a =>
            (savingsMode !== 'bestDepot' && universe !== 'few') ||
            a.suggestedMonthlyEur > 0 ||
            a.currentMonthlyEur > 0 ||
            a.reserve,
        )
        .map(a => ({
        isin: a.isin,
        name: a.name,
        amountEur: a.currentMonthlyEur,
        currentWeight: proposalResult.totalMonthlyEur > 0 ? a.currentMonthlyEur / proposalResult.totalMonthlyEur : 0,
        targetWeight: a.suggestedWeight,
        deltaEur: a.deltaEur,
        againstMarket: a.againstMarket,
        reserve: a.reserve,
      }))
    : [];

  const horizonMonths = horizonToMonths(horizonValue, horizonUnit);
  const depotProjection = proposalResult
    ? projectDepotAfterMonths(proposalResult, horizonMonths)
    : null;
  const usDepotNow = proposalResult?.depotCountryDrift?.find(c => c.code === 'US');
  const usDepotAfter = depotProjection?.countryDrift.find(c => c.code === 'US');
  const usDepotDeltaPp =
    usDepotNow && usDepotAfter ? (usDepotAfter.portfolio - usDepotNow.portfolio) * 100 : null;

  const setHorizonUnitClamped = (unit: HorizonUnit) => {
    setHorizonUnit(unit);
    const max = unit === 'years' ? 50 : 600;
    setHorizonValue(v => Math.min(v, max));
  };

  const portfolioIsinSet = new Set(portfolio.map(e => e.isin));
  /** ISINs einer Allokations-Liste, die nicht im Portfolio des Nutzers sind. */
  const newInResult = (rows: { isin: string }[]): string[] | undefined =>
    usesCatalog(universe)
      ? rows.filter(r => !portfolioIsinSet.has(r.isin)).map(r => r.isin)
      : undefined;

  return (
    <main className={styles.main}>
      <h1>Portfolio ↔ Weltmarkt</h1>
      <p className="muted">
        {view === 'sparplan'
          ? 'Oben die Steuerung. Dann deine Käufe diesen Monat, dann wie du sie aufteilen würdest, unten was das Depot davon merkt.'
          : 'Oben die Steuerung. Dann dein Depot heute, dann was du tun würdest, unten wie es danach aussähe.'}
      </p>

      <DepotSwitcher
        depots={depots}
        activeId={activeId}
        loading={loading}
        hydrated={hydrated}
        onSwitch={id => {
          setResult(null);
          setSavingsResult(null);
          setProposalResult(null);
          setAdditions(null);
          setReplacement(null);
          void switchDepot(id);
        }}
        onCreate={name => {
          setResult(null);
          setSavingsResult(null);
          setProposalResult(null);
          setAdditions(null);
          setReplacement(null);
          void createDepot(name);
        }}
        onDelete={() => {
          setResult(null);
          setSavingsResult(null);
          setProposalResult(null);
          setAdditions(null);
          setReplacement(null);
          void deleteActiveDepot();
        }}
      />
      <PortfolioInput
        portfolio={portfolio}
        loading={loading}
        hydrated={hydrated}
        onAdd={addEtf}
        onRemove={removeEtf}
        onMonthlyChange={changeMonthly}
      />
      {error && <div className="error">{error}</div>}

      <section className={`card ${styles.toolbox}`}>
        <div className="modelRow">
          <label>Ansicht:</label>
          <div className="segmented">
            <button className={view === 'bestand' ? 'active' : ''} onClick={() => selectView('bestand')}>
              Bestand
            </button>
            <button className={view === 'sparplan' ? 'active' : ''} onClick={() => selectView('sparplan')}>
              Sparplan
            </button>
          </div>
          <SimpleTooltip text="Bestand = das Geld, das du heute investiert hast (in €). Sparplan = deine laufenden monatlichen Käufe (in €/Monat). Beide werden getrennt gegen den Weltmarkt geprüft." />
        </div>
        <div className="modelRow">
          <label>Benchmark:</label>
          <div className="segmented">
            {MODELS.map(m => (
              <button
                key={m.value}
                className={model === m.value ? 'active' : ''}
                onClick={() => selectModel(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <p className="muted">
          {activeBm.description}
          {activeBm.asOf ? ` Stand: ${activeBm.asOf}.` : ''}
        </p>
        <button
          className="primary"
          onClick={analyze}
          disabled={afterHydrate(hydrated, loading || (view === 'sparplan' ? !hasFlow : !hasBestand))}
        >
          Analysieren
        </button>
      </section>

      {view === 'bestand' ? (
        <>
          {portfolio.length > 0 && !hasBestand && (
            <div className="hint">
              💡 Gib bei mindestens einem ETF einen Wert in € ein, um den Bestand zu analysieren.
            </div>
          )}

          {result && (
            <>
              <Chapter
                number={1}
                title="Dein Depot heute"
                lead="Anteile an deinem Aktien-Depot, Stand jetzt."
              >
                <div className={styles.dashboard}>
                  <section className={`card ${styles.scoreCard}`}>
                    <div className={styles.scoreCardInner}>
                      <CoverageGauge
                        score={result.currentCoverageScore}
                        label="Deckungs-Score heute"
                        tooltipText="Wie nah dein Portfolio dem Weltmarkt JETZT ist, ganz ohne Änderungen. 100 % = exakt der Weltmarkt."
                      />
                      <EquityScoreHint share={result.equityShare} scope="deines Portfolios" />
                    </div>
                  </section>
                  <section className={`card ${styles.topDeltasCard}`}>
                    <h3>Größte Abweichungen</h3>
                    <TopDeltas overweight={result.currentTopOverweight} underweight={result.currentTopUnderweight} />
                  </section>
                  <section className={`card ${styles.countryCard}`}>
                    <h3>Länder heute</h3>
                    <DriftBars data={toDriftData(result.currentCountryDrift).slice(0, 25)} />
                  </section>
                  <section className={`card ${styles.regionCard}`}>
                    <h3>Regionen heute</h3>
                    <Donut
                      segments={result.currentRegions
                        .filter(r => r.portfolio > 0)
                        .map(r => ({ id: r.code, label: r.name, value: r.portfolio }))}
                      selectedId={regionPane === 'current' ? selectedRegion : null}
                      onSelect={id => {
                        setRegionPane('current');
                        setSelectedRegion(prev => (prev === id && regionPane === 'current' ? null : id));
                      }}
                    />
                    {regionPane === 'current' && selectedRegCurrent && (
                      <RegionDrilldown region={selectedRegCurrent} countryDrift={result.currentCountryDrift} />
                    )}
                  </section>
                  <section className={`card ${styles.missingCard}`}>
                    <h3>Fehlende Länder heute</h3>
                    <MissingCountries countries={result.currentMissingCountries} />
                  </section>
                </div>
              </Chapter>

              <Chapter
                number={2}
                title="So würdest du umschichten"
                lead="Kauf und Verkauf in €, damit das Depot dem Weltmarkt näher kommt."
              >
                <section className="card">
                  <UniverseToggle
                    universe={universe}
                    candidatesLoading={candidatesLoading}
                    onSelect={selectUniverse}
                  />
                </section>
                <div className={styles.dashboard}>
                  {usesCatalog(universe) && additions && (
                    <StaircaseCard
                      additions={additions}
                      replacement={replacement}
                      context={universe === 'few' ? 'bestDepot' : 'bestand'}
                    />
                  )}
                  {usesCatalog(universe) && !additions && candidatesLoading && (
                    <p className="muted">Neue ETFs werden geladen …</p>
                  )}
                  <section className={`card ${styles.allocationCard}`}>
                    <h3>
                      Ziel-Gewichtung (Ist → Ziel)
                      <SimpleTooltip text="Vergleich: deine aktuelle ETF-Gewichtung (grau) vs. die optimale Ziel-Gewichtung (blau), die den Weltmarkt am besten nachbildet. Hover für Zahlen." />
                    </h3>
                    <AllocationChart allocations={result.allocations} />
                  </section>
                  <section className={`card ${styles.wideCard}`}>
                    <h3>
                      Umschichtungs-Plan
                      <SimpleTooltip text="Konkrete €-Beträge, um die du jeden ETF aufstocken oder reduzieren müsstest, um die optimale Ziel-Gewichtung zu erreichen. Grün = kaufen, Rot = verkaufen. Spalten sind sortierbar (klick)." />
                    </h3>
                    <RebalancingTable allocations={result.allocations} totalEur={result.totalEur} newIsins={newInResult(result.allocations)} />
                  </section>
                </div>
              </Chapter>

              <Chapter
                number={3}
                title="So sähe das Depot danach aus"
                lead="Dieselben Länder wie oben, aber nach der Umschichtung."
              >
                <div className={styles.dashboard}>
                  <section className={`card ${styles.scoreCard}`}>
                    <div className={styles.scoreCardInner}>
                      <CoverageGauge
                        score={result.coverageScore}
                        label="Deckungs-Score danach"
                        tooltipText="Wie nah das Depot dem Weltmarkt wäre, nachdem du die Umschichtung umgesetzt hast."
                      />
                    </div>
                  </section>
                  <section className={`card ${styles.topDeltasCard}`}>
                    <h3>Größte Abweichungen danach</h3>
                    <TopDeltas overweight={result.topOverweight} underweight={result.topUnderweight} />
                  </section>
                  <section className={`card ${styles.countryCard}`}>
                    <h3>Länder danach</h3>
                    <DriftBars data={toDriftData(result.countryDrift).slice(0, 25)} />
                  </section>
                  {showSectorDrift && (
                  <section className={`card ${styles.sectorCard}`}>
                    <h3>Sektoren danach</h3>
                    <DriftBars data={toDriftData(result.sectorDrift)} />
                  </section>
                  )}
                  <section className={`card ${styles.regionCard}`}>
                    <h3>Regionen danach</h3>
                    <Donut
                      segments={result.regions
                        .filter(r => r.portfolio > 0)
                        .map(r => ({ id: r.code, label: r.name, value: r.portfolio }))}
                      selectedId={regionPane === 'after' ? selectedRegion : null}
                      onSelect={id => {
                        setRegionPane('after');
                        setSelectedRegion(prev => (prev === id && regionPane === 'after' ? null : id));
                      }}
                    />
                    {regionPane === 'after' && selectedRegAfter && (
                      <RegionDrilldown region={selectedRegAfter} countryDrift={result.countryDrift} />
                    )}
                  </section>
                  {showMissingAfter && (
                  <section className={`card ${styles.missingCard}`}>
                    <h3>Fehlende Länder danach</h3>
                    <MissingCountries countries={result.missingCountries} />
                  </section>
                  )}
                </div>
              </Chapter>
            </>
          )}
        </>
      ) : (
        <>
          {portfolio.length > 0 && !hasFlow && (
            <div className="hint">💡 Gib bei mindestens einem ETF eine Sparrate (€/Monat) ein.</div>
          )}

          {savingsResult && (
            <>
              <Chapter
                number={1}
                title="Deine Käufe diesen Monat"
                lead="Nur die Sparrate. Das Depot zählt hier nicht."
              >
              <div className={styles.dashboard}>
                {/* === ROW 1: Score + Top-Deltas === */}

                <section className={`card ${styles.scoreCard}`}>
                  <div className={styles.scoreCardInner}>
                    <CoverageGauge
                      score={savingsResult.currentCoverageScore}
                      label="Käufe heute"
                      tooltipText="Nur die monatlichen Käufe, nicht dein Depot. 100 % = du kaufst exakt nach Weltmarkt-Anteilen."
                    />
                    <dl className={styles.metricList}>
                      <div className={styles.metric}>
                        <dt>Monatsrate</dt>
                        <dd>{eurMonth(savingsResult.totalEur)}</dd>
                      </div>
                    </dl>
                    <EquityScoreHint share={savingsResult.equityShare} scope="deiner Sparrate" />
                  </div>
                </section>

                <section className={`card ${styles.topDeltasCard}`}>
                  <h3>Größte Abweichungen der Käufe</h3>
                  <TopDeltas
                    overweight={savingsResult.topOverweight}
                    underweight={savingsResult.topUnderweight}
                  />
                </section>

                <section className={`card ${styles.countryCard}`}>
                  <h3>Länder der Käufe</h3>
                  <DriftBars data={toDriftData(savingsResult.countryDrift).slice(0, 25)} />
                </section>

                {showSectorDrift && (
                <section className={`card ${styles.sectorCard}`}>
                  <h3>Sektoren der Käufe</h3>
                  <DriftBars data={toDriftData(savingsResult.sectorDrift)} />
                </section>
                )}

                <section className={`card ${styles.regionCard}`}>
                  <h3>Regionen der Käufe</h3>
                  <Donut
                    segments={savingsResult.regions
                      .filter(r => r.portfolio > 0)
                      .map(r => ({ id: r.code, label: r.name, value: r.portfolio }))}
                    selectedId={regionPane === 'flow' ? selectedRegion : null}
                    onSelect={id => {
                      setRegionPane('flow');
                      setSelectedRegion(prev => (prev === id && regionPane === 'flow' ? null : id));
                    }}
                  />
                  {regionPane === 'flow' && selectedRegFlow && (
                    <RegionDrilldown
                      region={selectedRegFlow}
                      countryDrift={savingsResult.countryDrift}
                    />
                  )}
                </section>

                <section className={`card ${styles.missingCard}`}>
                  <h3>Fehlende Länder in den Käufen</h3>
                  <MissingCountries countries={savingsResult.missingCountries} />
                </section>
              </div>
              </Chapter>
            </>
          )}

          {proposalResult && (
            <>
              <Chapter
                number={2}
                title="So würdest du die Käufe aufteilen"
                lead="Dieselbe Monatsrate, andere Verteilung. Weiterhin €/Monat."
              >
              <section className="card">
                <div className="modelRow">
                  <label>Modus:</label>
                  <div className="segmented">
                    {SAVINGS_MODES.map(sm => (
                      <button
                        key={sm.value}
                        className={savingsMode === sm.value ? 'active' : ''}
                        onClick={() => selectSavingsMode(sm.value)}
                      >
                        {sm.label}
                      </button>
                    ))}
                  </div>
                </div>
                <UniverseToggle
                  universe={universe}
                  candidatesLoading={candidatesLoading}
                  onSelect={selectUniverse}
                />
                {savingsMode === 'converge' && proposalResult.mode === 'benchmark' && (
                  <p className="muted">
                    Hinweis: Ohne Bestand ist „Lücken füllen“ = „Weltmarkt spiegeln“.
                  </p>
                )}
                {savingsMode === 'bestDepot' && proposalResult.mode === 'benchmark' && (
                  <p className="muted">
                    Hinweis: Ohne Bestand ist „Bestmögliches Depot“ = „Weltmarkt spiegeln“.
                  </p>
                )}
                {savingsMode === 'bestDepot' && proposalResult.mode === 'bestDepot' && (
                  <p className="muted">
                    Käufe in einem kurzen Baukasten, gierig von leer gebaut.
                    Unbesparte Bestands-ETFs bekommen 0 € diesen Monat. Neue ETFs
                    zählen, wenn sie den Baukasten um mindestens 0,5 Prozentpunkte heben.
                  </p>
                )}
              </section>

              <div className={styles.dashboard}>
                <section className={`card ${styles.scoreCard}`}>
                  <div className={styles.scoreCardInner}>
                    <div className={styles.dualGauge}>
                      {savingsResult && (
                        <CoverageGauge
                          score={savingsResult.currentCoverageScore}
                          label="Käufe heute"
                          tooltipText="Deine jetzige Aufteilung der Monatsrate. Das Depot zählt nicht."
                        />
                      )}
                      <CoverageGauge
                        score={proposalResult.flowCoverageScore}
                        label="Käufe nach Vorschlag"
                        tooltipText="Dieselbe Monatsrate, neu verteilt. Immer noch nur die Käufe, nicht das Depot."
                      />
                    </div>
                    <p className="muted">
                      Gleiche €/Monat, andere Mischung. Was das Depot davon merkt, steht in Kapitel 3.
                    </p>
                  </div>
                </section>
                <section className={`card ${styles.topDeltasCard}`}>
                  <h3>
                    Diesen Monat kaufen
                    <SimpleTooltip text="Deine monatliche Sparrate, aufgeteilt auf die ETFs — die wichtigste Position steht ganz oben. Grün = mehr als bisher, Rot = weniger als bisher." />
                  </h3>
                  <ol className="rankList">
                    {buyList.map(a => (
                      <li key={a.isin}>
                        <span>
                          {a.name}
                          {a.currentMonthlyEur <= 0 &&
                            (!portfolioIsinSet.has(a.isin) ? (
                              <small className="chipNew">neuer ETF</small>
                            ) : (
                              <small className="buyDelta">neu im Sparplan</small>
                            ))}
                          {a.againstMarket && (
                            <small className="chipWarn">gegen den Weltmarkt gerichtet</small>
                          )}
                          {a.reserve && (
                            <small className="chipReserve">Reserve, unverändert</small>
                          )}
                        </span>
                        <span className="num">
                          <b>{eurMonth(a.suggestedMonthlyEur)}</b>{' '}
                          <small className={`buyDelta ${a.deltaEur >= 0 ? 'pos' : 'neg'}`}>
                            {a.deltaEur >= 0 ? '+' : '−'}
                            {eurMonth(Math.abs(a.deltaEur))} vs. heute
                          </small>
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>

                {usesCatalog(universe) && additions && (
                  <StaircaseCard
                    additions={additions}
                    replacement={replacement}
                    context={
                      universe === 'few' || savingsMode === 'bestDepot' ? 'bestDepot' : 'sparplan'
                    }
                  />
                )}
                {usesCatalog(universe) && !additions && candidatesLoading && (
                  <p className="muted">Neue ETFs werden geladen …</p>
                )}

                <section className={`card ${styles.wideCard}`}>
                  <h3>
                    Sparplan-Änderung (Ist → Ziel)
                    <SimpleTooltip text="Vergleich: deine aktuelle Sparrate (Ist) vs. die vorgeschlagene Sparrate (Ziel) je ETF, in €/Monat und als Anteil der Monatsrate. Grün = mehr besparen, Rot = weniger besparen. Spalten sind sortierbar (klick)." />
                  </h3>
                  <RebalancingTable
                    allocations={proposalAllocations}
                    totalEur={proposalResult.totalMonthlyEur}
                    newIsins={newInResult(proposalAllocations)}
                    showSharePct
                  />
                </section>
                <section className={`card ${styles.countryCard}`}>
                  <h3>Länder der vorgeschlagenen Käufe</h3>
                  <DriftBars data={toDriftData(proposalResult.flowCountryDrift).slice(0, 25)} />
                </section>
                <section className={`card ${styles.regionCard}`}>
                  <h3>Regionen der vorgeschlagenen Käufe</h3>
                  <Donut
                    segments={proposalResult.flowRegions
                      .filter(r => r.portfolio > 0)
                      .map(r => ({ id: r.code, label: r.name, value: r.portfolio }))}
                    selectedId={regionPane === 'flowProposed' ? selectedRegion : null}
                    onSelect={id => {
                      setRegionPane('flowProposed');
                      setSelectedRegion(prev => (prev === id && regionPane === 'flowProposed' ? null : id));
                    }}
                  />
                  {regionPane === 'flowProposed' && selectedRegFlowProposed && (
                    <RegionDrilldown
                      region={selectedRegFlowProposed}
                      countryDrift={proposalResult.flowCountryDrift}
                    />
                  )}
                </section>
              </div>
              </Chapter>

              <Chapter
                number={3}
                title="Was das Depot davon merkt"
                lead={
                  horizonMonths <= 1
                    ? 'Dein Depot ist groß, ein Monat ist klein. Deshalb bewegen sich die Länder hier kaum.'
                    : 'Dieselbe Sparrate, länger eingezahlt. Ohne Kurse und Zinsen, nur Buchwerte.'
                }
              >
              <div className={styles.dashboard}>
                <section className={`card ${styles.scoreCard}`}>
                  <h3>Depot-Score</h3>
                  <div className={styles.scoreCardInner}>
                    <div className={styles.horizonRow}>
                      <label htmlFor="horizon-value">Zeithorizont</label>
                      <input
                        id="horizon-value"
                        type="number"
                        min={0}
                        max={horizonUnit === 'years' ? 50 : 600}
                        step={1}
                        inputMode="numeric"
                        value={horizonValue}
                        onChange={e => {
                          const raw = e.target.value;
                          if (raw === '') {
                            setHorizonValue(0);
                            return;
                          }
                          const n = Number(raw);
                          if (!Number.isFinite(n)) return;
                          const max = horizonUnit === 'years' ? 50 : 600;
                          setHorizonValue(Math.min(max, Math.max(0, Math.round(n))));
                        }}
                      />
                      <div className="segmented">
                        <button
                          type="button"
                          className={horizonUnit === 'months' ? 'active' : ''}
                          onClick={() => setHorizonUnitClamped('months')}
                        >
                          Monate
                        </button>
                        <button
                          type="button"
                          className={horizonUnit === 'years' ? 'active' : ''}
                          onClick={() => setHorizonUnitClamped('years')}
                        >
                          Jahre
                        </button>
                      </div>
                    </div>
                    <div className={styles.dualGauge}>
                      {bestandScore !== null && (
                        <CoverageGauge
                          score={bestandScore}
                          label="Depot heute"
                          tooltipText="Nur der Bestand, ohne die kommenden Käufe."
                        />
                      )}
                      <CoverageGauge
                        score={depotProjection?.coverageScore ?? proposalResult.coverageScore}
                        label={depotAfterLabel(horizonMonths, horizonUnit)}
                        tooltipText={
                          horizonMonths <= 0
                            ? 'Nur der Bestand, ohne weitere Käufe.'
                            : `Bestand plus ${horizonSpanPhrase(horizonMonths, horizonUnit)} der vorgeschlagenen Käufe. Ohne Kurse und Zinsen.`
                        }
                      />
                    </div>
                    {usDepotNow && usDepotAfter && usDepotDeltaPp !== null && (
                      <p className="muted">
                        {horizonMonths <= 0
                          ? `USA im Depot heute ~${(usDepotNow.portfolio * 100).toFixed(1)} %.`
                          : `USA im Depot heute ~${(usDepotNow.portfolio * 100).toFixed(1)} %. ${afterHorizonPhrase(horizonMonths, horizonUnit)} ~${(usDepotAfter.portfolio * 100).toFixed(1)} % (${Math.abs(usDepotDeltaPp).toFixed(1)} Prozentpunkte${usDepotDeltaPp >= 0 ? ' nach oben' : ' nach unten'}).`}
                      </p>
                    )}
                    <p className="muted">
                      Rechnung ohne Kurse und Zinsen. Nur Buchwerte: Bestand plus die
                      vorgeschlagene Sparrate mal die Zahl der Monate.
                    </p>
                    {savingsMode === 'converge' && horizonMonths <= 1 && (
                      <p className="muted">
                        Lücken füllen steuert absichtlich das Depot nach einem Monat. Die Käufe
                        können deshalb extrem ausfallen, weil ein Monat klein gegen den Bestand ist.
                      </p>
                    )}
                    {savingsMode === 'converge' && horizonMonths > 1 && (
                      <p className="muted">
                        Lücken füllen wählt die Käufe für einen Monat. Die Anzeige für{' '}
                        {horizonSpanPhrase(horizonMonths, horizonUnit)} rechnet mit derselben
                        Aufteilung weiter. Der Plan, der nach Jahren wirklich optimal wäre, ist
                        Weltmarkt spiegeln.
                      </p>
                    )}
                    {savingsMode === 'bestDepot' && (
                      <p className="muted">
                        Bestmögliches Depot verteilt die Monatsrate wie das umgeschichtete Depot.
                        Verkaufen musst du dafür nicht. Neue ETFs kommen nur, wenn sie das Depot
                        selbst verbessern.
                      </p>
                    )}
                    <EquityScoreHint
                      share={depotProjection?.equityShare ?? proposalResult.equityShare}
                      scope="von Bestand + Sparrate"
                    />
                  </div>
                </section>
              </div>
              </Chapter>
            </>
          )}
        </>
      )}
    </main>
  );
}
