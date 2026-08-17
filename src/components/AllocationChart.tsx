'use client';

import type { EtfAllocation } from '@/lib/optimizer/optimize';

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

/**
 * Ist vs. Ziel-Gewichtung je ETF, divergierend um eine Mittelachse.
 * Hover auf einer Zeile zeigt die exakten Ist-/Ziel-Werte.
 */
export function AllocationChart({ allocations }: { allocations: EtfAllocation[] }) {
  const maxWeight = Math.max(
    0.0001,
    ...allocations.flatMap(a => [a.currentWeight, a.targetWeight]),
  );

  const sorted = [...allocations].sort((a, b) => b.targetWeight - a.targetWeight);

  return (
    <div className="driftList">
      {sorted.map(a => (
        <div className="driftRow" key={a.isin}>
          <div className="driftLabel">{a.name}
            {a.againstMarket && <small className="chipWarn">gegen den Weltmarkt gerichtet</small>}
            {a.reserve && <small className="chipReserve">Reserve, unverändert</small>}
          </div>
          <div className="driftTrack">
            <div className="driftAxis" />
            <div
              className="allocBar current"
              style={{ width: `${(a.currentWeight / maxWeight) * 50}%`, marginLeft: `${50 - (a.currentWeight / maxWeight) * 50}%` }}
            />
            <div
              className="allocBar target"
              style={{ width: `${(a.targetWeight / maxWeight) * 50}%` }}
            />
            <span className="barTip">
              <b>{a.name}</b>
              <span>
                Ist: {pct(a.currentWeight)}
                <br />
                Ziel: {pct(a.targetWeight)}
              </span>
            </span>
          </div>
          <div className="driftValue">
            {pct(a.currentWeight)} → <b>{pct(a.targetWeight)}</b>
          </div>
        </div>
      ))}
    </div>
  );
}
