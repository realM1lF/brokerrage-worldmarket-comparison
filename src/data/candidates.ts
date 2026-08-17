/**
 * Kandidaten-Katalog für Stufe B (fehlende ETFs vorschlagen).
 *
 * Kriterien (docs/plan-stufe-b.md): UCITS, TER ≤ 0,4 %, physisch bevorzugt,
 * thesaurierend (Acc), Fondsgröße ≥ 500 M€, Auflage ≥ 5 Jahre.
 * Dist nur, wenn es keine Acc-Klasse unter 0,4 % TER gibt (Kanada).
 * Ausnahme Größe/Alter: Amundi GDP-Weighted (IE000KCKFHE8).
 * TER hier statisch hinterlegt (Stand 2026-08); die API liefert zusätzlich
 * den Live-TER aus extraETF (profile.ter), das UI bevorzugt den Live-Wert.
 */
export interface CandidateEtf {
  isin: string;
  name: string;
  role:
    | 'em'
    | 'smallcap'
    | 'allworld'
    | 'japan'
    | 'pacific'
    | 'china'
    | 'india'
    | 'europe'
    | 'canada'
    | 'uk'
    | 'emu';
  /** TER in Prozent (statischer Referenzwert). */
  ter: number;
  index: string;
}

export const CANDIDATE_ETFS: CandidateEtf[] = [
  {
    isin: 'IE00BKM4GZ66',
    name: 'iShares Core MSCI EM IMI',
    role: 'em',
    ter: 0.18,
    index: 'MSCI Emerging Markets IMI',
  },
  {
    isin: 'IE00BF4RFH31',
    name: 'iShares MSCI World Small Cap',
    role: 'smallcap',
    ter: 0.35,
    index: 'MSCI World Small Cap',
  },
  {
    isin: 'IE00BK5BQT80',
    name: 'Vanguard FTSE All-World',
    role: 'allworld',
    ter: 0.14,
    index: 'FTSE All-World',
  },
  {
    isin: 'IE00B3YLTY66',
    name: 'SPDR MSCI ACWI IMI',
    role: 'allworld',
    ter: 0.17,
    index: 'MSCI ACWI IMI',
  },
  {
    isin: 'IE0003XJA0J9',
    name: 'Amundi Prime All Country World',
    role: 'allworld',
    ter: 0.07,
    index: 'Solactive GBS Global Markets Large & Mid Cap',
  },
  {
    // Ausnahme: zu neu/klein für die 5-Jahre/500-M€-Regel. Einziger physischer
    // GDP-Weighted-UCITS, ohne ihn bleibt „Bestmögliches Depot“ unter 90 %.
    isin: 'IE000KCKFHE8',
    name: 'Amundi FTSE All World GDP-Weighted',
    role: 'allworld',
    ter: 0.3,
    index: 'FTSE All-World GDP-Adjusted',
  },
  {
    isin: 'IE00B4L5YX21',
    name: 'iShares Core MSCI Japan IMI',
    role: 'japan',
    ter: 0.12,
    index: 'MSCI Japan IMI',
  },
  {
    isin: 'IE00B52MJY50',
    name: 'iShares Core MSCI Pacific ex-Japan',
    role: 'pacific',
    ter: 0.2,
    index: 'MSCI Pacific ex Japan',
  },
  {
    isin: 'IE00BHZRQZ17',
    name: 'Franklin FTSE India',
    role: 'india',
    ter: 0.19,
    index: 'FTSE India 30/18 Capped',
  },
  {
    isin: 'IE00BJ5JPG56',
    name: 'iShares MSCI China',
    role: 'china',
    ter: 0.28,
    index: 'MSCI China',
  },
  {
    isin: 'IE00BQT3WG13',
    name: 'iShares MSCI China A',
    role: 'china',
    ter: 0.4,
    index: 'MSCI China A Inclusion',
  },
  {
    isin: 'IE00B5L8K969',
    name: 'iShares MSCI EM Asia',
    role: 'em',
    ter: 0.2,
    index: 'MSCI Emerging Markets Asia',
  },
  {
    isin: 'IE00BK5BR733',
    name: 'Vanguard FTSE Emerging Markets',
    role: 'em',
    ter: 0.17,
    index: 'FTSE Emerging',
  },
  {
    isin: 'IE00B469F816',
    name: 'SPDR MSCI Emerging Markets',
    role: 'em',
    ter: 0.18,
    index: 'MSCI Emerging Markets',
  },
  {
    // Dist-Ausnahme: keine Acc-Klasse unter TER 0,4 % (iShares Canada Acc 0,48 %).
    isin: 'LU0446734872',
    name: 'UBS MSCI Canada',
    role: 'canada',
    ter: 0.33,
    index: 'MSCI Canada',
  },
  {
    isin: 'IE00B4K48X80',
    name: 'iShares Core MSCI Europe',
    role: 'europe',
    ter: 0.12,
    index: 'MSCI Europe',
  },
  {
    isin: 'IE00B53HP851',
    name: 'iShares Core FTSE 100',
    role: 'uk',
    ter: 0.07,
    index: 'FTSE 100',
  },
  {
    isin: 'IE00B53QG562',
    name: 'iShares Core MSCI EMU',
    role: 'emu',
    ter: 0.12,
    index: 'MSCI EMU',
  },
  {
    isin: 'LU0322253906',
    name: 'Xtrackers MSCI Europe Small Cap',
    role: 'smallcap',
    ter: 0.3,
    index: 'MSCI Europe Small Cap',
  },
  {
    isin: 'IE00B6R52259',
    name: 'iShares MSCI ACWI',
    role: 'allworld',
    ter: 0.2,
    index: 'MSCI ACWI',
  },
  {
    isin: 'IE00BFY0GT14',
    name: 'SPDR MSCI World',
    role: 'allworld',
    ter: 0.12,
    index: 'MSCI World',
  },
  {
    isin: 'IE00BJ0KDQ92',
    name: 'Xtrackers MSCI World',
    role: 'allworld',
    ter: 0.12,
    index: 'MSCI World',
  },
  {
    isin: 'IE00B53L3W79',
    name: 'iShares Core EURO STOXX 50',
    role: 'europe',
    ter: 0.1,
    index: 'EURO STOXX 50',
  },
];

/** Kandidat per ISIN (Map, schneller Lookup). */
export const CANDIDATE_BY_ISIN: Map<string, CandidateEtf> = new Map(
  CANDIDATE_ETFS.map(c => [c.isin, c]),
);
