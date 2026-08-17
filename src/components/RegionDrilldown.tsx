'use client';

import type { DriftEntry, RegionEntry } from '@/lib/optimizer/optimize';
import { COUNTRY_TO_REGION } from '@/lib/benchmark/country-to-region';
import { DriftBars } from '@/components/DriftBars';

export { COUNTRY_TO_REGION };

/** Länder-Drift-Detail für eine geklickte Region (Donut → Drift-Bars). */
export function RegionDrilldown({
  region,
  countryDrift,
}: {
  region: RegionEntry;
  countryDrift: DriftEntry[];
}) {
  const countries = countryDrift
    .filter(d => COUNTRY_TO_REGION[d.code] === region.code)
    .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));

  if (countries.length === 0) {
    return <p className="muted">Keine Länder-Daten für diese Region.</p>;
  }

  return (
    <div className="regionDrill">
      <hr className="drillDivider" />
      <p className="muted">
        {region.name}: Weltmarkt {(region.benchmark * 100).toFixed(1)}% · Dein Portfolio{' '}
        {(region.portfolio * 100).toFixed(1)}%
      </p>
      <DriftBars
        data={countries.map(d => ({
          code: d.code,
          label: d.name,
          portfolio: d.portfolio,
          benchmark: d.benchmark,
        }))}
      />
    </div>
  );
}