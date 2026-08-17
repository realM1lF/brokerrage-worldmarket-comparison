import { countryFlag } from './countryFlag';

/** Landname mit Flagge davor. Ohne ISO-Code nur der Name. */
export function CountryName({ code, name }: { code?: string; name: string }) {
  const flag = code ? countryFlag(code) : '';
  return (
    <span className="countryName">
      {flag ? (
        <span className="countryFlag" aria-hidden="true">
          {flag}
        </span>
      ) : null}
      {name}
    </span>
  );
}
