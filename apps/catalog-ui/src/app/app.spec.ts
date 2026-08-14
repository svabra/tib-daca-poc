import { FALLBACK_POLICY, FALLBACK_PRODUCT } from './core/catalog.seed';

describe('Catalog preview contract', () => {
  it('uses a stable catalog URN and aggregate-only ESTV product', () => {
    expect(FALLBACK_PRODUCT.globalId).toBe('urn:daca:ch:estv:tax-statistics-by-canton');
    expect(FALLBACK_PRODUCT.description).toContain('keine Personendaten');
  });

  it('defaults to allow only the St. Gallen subject on both supported protocols', () => {
    expect(FALLBACK_POLICY.subjects).toEqual(['kanton-st-gallen']);
    expect(FALLBACK_POLICY.protocols).toEqual(['http', 'postgresql']);
    expect(FALLBACK_POLICY.generatedRego).toContain('default allow := false');
  });
});
