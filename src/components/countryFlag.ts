const REGIONAL_A = 0x1f1e6;

/** ISO-3166 Alpha-2 → Flaggen-Emoji. Sonst leer (Rest, Sektoren). */
export function countryFlag(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return '';
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map(c => REGIONAL_A + c.charCodeAt(0) - 65),
  );
}
