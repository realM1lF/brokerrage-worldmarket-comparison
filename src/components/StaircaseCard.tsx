'use client';

import type { AdditionsResult, ReplacementHint } from '@/lib/optimizer/candidates';
import { SimpleTooltip } from '@/components/SimpleTooltip';
import styles from '@/app/page.module.css';

const pct = (n: number) => `${(n * 100).toFixed(1)} %`;
const ter = (t: number | null) => (t === null ? '' : ` · TER ${t.toFixed(2)} %`);

/**
 * Stufe B: Treppen-Karte ("Mit neuen ETFs") + optionaler Tausch-Hinweis.
 * context='bestand': Scores = Deckungs-Score nach Umschichtung.
 * context='sparplan': Scores = Deckungs-Score nach 1 Monat (p(1)).
 */
export function StaircaseCard({
  additions,
  replacement,
  context,
}: {
  additions: AdditionsResult;
  replacement: ReplacementHint | null;
  context: 'bestand' | 'sparplan';
}) {
  const scoreLabel = context === 'bestand' ? 'Deckungs-Score' : 'Deckungs-Score nach 1 Monat';
  const tooltip =
    context === 'bestand'
      ? 'Jede Stufe zeigt, wie viel näher du dem Weltmarkt kommst, wenn du einen weiteren ETF in die Umschichtung einbeziehst. Die Reihenfolge ist berechnet: zuerst der ETF mit dem größten Effekt. Abgebrochen wird, wenn ein weiterer ETF weniger als 0,5 Prozentpunkte bringt.'
      : 'Jede Stufe zeigt deinen Deckungs-Score nach einem Monat, wenn du einen weiteren ETF in deinen Sparplan aufnimmst. Die Reihenfolge ist berechnet: zuerst der ETF mit dem größten Effekt. Abgebrochen wird, wenn ein weiterer ETF weniger als 0,5 Prozentpunkte bringt.';

  return (
    <section className={`card ${styles.wideCard}`}>
      <h3>
        Mit neuen ETFs
        <SimpleTooltip text={tooltip} />
      </h3>
      <ol className="staircase">
        <li className="stairStep">
          <span className="stairChip base">
            Mit deinen ETFs: <b>{pct(additions.baseScore)}</b>
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
          <li className="muted">
            Deine ETFs decken den Weltmarkt bereits ab — keine Ergänzung nötig.
          </li>
        )}
      </ol>
      {replacement && (
        <p className="replacementHint">
          💡 Alternativ zum Neukauf: <b>{replacement.fromName}</b> gegen{' '}
          <b>{replacement.toName}</b> tauschen → {scoreLabel} {pct(replacement.scoreAfter)}
          {replacement.toTer !== null && ` (TER ${replacement.toTer.toFixed(2)} %)`}. Ein ETF
          weniger, gleicher Plan.
        </p>
      )}
    </section>
  );
}
