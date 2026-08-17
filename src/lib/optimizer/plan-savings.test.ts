import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CANDIDATE_ETFS } from '@/data/candidates';
import type { EtfData } from '@/lib/etf/types';
import type { Universe } from '@/lib/db/types';
import { isEquityEtf, type PortfolioEtf } from './optimize';
import { withData, TER_CAP } from './candidates';
import { planSavingsProposal } from './plan-savings';
import type { SavingsEtf, SavingsProposalMode } from './savings';

const WORLD = 'IE00B4L5Y983';
const GOLD = 'IE00B4ND3602';
const PRIME = 'IE0003XJA0J9';
const XEM = 'IE00BTJRMP35';
const STOXX = 'LU0908500753';
const EMIMI = 'IE00BKM4GZ66';
const GDP = 'IE000KCKFHE8';

const load = (isin: string): EtfData =>
  JSON.parse(readFileSync(path.join(__dirname, '__fixtures__', `${isin}.json`), 'utf-8'));

const savings: SavingsEtf[] = [
  { isin: WORLD, monthlyEur: 0, data: load(WORLD) },
  { isin: GOLD, monthlyEur: 25, data: load(GOLD) },
  { isin: PRIME, monthlyEur: 104, data: load(PRIME) },
  { isin: XEM, monthlyEur: 0, data: load(XEM) },
  { isin: STOXX, monthlyEur: 0, data: load(STOXX) },
  { isin: EMIMI, monthlyEur: 0, data: load(EMIMI) },
  { isin: GDP, monthlyEur: 126, data: load(GDP) },
];

const portfolio: PortfolioEtf[] = [
  { isin: WORLD, amountEur: 6000, data: load(WORLD) },
  { isin: GOLD, amountEur: 938, data: load(GOLD) },
  { isin: PRIME, amountEur: 792, data: load(PRIME) },
  { isin: XEM, amountEur: 528, data: load(XEM) },
  { isin: STOXX, amountEur: 399, data: load(STOXX) },
  { isin: EMIMI, amountEur: 373, data: load(EMIMI) },
  { isin: GDP, amountEur: 100, data: load(GDP) },
];

const catalog = withData(
  CANDIDATE_ETFS.map(c => ({ isin: c.isin, name: c.name, role: c.role, ter: c.ter })),
  new Map(CANDIDATE_ETFS.map(c => [c.isin, load(c.isin)])),
);

const modes: SavingsProposalMode[] = ['benchmark', 'converge', 'bestDepot'];
const universes: Universe[] = ['mine', 'new', 'few'];

function plan(universe: Universe, mode: SavingsProposalMode, maxTer: number | null) {
  return planSavingsProposal({
    universe,
    mode,
    model: 'blend',
    maxTer,
    savings,
    portfolio,
    catalog,
  });
}

function paidEquity(universe: Universe, mode: SavingsProposalMode, maxTer: number | null) {
  return plan(universe, mode, maxTer)
    .proposal.allocations.filter(
      a => isEquityEtf(load(a.isin)) && a.suggestedMonthlyEur > 0.5,
    )
    .map(a => a.isin)
    .sort();
}

function gdpEur(universe: Universe, mode: SavingsProposalMode, maxTer: number | null) {
  return (
    plan(universe, mode, maxTer).proposal.allocations.find(a => a.isin === GDP)
      ?.suggestedMonthlyEur ?? 0
  );
}

describe('planSavingsProposal Kombinationen', () => {
  it('Deckel: kein GDP-Weighted in keiner Kombination, Gold bleibt', () => {
    for (const mode of modes) {
      for (const universe of universes) {
        const res = plan(universe, mode, TER_CAP);
        expect(gdpEur(universe, mode, TER_CAP), `${mode}+${universe}`).toBe(0);
        expect(
          res.proposal.allocations.find(a => a.isin === GOLD)!.suggestedMonthlyEur,
          `${mode}+${universe} gold`,
        ).toBeCloseTo(25, 6);
      }
    }
  }, 60_000);

  it('bestDepot + Deckel: new und few sind derselbe Vorschlag', () => {
    const neu = plan('new', 'bestDepot', TER_CAP);
    const few = plan('few', 'bestDepot', TER_CAP);
    expect(paidEquity('new', 'bestDepot', TER_CAP)).toEqual(
      paidEquity('few', 'bestDepot', TER_CAP),
    );
    const byIsin = (r: typeof neu) =>
      Object.fromEntries(r.proposal.allocations.map(a => [a.isin, a.suggestedMonthlyEur]));
    expect(byIsin(neu)).toEqual(byIsin(few));
  }, 30_000);

  it('ohne Deckel darf bestDepot den GDP-Weighted wählen', () => {
    expect(gdpEur('few', 'bestDepot', null)).toBeGreaterThan(1);
    expect(gdpEur('new', 'bestDepot', null)).toBeGreaterThan(1);
  }, 30_000);

  it('benchmark + Deckel: new darf mehr ETFs als few, beide ohne GDP', () => {
    const fewPaid = paidEquity('few', 'benchmark', TER_CAP);
    const newPaid = paidEquity('new', 'benchmark', TER_CAP);
    expect(fewPaid).not.toContain(GDP);
    expect(newPaid).not.toContain(GDP);
    expect(newPaid.length).toBeGreaterThanOrEqual(fewPaid.length);
  }, 30_000);
});
