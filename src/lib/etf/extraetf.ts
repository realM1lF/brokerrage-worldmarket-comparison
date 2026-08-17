import type { EtfData, EtfProfile, ExposureEntry } from './types';

const EXTRAETF_PROFILE_URL = 'https://extraetf.com/de/etf-profile/';
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0';
const FETCH_TIMEOUT_MS = 15_000;

export class ExtraEtfError extends Error {
  /** HTTP-Status für die API-Antwort; 404 = ISIN unbekannt. */
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'ExtraEtfError';
    this.status = status;
  }
}

/**
 * Lädt das extraETF-Profil einer ISIN und parst Metadaten + Exposure-Daten.
 * Server-rendered HTML, kein Key, keine Session.
 */
export async function fetchExtraEtfData(
  isin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<EtfData> {
  const url = EXTRAETF_PROFILE_URL + isin;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch (err) {
      throw new ExtraEtfError(
        `extraETF nicht erreichbar (${err instanceof Error ? err.message : String(err)})`,
        502,
      );
    }
    if (!res.ok) {
      throw new ExtraEtfError(`extraETF antwortet HTTP ${res.status}`, res.status === 404 ? 404 : 502);
    }
    const html = await res.text();
    return parseExtraEtfHtml(html, isin);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parst das `<script id="frontend-state">`-JSON der extraETF-Profilseite.
 * Reine Funktion, damit sie in Tests mit gespeicherten HTML-Fixtures läuft.
 */
export function parseExtraEtfHtml(html: string, requestedIsin: string): EtfData {
  const match = /<script id="frontend-state" type="application\/json">([\s\S]*?)<\/script>/.exec(
    html,
  );
  if (!match) {
    throw new ExtraEtfError('frontend-state-Script nicht gefunden');
  }
  let state: unknown;
  try {
    state = JSON.parse(match[1]);
  } catch {
    throw new ExtraEtfError('frontend-state enthält kein valides JSON');
  }
  const result = findProfileResult(state);
  if (!result) {
    throw new ExtraEtfError(
      `Kein ETF-Profil für ISIN ${requestedIsin} gefunden (unbekannte ISIN?)`,
      404,
    );
  }
  return extractEtfData(result, requestedIsin);
}

/** Top-Level: mehrere numerische Keys; gesucht wird der mit b.results als Liste. */
function findProfileResult(state: unknown): Record<string, unknown> | null {
  if (!state || typeof state !== 'object') return null;
  for (const value of Object.values(state)) {
    if (!value || typeof value !== 'object') continue;
    const b = (value as Record<string, unknown>).b;
    if (!b || typeof b !== 'object') continue;
    const results = (b as Record<string, unknown>).results;
    if (Array.isArray(results) && results.length > 0 && typeof results[0] === 'object') {
      return results[0] as Record<string, unknown>;
    }
  }
  return null;
}

function extractEtfData(result: Record<string, unknown>, requestedIsin: string): EtfData {
  const pb = asRecord(result.portfolio_breakdown);

  const countries = exposureList(pb.country_stocks_exposure_list);
  const sectors = exposureList(pb.global_stock_exposure_list);
  const regions = exposureList(pb.region_stock_exposure_list);
  const msci = exposureList(pb.msci_stock_exposure_list);

  const profile: EtfProfile = {
    isin: str(result.isin) ?? requestedIsin,
    name: str(result.fondname) ?? str(result.shortname) ?? requestedIsin,
    provider: str(result.provider_name) ?? '',
    index: str(result.index_name),
    ter: num(result.ter),
    ongoingCharges: num(result.ongoing_charges),
    swapBased: result.is_swap_based_etf === true,
    launchDate: str(result.launch_date),
    fundVolumeEur: num(result.fondsvolumen),
    numberOfHoldings: num(result.number_of_holding),
  };

  return {
    profile,
    exposures: {
      countries,
      sectors,
      regions,
      msci,
      asOfDate: str(pb.index_date_last_update) || null,
      sums: {
        countries: sum(countries),
        sectors: sum(sectors),
        regions: sum(regions),
      },
    },
  };
}

/** Liste {name, value, code} aus dem frontend-state; fehlend/leer -> []. */
function exposureList(value: unknown): ExposureEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: ExposureEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.name !== 'string' || typeof rec.value !== 'number') continue;
    entries.push({
      name: rec.name,
      value: rec.value,
      code: typeof rec.code === 'string' ? rec.code : undefined,
    });
  }
  return entries;
}

function sum(entries: ExposureEntry[]): number {
  return round4(entries.reduce((acc, e) => acc + e.value, 0));
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  // extraETF liefert manche Zahlenwerte (z.B. ongoing_charges) als String.
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
