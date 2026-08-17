import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseExtraEtfHtml, ExtraEtfError } from './extraetf';

const fixture = (name: string) =>
  readFileSync(path.join(__dirname, '__fixtures__', name), 'utf-8');

describe('parseExtraEtfHtml', () => {
  it('parst ein vollständiges frontend-state-Profil', () => {
    const data = parseExtraEtfHtml(fixture('mini-profile.html'), 'TEST00000001');

    expect(data.profile.name).toBe('Test ETF UCITS (Acc)');
    expect(data.profile.provider).toBe('Test Asset Management');
    expect(data.profile.ter).toBe(0.15);
    expect(data.profile.swapBased).toBe(false);
    expect(data.profile.numberOfHoldings).toBe(500);

    expect(data.exposures.asOfDate).toBe('2026-07-31');
    expect(data.exposures.countries).toHaveLength(4);
    expect(data.exposures.countries[0]).toEqual({ name: 'USA', value: 60, code: 'US' });
    expect(data.exposures.sums.countries).toBeCloseTo(98.5, 2);

    expect(data.exposures.sectors).toHaveLength(3);
    expect(data.exposures.regions).toHaveLength(3);
  });

  it('wirft bei fehlendem frontend-state', () => {
    expect(() => parseExtraEtfHtml('<html><body>kein state</body></html>', 'X')).toThrow(
      ExtraEtfError,
    );
  });

  it('wirft bei ungültigem JSON im frontend-state', () => {
    const html = '<script id="frontend-state" type="application/json">{kaputt</script>';
    expect(() => parseExtraEtfHtml(html, 'X')).toThrow(ExtraEtfError);
  });

  it('wirft 404 bei unbekannter ISIN (keine results)', () => {
    const html =
      '<script id="frontend-state" type="application/json">{"1":{"b":{"results":[]}}}</script>';
    try {
      parseExtraEtfHtml(html, 'XX0000000000');
      expect.unreachable('sollte werfen');
    } catch (err) {
      expect(err).toBeInstanceOf(ExtraEtfError);
      expect((err as ExtraEtfError).status).toBe(404);
    }
  });
});

describe('parseExtraEtfHtml mit echten extraETF-Snapshots', () => {
  // Fixtures: echte extraETF-Seiten vom 2026-08-17, reduziert auf die vom Parser
  // gelesenen Felder (portfolio_breakdown unverändert, NAV-Reihen gekürzt).

  it('parst den echten IWDA-Snapshot vollständig', () => {
    const data = parseExtraEtfHtml(fixture('real-iwda.html'), 'IE00B4L5Y983');

    expect(data.profile).toMatchObject({
      isin: 'IE00B4L5Y983',
      name: 'iShares Core MSCI World UCITS ETF (Acc)',
      provider: 'BlackRock Asset Management (DEU) AG',
      index: 'MSCI World',
      ter: 0.2,
      swapBased: false,
      launchDate: '2009-09-25',
      numberOfHoldings: 1328,
    });

    expect(data.exposures.asOfDate).toBe('2026-08-14');
    expect(data.exposures.countries).toHaveLength(32);
    expect(data.exposures.sectors).toHaveLength(11);
    expect(data.exposures.regions).toHaveLength(6);
    expect(data.exposures.msci).toHaveLength(3);

    // Summen ~99,5 % (Rest ist Cash/Derivate, kein "Sonstige"-Eintrag im Live-Feed)
    expect(data.exposures.sums.countries).toBeCloseTo(99.4961, 4);
    expect(data.exposures.sums.sectors).toBeCloseTo(99.4937, 4);
    expect(data.exposures.sums.regions).toBeCloseTo(99.4961, 4);

    // ISO-2-Codes sauber
    for (const c of data.exposures.countries) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
    }
    const usa = data.exposures.countries.find((c) => c.code === 'US');
    expect(usa?.name).toBe('Vereinigte Staaten (USA)');
    expect(usa?.value).toBeGreaterThan(60);
    // Sektor-Codes (GICS-Slugs) vorhanden
    for (const s of data.exposures.sectors) {
      expect(s.code).toBeTruthy();
    }
  });

  it('parst den echten Gold-ETC-Snapshot (IE00B4ND3602) sauber', () => {
    const data = parseExtraEtfHtml(fixture('real-gold-etc.html'), 'IE00B4ND3602');

    expect(data.profile).toMatchObject({
      isin: 'IE00B4ND3602',
      name: 'iShares Physical Gold ETC',
      provider: 'BlackRock Asset Management (DEU) AG',
      index: 'LBMA Gold Price PM USD',
      ter: 0.12,
      swapBased: false,
      launchDate: '2011-04-08',
      numberOfHoldings: 1,
    });

    // extraETF liefert für den Gold-ETC KEINE Aktien-Exposure-Listen:
    // country/global/region/msci stocks exposure lists sind leere Arrays.
    expect(data.exposures.countries).toEqual([]);
    expect(data.exposures.sectors).toEqual([]);
    expect(data.exposures.regions).toEqual([]);
    expect(data.exposures.msci).toEqual([]);
    expect(data.exposures.sums).toEqual({ countries: 0, sectors: 0, regions: 0 });

    // BEKANNTER DATENQUALITÄTS-HINWEIS: extraETF liefert als Stichtag
    // "2014-11-30" (≈12 Jahre alt, kein echter Exposure-Stichtag).
    // Der Parser reicht das Datum unverändert durch — kein Crash, aber
    // Konsumenten sollten dem Datum bei Nicht-Aktien-ETFs nicht vertrauen.
    expect(data.exposures.asOfDate).toBe('2014-11-30');
  });
});

