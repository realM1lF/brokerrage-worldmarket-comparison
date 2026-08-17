'use client';

import { useState, useMemo } from 'react';
import type { EtfAllocation } from '@/lib/optimizer/optimize';

function eur(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function sharePct(v: number): string {
  return `${(v * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

type SortKey = 'name' | 'amount' | 'target' | 'delta';
type SortDir = 'asc' | 'desc';

const SORT_LABEL: Record<SortKey, string> = {
  name: 'ETF',
  amount: 'Ist',
  target: 'Ziel',
  delta: 'Δ',
};

export function RebalancingTable({
  allocations,
  totalEur,
  newIsins,
  showSharePct = false,
}: {
  allocations: EtfAllocation[];
  totalEur: number;
  /** ISINs of newly added ETFs — rows get a "neuer ETF" badge. */
  newIsins?: string[];
  /** Ist- und Ziel-Anteil der Rate/des Bestands unter den €-Beträgen. */
  showSharePct?: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('delta');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const arr = [...allocations];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      let va: number, vb: number;
      switch (sortKey) {
        case 'name':
          return dir * a.name.localeCompare(b.name, 'de');
        case 'amount':
          va = a.amountEur; vb = b.amountEur; break;
        case 'target':
          va = a.targetWeight * totalEur; vb = b.targetWeight * totalEur; break;
        case 'delta':
        default:
          va = Math.abs(a.deltaEur); vb = Math.abs(b.deltaEur); break;
      }
      return dir * (va! - vb!);
    });
    return arr;
  }, [allocations, totalEur, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (key !== sortKey) return null;
    return <span className="sortInd">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>;
  };

  return (
    <table className="table">
      <thead>
        <tr>
          {(['name', 'amount', 'target', 'delta'] as SortKey[]).map(key => (
            <th key={key} className={key !== 'name' ? 'num sortable' : 'sortable'} onClick={() => handleSort(key)}>
              {SORT_LABEL[key]}
              {sortIndicator(key)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map(a => (
          <tr key={a.isin}>
            <td>
              {a.name}
              <div className="isinSub">{a.isin}</div>
              {newIsins?.includes(a.isin) && <small className="chipNew">neuer ETF</small>}
              {a.againstMarket && <small className="chipWarn">gegen den Weltmarkt gerichtet</small>}
              {a.reserve && <small className="chipReserve">Reserve, unverändert</small>}
            </td>
            <td className="num">
              {eur(a.amountEur)}
              {showSharePct && <small className="sharePct">{sharePct(a.currentWeight)}</small>}
            </td>
            <td className="num">
              {eur(a.targetWeight * totalEur)}
              {showSharePct && <small className="sharePct">{sharePct(a.targetWeight)}</small>}
            </td>
            <td className={`num ${a.deltaEur >= 0 ? 'pos' : 'neg'}`}>
              {a.deltaEur >= 0 ? '+' : ''}
              {eur(a.deltaEur)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}