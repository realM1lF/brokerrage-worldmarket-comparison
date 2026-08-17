import { describe, it, expect } from 'vitest';
import { getBenchmark, benchmarkModels, PILLAR_WEIGHTS } from '@/lib/benchmark';
import type { BenchmarkModel } from '@/lib/benchmark';
import energyData from '@/data/benchmarks/energy-primary-2024.json';
import workingAgeData from '@/data/benchmarks/working-age-2023.json';

/**
 * Benchmark-Daten-Verifikation (statische JSON-Modelle + live Blend/Säulen).
 *
 * Erwartete US-Gewichte (docs/methodology.md):
 *   marketcap ≈ 62.7 %  (Free-Float, SPDR ACWI IMI, 56 Länder)
 *   gdp       ≈ 28.6 %  (nominal, World Bank 2023, ACWI-IMI-Universum)
 *   ppp       ≈ 17.7 %  (World Bank 2023, Taiwan via IMF WEO)
 *   blend     ≈ 45.7 %  (0.50·MC + 0.50·GDP_nom, live, ohne PPP)
 *   pillars   ≈ 41.9 %  (0.50·MC + 0.25·GDP + 0.15·Energie + 0.10·Erwerb)
 */

describe('Benchmark-Modelle: Struktur', () => {
  it('alle Modelle laden mit 56 Ländern und Summe ≈ 1', () => {
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

  it('US-Gewichte sind plausibel (Marktkap 62–65 %, GDP ~28 %, PPP ~17–18 %, Blend ~45.7 %, Säulen ~41.9 %)', () => {
    const usOf = (m: BenchmarkModel) => getBenchmark(m).countryMap.get('US')!;
    expect(usOf('marketcap')).toBeCloseTo(0.6274, 3);
    expect(usOf('marketcap')).toBeGreaterThan(0.62);
    expect(usOf('marketcap')).toBeLessThan(0.65);
    expect(usOf('gdp')).toBeCloseTo(0.2861, 3);
    expect(usOf('ppp')).toBeCloseTo(0.1765, 3);
    expect(usOf('ppp')).toBeGreaterThan(0.17);
    expect(usOf('ppp')).toBeLessThan(0.18);
    expect(usOf('blend')).toBeCloseTo(0.4568, 3);
    expect(usOf('pillars')).toBeCloseTo(0.4185, 3);
  });

  it('Blend = 0.50·Marktkap + 0.50·GDP nominal je Land (kein PPP)', () => {
    const mc = getBenchmark('marketcap').countryMap;
    const gdp = getBenchmark('gdp').countryMap;
    const ppp = getBenchmark('ppp').countryMap;
    const blend = getBenchmark('blend').countryMap;
    for (const code of mc.keys()) {
      const expected = 0.5 * mc.get(code)! + 0.5 * gdp.get(code)!;
      expect(blend.get(code)!, code).toBeCloseTo(expected, 4);
    }
    const usOld = 0.5 * mc.get('US')! + 0.25 * gdp.get('US')! + 0.25 * ppp.get('US')!;
    expect(blend.get('US')!).not.toBeCloseTo(usOld, 3);
  });

  it('Blend wird live gebaut: Label MC+GDP, asOf mischt Stichtage, Caption erklärt die These', () => {
    const blend = getBenchmark('blend');
    expect(blend.label).toBe('Blend (MC+GDP)');
    expect(blend.asOf).toMatch(/2026-07-31/);
    expect(blend.asOf).toMatch(/2023/);
    expect(blend.description).toMatch(/Hälfte/i);
    expect(blend.description).toMatch(/BIP nominal/i);
    expect(blend.description).not.toMatch(/PPP/i);
  });

  it('Blend-US liegt strikt zwischen GDP nominal und Marktkap', () => {
    const usOf = (m: BenchmarkModel) => getBenchmark(m).countryMap.get('US')!;
    expect(usOf('blend')).toBeGreaterThan(usOf('gdp'));
    expect(usOf('blend')).toBeLessThan(usOf('marketcap'));
  });

  it('alle Modelle haben dasselbe Länder-Universum (56 Codes, identisch)', () => {
    const codes = benchmarkModels().map(m =>
      new Set(getBenchmark(m).countries.map(c => c.code)),
    );
    for (const c of codes.slice(1)) {
      expect(c).toEqual(codes[0]);
    }
  });
});

describe('Benchmark-Modelle: Sektor-/Region-Maps', () => {
  it('GDP/PPP/Blend leihen Sektoren von Marktkap, Regionen sind eigene Ländersummen', () => {
    const mc = getBenchmark('marketcap');
    for (const model of ['gdp', 'ppp', 'blend', 'pillars'] as BenchmarkModel[]) {
      const bm = getBenchmark(model);
      expect(bm.sectorMap, model).toBe(mc.sectorMap);
      expect(bm.sectors, model).toBe(mc.sectors);
      expect(bm.sectorsFromMarketcap, model).toBe(true);
      expect(bm.regionMap, model).not.toBe(mc.regionMap);
      expect(bm.regions, model).not.toBe(mc.regions);
      const secSum = [...bm.sectorMap.values()].reduce((a, v) => a + v, 0);
      const regSum = [...bm.regionMap.values()].reduce((a, v) => a + v, 0);
      expect(secSum, model).toBeCloseTo(1, 4);
      expect(regSum, model).toBeCloseTo(1, 4);
    }
  });

  it('Blend-Nordamerika = Blend-US + Blend-CA und weicht von Marktkap-Nordamerika ab', () => {
    const blend = getBenchmark('blend');
    const mc = getBenchmark('marketcap');
    const na = blend.regionMap.get('america_north')!;
    const us = blend.countryMap.get('US')!;
    const ca = blend.countryMap.get('CA')!;
    expect(na).toBeCloseTo(us + ca, 6);
    expect(na).toBeGreaterThan(0.47);
    expect(na).toBeLessThan(0.52);
    expect(na).not.toBeCloseTo(mc.regionMap.get('america_north')!, 2);
  });

  it('Marktkap-Nordamerika bleibt ≈ 65,9 % und = US + CA', () => {
    const mc = getBenchmark('marketcap');
    const na = mc.regionMap.get('america_north')!;
    expect(na).toBeCloseTo(0.6585, 3);
    expect(na).toBeCloseTo((mc.countryMap.get('US') ?? 0) + (mc.countryMap.get('CA') ?? 0), 4);
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
  it('benchmarkModels() liefert die Modelle in fester Reihenfolge', () => {
    expect(benchmarkModels()).toEqual(['marketcap', 'gdp', 'ppp', 'blend', 'pillars']);
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

  it('jedes Modell hat eine verständliche Caption für die UI', () => {
    const mc = getBenchmark('marketcap');
    expect(mc.description).toMatch(/Näherung|Proxy/i);
    expect(mc.asOf).toBe('2026-07-31');

    const gdp = getBenchmark('gdp');
    expect(gdp.description).toMatch(/nicht Welt-BIP/i);
    expect(gdp.asOf).toBe('2023');

    const ppp = getBenchmark('ppp');
    expect(ppp.description).toMatch(/Kaufkraft/i);
    expect(ppp.description).toMatch(/nicht Welt-BIP/i);
    expect(ppp.asOf).toBe('2023');
  });
});

describe('Säulen-Benchmark', () => {
  it('mischt 0.50·MC + 0.25·GDP + 0.15·Energie + 0.10·Erwerb je Land', () => {
    expect(PILLAR_WEIGHTS).toEqual({
      marketcap: 0.50,
      gdp: 0.25,
      energy: 0.15,
      workingAge: 0.10,
    });
    const mc = getBenchmark('marketcap').countryMap;
    const gdp = getBenchmark('gdp').countryMap;
    const pillars = getBenchmark('pillars');
    const energy = new Map(Object.entries(energyData.weights).map(([c, w]) => [c, w.weight]));
    const workingAge = new Map(Object.entries(workingAgeData.weights).map(([c, w]) => [c, w.weight]));
    for (const code of mc.keys()) {
      const expected =
        PILLAR_WEIGHTS.marketcap * mc.get(code)! +
        PILLAR_WEIGHTS.gdp * gdp.get(code)! +
        PILLAR_WEIGHTS.energy * energy.get(code)! +
        PILLAR_WEIGHTS.workingAge * workingAge.get(code)!;
      expect(pillars.countryMap.get(code)!, code).toBeCloseTo(expected, 4);
    }
  });

  it('ist nicht der Blend und nicht der Mittelwert der Scores', () => {
    const usOf = (m: BenchmarkModel) => getBenchmark(m).countryMap.get('US')!;
    expect(usOf('pillars')).not.toBeCloseTo(usOf('blend'), 2);
    expect(usOf('pillars')).toBeGreaterThan(usOf('gdp'));
    expect(usOf('pillars')).toBeLessThan(usOf('blend'));
    expect(usOf('pillars')).toBeLessThan(usOf('marketcap'));
    const inOf = (m: BenchmarkModel) => getBenchmark(m).countryMap.get('IN')!;
    expect(inOf('pillars')).toBeGreaterThan(inOf('blend'));
    expect(inOf('pillars')).toBeGreaterThan(0.04);
    expect(inOf('pillars')).toBeLessThan(0.07);
  });

  it('Label, asOf und Caption erklären These plus Haircuts, ohne PPP', () => {
    const p = getBenchmark('pillars');
    expect(p.label).toBe('Säulen');
    expect(p.asOf).toMatch(/MC 2026-07-31/);
    expect(p.asOf).toMatch(/GDP 2023/);
    expect(p.asOf).toMatch(/EN 2024/);
    expect(p.asOf).toMatch(/POP 2023/);
    expect(p.asOf).not.toMatch(/C 2024/);
    expect(p.description).toMatch(/Erwerbsbevölkerung|Erwerb/i);
    expect(p.description).toMatch(/50\s*\/\s*25\s*\/\s*15\s*\/\s*10/);
    expect(p.description).not.toMatch(/PPP/i);
    expect(p.description).not.toMatch(/Konsum/i);
    expect(p.sectorsFromMarketcap).toBe(true);
  });

  it('Säulen-Nordamerika = Säulen-US + Säulen-CA und liegt unter Marktkap-Nordamerika', () => {
    const p = getBenchmark('pillars');
    const mc = getBenchmark('marketcap');
    const na = p.regionMap.get('america_north')!;
    expect(na).toBeCloseTo((p.countryMap.get('US') ?? 0) + (p.countryMap.get('CA') ?? 0), 6);
    expect(na).toBeGreaterThan(0.40);
    expect(na).toBeLessThan(0.50);
    expect(na).toBeLessThan(mc.regionMap.get('america_north')!);
  });

  it('Taiwan hat Erwerbs- und Energiegewicht > 0', () => {
    const p = getBenchmark('pillars');
    expect(workingAgeData.weights.TW.weight).toBeGreaterThan(0.003);
    expect(energyData.weights.TW.weight).toBeGreaterThan(0.005);
    expect(p.countryMap.get('TW')!).toBeGreaterThan(0.01);
  });
});