describe('parseExtraEtfHtml: state-Struktur-Edge-Cases', () => {
  const wrap = (state: unknown) =>
    `<script id="frontend-state" type="application/json">${JSON.stringify(state)}</script>`;

  const profileResult = {
    isin: 'IE0000000000',
    fondname: 'Edge ETF',
    provider_name: 'Edge Provider',
    portfolio_breakdown: {
      index_date_last_update: '2026-01-01',
      country_stocks_exposure_list: [{ name: 'USA', value: 99, code: 'US' }],
      global_stock_exposure_list: [],
      region_stock_exposure_list: [],
      msci_stock_exposure_list: [],
    },
  };

  it('überspringt frühere Keys mit b.results = null (echtes extraETF-Muster)', () => {
    // Auf echten extraETF-Seiten gibt es einen früheren numerischen Key
    // ("2309834432") mit b, aber results: null — vor dem Profil-Key.
    const state = {
      '2309834432': { b: { etf_broker: {}, results: null } },
      '2352549139': { b: { count: 1, next: null, previous: null, results: [profileResult] } },
    };
    const data = parseExtraEtfHtml(wrap(state), 'IE0000000000');
    expect(data.profile.name).toBe('Edge ETF');
  });

  it('überspringt Keys, deren results ein Objekt statt Array ist (NAV-Chart-Key)', () => {
    // Echte Seiten enthalten einen Chart-Key mit b.results = { nav: [...] }.
    const state = {
      '1000000000': { b: { results: { nav: [{ date: '2020-01-01', value: 1 }] } } },
      '2000000000': { b: { results: [profileResult] } },
    };
    const data = parseExtraEtfHtml(wrap(state), 'IE0000000000');
    expect(data.profile.name).toBe('Edge ETF');
  });

  it('nimmt den ersten Key mit nicht-leerer results-Liste', () => {
    const state = {
      '1000000000': { b: { results: [] } },
      '2000000000': { b: { results: [profileResult] } },
      '3000000000': { b: { results: [{ ...profileResult, fondname: 'Falscher Kandidat' }] } },
    };
    const data = parseExtraEtfHtml(wrap(state), 'IE0000000000');
    expect(data.profile.name).toBe('Edge ETF');
  });

  it('wirft 404, wenn results[0] kein Objekt ist', () => {
    const state = { '1': { b: { results: [null] } } };
    try {
      parseExtraEtfHtml(wrap(state), 'IE0000000000');
      expect.unreachable('sollte werfen');
    } catch (err) {
      expect(err).toBeInstanceOf(ExtraEtfError);
      expect((err as ExtraEtfError).status).toBe(404);
    }
  });

  it('wirft 404, wenn kein Key b.results als Array hat', () => {
    const state = { '1': { b: { results: null } }, '2': { b: { results: {} } } };
    try {
      parseExtraEtfHtml(wrap(state), 'IE0000000000');
      expect.unreachable('sollte werfen');
    } catch (err) {
      expect((err as ExtraEtfError).status).toBe(404);
    }
  });
});

