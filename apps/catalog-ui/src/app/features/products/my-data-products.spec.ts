import { FALLBACK_OWNED_ACCESS_CONSUMERS, FALLBACK_PRODUCTS } from '../../core/catalog.seed';
import {
  accessConsumerSummary,
  accessRequest,
  canTransferOwnership,
  catalogUsage,
  dataOwner,
  dataConsumerCountLabel,
  isConsumedProduct,
  matchesProduct,
  relationshipBadges,
} from './my-data-products';

describe('My data products filtering', () => {
  it('distinguishes the five owner-workspace categories', () => {
    const offered = FALLBACK_PRODUCTS.filter((product) => matchesProduct(product, '', 'offered', undefined, FALLBACK_OWNED_ACCESS_CONSUMERS));
    const sharedByMe = FALLBACK_PRODUCTS.filter((product) => matchesProduct(product, '', 'sharedByMe', undefined, FALLBACK_OWNED_ACCESS_CONSUMERS));
    const requestedByMe = FALLBACK_PRODUCTS.filter((product) => matchesProduct(product, '', 'requestedByMe'));
    const sharedWithMe = FALLBACK_PRODUCTS.filter((product) => matchesProduct(product, '', 'sharedWithMe'));

    expect(FALLBACK_PRODUCTS.filter((product) => matchesProduct(product, '', 'all'))).toHaveLength(7);
    expect(offered).toHaveLength(3);
    expect(sharedByMe).toHaveLength(2);
    expect(requestedByMe).toHaveLength(1);
    expect(sharedWithMe).toHaveLength(3);
  });

  it('summarizes active people and machines with correct German count labels', () => {
    const main = accessConsumerSummary('11111111-1111-4111-8111-111111111111', FALLBACK_OWNED_ACCESS_CONSUMERS);
    const refund = accessConsumerSummary('16666666-6666-4666-8666-666666666666', FALLBACK_OWNED_ACCESS_CONSUMERS);
    const empty = accessConsumerSummary('12222222-2222-4222-8222-222222222222', FALLBACK_OWNED_ACCESS_CONSUMERS);

    expect(main).toEqual({ total: 5, persons: 3, machines: 2 });
    expect(refund).toEqual({ total: 1, persons: 0, machines: 1 });
    expect(empty).toEqual({ total: 0, persons: 0, machines: 0 });
    expect(dataConsumerCountLabel(0)).toBe('Keine Datenkonsumenten');
    expect(dataConsumerCountLabel(1)).toBe('1 Datenkonsument');
    expect(dataConsumerCountLabel(5)).toBe('5 Datenkonsumenten');
  });

  it('combines ownership and the active-consumer count in one badge', () => {
    const main = FALLBACK_PRODUCTS.find((product) => product.id === '11111111-1111-4111-8111-111111111111')!;
    const empty = FALLBACK_PRODUCTS.find((product) => product.id === '12222222-2222-4222-8222-222222222222')!;

    expect(relationshipBadges(main, undefined, FALLBACK_OWNED_ACCESS_CONSUMERS)).toEqual([
      { kind: 'offered', label: 'Von Ihnen angeboten', detail: '5 Datenkonsumenten', tone: 'normal' },
    ]);
    expect(relationshipBadges(empty, undefined, FALLBACK_OWNED_ACCESS_CONSUMERS)).toEqual([
      { kind: 'offered', label: 'Von Ihnen angeboten', detail: 'Keine Datenkonsumenten', tone: 'attention' },
    ]);
  });

  it('shows only the active relationship after an access request was granted', () => {
    const granted = FALLBACK_PRODUCTS.find((product) => product.id === '17777777-7777-4777-8777-777777777777')!;
    const badges = relationshipBadges(granted);

    expect(badges.some((badge) => badge.kind === 'requestedByMe')).toBe(false);
    expect(badges.some((badge) => badge.kind === 'sharedWithMe')).toBe(true);
    expect(badges.every((badge) => badge.tone === 'normal')).toBe(true);
  });

  it('marks an open request as requiring attention', () => {
    const open = FALLBACK_PRODUCTS.find((product) => product.id === '14444444-4444-4444-8444-444444444444')!;

    expect(relationshipBadges(open)).toContainEqual(expect.objectContaining({
      kind: 'requestedByMe',
      tone: 'attention',
    }));
  });

  it('searches product metadata, connected authorities and machine ids', () => {
    expect(FALLBACK_PRODUCTS.filter((product) => matchesProduct(product, 'Gemeindecodes', 'all'))).toHaveLength(1);
    expect(FALLBACK_PRODUCTS.filter((product) => matchesProduct(product, 'svc-estv-federal-tax-forecast', 'all'))).toHaveLength(1);
    expect(FALLBACK_PRODUCTS.filter((product) => matchesProduct(product, 'BFS', 'all'))).toHaveLength(1);
    expect(FALLBACK_PRODUCTS.filter((product) => matchesProduct(product, 'Noémie Rochat', 'all'))).toHaveLength(2);
    expect(FALLBACK_PRODUCTS.filter((product) => matchesProduct(product, 'Kanton Neuchâtel', 'all'))).toHaveLength(2);
  });

  it('provides a data owner portrait for every personally or technically consumed product', () => {
    const consumed = FALLBACK_PRODUCTS.filter((product) => isConsumedProduct(product));
    expect(consumed).toHaveLength(6);
    expect(consumed.every((product) => dataOwner(product)?.avatarUrl.endsWith('.webp'))).toBe(true);
  });

  it('offers ownership transfer only for products Kassandra owns', () => {
    const owned = FALLBACK_PRODUCTS.filter((product) => canTransferOwnership(product));
    expect(owned).toHaveLength(3);
    expect(owned.every((product) => dataOwner(product)?.avatarUrl === '/assets/kassandra-valdata.webp')).toBe(true);
    expect(FALLBACK_PRODUCTS.filter((product) => !canTransferOwnership(product))).toHaveLength(4);
  });

  it('exposes distinct processing states for the two Noémie Rochat requests', () => {
    const requests = FALLBACK_PRODUCTS
      .filter((product) => dataOwner(product)?.name === 'Noémie Rochat')
      .map((product) => accessRequest(product));

    expect(requests.map((request) => request?.label)).toEqual([
      'Rechtslage wird geprüft',
      'Zugriff gewährt (modifiziert)',
    ]);
    expect(requests.every((request) => request?.requestId.startsWith('AR-NE-'))).toBe(true);
  });

  it('ignores malformed usage metadata safely', () => {
    const malformed = { ...FALLBACK_PRODUCTS[0], additionalMetadata: { catalogUsage: 'invalid' } };
    expect(catalogUsage(malformed).consumerMachineIds).toEqual([]);
    expect(relationshipBadges(malformed)).toEqual([]);
  });
});
