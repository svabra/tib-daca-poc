import { GlossaryTermProposal } from '../../core/catalog.models';
import { canDecideGlossaryProposal, canEditGlossaryProposal, relatedConceptIsComplete } from './domain-review-policy';

const proposal = { reviews: [{ domainId: 'defence', ownerUserId: 'sibilla.micheli', status: 'pending' }] } as GlossaryTermProposal;

describe('glossary review policy', () => {
  it('lets a deputy edit but reserves the decision for the primary owner', () => {
    const domains = [{ id: 'defence', deputyOwnerUserId: 'sandro.wenger' }] as never;
    expect(canEditGlossaryProposal(proposal, domains, 'sandro.wenger')).toBe(true);
    expect(canDecideGlossaryProposal(proposal, 'sandro.wenger')).toBe(false);
    expect(canDecideGlossaryProposal(proposal, 'sibilla.micheli')).toBe(true);
  });

  it('requires a target URI for a separate related concept', () => {
    expect(relatedConceptIsComplete('same_concept', '')).toBe(true);
    expect(relatedConceptIsComplete('related_concept', '')).toBe(false);
    expect(relatedConceptIsComplete('related_concept', 'urn:daca:term:armored-vehicle')).toBe(true);
  });
});
