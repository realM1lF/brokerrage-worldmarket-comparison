import { describe, it, expect } from 'vitest';
import { staircaseEmptyMessage, staircaseBaseLabel } from './staircaseCopy';

describe('Staircase-Texte', () => {
  it('Sparplan-Leertext sagt nicht „bereits abgedeckt“, sondern Monatsrate vs. Bestand', () => {
    const msg = staircaseEmptyMessage('sparplan');
    expect(msg).not.toMatch(/bereits ab/i);
    expect(msg).toMatch(/Monatsrate/i);
    expect(msg).toMatch(/Bestand/i);
    expect(msg).toMatch(/0,5/);
  });

  it('Bestand-Leertext spricht von Umschichtung, nicht von Sparplan', () => {
    const msg = staircaseEmptyMessage('bestand');
    expect(msg).toMatch(/Umschichtung/i);
    expect(msg).not.toMatch(/Sparplan/i);
    expect(msg).not.toMatch(/bereits ab/i);
  });

  it('Basis-Label trennt Umschichtung und 1 Monat', () => {
    expect(staircaseBaseLabel('bestand')).toMatch(/Umschichtung/);
    expect(staircaseBaseLabel('sparplan')).toMatch(/1 Monat/);
    expect(staircaseBaseLabel('sparplan')).not.toMatch(/Umschichtung/);
  });

  it('bestDepot startet bei 0 Aktien-ETFs, nicht bei Umschichtung des Bestands', () => {
    expect(staircaseBaseLabel('bestDepot')).toMatch(/kein Aktien-ETF/i);
    expect(staircaseBaseLabel('bestDepot')).not.toMatch(/Umschichtung/);
    expect(staircaseBaseLabel('bestDepot')).not.toMatch(/1 Monat/);
    const msg = staircaseEmptyMessage('bestDepot');
    expect(msg).toMatch(/Baukasten/i);
    expect(msg).not.toMatch(/nach einem Monat/i);
  });
});
