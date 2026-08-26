import { DomainSummary, GlossaryTermProposal } from '../../core/catalog.models';

export function canEditGlossaryProposal(proposal: GlossaryTermProposal | null, domains: readonly DomainSummary[], userId: string): boolean {
  return proposal?.reviews.some((review) => review.ownerUserId === userId || domains.find((domain) => domain.id === review.domainId)?.deputyOwnerUserId === userId) ?? false;
}

export function canDecideGlossaryProposal(proposal: GlossaryTermProposal | null, userId: string): boolean {
  return proposal?.reviews.some((review) => review.ownerUserId === userId && review.status === 'pending') ?? false;
}

export function relatedConceptIsComplete(mode: 'same_concept' | 'related_concept', targetUri: string): boolean {
  return mode === 'same_concept' || Boolean(targetUri.trim());
}
