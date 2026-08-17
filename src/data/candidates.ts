/**
 * Kandidaten-Katalog für Stufe B (fehlende ETFs vorschlagen).
 *
 * Kriterien (docs/plan-stufe-b.md): UCITS, TER ≤ 0,4 %, physisch bevorzugt,
 * Fondsgröße ≥ 500 M€, Auflage ≥ 5 Jahre, breite Abdeckung je Rolle.
 * TER hier statisch hinterlegt (Stand 2026-08); die API liefert zusätzlich
 * den Live-TER aus extraETF (profile.ter), das UI bevorzugt den Live-Wert.
 */
export interface CandidateEtf {
  isin: string;
  name: string;
  role: 'em' | 'smallcap' | 'allworld';
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
    isin: 'IE00B3RBWM25',
    name: 'Vanguard FTSE All-World',
    role: 'allworld',
    ter: 0.22,
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
];

/** Kandidat per ISIN (Map, schneller Lookup). */
export const CANDIDATE_BY_ISIN: Map<string, CandidateEtf> = new Map(
  CANDIDATE_ETFS.map(c => [c.isin, c]),
);
