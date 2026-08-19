import { FALLBACK_PRODUCTS } from '../../core/catalog.seed';
import {
  CATALOG_LIVE_RESULT_LIMIT,
  catalogProductMatches,
  catalogSearchIsReady,
  expertSearchQueryParams,
  normalizeCatalogSearch,
  searchCatalogProducts,
  shouldExpandWelcomeSearch,
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
  it('preserves a trimmed quick-search query for the expert-search link', () => {
    expect(expertSearchQueryParams('  ESTV  ')).toEqual({ q: 'ESTV' });
    expect(expertSearchQueryParams('   ')).toBeNull();
  });

  it('does not expand the quick search when the expert-search action receives focus', () => {
    const expertLink = document.createElement('a');
    expertLink.className = 'welcome-search-expert-link';
    expect(shouldExpandWelcomeSearch(expertLink)).toBe(false);

    const searchInput = document.createElement('input');
    expect(shouldExpandWelcomeSearch(searchInput)).toBe(true);
  });
});
