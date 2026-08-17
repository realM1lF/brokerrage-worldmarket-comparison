import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { EtfData } from '@/lib/etf/types';
import type { PortfolioEtf } from './optimize';
import type { SavingsEtf } from './savings';
import {
  suggestAdditions,
  suggestAdditionsSavings,
  suggestFewestEtfs,
  suggestReplacement,
  withData,
  type CandidateWithData,
} from './candidates';

const loadEtf = (isin: string): EtfData =>
  JSON.parse(readFileSync(path.join(__dirname, '__fixtures__', `${isin}.json`), 'utf-8'));

const IWDA = 'IE00B4L5Y983'; // MSCI World (nur Industrieländer)
const VWRL = 'IE00B3RBWM25'; // FTSE All-World (inkl. EM)
const SPDR = 'IE00B3YLTY66'; // MSCI ACWI IMI (Benchmark-Proxy)
const XTRACKERS = 'IE00BJ0KDQ92'; // MSCI World (nur Industrieländer)
const AMUNDI = 'LU1681043599'; // MSCI World Swap (nur Industrieländer)

const etf = (isin: string, amountEur: number): PortfolioEtf => ({
  isin,
  amountEur,
  data: loadEtf(isin),
});

const cand = (isin: string, name: string, role = 'allworld', ter: number | null = null): CandidateWithData => ({
  isin,
  name,
  role,
  ter: ter ?? loadEtf(isin).profile.ter,
  data: loadEtf(isin),
});

describe('suggestAdditions (Bestand)', () => {
  it('wählt zuerst den Kandidaten, der Schwellenländer abdeckt (nicht den 2. MSCI World)', () => {
    const res = suggestAdditions(
      [etf(IWDA, 10000)],
      [cand(VWRL, 'Vanguard FTSE All-World'), cand(XTRACKERS, 'Xtrackers MSCI World'), cand(AMUNDI, 'Amundi MSCI World')],
      'marketcap',
    );
    expect(res.steps.length).toBeGreaterThan(0);
    expect(res.steps[0].isin).toBe(VWRL);
    // monoton steigende Scores
    let prev = res.baseScore;
    for (const s of res.steps) {
      expect(s.score).toBeGreaterThan(prev);
      prev = s.score;
    }
  });

  it('schlägt nichts vor, wenn das Portfolio den Benchmark bereits abdeckt', () => {
    const res = suggestAdditions(
      [etf(SPDR, 10000)],
      [cand(VWRL, 'Vanguard FTSE All-World'), cand(IWDA, 'iShares Core MSCI World')],
      'marketcap',
    );
    expect(res.steps).toEqual([]);
  });

  it('liefert maximal 3 Stufen', () => {
    const res = suggestAdditions(
      [etf(IWDA, 10000)],
      [cand(VWRL, 'Vanguard'), cand(SPDR, 'SPDR ACWI IMI'), cand(XTRACKERS, 'Xtrackers'), cand(AMUNDI, 'Amundi')],
      'marketcap',
    );
    expect(res.steps.length).toBeLessThanOrEqual(3);
  });

  it('überspringt Kandidaten, die schon im Portfolio sind', () => {
    const res = suggestAdditions(
      [etf(IWDA, 6000), etf(VWRL, 4000)],
      [cand(VWRL, 'Vanguard FTSE All-World'), cand(XTRACKERS, 'Xtrackers MSCI World')],
      'marketcap',
    );
    expect(res.steps.every(s => s.isin !== VWRL)).toBe(true);
  });
});

describe('suggestAdditionsSavings (Sparplan)', () => {
  const savings = (isin: string, monthlyEur: number): SavingsEtf => ({
    isin,
    monthlyEur,
    data: loadEtf(isin),
  });

  it('fällt ohne Bestand auf den Flow-Score zurück und wählt EM-Kandidaten', () => {
    const res = suggestAdditionsSavings(
      [savings(IWDA, 1000)],
      [],
      [cand(VWRL, 'Vanguard FTSE All-World'), cand(XTRACKERS, 'Xtrackers MSCI World')],
      'marketcap',
      'benchmark',
    );
    expect(res.steps.length).toBeGreaterThan(0);
    expect(res.steps[0].isin).toBe(VWRL);
    expect(res.baseScore).toBeLessThan(0.95); // nur Industrieländer
    expect(res.steps[0].score).toBeGreaterThan(res.baseScore);
  });

  it('berücksichtigt den Bestand im converge-Modus', () => {
    const res = suggestAdditionsSavings(
      [savings(IWDA, 500)],
      [etf(IWDA, 10000)],
      [cand(VWRL, 'Vanguard FTSE All-World')],
      'marketcap',
      'converge',
    );
    expect(res.steps[0].isin).toBe(VWRL);
  });
});

describe('suggestReplacement (Tausch-Hinweis)', () => {
  it('schlägt IWDA → Vanguard All-World vor (EM-Lücke)', () => {
    const hint = suggestReplacement(
      [etf(IWDA, 10000)],
      [cand(VWRL, 'Vanguard FTSE All-World')],
      'marketcap',
    );
    expect(hint).not.toBeNull();
    expect(hint!.fromIsin).toBe(IWDA);
    expect(hint!.toIsin).toBe(VWRL);
    expect(hint!.improvement).toBeGreaterThan(0.05);
  });

  it('schlägt keinen Tausch vor, wenn kein Kandidat den Score verbessert', () => {
    const hint = suggestReplacement(
      [etf(SPDR, 10000)],
      [cand(VWRL, 'Vanguard FTSE All-World'), cand(IWDA, 'iShares Core MSCI World')],
      'marketcap',
    );
    expect(hint).toBeNull();
  });

  it('schlägt Kandidaten nicht vor, wenn sie schon gehalten werden', () => {
    const hint = suggestReplacement(
      [etf(IWDA, 6000), etf(VWRL, 4000)],
      [cand(VWRL, 'Vanguard FTSE All-World')],
      'marketcap',
    );
    expect(hint).toBeNull();
  });
});

describe('suggestFewestEtfs', () => {
  it('baut von leer und bleibt kürzer als Add-on auf den Bestand', () => {
    const holdings = [etf(IWDA, 6000), etf(SPDR, 792)];
    const cands = [cand(VWRL, 'Vanguard FTSE All-World'), cand(SPDR, 'SPDR ACWI IMI')];
    const addOn = suggestAdditions(holdings, cands, 'marketcap');
    const few = suggestFewestEtfs([...holdings, ...cands], 'marketcap');
    expect(few.baseScore).toBe(0);
    expect(few.steps.length).toBeGreaterThan(0);
    expect(few.steps.length).toBeLessThanOrEqual(6);
    const fewCount = few.steps.length;
    const addOnCount = holdings.length + addOn.steps.length;
    expect(fewCount).toBeLessThan(addOnCount);
  });
});

describe('withData', () => {
  it('überspringt Kandidaten ohne geladene Daten und nutzt Live-TER', () => {
    const catalog = [
      { isin: VWRL, name: 'Vanguard FTSE All-World', role: 'allworld', ter: 0.22 },
      { isin: 'IE00FAKE0001', name: 'Fehlt', role: 'em', ter: 0.5 },
    ];
    const out = withData(catalog, new Map([[VWRL, loadEtf(VWRL)]]));
    expect(out).toHaveLength(1);
    expect(out[0].ter).toBe(loadEtf(VWRL).profile.ter);
  });
});
