import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { EtfData } from '@/lib/etf/types';
import { CANDIDATE_ETFS } from './candidates';

const FIXTURE_DIR = path.join(__dirname, '../lib/optimizer/__fixtures__');

const loadEtf = (isin: string): EtfData =>
  JSON.parse(readFileSync(path.join(FIXTURE_DIR, `${isin}.json`), 'utf-8'));

/** Ursprüngliche 5 plus Acc-Bausteine (Stand 2026-08). */
const ORIGINAL = [
  'IE00BKM4GZ66',
  'IE00BF4RFH31',
  'IE00BK5BQT80',
  'IE00B3YLTY66',
  'IE0003XJA0J9',
] as const;

const ADDED = [
  'IE00B4L5YX21', // Japan IMI
  'IE00B52MJY50', // Pacific ex Japan
  'IE00BHZRQZ17', // India
  'IE00BJ5JPG56', // China
  'IE00BQT3WG13', // China A
  'IE00B5L8K969', // EM Asia
  'IE00BK5BR733', // Vanguard EM Acc
  'IE00B469F816', // SPDR EM
  'LU0446734872', // Canada Dist (keine Acc ≤ 0,4 %)
  'IE00B4K48X80', // Europe Acc
  'IE00B53HP851', // FTSE 100 Acc
  'IE00B53QG562', // EMU unhedged
  'LU0322253906', // Europe Small Cap
  'IE00B6R52259', // ACWI
  'IE00BFY0GT14', // SPDR World
  'IE00BJ0KDQ92', // Xtrackers World
  'IE00B53L3W79', // EURO STOXX 50
  'IE000KCKFHE8', // GDP-Weighted (Ausnahme: zu neu/klein)
] as const;

describe('CANDIDATE_ETFS Katalog', () => {
  it('hat 23 eindeutige ISINs: die ursprünglichen 5 plus Acc-Bausteine', () => {
    expect(CANDIDATE_ETFS).toHaveLength(23);
    const isins = CANDIDATE_ETFS.map(c => c.isin);
    expect(new Set(isins).size).toBe(23);
    for (const isin of ORIGINAL) expect(isins, isin).toContain(isin);
    for (const isin of ADDED) expect(isins, isin).toContain(isin);
  });

  it('Katalog-Vorschläge sind thesaurierend, Dist nur als Kanada-Ausnahme', () => {
    const distOk = new Set(['LU0446734872']);
    for (const c of CANDIDATE_ETFS) {
      const data = loadEtf(c.isin);
      if (distOk.has(c.isin)) {
        expect(data.profile.name, c.isin).toMatch(/\(Dist\)/i);
        continue;
      }
      expect(data.profile.name, c.isin).not.toMatch(/\(Dist\)/i);
    }
  });

  it('jeder Eintrag hat Fixture, TER ≤ 0,4 %, physisch, mindestens ein Land', () => {
    for (const c of CANDIDATE_ETFS) {
      expect(existsSync(path.join(FIXTURE_DIR, `${c.isin}.json`)), c.isin).toBe(true);
      expect(c.ter, c.isin).toBeLessThanOrEqual(0.4);
      const data = loadEtf(c.isin);
      expect(data.profile.swapBased, c.isin).toBe(false);
      expect(data.exposures.countries.length, c.isin).toBeGreaterThan(0);
    }
  });

  it('deckt Japan, Pazifik, China, Indien, Europa, Kanada, UK, EM, Small Cap ab', () => {
    const roles = new Set(CANDIDATE_ETFS.map(c => c.role));
    const required: Array<(typeof CANDIDATE_ETFS)[number]['role']> = [
      'japan',
      'pacific',
      'china',
      'india',
      'europe',
      'canada',
      'uk',
      'emu',
      'em',
      'smallcap',
      'allworld',
    ];
    for (const role of required) {
      expect(roles.has(role), role).toBe(true);
    }
  });
});
