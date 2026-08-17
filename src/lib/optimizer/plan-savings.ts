import type { BenchmarkModel, Universe } from '@/lib/db/types';
import { usesCatalog } from '@/lib/db/types';
import {
  filterByMaxTer,
  proposalPool,
  suggestAdditionsSavings,
  suggestFewestEtfs,
  type AdditionsResult,
  type CandidateWithData,
} from './candidates';
import { proposeSavings, type SavingsEtf, type SavingsProposalMode, type SavingsProposalResult } from './savings';
import type { PortfolioEtf } from './optimize';

export function planSavingsProposal(args: {
  universe: Universe;
  mode: SavingsProposalMode;
  model: BenchmarkModel;
  maxTer: number | null;
  savings: SavingsEtf[];
  portfolio: PortfolioEtf[];
  catalog: CandidateWithData[] | null;
}): { proposal: SavingsProposalResult; additions: AdditionsResult | null } {
  const { universe, mode, model, maxTer, savings, portfolio } = args;
  const catalog = args.catalog ? filterByMaxTer(args.catalog, maxTer) : null;
  const useCatalog = usesCatalog(universe) && catalog !== null && catalog.length > 0;

  if (!useCatalog) {
    return {
      proposal: proposeSavings(savings, portfolio, model, mode, { maxTer }),
      additions: null,
    };
  }

  // bestDepot und „geringste Menge“: derselbe Baukasten, teure Bestände draußen.
  if (universe === 'few' || mode === 'bestDepot') {
    const pool = proposalPool(savings, catalog, maxTer);
    const additions = suggestFewestEtfs(pool, model);
    const keep = new Set(additions.steps.map(s => s.isin));
    const extras = catalog
      .filter(c => keep.has(c.isin) && !savings.some(s => s.isin === c.isin))
      .map(c => ({ isin: c.isin, monthlyEur: 0, data: c.data }));
    return {
      proposal: proposeSavings([...savings, ...extras], portfolio, model, mode, {
        keepIsins: keep,
        maxTer,
      }),
      additions,
    };
  }

  const additions = suggestAdditionsSavings(savings, portfolio, catalog, model, mode, maxTer);
  const selected = new Set(additions.steps.map(s => s.isin));
  const extras = catalog
    .filter(c => selected.has(c.isin) && !savings.some(s => s.isin === c.isin))
    .map(c => ({ isin: c.isin, monthlyEur: 0, data: c.data }));
  return {
    proposal: proposeSavings([...savings, ...extras], portfolio, model, mode, { maxTer }),
    additions,
  };
}
