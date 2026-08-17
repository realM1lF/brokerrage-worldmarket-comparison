'use client';

import { useCallback, useState } from 'react';
import type { EtfData } from '@/lib/etf/types';
import type { BenchmarkModel } from '@/lib/benchmark';
import { optimize, type OptimizeResult, type PortfolioEtf } from '@/lib/optimizer/optimize';
import {
  analyzeSavings,
  proposeSavings,
  type SavingsProposalMode,
  type SavingsProposalResult,
} from '@/lib/optimizer/savings';
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState';
import { CANDIDATE_ETFS } from '@/data/candidates';
import {
  suggestAdditions,
  suggestAdditionsSavings,
  suggestReplacement,
  withData,
  type AdditionsResult,
  type CandidateWithData,
  type ReplacementHint,
} from '@/lib/optimizer/candidates';
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
import styles from './page.module.css';

const MODELS: { value: BenchmarkModel; label: string }[] = [
  { value: 'marketcap', label: 'Marktkap. (ACWI IMI)' },
  { value: 'gdp', label: 'GDP (BIP)' },
  { value: 'ppp', label: 'GDP PPP' },
  { value: 'blend', label: 'Blend (MC+GDP+PPP)' },
];

const SAVINGS_MODES: { value: SavingsProposalMode; label: string }[] = [
  { value: 'benchmark', label: 'Weltmarkt spiegeln' },
  { value: 'converge', label: 'Lücken füllen' },
];

const STORAGE_PORTFOLIO = 'finance.portfolio.v1';
const STORAGE_MODEL = 'finance.model.v1';
const STORAGE_VIEW = 'finance.view.v1';
const STORAGE_SAVINGS_MODE = 'finance.savingsMode.v1';
const STORAGE_UNIVERSE = 'finance.universe.v1';

type View = 'bestand' | 'sparplan';
type Universe = 'mine' | 'new';

function isBenchmarkModel(v: unknown): v is BenchmarkModel {
  return v === 'marketcap' || v === 'gdp' || v === 'ppp' || v === 'blend';
}

function isView(v: unknown): v is View {
  return v === 'bestand' || v === 'sparplan';
}

function isSavingsMode(v: unknown): v is SavingsProposalMode {
  return v === 'benchmark' || v === 'converge';
}

function isUniverse(v: unknown): v is Universe {
  return v === 'mine' || v === 'new';
}

function isPortfolioEtf(v: unknown): v is PortfolioEtf {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  if (typeof e.isin !== 'string') return false;
  if (typeof e.amountEur !== 'number' || !Number.isFinite(e.amountEur)) return false;
  if (
    e.monthlyEur !== undefined &&
    (typeof e.monthlyEur !== 'number' || !Number.isFinite(e.monthlyEur) || e.monthlyEur < 0)
  ) {
    return false;
  }
  return !!e.data;
}

function isPortfolio(v: unknown): v is PortfolioEtf[] {
  return Array.isArray(v) && v.every(isPortfolioEtf);
}

function toDriftData(entries: { code: string; name: string; portfolio: number; benchmark: number }[]): DriftDatum[] {
  return entries.map(e => ({ label: e.name, portfolio: e.portfolio, benchmark: e.benchmark }));
}

