export type BenchmarkModel = 'marketcap' | 'gdp' | 'ppp' | 'blend' | 'pillars';
export type DepotView = 'bestand' | 'sparplan';
export type SavingsMode = 'benchmark' | 'converge' | 'bestDepot';
export type Universe = 'mine' | 'new' | 'few';

export function usesCatalog(u: Universe): boolean {
  return u === 'new' || u === 'few';
}

export interface DepotPrefs {
  model: BenchmarkModel;
  view: DepotView;
  savingsMode: SavingsMode;
  universe: Universe;
  /** Obergrenze TER in Prozentpunkten (0.2 = 0,20 %). null = aus. */
  maxTer: number | null;
}

export interface Depot extends DepotPrefs {
  id: number;
  name: string;
}

export interface Holding {
  isin: string;
  amountEur: number;
  monthlyEur: number | null;
}

export interface DepotSnapshot extends Depot {
  holdings: Holding[];
}

export interface DepotSession {
  depots: Depot[];
  activeId: number | null;
  holdings: Holding[];
}
