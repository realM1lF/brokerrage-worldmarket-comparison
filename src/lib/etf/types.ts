/** Ein Exposure-Eintrag (Land, Sektor oder Region). Werte in Prozent. */
export interface ExposureEntry {
  name: string;
  /** Gewicht in Prozent, z.B. 71.79 für 71.79 %. */
  value: number;
  /** ISO-Ländercode (AT) bzw. Sektor-/Region-Code (z.B. "basic_materials"). */
  code?: string;
}

export interface EtfExposures {
  countries: ExposureEntry[];
  sectors: ExposureEntry[];
  regions: ExposureEntry[];
  /** Developed/Emerging-Split, falls Quelle ihn liefert (optional). */
  msci: ExposureEntry[];
  /** Stichtag der Exposure-Daten (index_date_last_update), z.B. "2026-08-14". */
  asOfDate: string | null;
  sums: {
    countries: number;
    sectors: number;
    regions: number;
  };
}

export interface EtfProfile {
  isin: string;
  name: string;
  provider: string;
  index: string | null;
  /** TER in Prozent (z.B. 0.2). */
  ter: number | null;
  ongoingCharges: number | null;
  swapBased: boolean;
  launchDate: string | null;
  fundVolumeEur: number | null;
  numberOfHoldings: number | null;
}

export interface EtfData {
  profile: EtfProfile;
  exposures: EtfExposures;
}
