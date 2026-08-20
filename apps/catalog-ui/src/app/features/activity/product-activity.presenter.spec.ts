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

  it.each([
    {
      eventType: 'access-renewal-submitted',
      category: 'access' as const,
      status: 'pending' as const,
      title: 'Verlängerung beantragt',
      description: 'Eine bestehende Freigabe soll mit unverändertem Umfang länger gültig bleiben.',
    },
    {
      eventType: 'access-renewal-policy-prepared',
      category: 'access' as const,
      status: 'pending' as const,
      title: 'Verlängerung in Policy vorbereitet',
      description: 'Der geprüfte Antrag wurde an eine unveränderliche neue Policy-Revision gebunden.',
    },
    {
      eventType: 'access-renewal-rejected',
      category: 'access' as const,
      status: 'warning' as const,
      title: 'Verlängerung abgelehnt',
      description: 'Die unabhängige Kontrollperson hat die Verlängerung abgelehnt.',
    },
    {
      eventType: 'access-renewal-governance-submitted',
      category: 'governance' as const,
      status: 'pending' as const,
      title: 'Verlängerung zur Vier-Augen-Prüfung übermittelt',
      description: 'Die Kontrollperson vergleicht die bestehende Freigabe mit dem verlängerten Enddatum.',
    },
    {
      eventType: 'access-renewal-approved-deploying',
      category: 'governance' as const,
      status: 'pending' as const,
      title: 'Verlängerung genehmigt',
      description: 'OPA und PostgreSQL gleichen die neue Policy-Revision ab; die bisherige Freigabe behält ihr Enddatum.',
    },
    {
      eventType: 'access-renewal-governance-rejected',
      category: 'governance' as const,
      status: 'warning' as const,
      title: 'Verlängerung in Vier-Augen-Prüfung abgelehnt',
      description: 'Die bestehende Freigabe bleibt bis zu ihrem bisherigen Enddatum wirksam.',
    },
    {
      eventType: 'access-renewal-deployment-failed',
      category: 'deployment' as const,
      status: 'failure' as const,
      title: 'Verlängerung technisch nicht aktiviert',
      description: 'Die Zielsysteme sind nicht konvergent; die bisherige Freigabe gilt nur bis zu ihrem bisherigen Enddatum.',
    },
    {
      eventType: 'access-renewal-activated',
      category: 'deployment' as const,
      status: 'success' as const,
      title: 'Verlängerung aktiviert',
      description: 'OPA und PostgreSQL haben dieselbe verlängerte Policy-Revision bestätigt.',
    },
    {
      eventType: 'access-renewal-fixture-prepared',
      category: 'poc_system' as const,
      status: 'success' as const,
      title: 'Verlängerungsdemo vorbereitet',
      description: 'Eine isoliert rücksetzbare Freigabe mit nahem Ablauf wurde explizit vorbereitet.',
    },
    {
      eventType: 'access-renewal-fixture-reset',
      category: 'poc_system' as const,
      status: 'success' as const,
      title: 'Verlängerungsdemo zurückgesetzt',
      description: 'Die Fixture-eigenen Anträge und Projektionen wurden für einen neuen Durchlauf zurückgesetzt.',
    },
  ])('presents the safe German copy for $eventType without deriving raw identifiers', ({ eventType, category, status, title, description }) => {
    const presentation = presentProductActivity({
      ...item,
      key: 'raw-request-id-not-for-copy',
      eventType,
      category,
      status,
      title,
      description,
      policyRevision: 8,
      facts: [{ label: 'Policy-Revision', value: '8' }],
      technicalEvidence: [{ label: 'Interne Request-ID', value: 'raw-request-id-not-for-copy' }],
    });

    expect(presentation.title).toBe(title);
    expect(presentation.description).toBe(description);
    expect(presentation.title).not.toBe('Technisches Katalogereignis');
    expect(JSON.stringify(presentation)).not.toContain('raw-request-id-not-for-copy');
  });

  it('groups metadata and quality without mixing deployment activity', () => {
    expect(productActivityMatchesFilter(item, 'metadata_quality')).toBe(true);
    expect(productActivityMatchesFilter(item, 'deployment')).toBe(false);
    expect(productActivityMatchesFilter(item, 'all')).toBe(true);
  });
});