describe('parseExtraEtfHtml: fehlende/teilweise Felder', () => {
  const wrap = (state: unknown) =>
    `<script id="frontend-state" type="application/json">${JSON.stringify(state)}</script>`;

  it('liefert leere Exposures bei fehlendem portfolio_breakdown', () => {
    const state = { '1': { b: { results: [{ isin: 'IE0000000000' }] } } };
    const data = parseExtraEtfHtml(wrap(state), 'IE0000000000');
    expect(data.exposures.countries).toEqual([]);
    expect(data.exposures.sectors).toEqual([]);
    expect(data.exposures.regions).toEqual([]);
    expect(data.exposures.msci).toEqual([]);
    expect(data.exposures.asOfDate).toBeNull();
    expect(data.exposures.sums).toEqual({ countries: 0, sectors: 0, regions: 0 });
    // Profil-Fallbacks
    expect(data.profile.name).toBe('IE0000000000'); // kein fondname/shortname -> ISIN
    expect(data.profile.provider).toBe('');
    expect(data.profile.ter).toBeNull();
    expect(data.profile.index).toBeNull();
  });

  it('nutzt shortname als Fallback für den Namen', () => {
    const state = { '1': { b: { results: [{ isin: 'IE0000000000', shortname: 'Kurzname' }] } } };
    const data = parseExtraEtfHtml(wrap(state), 'IE0000000000');
    expect(data.profile.name).toBe('Kurzname');
  });

  it('nutzt die angefragte ISIN als Fallback, wenn result.isin fehlt', () => {
    const state = { '1': { b: { results: [{ fondname: 'Ohne ISIN' }] } } };
    const data = parseExtraEtfHtml(wrap(state), 'TESTFALLBACK1');
    expect(data.profile.isin).toBe('TESTFALLBACK1');
  });

  it('ignoriert nicht-string asOfDate-Werte', () => {
    const state = {
      '1': {
        b: {
          results: [
            {
              isin: 'IE0000000000',
              portfolio_breakdown: { index_date_last_update: 20260101 },
            },
          ],
        },
      },
    };
    const data = parseExtraEtfHtml(wrap(state), 'IE0000000000');
    expect(data.exposures.asOfDate).toBeNull();
  });

  it('überspringt Exposure-Einträge ohne name oder mit nicht-numerischem value', () => {
    const state = {
      '1': {
        b: {
          results: [
            {
              isin: 'IE0000000000',
              portfolio_breakdown: {
                country_stocks_exposure_list: [
                  { name: 'Gültig', value: 50, code: 'US' },
                  { name: '', value: 10, code: 'XX' }, // name kein gültiger String? (leer ist String!)
                  { value: 30, code: 'DE' }, // name fehlt
                  { name: 'String-Wert', value: '40', code: 'JP' }, // value ist String
                  { name: 'Ohne Code', value: 20 }, // code fehlt
                ],
              },
            },
          ],
        },
      },
    };
    const data = parseExtraEtfHtml(wrap(state), 'IE0000000000');
    // "Gültig", "" (leerer Name ist String), "Ohne Code" bleiben; ohne name / String-value fliegen raus
    expect(data.exposures.countries).toEqual([
      { name: 'Gültig', value: 50, code: 'US' },
      { name: '', value: 10, code: 'XX' },
      { name: 'Ohne Code', value: 20, code: undefined },
    ]);
    expect(data.exposures.sums.countries).toBe(80);
  });

  it('rundet Summen auf 4 Nachkommastellen', () => {
    const state = {
      '1': {
        b: {
          results: [
            {
              isin: 'IE0000000000',
              portfolio_breakdown: {
                country_stocks_exposure_list: [
                  { name: 'A', value: 1.00004 },
                  { name: 'B', value: 2.00004 },
                ],
              },
            },
          ],
        },
      },
    };
    const data = parseExtraEtfHtml(wrap(state), 'IE0000000000');
    expect(data.exposures.sums.countries).toBeCloseTo(3.0001, 4);
  });

  it('akzeptiert swap-basierte ETFs (is_swap_based_etf true)', () => {
    const state = {
      '1': {
        b: {
          results: [
            { isin: 'IE0000000000', fondname: 'Swap ETF', is_swap_based_etf: true },
          ],
        },
      },
    };
    const data = parseExtraEtfHtml(wrap(state), 'IE0000000000');
    expect(data.profile.swapBased).toBe(true);
  });
});
