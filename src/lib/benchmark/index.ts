import type { ExposureEntry } from '@/lib/etf/types';

// Rohformat der JSON-Dateien
interface RawCountryWeight { name: string; weight: number; gdp?: number; ppp?: number; note?: string }
interface RawSectorRegion { code: string; name: string; weight: number }

interface RawMarketcap {
  description: string; source: string; asOf: string; countryCount: number;
  weights: Record<string, RawCountryWeight>;
  sectors: RawSectorRegion[];
  regions: RawSectorRegion[];
  msci: RawSectorRegion[];
}

interface RawGdp {
  description: string; source: string; year: number; countryCount: number; totalUsd: number;
  weights: Record<string, RawCountryWeight>;
}

import marketcapData from '@/data/benchmarks/acwi-imi-marktkap.json';
import gdpNominalData from '@/data/benchmarks/gdp-nominal-2023.json';
import gdpPppData from '@/data/benchmarks/gdp-ppp-2023.json';
import energyData from '@/data/benchmarks/energy-primary-2024.json';
import workingAgeData from '@/data/benchmarks/working-age-2023.json';
import { COUNTRY_TO_REGION } from '@/lib/benchmark/country-to-region';

export type BenchmarkModel = 'marketcap' | 'gdp' | 'ppp' | 'blend' | 'pillars';

/** Investierbarkeits-Haircuts. Summe 1. These, kein Optimum. */
export const PILLAR_WEIGHTS = {
  marketcap: 0.50,
  gdp: 0.25,
  energy: 0.15,
  workingAge: 0.10,
} as const;

export interface CountryWeight { code: string; name: string; weight: number; }
export interface SectorRegionWeight { code: string; name: string; weight: number; }
export type SectorWeight = ExposureEntry;

/** Kurze UI-Texte unter dem Benchmark-Toggle. */
const CAPTIONS: Record<BenchmarkModel, string> = {
  marketcap:
    'So gewichtet die Börse die Welt. Quelle: SPDR ACWI IMI (Näherung an den Index, Abweichung ~0,1–0,2 Prozentpunkte).',
  gdp:
    'So groß sind die Volkswirtschaften (BIP in Dollar). Nur Länder im ACWI IMI, nicht Welt-BIP (Russland etc. fehlen).',
  ppp:
    'Volkswirtschaften in Kaufkraft, nicht zu Markt-Wechselkursen. Nur ACWI-IMI-Länder, nicht Welt-BIP.',
  blend:
    'Hälfte so, wie die Börse die Welt sieht. Hälfte so, wie groß die Volkswirtschaften sind (BIP nominal).',
  pillars:
    'Vier Säulen, Abschlag nach Investierbarkeit 50/25/15/10: Börse, BIP, Energie, Erwerbsbevölkerung. These, kein Optimum.',
};

export interface Benchmark {
  model: BenchmarkModel;
  label: string;
  description: string;
  asOf: string | null;
  countries: CountryWeight[];
  sectors: SectorRegionWeight[];
  regions: SectorRegionWeight[];
  msci: SectorRegionWeight[];
  /** true = Sektor-Daten stammen vom Marktkap-Modell
   *  (GDP/PPP/Blend/Säulen haben keine eigenen Sektor-Daten). UI blendet Sektor-Drift aus.
   *  Regionen kommen immer aus den Ländern dieses Modells. */
  sectorsFromMarketcap: boolean;
  /** Schnelle Lookup-Maps */
  countryMap: Map<string, number>;
  sectorMap: Map<string, number>;
  regionMap: Map<string, number>;
}

function buildCountries(weights: Record<string, RawCountryWeight>): CountryWeight[] {
  return Object.entries(weights)
    .map(([code, w]) => ({ code, name: w.name, weight: w.weight }))
    .sort((a, b) => b.weight - a.weight);
}

function buildMap(entries: SectorRegionWeight[]): Map<string, number> {
  return new Map(entries.map(e => [e.code, e.weight]));
}

function buildMarketcap(raw: RawMarketcap, model: BenchmarkModel, label: string): Benchmark {
  const countries = buildCountries(raw.weights);
  const sectors: SectorRegionWeight[] = raw.sectors.map(s => ({ code: s.code, name: s.name, weight: s.weight }));
  const regionNames: SectorRegionWeight[] = raw.regions.map(r => ({ code: r.code, name: r.name, weight: r.weight }));
  const regions = regionsFromCountries(countries, regionNames);
  const msci: SectorRegionWeight[] = raw.msci.map(m => ({ code: '', name: m.name, weight: m.weight }));
  return {
    model, label, description: CAPTIONS[model], asOf: raw.asOf,
    countries, sectors, regions, msci,
    sectorsFromMarketcap: false,
    countryMap: buildCountryMap(countries),
    sectorMap: buildMap(sectors),
    regionMap: buildMap(regions),
  };
}

function buildCountryMap(countries: CountryWeight[]): Map<string, number> {
  return new Map(countries.map(c => [c.code, c.weight]));
}

