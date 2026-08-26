import { GlossaryTermSummary } from '../../core/catalog.models';

export function toggleSemanticSelection(ids: readonly string[], id: string): readonly string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

export function termsForDomains(terms: readonly GlossaryTermSummary[], domainIds: readonly string[]): readonly GlossaryTermSummary[] {
  const selected = new Set(domainIds);
  return selected.size ? terms.filter((term) => term.domains.some((domain) => selected.has(domain.id))) : [];
}

export function validSelectedTermIds(terms: readonly GlossaryTermSummary[], domainIds: readonly string[], selectedTermIds: readonly string[]): readonly string[] {
  const valid = new Set(termsForDomains(terms, domainIds).map((term) => term.id));
  return selectedTermIds.filter((id) => valid.has(id));
}
