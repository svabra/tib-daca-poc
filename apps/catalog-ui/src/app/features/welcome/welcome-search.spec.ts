import { FALLBACK_PRODUCTS } from '../../core/catalog.seed';
import { DomainSummary, GlossaryTermSummary } from '../../core/catalog.models';
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
  it('finds a product through bilingual glossary labels and alternative labels', () => {
    const domain: DomainSummary = { id: 'defence', urn: 'urn:daca:domain:defence', originCatalogId: 'catalog', revision: 1, status: 'active', preferredLabel: 'Verteidigung', definition: 'Militärische Fähigkeiten', labels: [{ language: 'de', preferredLabel: 'Verteidigung', alternativeLabels: [], definition: 'Militärische Fähigkeiten' }], ownerUserId: 'sibilla.micheli', ownerName: 'Sibilla Micheli', ownerOrganization: 'VBS', deputyOwnerUserId: 'sandro.wenger', deputyOwnerName: 'Sandro Wenger', deputyOwnerOrganization: 'BAZG', productCount: 1, termCount: 1, updatedAt: '' };
    const glossaryTerm: GlossaryTermSummary = { id: 'vehicle', urn: 'urn:daca:glossary-term:vehicle', originCatalogId: 'catalog', revision: 1, status: 'active', preferredLabel: 'Gepanzertes Fahrzeug', definition: 'Geschütztes Landfahrzeug', domains: [domain], labels: [{ language: 'de', preferredLabel: 'Gepanzertes Fahrzeug', alternativeLabels: ['Panzerfahrzeug'], definition: 'Geschütztes Landfahrzeug' }, { language: 'en', preferredLabel: 'Armored Vehicle', alternativeLabels: ['Armoured Vehicle'], definition: 'Protected land vehicle' }], relations: [], updatedAt: '' };
    const product = { ...FALLBACK_PRODUCTS[0], domains: [domain], glossaryTerms: [glossaryTerm] };
    expect(searchCatalogProducts([product], 'Armored Vehicle')).toEqual([product]);
    expect(searchCatalogProducts([product], 'Armoured Vehicle')).toEqual([product]);
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
