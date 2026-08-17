'use client';

import type { AdditionsResult, ReplacementHint } from '@/lib/optimizer/candidates';
import { staircaseBaseLabel, staircaseEmptyMessage } from '@/components/staircaseCopy';
import styles from '@/app/page.module.css';

const pct = (n: number) => `${(n * 100).toFixed(1)} %`;
const ter = (t: number | null) => (t === null ? '' : ` · TER ${t.toFixed(2)} %`);

/**
 * Stufe B: Treppen-Karte ("Mit neuen ETFs") + optionaler Tausch-Hinweis.
 * context='bestand': Treppen-Scores = Deckungs-Score nach Umschichtung.
 * context='sparplan': Treppen-Scores = Depot nach 1 Monat Sparplan (p(1)).
 * context='bestDepot': Treppe = Baukasten von leer, Stopp unter 0,5 pp.
 * Der Tausch-Hinweis ist immer eine Bestands-Umschichtung (optimize), nie p(1).
 */
export function StaircaseCard({
  additions,
  replacement,
  context,
}: {
  additions: AdditionsResult;
  replacement: ReplacementHint | null;
  context: 'bestand' | 'sparplan' | 'bestDepot';
}) {
  return (
    <section className={`card ${styles.wideCard}`}>
      <h3>Wenn du einen ETF dazu nimmst</h3>
      <ol className="staircase">
        <li className="stairStep">
          <span className="stairChip base">
            {staircaseBaseLabel(context)} <b>{pct(additions.baseScore)}</b>
          </span>
        </li>
        {additions.steps.map(s => (
          <li className="stairStep" key={s.isin}>
            <span className="stairArrow" aria-hidden="true">
              →
            </span>
            <span className="stairChip">
              + {s.name}
              {ter(s.ter)} = <b>{pct(s.score)}</b>
            </span>
          </li>
        ))}
        {additions.steps.length === 0 && (
          <li className="muted">{staircaseEmptyMessage(context)}</li>
        )}
      </ol>
      {replacement && (
        <p className="replacementHint">
          {context !== 'bestand' ? (
            <>
              💡 Tipp zum Depot (nicht zum Sparplan): <b>{replacement.fromName}</b> gegen{' '}
              <b>{replacement.toName}</b> tauschen, dann umschichten → Deckungs-Score{' '}
              {pct(replacement.scoreAfter)}
              {replacement.toTer !== null && ` (TER ${replacement.toTer.toFixed(2)} %)`}. Das
              ändert den Bestand, nicht die Monatsrate.
            </>
          ) : (
            <>
              💡 Alternativ zum Neukauf: <b>{replacement.fromName}</b> gegen{' '}
              <b>{replacement.toName}</b> tauschen → Deckungs-Score nach Umschichtung{' '}
              {pct(replacement.scoreAfter)}
              {replacement.toTer !== null && ` (TER ${replacement.toTer.toFixed(2)} %)`}. Ein ETF
              weniger.
            </>
          )}
        </p>
      )}
    </section>
  );
}
