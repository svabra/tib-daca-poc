export function normalizeCatalogSearch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('de-CH')
    .trim();
}

export function catalogProductMatches(query: string, terms: readonly string[]): boolean {
  const tokens = normalizeCatalogSearch(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  const searchableText = normalizeCatalogSearch(terms.join(' '));
  return tokens.every((token) => searchableText.includes(token));
}
