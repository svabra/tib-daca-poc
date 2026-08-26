import { DataProduct } from '../../core/catalog.models';

export const CATALOG_SEARCH_MIN_LENGTH = 2;
export const CATALOG_LIVE_RESULT_LIMIT = 3;

export function expertSearchQueryParams(value: string): { q: string } | null {
  const query = value.trim();
  return query ? { q: query } : null;
}

export function shouldExpandWelcomeSearch(target: EventTarget | null): boolean {
  return !(target instanceof Element) || target.closest('.welcome-search-expert-link') === null;
}

export function normalizeCatalogSearch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('de-CH')
    .trim();
}

export function catalogSearchIsReady(query: string): boolean {
  return normalizeCatalogSearch(query).length >= CATALOG_SEARCH_MIN_LENGTH;
}

export function catalogProductMatches(query: string, terms: readonly string[]): boolean {
  const tokens = normalizeCatalogSearch(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  const searchableText = normalizeCatalogSearch(terms.join(' '));
  return tokens.every((token) => searchableText.includes(token));
}

export function catalogDataProductMatches(query: string, product: DataProduct): boolean {
  return catalogProductMatches(query, [
    product.title,
    product.description,
    product.owner,
    product.domain,
    ...product.domains.flatMap((domain) => [domain.preferredLabel, domain.definition, ...domain.labels.flatMap((label) => [label.preferredLabel, label.definition, ...label.alternativeLabels])]),
    ...product.glossaryTerms.flatMap((term) => [term.preferredLabel, term.definition, ...term.labels.flatMap((label) => [label.preferredLabel, label.definition, ...label.alternativeLabels])]),
    product.globalId,
    product.updateFrequency,
    ...product.keywords,
    ...product.endpoints.map((endpoint) => endpoint.title),
    JSON.stringify(product.additionalMetadata),
    'Öffentliche Finanzen Steuern Kantone Gemeinden Statistik Bundessteuern',
  ]);
}

export function searchCatalogProducts(
  products: readonly DataProduct[],
  query: string,
  limit = products.length,
): readonly DataProduct[] {
  if (!catalogSearchIsReady(query)) return [];
  return products.filter((product) => catalogDataProductMatches(query, product)).slice(0, limit);
}
