import { catalogProductMatches, normalizeCatalogSearch } from './welcome-search';

describe('welcome catalog search', () => {
  const terms = [
    'ESTV-Steuerstatistik nach Kanton',
    'Aggregierte jährliche Steuerstatistiken der Schweizer Kantone',
    'ESTV',
    'Öffentliche Finanzen',
    'Steuern Kantone Statistik',
  ];

  it('normalizes umlauts and casing', () => {
    expect(normalizeCatalogSearch('  JÄHRLICH  ')).toBe('jahrlich');
  });

  it('finds the demo product using multiple terms', () => {
    expect(catalogProductMatches('estv kanton', terms)).toBe(true);
    expect(catalogProductMatches('jährliche Statistik', terms)).toBe(true);
  });

  it('does not claim a match for an unavailable product', () => {
    expect(catalogProductMatches('Bevölkerungsregister', terms)).toBe(false);
    expect(catalogProductMatches('   ', terms)).toBe(false);
  });
});