function eurMonth(n: number): string {
  return n.toLocaleString('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export default function Home() {
  const [portfolio, setPortfolio] = useLocalStorageState<PortfolioEtf[]>(
    STORAGE_PORTFOLIO,
    [],
    isPortfolio,
  );
  const [model, setModel] = useLocalStorageState<BenchmarkModel>(
    STORAGE_MODEL,
    'marketcap',
    isBenchmarkModel,
  );
  const [view, setView] = useLocalStorageState<View>(STORAGE_VIEW, 'bestand', isView);
  const [savingsMode, setSavingsMode] = useLocalStorageState<SavingsProposalMode>(
    STORAGE_SAVINGS_MODE,
    'converge',
    isSavingsMode,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [savingsResult, setSavingsResult] = useState<OptimizeResult | null>(null);
  const [proposalResult, setProposalResult] = useState<SavingsProposalResult | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  const [universe, setUniverse] = useLocalStorageState<Universe>(
    STORAGE_UNIVERSE,
    'mine',
    isUniverse,
  );
  const [candidates, setCandidates] = useState<CandidateWithData[] | null>(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [additions, setAdditions] = useState<AdditionsResult | null>(null);
  const [replacement, setReplacement] = useState<ReplacementHint | null>(null);

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
    (m: BenchmarkModel, cands: CandidateWithData[] | null = candidates, uni: Universe = universe) => {
      if (bestandEtfs.length === 0) {
        setResult(null);
        setAdditions(null);
        setReplacement(null);
        return;
      }
      const useExtended = uni === 'new' && cands && cands.length > 0;
      try {
        if (useExtended) {
          // Treppe zuerst: nur die gierig gewählten ETFs gehen ins Universum,
          // damit Tabelle und Treppe dieselbe Empfehlung zeigen.
          const additionsRes = suggestAdditions(bestandEtfs, cands!, m);
          setAdditions(additionsRes);
          const selected = additionsRes.steps.map(s => s.isin);
          const etfs =
            selected.length > 0
              ? extendWithCandidates(
                  bestandEtfs,
                  cands!.filter(c => selected.includes(c.isin)),
                )
              : bestandEtfs;
          const res = optimize(etfs, m);
          setResult(res);
          const replacementRes = suggestReplacement(bestandEtfs, cands!, m);
          setReplacement(
            replacementRes && !selected.includes(replacementRes.toIsin)
              ? replacementRes
              : null,
          );
        } else {
          setResult(optimize(bestandEtfs, m));
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
    [bestandEtfs, candidates, universe],
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
        return;
      }
      const useExtended = uni === 'new' && cands && cands.length > 0;
      try {
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
        const bestand = portf.filter(e => e.amountEur > 0);
        if (useExtended) {
          const additionsRes = suggestAdditionsSavings(universeEtfs, bestand, cands!, m, mode);
          setAdditions(additionsRes);
          const selected = additionsRes.steps.map(s => s.isin);
          const newOnes =
            selected.length > 0
              ? cands!
                  .filter(c => selected.includes(c.isin))
                  .map(c => ({ isin: c.isin, monthlyEur: 0, data: c.data }))
              : [];
          const extendedUniverse = [...universeEtfs, ...newOnes];
          setProposalResult(proposeSavings(extendedUniverse, bestand, m, mode));
          const replacementRes = suggestReplacement(bestand, cands!, m);
          setReplacement(
            replacementRes && !selected.includes(replacementRes.toIsin)
              ? replacementRes
              : null,
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
    [portfolio, candidates, universe],
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

  const selectUniverse = async (u: Universe) => {
    const changed = u !== universe;
    setUniverse(u);
    if (!changed) return;
    if (u === 'new' && candidates === null && !candidatesLoading) {
      setCandidatesLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/candidates');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `Fehler ${res.status}`);
        const dataByIsin = new Map<string, EtfData>(
          (json.candidates as { isin: string; data: EtfData }[]).map(c => [c.isin, c.data]),
        );
        const loaded = withData(CANDIDATE_ETFS, dataByIsin);
        setCandidates(loaded);
        if (view === 'sparplan') {
          if (hasFlow) computeSavings(model, savingsMode, portfolio, loaded, u);
        } else if (hasBestand) {
          analyzeBestand(model, loaded, u);
        }
      } catch (err) {
        setError(
          `Neue ETFs konnten nicht geladen werden: ${err instanceof Error ? err.message : String(err)}`,
        );
        setCandidates([]);
      } finally {
        setCandidatesLoading(false);
      }
    } else {
      if (view === 'sparplan') {
        if (hasFlow) computeSavings(model, savingsMode, portfolio, candidates, u);
      } else if (hasBestand) {
        analyzeBestand(model, candidates, u);
      }
    }
  };

  /* ---- ETF hinzufügen/entfernen ---- */

  const addEtf = useCallback(
    async (isin: string, amountEur: number, monthlyEur?: number) => {
      setLoading(true);
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
        if (existing) {
          setPortfolio(
            portfolio.map(e => {
              if (e.isin !== data.profile.isin) return e;
              const merged: PortfolioEtf = { ...e, amountEur: e.amountEur + amountEur };
              if (monthlyEur !== undefined && monthlyEur > 0) {
                merged.monthlyEur = (e.monthlyEur ?? 0) + monthlyEur;
              }
              return merged;
            }),
          );
        } else {
          setPortfolio([
            ...portfolio,
            {
              isin: data.profile.isin,
              amountEur,
              monthlyEur: monthlyEur !== undefined && monthlyEur > 0 ? monthlyEur : undefined,
              data,
            },
          ]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [portfolio, setPortfolio],
  );

  const removeEtf = useCallback(
    (isin: string) => {
      setPortfolio(portfolio.filter(e => e.isin !== isin));
      setResult(null);
      setSavingsResult(null);
      setProposalResult(null);
      setSelectedRegion(null);
    },
    [portfolio, setPortfolio],
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
  const activeResult = view === 'sparplan' ? savingsResult : result;
  const selectedReg = activeResult?.regions.find(r => r.code === selectedRegion) ?? null;

  /* ---- Vorschlag: „Diesen Monat kaufen“ + Tabellen-Mapping ---- */
  const buyList = proposalResult
    ? [...proposalResult.allocations]
        .filter(a => a.suggestedMonthlyEur > 0)
        .sort((a, b) => b.suggestedMonthlyEur - a.suggestedMonthlyEur)
    : [];

  const proposalAllocations = proposalResult
    ? proposalResult.allocations.map(a => ({
        isin: a.isin,
        name: a.name,
        amountEur: a.currentMonthlyEur,
        currentWeight: proposalResult.totalMonthlyEur > 0 ? a.currentMonthlyEur / proposalResult.totalMonthlyEur : 0,
        targetWeight: a.suggestedWeight,
        deltaEur: a.deltaEur,
      }))
    : [];

  const portfolioIsinSet = new Set(portfolio.map(e => e.isin));
  /** ISINs einer Allokations-Liste, die nicht im Portfolio des Nutzers sind. */
  const newInResult = (rows: { isin: string }[]): string[] | undefined =>
    universe === 'new'
      ? rows.filter(r => !portfolioIsinSet.has(r.isin)).map(r => r.isin)
      : undefined;

  return (
    <main className={styles.main}>
      <h1>Portfolio ↔ Weltmarkt</h1>
      <p className="muted">
        {view === 'sparplan'
          ? 'Sparplan: deine monatlichen Käufe (€/Monat) gegen den Weltmarkt-Benchmark — Ist-Analyse und Verbesserungs-Vorschlag. Datenquelle: extraETF.'
          : 'Ziel-Gewichtung gegen den gewählten Weltmarkt-Benchmark. Datenquelle: extraETF.'}
      </p>

      <PortfolioInput
        portfolio={portfolio}
        loading={loading}
        onAdd={addEtf}
        onRemove={removeEtf}
        onMonthlyChange={changeMonthly}
      />
      {error && <div className="error">{error}</div>}

      <section className="card">
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
        <div className="modelRow">
          <label>ETFs:</label>
          <div className="segmented">
            <button
              className={universe === 'mine' ? 'active' : ''}
              onClick={() => selectUniverse('mine')}
            >
              Nur meine ETFs
            </button>
            <button
              className={universe === 'new' ? 'active' : ''}
              onClick={() => selectUniverse('new')}
              disabled={candidatesLoading}
            >
              Mit neuen ETFs
            </button>
          </div>
          {candidatesLoading && <span className="muted">lädt Kandidaten…</span>}
          <SimpleTooltip text="Nur meine ETFs = der Vorschlag nutzt ausschließlich die ETFs aus deinem Portfolio. Mit neuen ETFs = die Rechnung bezieht bewährte Ergänzungs-ETFs (z. B. für Schwellenländer oder Small Caps) ein und zeigt dir, wie viel näher du damit an den Weltmarkt kommst." />
        </div>
        <button
          className="primary"
          onClick={analyze}
          disabled={loading || (view === 'sparplan' ? !hasFlow : !hasBestand)}
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
            <div className={styles.dashboard}>
              {/* === ROW 1: Score + Top-Deltas === */}

              <section className={`card ${styles.scoreCard}`}>
                <div className={styles.scoreCardInner}>
                  <CoverageGauge
                    score={result.currentCoverageScore}
                    label="Deckungs-Score heute"
                    tooltipText="Wie nah dein Portfolio dem Weltmarkt JETZT ist, ganz ohne Änderungen. 100 % = exakt der Weltmarkt."
                  />
                  <dl className={styles.metricList}>
                    <div className={styles.metric}>
                      <dt>
                        Deckungs-Score nach Umschichtung
                        <SimpleTooltip text={
                          universe === 'new'
                            ? "Wie gut dein Portfolio den Weltmarkt nachbildet, nachdem du die Umschichtung umgesetzt hast — mit den neuen ETFs, die dir mit diesem Score vorgeschlagen werden."
                            : "Wie gut dein Portfolio den Weltmarkt nachbildet, NACHDEM du die vorgeschlagene Umschichtung umgesetzt hast. Das ist der bestmögliche Zustand mit den ETFs, die du hast — der Unterschied zum Ring zeigt, was Umschichten bringt."
                        } />
                      </dt>
                      <dd>{(result.coverageScore * 100).toFixed(1)}%</dd>
                    </div>
                    <div className={styles.metric}>
                      <dt>
                        Active Share (nach Umschichtung)
                        <SimpleTooltip text="Misst, wie stark dein Portfolio NACH der Umschichtung noch vom Weltmarkt abweicht. 0 % = exakt wie der Weltmarkt, 100 % = komplett anders. Je niedriger, desto näher am Weltmarkt." />
                      </dt>
                      <dd>{(result.activeShare * 100).toFixed(2)}%</dd>
                    </div>
                    <div className={styles.metric}>
                      <dt>
                        Optimierung
                        <SimpleTooltip text="Die mathematische Suche nach der besten ETF-Gewichtung. Konvergiert = Optimum gefunden. Nicht konvergiert = Rechnung abgebrochen, Werte sind trotzdem brauchbar." />
                      </dt>
                      <dd>
                        {result.converged ? 'konvergiert' : 'nicht konv.'} ({result.iterations}{' '}
                        Iter.)
                      </dd>
                    </div>
                  </dl>
                </div>
              </section>

              <section className={`card ${styles.topDeltasCard}`}>
                <h3>
                  Größte Abweichungen
                  <SimpleTooltip text="Die Länder, in denen dein Portfolio NACH der vorgeschlagenen Umschichtung noch am stärksten vom Weltmarkt abweicht — nach oben (Übergewicht) oder unten (Untergewicht)." />
                </h3>
                <TopDeltas overweight={result.topOverweight} underweight={result.topUnderweight} />
              </section>

              {/* === ROW 1b (nur "Mit neuen ETFs"): Treppe + Tausch-Hinweis === */}

              {universe === 'new' && additions && (
                <StaircaseCard
                  additions={additions}
                  replacement={replacement}
                  context="bestand"
                />
              )}
              {universe === 'new' && !additions && candidatesLoading && (
                <p className="muted">Neue ETFs werden geladen …</p>
              )}

              {/* === ROW 2: Länder-Drift, Sektor-Drift, Regionen-Donut === */}

              <section className={`card ${styles.countryCard}`}>
                <h3>
                  Länder-Drift
                  <SimpleTooltip text="Wie stark jedes Land in deinem Portfolio NACH der Umschichtung vom Weltmarkt-Anteil abweicht. Balken nach rechts = zu viel (Übergewicht), nach links = zu wenig (Untergewicht)." />
                </h3>
                <DriftBars data={toDriftData(result.countryDrift).slice(0, 25)} />
              </section>

              <section className={`card ${styles.sectorCard}`}>
                <h3>
                  Sektor-Drift
                  <SimpleTooltip text="Abweichung deines Portfolios NACH der Umschichtung in den 11 GICS-Wirtschaftssektoren (z. B. Technologie, Finanzen, Gesundheit). Gleiche Darstellung wie Länder-Drift." />
                </h3>
                <DriftBars data={toDriftData(result.sectorDrift)} />
              </section>

              <section className={`card ${styles.regionCard}`}>
                <h3>
                  Regionen
                  <SimpleTooltip text="Aufteilung NACH der Umschichtung nach Weltregionen. Klicke auf ein Segment oder die Legende, um die Länder-Details der Region zu sehen." />
                </h3>
                <Donut
                  segments={result.regions
                    .filter(r => r.portfolio > 0)
                    .map(r => ({ id: r.code, label: r.name, value: r.portfolio }))}
                  selectedId={selectedRegion}
                  onSelect={id => setSelectedRegion(prev => (prev === id ? null : id))}
                />
                {selectedReg && (
                  <RegionDrilldown region={selectedReg} countryDrift={result.countryDrift} />
                )}
              </section>

              {/* === ROW 3: Ziel-Gewichtung + Fehlende Länder === */}

              <section className={`card ${styles.allocationCard}`}>
                <h3>
                  Ziel-Gewichtung (Ist → Ziel)
                  <SimpleTooltip text="Vergleich: deine aktuelle ETF-Gewichtung (grau) vs. die optimale Ziel-Gewichtung (blau), die den Weltmarkt am besten nachbildet. Hover für Zahlen." />
                </h3>
                <AllocationChart allocations={result.allocations} />
              </section>

              <section className={`card ${styles.missingCard}`}>
                <h3>
                  Fehlende Länder
                  <SimpleTooltip text="Länder, die im Weltmarkt vertreten sind, aber NACH der Umschichtung in deinem Portfolio fehlen (oder verschwindend gering sind) — weil sie in deinen ETFs gar nicht enthalten sind. Dafür bräuchtest du einen zusätzlichen ETF." />
                </h3>
                <MissingCountries countries={result.missingCountries} />
              </section>

              {/* === ROW 4: Umschichtungs-Tabelle === */}

              <section className={`card ${styles.wideCard}`}>
                <h3>
                  Umschichtungs-Plan
                  <SimpleTooltip text="Konkrete €-Beträge, um die du jeden ETF aufstocken oder reduzieren müsstest, um die optimale Ziel-Gewichtung zu erreichen. Grün = kaufen, Rot = verkaufen. Spalten sind sortierbar (klick)." />
                </h3>
                <RebalancingTable allocations={result.allocations} totalEur={result.totalEur} newIsins={newInResult(result.allocations)} />
              </section>
            </div>
          )}
        </>
      ) : (
        <>
          {portfolio.length > 0 && !hasFlow && (
            <div className="hint">💡 Gib bei mindestens einem ETF eine Sparrate (€/Monat) ein.</div>
          )}

          {savingsResult && (
            <>
              <h2 className={styles.sectionTitle}>
                Ist-Analyse
                <SimpleTooltip text="Wie gut bilden deine aktuellen monatlichen Käufe den Weltmarkt ab — genauso ausgewertet wie dein Bestand, nur mit €/Monat statt €." />
              </h2>
              <div className={styles.dashboard}>
                {/* === ROW 1: Score + Top-Deltas === */}

                <section className={`card ${styles.scoreCard}`}>
                  <h3>
                    Dein aktueller Sparplan
                    <SimpleTooltip text="Der große Ring zeigt deinen Sparplan HEUTE. Darunter 'Optimaler Sparplan': die bestmögliche Aufteilung deiner Sparrate." />
                  </h3>
                  <div className={styles.scoreCardInner}>
                    <CoverageGauge
                      score={savingsResult.currentCoverageScore}
                      label="Sparplan heute"
                      tooltipText="Wie gut deine JETZIGE monatliche Aufteilung den Weltmarkt nachbildet, ganz ohne Änderungen. 100 % = du kaufst exakt nach Weltmarkt-Anteilen."
                    />
                    <dl className={styles.metricList}>
                      <div className={styles.metric}>
                        <dt>
                          Optimaler Sparplan
                          <SimpleTooltip text="Wie gut die bestmögliche Aufteilung deiner Sparrate den Weltmarkt nachbildet. Das ist das Maximum, das mit deinen ETFs geht — der Unterschied zum Ring zeigt, was eine Anpassung bringt." />
                        </dt>
                        <dd>{(savingsResult.coverageScore * 100).toFixed(1)}%</dd>
                      </div>
                      <div className={styles.metric}>
                        <dt>
                          Active Share (optimaler Sparplan)
                          <SimpleTooltip text="Wie stark selbst die bestmögliche Aufteilung deiner Sparrate noch vom Weltmarkt abweicht. 0 % = exakt wie der Weltmarkt, 100 % = komplett anders. Je niedriger, desto besser." />
                        </dt>
                        <dd>{(savingsResult.activeShare * 100).toFixed(2)}%</dd>
                      </div>
                      <div className={styles.metric}>
                        <dt>
                          Monatsrate
                          <SimpleTooltip text="Die Summe aller Sparraten, die du aktuell jeden Monat investierst." />
                        </dt>
                        <dd>{eurMonth(savingsResult.totalEur)}</dd>
                      </div>
                      <div className={styles.metric}>
                        <dt>
                          Optimierung
                          <SimpleTooltip text="Die mathematische Suche nach der besten Aufteilung deiner Sparrate. Konvergiert = Optimum gefunden. Nicht konvergiert = Rechnung abgebrochen, Werte sind trotzdem brauchbar." />
                        </dt>
                        <dd>
                          {savingsResult.converged ? 'konvergiert' : 'nicht konv.'} (
                          {savingsResult.iterations} Iter.)
                        </dd>
                      </div>
                    </dl>
                  </div>
                </section>

                <section className={`card ${styles.topDeltasCard}`}>
                  <h3>
                    Größte Abweichungen
                    <SimpleTooltip text="Die Länder, in denen dein Sparplan am stärksten vom Weltmarkt abweicht — nach oben (Übergewicht) oder unten (Untergewicht)." />
                  </h3>
                  <TopDeltas
                    overweight={savingsResult.topOverweight}
                    underweight={savingsResult.topUnderweight}
                  />
                </section>

                {/* === ROW 2: Länder-Drift, Sektor-Drift, Regionen-Donut === */}

                <section className={`card ${styles.countryCard}`}>
                  <h3>
                    Länder-Drift
                    <SimpleTooltip text="Wie stark jedes Land in deinem Sparplan vom Weltmarkt-Anteil abweicht. Balken nach rechts = zu viel (Übergewicht), nach links = zu wenig (Untergewicht)." />
                  </h3>
                  <DriftBars data={toDriftData(savingsResult.countryDrift).slice(0, 25)} />
                </section>

                <section className={`card ${styles.sectorCard}`}>
                  <h3>
                    Sektor-Drift
                    <SimpleTooltip text="Abweichung deiner monatlichen Käufe in den 11 GICS-Wirtschaftssektoren (z. B. Technologie, Finanzen, Gesundheit). Gleiche Darstellung wie Länder-Drift." />
                  </h3>
                  <DriftBars data={toDriftData(savingsResult.sectorDrift)} />
                </section>

                <section className={`card ${styles.regionCard}`}>
                  <h3>
                    Regionen
                    <SimpleTooltip text="Aufteilung deiner monatlichen Käufe nach Weltregionen. Klicke auf ein Segment oder die Legende, um die Länder-Details der Region zu sehen." />
                  </h3>
                  <Donut
                    segments={savingsResult.regions
                      .filter(r => r.portfolio > 0)
                      .map(r => ({ id: r.code, label: r.name, value: r.portfolio }))}
                    selectedId={selectedRegion}
                    onSelect={id => setSelectedRegion(prev => (prev === id ? null : id))}
                  />
                  {selectedReg && (
                    <RegionDrilldown
                      region={selectedReg}
                      countryDrift={savingsResult.countryDrift}
                    />
                  )}
                </section>

                {/* === ROW 3: Ziel-Sparplan-Gewichtung + Fehlende Länder === */}

                <section className={`card ${styles.allocationCard}`}>
                  <h3>
                    Ziel-Sparplan-Gewichtung (Ist → Ziel)
                    <SimpleTooltip text="Vergleich: deine aktuelle Sparplan-Aufteilung (grau) vs. die perfekte Aufteilung (blau), die den Weltmarkt exakt nachbildet — der „Weltmarkt spiegeln“-Vorschlag. Hover für Zahlen." />
                  </h3>
                  <AllocationChart allocations={savingsResult.allocations} />
                </section>

                <section className={`card ${styles.missingCard}`}>
                  <h3>
                    Fehlende Länder
                    <SimpleTooltip text="Länder, die im Weltmarkt vertreten sind, aber in deinem Sparplan fehlen (oder verschwindend gering sind). Je weniger hier stehen, desto besser." />
                  </h3>
                  <MissingCountries countries={savingsResult.missingCountries} />
                </section>
              </div>
            </>
          )}

          {proposalResult && (
            <>
              <h2 className={styles.sectionTitle}>
                Vorschlag
                <SimpleTooltip text="So teilst du deine Sparrate am besten auf, damit dein Portfolio dem Weltmarkt möglichst nahe kommt. Je nach Modus: exakt den Weltmarkt nachkaufen oder bestehende Lücken füllen." />
              </h2>

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
                  <SimpleTooltip text="„Weltmarkt spiegeln“ = jeden Monat exakt nach Weltmarkt-Anteilen kaufen. „Lücken füllen“ = dein Bestand wird mitberücksichtigt, die Käufe holen gezielt das nach, was dir noch fehlt." />
                </div>
                {savingsMode === 'converge' && proposalResult.mode === 'benchmark' && (
                  <p className="muted">
                    Hinweis: Ohne Bestand ist „Lücken füllen“ = „Weltmarkt spiegeln“.
                  </p>
                )}
              </section>

              <div className={styles.dashboard}>
                {/* === ROW 1: Gauge nach 1 Monat + Kauf-Liste === */}

                <section className={`card ${styles.scoreCard}`}>
                  <h3>
                    Nach 1 Monat
                    <SimpleTooltip text="Deckungs-Score deines Portfolios, nachdem du einen Monat lang nach diesem Vorschlag gekauft hast. 100 % = dein Portfolio entspricht dann exakt dem Weltmarkt." />
                  </h3>
                  <div className={styles.scoreCardInner}>
                    <CoverageGauge
                      score={proposalResult.coverageScore}
                      label="Deckungs-Score nach 1 Monat"
                      tooltipText={
                        universe === 'new'
                          ? 'Deckungs-Score deines Portfolios, nachdem du einen Monat lang nach diesem Vorschlag gekauft hast — inklusive der neu vorgeschlagenen ETFs. 100 % = dein Portfolio entspricht dann exakt dem Weltmarkt.'
                          : 'Deckungs-Score deines Portfolios, nachdem du einen Monat lang nach diesem Vorschlag gekauft hast. 100 % = dein Portfolio entspricht dann exakt dem Weltmarkt.'
                      }
                    />
                    <dl className={styles.metricList}>
                      <div className={styles.metric}>
                        <dt>
                          Active Share
                          <SimpleTooltip text="Abweichung deines Portfolios vom Weltmarkt nach einem Monat mit diesem Sparplan. Je niedriger, desto besser." />
                        </dt>
                        <dd>{(proposalResult.activeShare * 100).toFixed(2)}%</dd>
                      </div>
                      <div className={styles.metric}>
                        <dt>
                          Monatsrate
                          <SimpleTooltip text="Deine gesamte Sparrate pro Monat, aufgeteilt auf die ETFs." />
                        </dt>
                        <dd>{eurMonth(proposalResult.totalMonthlyEur)}</dd>
                      </div>
                      <div className={styles.metric}>
                        <dt>
                          Bestand
                          <SimpleTooltip text="Der Wert deines aktuellen Portfolios (in €), den der Vorschlag mitberücksichtigt." />
                        </dt>
                        <dd>{eurMonth(proposalResult.totalPortfolioEur)}</dd>
                      </div>
                    </dl>
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

                {/* === ROW 1b (nur "Mit neuen ETFs"): Treppe + Tausch-Hinweis === */}

                {universe === 'new' && additions && (
                  <StaircaseCard
                    additions={additions}
                    replacement={replacement}
                    context="sparplan"
                  />
                )}
                {universe === 'new' && !additions && candidatesLoading && (
                  <p className="muted">Neue ETFs werden geladen …</p>
                )}

                {/* === ROW 2: Sparplan-Änderungs-Tabelle === */}

                <section className={`card ${styles.wideCard}`}>
                  <h3>
                    Sparplan-Änderung (Ist → Ziel)
                    <SimpleTooltip text="Vergleich: deine aktuelle Sparrate (Ist) vs. die vorgeschlagene Sparrate (Ziel) je ETF, in €/Monat. Grün = mehr besparen, Rot = weniger besparen. Spalten sind sortierbar (klick)." />
                  </h3>
                  <RebalancingTable
                    allocations={proposalAllocations}
                    totalEur={proposalResult.totalMonthlyEur}
                    newIsins={newInResult(proposalAllocations)}
                  />
                </section>

                {/* === ROW 3: Länder-Drift nach 1 Monat === */}

                <section className={`card ${styles.countryCard}`}>
                  <h3>
                    Länder-Drift nach 1 Monat
                    <SimpleTooltip text="Abweichung deines Portfolios vom Weltmarkt, nachdem du einen Monat lang nach diesem Vorschlag gekauft hast. Vergleiche mit der Ist-Analyse oben — die Lücken werden kleiner." />
                  </h3>
                  <DriftBars data={toDriftData(proposalResult.countryDrift).slice(0, 15)} />
                </section>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
