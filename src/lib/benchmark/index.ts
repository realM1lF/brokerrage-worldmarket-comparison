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

interface RawBlend {
  description: string; source: string; asOf: string; countryCount: number;
  weights: Record<string, RawCountryWeight>;
}

import marketcapData from '@/data/benchmarks/acwi-imi-marktkap.json';
import gdpNominalData from '@/data/benchmarks/gdp-nominal-2023.json';
import gdpPppData from '@/data/benchmarks/gdp-ppp-2023.json';
import blendData from '@/data/benchmarks/acwi-imi-blend.json';

export type BenchmarkModel = 'marketcap' | 'gdp' | 'ppp' | 'blend';

export interface CountryWeight { code: string; name: string; weight: number; }
export interface SectorRegionWeight { code: string; name: string; weight: number; }
export type SectorWeight = ExposureEntry;

export interface Benchmark {
  model: BenchmarkModel;
  label: string;
  description: string;
  asOf: string | null;
  countries: CountryWeight[];
  sectors: SectorRegionWeight[];
  regions: SectorRegionWeight[];
  msci: SectorRegionWeight[];
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
  const regions: SectorRegionWeight[] = raw.regions.map(r => ({ code: r.code, name: r.name, weight: r.weight }));
  const msci: SectorRegionWeight[] = raw.msci.map(m => ({ code: '', name: m.name, weight: m.weight }));
  return {
    model, label, description: raw.description, asOf: raw.asOf,
    countries, sectors, regions, msci,
    countryMap: buildCountryMap(countries),
    sectorMap: buildMap(sectors),
    regionMap: buildMap(regions),
  };
}

function buildCountryMap(countries: CountryWeight[]): Map<string, number> {
  return new Map(countries.map(c => [c.code, c.weight]));
}

function buildGdp(raw: RawGdp, model: BenchmarkModel, label: string): Benchmark {
  const countries = buildCountries(raw.weights);
  return {
    model, label, description: `${raw.description} (${raw.year})`, asOf: String(raw.year),
    countries,
    sectors: MARKETCAP.sectors,
    regions: MARKETCAP.regions,
    msci: MARKETCAP.msci,
    countryMap: buildCountryMap(countries),
    sectorMap: MARKETCAP.sectorMap,
    regionMap: MARKETCAP.regionMap,
  };
}

function buildBlend(raw: RawBlend, model: BenchmarkModel, label: string): Benchmark {
  const countries = buildCountries(raw.weights);
  return {
    model, label, description: raw.description, asOf: raw.asOf,
    countries,
    sectors: MARKETCAP.sectors,
    regions: MARKETCAP.regions,
    msci: MARKETCAP.msci,
    countryMap: buildCountryMap(countries),
    sectorMap: MARKETCAP.sectorMap,
    regionMap: MARKETCAP.regionMap,
  };
}

const MARKETCAP = buildMarketcap(marketcapData as RawMarketcap, 'marketcap', 'Marktkap. (ACWI IMI)');
const GDP_NOMINAL = buildGdp(gdpNominalData as RawGdp, 'gdp', 'GDP (BIP)');
const GDP_PPP = buildGdp(gdpPppData as RawGdp, 'ppp', 'GDP PPP (kaufkraftbereinigt)');
const BLEND = buildBlend(blendData as RawBlend, 'blend', 'Blend (MC+GDP+PPP)');

export function getBenchmark(model: BenchmarkModel): Benchmark {
  switch (model) {
    case 'marketcap': return MARKETCAP;
    case 'gdp':       return GDP_NOMINAL;
    case 'ppp':       return GDP_PPP;
    case 'blend':     return BLEND;
    default:          throw new Error(`Unbekanntes Benchmark-Modell: ${String(model)}`);
  }
}

export function benchmarkModels(): BenchmarkModel[] {
  return ['marketcap', 'gdp', 'ppp', 'blend'];
}