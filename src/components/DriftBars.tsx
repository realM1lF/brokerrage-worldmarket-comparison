'use client';

import { CountryName } from './CountryName';

export interface DriftDatum {
  label: string;
  /** ISO-Land, wenn die Zeile ein Land ist. */
  code?: string;
  /** Portfolio-Anteil 0..1 */
  portfolio: number;
  /** Benchmark-Anteil 0..1 */
  benchmark: number;
}

const OVER = '#ff6b4a'; // Übergewicht
const UNDER = '#4d6bdd'; // Untergewicht

function pct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

/**
 * Divergierender Balkenchart: Achse in der Mitte = Benchmark.
 * Balken nach rechts = Übergewicht, nach links = Untergewicht.
 * Hover auf einer Zeile zeigt die exakten Portfolio-/Benchmark-Werte.
 */
export function DriftBars({ data, unit = '%' }: { data: DriftDatum[]; unit?: string }) {
  const maxAbs = Math.max(
    0.0001,
    ...data.map(d => Math.abs(d.portfolio - d.benchmark)),
  );

  return (
    <div className="driftList">
      {data.map(d => {
        const drift = d.portfolio - d.benchmark;
        const over = drift > 0;
        const pctWidth = Math.abs(drift) / maxAbs;
        return (
          <div className="driftRow" key={d.label}>
            <div className="driftLabel">
              <CountryName code={d.code} name={d.label} />
            </div>
            <div className="driftTrack">
              <div className="driftAxis" />
              {over ? (
                <div className="driftBar over" style={{ width: `${pctWidth * 50}%` }} />
              ) : (
                <div
                  className="driftBar under"
                  style={{ width: `${pctWidth * 50}%`, marginLeft: `${50 - pctWidth * 50}%` }}
                />
              )}
              <span className="barTip">
                <b>
                  <CountryName code={d.code} name={d.label} />
                </b>
                <span>
                  Dein Portfolio: {pct(d.portfolio)}
                  <br />
                  Weltmarkt: {pct(d.benchmark)}
                </span>
              </span>
            </div>
            <div className={`driftValue ${over ? 'overText' : 'underText'}`}>
              {drift > 0 ? '+' : ''}
              {(drift * 100).toFixed(2)}
              {unit}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { OVER, UNDER };
