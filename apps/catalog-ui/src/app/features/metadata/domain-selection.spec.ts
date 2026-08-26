import { DomainSummary, GlossaryTermSummary } from '../../core/catalog.models';
import { termsForDomains, toggleSemanticSelection, validSelectedTermIds } from './domain-selection';

const domain = (id: string): DomainSummary => ({ id, urn: `urn:daca:domain:${id}`, originCatalogId: 'catalog', revision: 1, status: 'active', preferredLabel: id, definition: '', labels: [], ownerUserId: 'owner', ownerName: 'Owner', ownerOrganization: 'Office', deputyOwnerUserId: 'deputy', deputyOwnerName: 'Deputy', deputyOwnerOrganization: 'Office', productCount: 0, termCount: 0, updatedAt: '' });
const term = (id: string, domains: DomainSummary[]): GlossaryTermSummary => ({ id, urn: `urn:daca:term:${id}`, originCatalogId: 'catalog', revision: 1, status: 'active', preferredLabel: id, definition: '', labels: [], domains, relations: [], updatedAt: '' });

describe('domain and glossary selection', () => {
  it('filters jointly governed terms when any selected product domain intersects', () => {
    const defence = domain('defence'); const mobility = domain('mobility');
    const terms = [term('vehicle', [defence, mobility]), term('tax', [domain('tax')])];
    expect(termsForDomains(terms, ['mobility']).map((item) => item.id)).toEqual(['vehicle']);
    expect(termsForDomains(terms, [])).toEqual([]);
  });

  it('removes terms that no longer share a selected domain and toggles without duplicates', () => {
    const defence = domain('defence'); const mobility = domain('mobility');
    const terms = [term('vehicle', [defence]), term('transport', [mobility])];
    expect(validSelectedTermIds(terms, ['defence'], ['vehicle', 'transport'])).toEqual(['vehicle']);
    expect(toggleSemanticSelection(['defence'], 'defence')).toEqual([]);
    expect(toggleSemanticSelection([], 'defence')).toEqual(['defence']);
  });
});
