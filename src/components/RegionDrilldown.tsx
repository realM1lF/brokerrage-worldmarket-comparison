'use client';

import type { DriftEntry, RegionEntry } from '@/lib/optimizer/optimize';
import { DriftBars } from '@/components/DriftBars';

/**
 * Land → Region (extraETF-Klassifikation, abgeleitet aus den SPDR-ACWI-IMI-
 * Benchmark-Daten: jede Region entspricht exakt einer Teilmenge der 56 Länder).
 */
export const COUNTRY_TO_REGION: Record<string, string> = {
  // Nordamerika
  US: 'america_north',
  CA: 'america_north',
  // Lateinamerika
  BR: 'latin_america',
  CL: 'latin_america',
  CO: 'latin_america',
  GT: 'latin_america',
  MX: 'latin_america',
  PE: 'latin_america',
  PR: 'latin_america',
  // Europa
  AT: 'europe',
  BE: 'europe',
  CH: 'europe',
  CY: 'europe',
  DE: 'europe',
  DK: 'europe',
  ES: 'europe',
  FI: 'europe',
  FR: 'europe',
  GB: 'europe',
  GR: 'europe',
  IE: 'europe',
  IS: 'europe',
  IT: 'europe',
  JE: 'europe',
  LU: 'europe',
  NL: 'europe',
  NO: 'europe',
  PT: 'europe',
  SE: 'europe',
  // Osteuropa
  CZ: 'europe_east',
  HU: 'europe_east',
  LT: 'europe_east',
  PL: 'europe_east',
  RO: 'europe_east',
  // Asien (inkl. Naher Osten)
  AE: 'asien',
  CN: 'asien',
  HK: 'asien',
  ID: 'asien',
  IL: 'asien',
  IN: 'asien',
  JP: 'asien',
  KR: 'asien',
  KW: 'asien',
  MO: 'asien',
  MY: 'asien',
  PH: 'asien',
  QA: 'asien',
  SA: 'asien',
  SG: 'asien',
  TH: 'asien',
  TR: 'asien',
  TW: 'asien',
  // Pazifik
  AU: 'australasia',
  NZ: 'australasia',
  // Afrika
  EG: 'africa',
  ZA: 'africa',
};

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
          label: d.name,
          portfolio: d.portfolio,
          benchmark: d.benchmark,
        }))}
      />
    </div>
  );
}