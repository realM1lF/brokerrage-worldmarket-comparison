import { describe, it, expect } from 'vitest';
import { getBenchmark, benchmarkModels } from '@/lib/benchmark';
import type { BenchmarkModel } from '@/lib/benchmark';

/**
 * Benchmark-Daten-Verifikation (statische JSON-Modelle).
 *
 * Erwartete US-Gewichte (docs/methodology.md + references/formulas.md):
 *   marketcap ≈ 62.7 %  (Free-Float, SPDR ACWI IMI, 56 Länder)
 *   gdp       ≈ 28.6 %  (nominal, World Bank 2023, ACWI-IMI-Universum)
 *   ppp       ≈ 17.7 %  (World Bank 2023, Taiwan via IMF WEO)
 *   blend     ≈ 42.9 %  (0.50·MC + 0.25·GDP_nom + 0.25·GDP_PPP)
 */

describe('Benchmark-Modelle: Struktur', () => {
  it('alle 4 Modelle laden mit 56 Ländern und Summe ≈ 1', () => {
    for (const model of benchmarkModels()) {
      const bm = getBenchmark(model);
      expect(bm.countries.length, model).toBe(56);
      const sum = bm.countries.reduce((a, c) => a + c.weight, 0);
      // marketcap-Datei summiert zu 0.999998 (Rundung der Quelldaten)
      expect(sum, model).toBeCloseTo(1, 4);
      // gdp: Jersey (JE) hat exakt 0.0 (Rundung der Quelldaten) → >= 0
      expect(bm.countries.every(c => c.weight >= 0), model).toBe(true);
      // sortiert absteigend: Marktkap/GDP/Blend → US zuerst; PPP → China zuerst
      if (model !== 'ppp') expect(bm.countries[0].code, model).toBe('US');
      else expect(bm.countries[0].code, model).toBe('CN');
    }
  });

  it('US-Gewichte sind plausibel (Marktkap 62–65 %, GDP ~28 %, PPP ~17–18 %, Blend ~42.9 %)', () => {
    const usOf = (m: BenchmarkModel) => getBenchmark(m).countryMap.get('US')!;
    expect(usOf('marketcap')).toBeCloseTo(0.6274, 3);
    expect(usOf('marketcap')).toBeGreaterThan(0.62);
    expect(usOf('marketcap')).toBeLessThan(0.65);
    expect(usOf('gdp')).toBeCloseTo(0.2861, 3);
    expect(usOf('ppp')).toBeCloseTo(0.1765, 3);
    expect(usOf('ppp')).toBeGreaterThan(0.17);
    expect(usOf('ppp')).toBeLessThan(0.18);
    expect(usOf('blend')).toBeCloseTo(0.4294, 3);
  });

  it('Blend = 0.50·Marktkap + 0.25·GDP nominal + 0.25·GDP PPP (je Land)', () => {
    const mc = getBenchmark('marketcap').countryMap;
    const gdp = getBenchmark('gdp').countryMap;
    const ppp = getBenchmark('ppp').countryMap;
    const blend = getBenchmark('blend').countryMap;
    for (const code of mc.keys()) {
      const expected = 0.5 * mc.get(code)! + 0.25 * gdp.get(code)! + 0.25 * ppp.get(code)!;
      expect(blend.get(code)!, code).toBeCloseTo(expected, 4);
    }
  });

  it('Blend-US liegt strikt zwischen GDP nominal und Marktkap', () => {
    const usOf = (m: BenchmarkModel) => getBenchmark(m).countryMap.get('US')!;
    expect(usOf('blend')).toBeGreaterThan(usOf('gdp'));
    expect(usOf('blend')).toBeLessThan(usOf('marketcap'));
  });

  it('alle 4 Modelle haben dasselbe Länder-Universum (56 Codes, identisch)', () => {
    const codes = benchmarkModels().map(m =>
      new Set(getBenchmark(m).countries.map(c => c.code)),
    );
    for (const c of codes.slice(1)) {
      expect(c).toEqual(codes[0]);
    }
  });
});

describe('Benchmark-Modelle: Sektor-/Region-Maps', () => {
  it('GDP/PPP/Blend nutzen exakt die Marktkap-Sektor- und -Region-Maps', () => {
    const mc = getBenchmark('marketcap');
    for (const model of ['gdp', 'ppp', 'blend'] as BenchmarkModel[]) {
      const bm = getBenchmark(model);
      // Referenzidentität: Loader reicht die Marktkap-Maps durch
      expect(bm.sectorMap, model).toBe(mc.sectorMap);
      expect(bm.regionMap, model).toBe(mc.regionMap);
      expect(bm.sectors, model).toBe(mc.sectors);
      expect(bm.regions, model).toBe(mc.regions);
      // Daten selbst sind valide
      const secSum = [...bm.sectorMap.values()].reduce((a, v) => a + v, 0);
      const regSum = [...bm.regionMap.values()].reduce((a, v) => a + v, 0);
      expect(secSum, model).toBeCloseTo(1, 4);
      expect(regSum, model).toBeCloseTo(1, 4);
    }
  });

  it('Marktkap-Sektoren enthalten die üblichen GICS-Gruppen (Technologie etc.)', () => {
    const mc = getBenchmark('marketcap');
    const codes = new Set(mc.sectors.map(s => s.code));
    expect(codes.has('technology')).toBe(true);
    expect(codes.has('financial_services')).toBe(true);
    expect(mc.sectors.length).toBeGreaterThanOrEqual(10);
    expect(mc.regions.length).toBeGreaterThanOrEqual(5);
  });
});

describe('Benchmark-Modelle: Loader', () => {
  it('benchmarkModels() liefert die 4 Modelle in fester Reihenfolge', () => {
    expect(benchmarkModels()).toEqual(['marketcap', 'gdp', 'ppp', 'blend']);
  });

  it('getBenchmark wirft bei unbekanntem Modell', () => {
    expect(() => getBenchmark('kaputt' as BenchmarkModel)).toThrow();
  });

  it('Modelle tragen label und Landnamen (kein leerer Name)', () => {
    for (const model of benchmarkModels()) {
      const bm = getBenchmark(model);
      expect(bm.label.length).toBeGreaterThan(0);
      expect(bm.countries.every(c => c.name.length > 0)).toBe(true);
    }
  });
});
