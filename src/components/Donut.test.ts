import { describe, it, expect } from 'vitest';
import { donutColor } from './Donut';

describe('donutColor', () => {
  it('gleiche Region behält die Farbe, auch wenn Nachbarn fehlen', () => {
    const north = donutColor('america_north');
    expect(north).toBeTruthy();
    expect(donutColor('america_north')).toBe(north);
    expect(donutColor('asien')).not.toBe(north);
  });

  it('Other ist Anthrazit, nicht das Orange von Nordamerika', () => {
    const anthracite = '#36454F';
    expect(donutColor('_OTHER')).toBe(anthracite);
    expect(donutColor('Other')).toBe(anthracite);
    expect(donutColor('_OTHER')).not.toBe(donutColor('america_north'));
  });
});
