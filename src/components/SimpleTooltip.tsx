'use client';

/**
 * Leichte Laien-Erklärung: Info-Button (ⓘ) mit Popup bei Hover/Fokus.
 * Bewusst ohne JS-State — reines CSS (:hover / :focus-within),
 * damit Tastatur-Nutzer (Tab + Enter/Fokus) es auch sehen.
 */
export function SimpleTooltip({ text }: { text: string }) {
  return (
    <span className="tipWrap" tabIndex={0} role="note" aria-label={text}>
      <span className="tipIcon" aria-hidden="true">
        ⓘ
      </span>
      <span className="tipPopup">{text}</span>
    </span>
  );
}
