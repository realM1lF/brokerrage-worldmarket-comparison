'use client';

import type { DriftEntry } from '@/lib/optimizer/optimize';
import { SimpleTooltip } from '@/components/SimpleTooltip';

function pct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

/** Top Über-/Untergewichte als gerankte Liste — mit Laien-Erklärung. */
export function TopDeltas({
  overweight,
  underweight,
}: {
  overweight: DriftEntry[];
  underweight: DriftEntry[];
}) {
  const n = 6;
  return (
    <div className="twoCol">
      <div>
        <h4>
          Top Übergewichte
          <SimpleTooltip text="Diese Länder hast du stärker im Portfolio als der Weltmarkt. Du bist hier überdurchschnittlich investiert." />
        </h4>
        <ol className="rankList">
          {overweight.slice(0, n).map(d => (
            <li key={d.code}>
              <span>{d.name}</span>
              <b className="pos">+{pct(d.drift)}</b>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <h4>
          Top Untergewichte
          <SimpleTooltip text="Diese Länder sind im Weltmarkt stärker vertreten als in deinem Portfolio. Du bist hier unterdurchschnittlich investiert." />
        </h4>
        <ol className="rankList">
          {underweight.slice(0, n).map(d => (
            <li key={d.code}>
              <span>{d.name}</span>
              <b className="neg">{pct(d.drift)}</b>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Fehlende Länder als Tags — mit Erklärung. */
export function MissingCountries({ countries }: { countries: DriftEntry[] }) {
  if (countries.length === 0) {
    return (
      <>
        <p className="muted">Keine fehlenden Länder.</p>
        <SimpleTooltip text="Dein Portfolio deckt alle wesentlichen Weltmarkt-Länder ab. Gut so!" />
      </>
    );
  }
  return (
    <div className="tags">
      {countries.map(c => (
        <span className="tag" key={c.code} title={`Benchmark: ${pct(c.benchmark)}`}>
          {c.name} <small>{pct(c.benchmark)}</small>
        </span>
      ))}
    </div>
  );
}