import { describe, it, expect } from 'vitest';
import { countryFlag } from './countryFlag';

describe('countryFlag', () => {
  it('setzt die Flagge vor ISO-Ländern und lässt Rest/Sektoren leer', () => {
    expect(countryFlag('US')).toBe('🇺🇸');
    expect(countryFlag('DE')).toBe('🇩🇪');
    expect(countryFlag('_OTHER')).toBe('');
    expect(countryFlag('technology')).toBe('');
  });
});
