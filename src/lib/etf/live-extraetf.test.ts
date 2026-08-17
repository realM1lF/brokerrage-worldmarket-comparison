/**
 * Live-Netzwerk-Tests gegen extraETF (https://extraetf.com).
 *
 * Diese Tests sind NICHT Teil von `npm test` (offline deterministisch).
 * Ausführen nur bei Bedarf:
 *
 *   RUN_LIVE=1 npx vitest run src/lib/etf/live-extraetf.test.ts
 *
 * Sie validieren die komplette Pipeline (fetchExtraEtfData) gegen die
 * echte Quelle für alle 6 Portfolio-ISINs inkl. des Gold-ETC-Sonderfalls.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { fetchExtraEtfData, ExtraEtfError } from './extraetf';
import type { EtfData } from './types';

const live = process.env.RUN_LIVE === '1' ? describe : describe.skip;

const EQUITY_ISINS = [
  'IE00B4L5Y983', // iShares Core MSCI World (IWDA)
  'IE0003XJA0J9', // Amundi Prime All Country World
  'IE00BTJRMP35', // Xtrackers MSCI Emerging Markets
  'LU0908500753', // Amundi Core Stoxx Europe 600
  'IE00BKM4GZ66', // iShares Core MSCI EM IMI
] as const;

const GOLD_ETC_ISIN = 'IE00B4ND3602'; // iShares Physical Gold ETC — KEIN Aktien-ETF

const ISO2 = /^[A-Z]{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DATA_AGE_DAYS = 400;

live('Live: extraETF-Pipeline für alle Portfolio-ISINs', () => {
  describe.each(EQUITY_ISINS)('Aktien-ETF %s', (isin) => {
    let data: EtfData;

    beforeAll(async () => {
      data = await fetchExtraEtfData(isin);
    }, 30_000);

    it('liefert Profil-Metadaten', () => {
      expect(data.profile.isin).toBe(isin);
      expect(data.profile.name.length).toBeGreaterThan(5);
      expect(data.profile.provider.length).toBeGreaterThan(2);
      expect(typeof data.profile.ter).toBe('number');
      expect(data.profile.ter).toBeGreaterThan(0);
    });

    it('liefert Länder-, Sektor- und Regions-Exposures', () => {
      expect(data.exposures.countries.length).toBeGreaterThanOrEqual(20);
      expect(data.exposures.sectors.length).toBeGreaterThanOrEqual(10);
      expect(data.exposures.regions.length).toBeGreaterThanOrEqual(3);
    });

    it('hat plausible Summen (90–105 %)', () => {
      expect(data.exposures.sums.countries).toBeGreaterThan(90);
      expect(data.exposures.sums.countries).toBeLessThan(105);
      expect(data.exposures.sums.sectors).toBeGreaterThan(90);
      expect(data.exposures.sums.sectors).toBeLessThan(105);
      expect(data.exposures.sums.regions).toBeGreaterThan(90);
      expect(data.exposures.sums.regions).toBeLessThan(105);
    });

    it('hat einen aktuellen, wohlgeformten Stichtag', () => {
      const asOf = data.exposures.asOfDate;
      expect(asOf).toMatch(ISO_DATE);
      const ageDays = (Date.now() - Date.parse(asOf as string)) / 86_400_000;
      expect(ageDays).toBeLessThan(MAX_DATA_AGE_DAYS);
    });

    it('hat saubere Länder-ISO-Codes und gültige Sektor-/Regions-Codes', () => {
      for (const c of data.exposures.countries) {
        expect(c.code).toMatch(ISO2);
        expect(Number.isFinite(c.value)).toBe(true);
        expect(c.value).toBeGreaterThanOrEqual(0);
      }
      for (const s of [...data.exposures.sectors, ...data.exposures.regions]) {
        expect(s.code).toBeTruthy();
        expect(Number.isFinite(s.value)).toBe(true);
      }
    });
  });

  describe(`Gold-ETC ${GOLD_ETC_ISIN} (Sonderfall, kein Aktien-ETF)`, () => {
    let data: EtfData;

    beforeAll(async () => {
      data = await fetchExtraEtfData(GOLD_ETC_ISIN);
    }, 30_000);

    it('liefert ein Profil ohne Fehler', () => {
      expect(data.profile.isin).toBe(GOLD_ETC_ISIN);
      expect(data.profile.name).toBe('iShares Physical Gold ETC');
      expect(data.profile.index).toBe('LBMA Gold Price PM USD');
      expect(data.profile.numberOfHoldings).toBe(1);
      expect(data.profile.ter).toBe(0.12);
    });

    it('extraETF liefert KEINE Aktien-Exposure-Listen (leere Arrays)', () => {
      // Beobachtetes Verhalten der Quelle: country/global/region/msci
      // stock exposure lists sind leer, Summen daher 0. Die Pipeline
      // behandelt das sauber: gültiges EtfData-Objekt, kein Fehler.
      expect(data.exposures.countries).toEqual([]);
      expect(data.exposures.sectors).toEqual([]);
      expect(data.exposures.regions).toEqual([]);
      expect(data.exposures.msci).toEqual([]);
      expect(data.exposures.sums).toEqual({ countries: 0, sectors: 0, regions: 0 });
    });

    it('Stichtag: extraETF liefert "2014-11-30" (veraltet, kein echter Stichtag)', () => {
      // Dokumentiert den Datenqualitäts-Befund der Quelle. Sollte extraETF
      // diesen Wert jemals korrigieren, schlägt dieser Test bewusst fehl,
      // damit die Annahme neu bewertet wird.
      console.info(`[live] ${GOLD_ETC_ISIN} asOfDate = ${data.exposures.asOfDate}`);
      expect(data.exposures.asOfDate).toBe('2014-11-30');
    });
  });

  describe('Fehlerbehandlung', () => {
    it('unbekannte, aber valide ISIN → ExtraEtfError mit Status 404', async () => {
      await expect(fetchExtraEtfData('XX1234567890')).rejects.toMatchObject({
        name: 'ExtraEtfError',
        status: 404,
      });
    }, 30_000);

    it('ExtraEtfError hat Status 502 als Default', () => {
      expect(new ExtraEtfError('x').status).toBe(502);
    });
  });
});
