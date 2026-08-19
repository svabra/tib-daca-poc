import { ProductActivityItem } from '../../core/catalog.models';
import { presentProductActivity, productActivityMatchesFilter } from './product-activity.presenter';

const item: ProductActivityItem = {
  key: 'activity-test',
  eventType: 'quality-reviewed',
  category: 'quality',
  status: 'success',
  title: 'Metadatenqualität geprüft',
  description: 'Die Qualitätskriterien wurden bestätigt.',
  occurredAt: '2026-08-19T07:15:00Z',
  actor: { displayName: 'Joel Ruod', kind: 'person' },
  productRevision: 3,
  policyRevision: null,
  facts: [],
  technicalEvidence: [],
};

describe('product activity presenter', () => {
  it('presents known, server-sanitized German activity text', () => {
    expect(presentProductActivity(item)).toEqual({
      title: 'Metadatenqualität geprüft',
      description: 'Die Qualitätskriterien wurden bestätigt.',
      categoryLabel: 'Qualität',
      statusLabel: 'Erfolgreich',
      actorKindLabel: 'Person',
    });
  });

  it('neutralizes unknown event text instead of exposing arbitrary values', () => {
    const presentation = presentProductActivity({
      ...item,
      eventType: 'future-secret-event',
      title: 'token=do-not-render',
      description: 'raw internal details',
    });

    expect(presentation.title).toBe('Technisches Katalogereignis');
    expect(presentation.description).not.toContain('raw internal details');
    expect(JSON.stringify(presentation)).not.toContain('token=do-not-render');
  });

  it.each([
    'control-person-updated',
    'service-level-submitted',
    'service-level-approved',
    'service-level-published',
    'service-level-rejected',
    'service-level-superseded',
  ])('preserves the sanitized title for the known SLA event %s', (eventType) => {
    const presentation = presentProductActivity({
      ...item,
      eventType,
      title: 'Sicheres SLA-Ereignis',
      description: 'Fachlich freigegebene Beschreibung.',
    });

    expect(presentation.title).toBe('Sicheres SLA-Ereignis');
    expect(presentation.description).toBe('Fachlich freigegebene Beschreibung.');
  });

  it('groups metadata and quality without mixing deployment activity', () => {
    expect(productActivityMatchesFilter(item, 'metadata_quality')).toBe(true);
    expect(productActivityMatchesFilter(item, 'deployment')).toBe(false);
    expect(productActivityMatchesFilter(item, 'all')).toBe(true);
  });
});