/** Regionen-Weltmarkt = Summe der Ländergewichte dieses Modells. */
function regionsFromCountries(
  countries: CountryWeight[],
  nameSource: SectorRegionWeight[],
): SectorRegionWeight[] {
  const names = new Map(nameSource.map(r => [r.code, r.name]));
  const sums = new Map<string, number>();
  for (const c of countries) {
    const region = COUNTRY_TO_REGION[c.code];
    if (!region) continue;
    sums.set(region, (sums.get(region) ?? 0) + c.weight);
  }
  return [...sums.entries()]
    .map(([code, weight]) => ({
      code,
      name: names.get(code) ?? code,
      weight,
    }))
    .sort((a, b) => b.weight - a.weight);
}

function buildGdp(raw: RawGdp, model: BenchmarkModel, label: string): Benchmark {
  const countries = buildCountries(raw.weights);
  const regions = regionsFromCountries(countries, MARKETCAP.regions);
  return {
    model, label, description: CAPTIONS[model], asOf: String(raw.year),
    countries,
    sectors: MARKETCAP.sectors,
    regions,
    msci: MARKETCAP.msci,
    sectorsFromMarketcap: true,
    countryMap: buildCountryMap(countries),
    sectorMap: MARKETCAP.sectorMap,
    regionMap: buildMap(regions),
  };
}

/** Live: 50 % Marktkap + 50 % BIP nominal. Kein statisches JSON, kein PPP. */
function buildBlend(): Benchmark {
  const countries: CountryWeight[] = MARKETCAP.countries.map(c => ({
    code: c.code,
    name: c.name,
    weight: 0.5 * c.weight + 0.5 * (GDP_NOMINAL.countryMap.get(c.code) ?? 0),
  })).sort((a, b) => b.weight - a.weight);
  const regions = regionsFromCountries(countries, MARKETCAP.regions);

  return {
    model: 'blend',
    label: 'Blend (MC+GDP)',
    description: CAPTIONS.blend,
    asOf: `MC ${MARKETCAP.asOf} / GDP ${GDP_NOMINAL.asOf}`,
    countries,
    sectors: MARKETCAP.sectors,
    regions,
    msci: MARKETCAP.msci,
    sectorsFromMarketcap: true,
    countryMap: buildCountryMap(countries),
    sectorMap: MARKETCAP.sectorMap,
    regionMap: buildMap(regions),
  };
}

/** Live: 50 % MC + 25 % BIP + 15 % Energie + 10 % Erwerb. Kein PPP, kein Konsum. */
function buildPillars(): Benchmark {
  const w = PILLAR_WEIGHTS;
  const energyMap = buildCountryMap(buildCountries(energyData.weights as Record<string, RawCountryWeight>));
  const popMap = buildCountryMap(buildCountries(workingAgeData.weights as Record<string, RawCountryWeight>));
  const countries: CountryWeight[] = MARKETCAP.countries.map(c => ({
    code: c.code,
    name: c.name,
    weight:
      w.marketcap * c.weight +
      w.gdp * (GDP_NOMINAL.countryMap.get(c.code) ?? 0) +
      w.energy * (energyMap.get(c.code) ?? 0) +
      w.workingAge * (popMap.get(c.code) ?? 0),
  })).sort((a, b) => b.weight - a.weight);
  const regions = regionsFromCountries(countries, MARKETCAP.regions);

  return {
    model: 'pillars',
    label: 'Säulen',
    description: CAPTIONS.pillars,
    asOf: `MC ${MARKETCAP.asOf} / GDP ${GDP_NOMINAL.asOf} / EN ${energyData.year} / POP ${workingAgeData.year}`,
    countries,
    sectors: MARKETCAP.sectors,
    regions,
    msci: MARKETCAP.msci,
    sectorsFromMarketcap: true,
    countryMap: buildCountryMap(countries),
    sectorMap: MARKETCAP.sectorMap,
    regionMap: buildMap(regions),
  };
}

const MARKETCAP = buildMarketcap(marketcapData as RawMarketcap, 'marketcap', 'Marktkap. (ACWI IMI)');
const GDP_NOMINAL = buildGdp(gdpNominalData as RawGdp, 'gdp', 'GDP (BIP)');
const GDP_PPP = buildGdp(gdpPppData as RawGdp, 'ppp', 'GDP PPP (kaufkraftbereinigt)');
const BLEND = buildBlend();
const PILLARS = buildPillars();

export function getBenchmark(model: BenchmarkModel): Benchmark {
  switch (model) {
    case 'marketcap': return MARKETCAP;
    case 'gdp':       return GDP_NOMINAL;
    case 'ppp':       return GDP_PPP;
    case 'blend':     return BLEND;
    case 'pillars':   return PILLARS;
    default:          throw new Error(`Unbekanntes Benchmark-Modell: ${String(model)}`);
  }
}

export function benchmarkModels(): BenchmarkModel[] {
  return ['marketcap', 'gdp', 'ppp', 'blend', 'pillars'];
}
