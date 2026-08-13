import { FALLBACK_PRODUCTS } from '../../core/catalog.seed';
import {
  CATALOG_LIVE_RESULT_LIMIT,
  catalogProductMatches,
  catalogSearchIsReady,
  normalizeCatalogSearch,
  searchCatalogProducts,
} from './welcome-search';

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

  it('starts after two characters and limits the landing-page preview to three products', () => {
    expect(catalogSearchIsReady('e')).toBe(false);
    expect(catalogSearchIsReady('es')).toBe(true);

    const preview = searchCatalogProducts(FALLBACK_PRODUCTS, 'st', CATALOG_LIVE_RESULT_LIMIT);
    expect(preview.length).toBeLessThanOrEqual(3);
  });

  it('searches complete product metadata for the expert results', () => {
    expect(searchCatalogProducts(FALLBACK_PRODUCTS, 'Mehrwertsteuer').map((product) => product.title))
      .toContain('Mehrwertsteuer – Branchenindikatoren');
  });
});
