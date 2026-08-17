import { describe, it, expect } from 'vitest';
import { readCatalogFixture } from './catalog-fallback';

describe('readCatalogFixture', () => {
  it('liefert den GDP-Weighted aus der Optimizer-Fixture', () => {
    const data = readCatalogFixture('IE000KCKFHE8');
    expect(data).not.toBeNull();
    expect(data!.profile.isin).toBe('IE000KCKFHE8');
    expect(data!.exposures.countries.length).toBeGreaterThan(0);
  });

  it('gibt null für unbekannte ISIN', () => {
    expect(readCatalogFixture('XX0000000000')).toBeNull();
  });
});
