import { ProductActivityItem } from '../../core/catalog.models';
import { recentProductActivity } from './metadata-activity-preview';

function activity(index: number): ProductActivityItem {
  return {
    key: `activity-${index}`,
    eventType: 'metadata-updated',
    category: 'metadata',
    status: 'success',
    title: `Metadaten aktualisiert ${index}`,
    description: 'Der Katalogeintrag wurde aktualisiert.',
    occurredAt: `2026-08-${20 - index}T07:15:00Z`,
    actor: { displayName: 'Kassandra Valdata', kind: 'person' },
    productRevision: index,
    policyRevision: null,
    facts: [],
    technicalEvidence: [],
  };
}

describe('Metadata activity preview', () => {
  it('uses only the three newest server-ordered events without inventing evidence', () => {
    const items = [activity(5), activity(4), activity(3), activity(2)];
    expect(recentProductActivity(items).map((item) => item.key)).toEqual([
      'activity-5',
      'activity-4',
      'activity-3',
    ]);
    expect(recentProductActivity([])).toEqual([]);
  });
});
