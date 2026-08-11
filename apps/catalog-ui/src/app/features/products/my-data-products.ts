import { DataProduct, OwnedAccessConsumer } from '../../core/catalog.models';

export const KASSANDRA_USER_ID = 'kassandra.valdata';

export type ProductRelationshipFilter = 'all' | 'offered' | 'sharedByMe' | 'requestedByMe' | 'sharedWithMe';

export interface MachineConsumer {
  id: string;
  label: string;
}

export interface CatalogUsage {
  consumerUserIds: readonly string[];
  consumerMachineIds: readonly MachineConsumer[];
  responsibleUserIds: readonly string[];
  sharedByUserIds: readonly string[];
  requestedByUserIds: readonly string[];
  sharedWithUserIds: readonly string[];
}

export interface RelationshipBadge {
  kind: Exclude<ProductRelationshipFilter, 'all'> | 'machine';
  label: string;
  detail: string;
}

export interface AccessConsumerSummary {
  total: number;
  persons: number;
  machines: number;
}

export interface DataOwnerProfile {
  name: string;
  organization: string;
  avatarUrl: string;
  phone?: string;
  teamsUrl?: string;
}

export type AccessRequestStatus =
  | 'submitted'
  | 'identity_review'
  | 'legal_review'
  | 'conditions_review'
  | 'granted_modified'
  | 'granted_original'
  | 'rejected'
  | 'withdrawn';

export interface AccessRequest {
  requestId: string;
  status: AccessRequestStatus;
  label: string;
  tone: 'open' | 'granted' | 'rejected';
  detail: string;
  updatedAt: string;
}

const ACCESS_REQUEST_STATUS: Record<AccessRequestStatus, Pick<AccessRequest, 'label' | 'tone'>> = {
  submitted: { label: 'Anfrage eingegangen', tone: 'open' },
  identity_review: { label: 'Identität wird geprüft', tone: 'open' },
  legal_review: { label: 'Rechtslage wird geprüft', tone: 'open' },
  conditions_review: { label: 'Zugriffskonditionen werden geprüft', tone: 'open' },
  granted_modified: { label: 'Zugriff gewährt (modifiziert)', tone: 'granted' },
  granted_original: { label: 'Zugriff gewährt (original)', tone: 'granted' },
  rejected: { label: 'Zugriff nicht gewährt', tone: 'rejected' },
  withdrawn: { label: 'Anfrage zurückgezogen', tone: 'rejected' },
};

export function catalogUsage(product: DataProduct): CatalogUsage {
  const candidate = product.additionalMetadata['catalogUsage'];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return {
      consumerUserIds: [],
      consumerMachineIds: [],
      responsibleUserIds: [],
      sharedByUserIds: [],
      requestedByUserIds: [],
      sharedWithUserIds: [],
    };
  }
  const usage = candidate as Record<string, unknown>;
  return {
    consumerUserIds: strings(usage['consumerUserIds']),
    consumerMachineIds: machines(usage['consumerMachineIds']),
    responsibleUserIds: strings(usage['responsibleUserIds']),
    sharedByUserIds: strings(usage['sharedByUserIds']),
    requestedByUserIds: strings(usage['requestedByUserIds']),
    sharedWithUserIds: strings(usage['sharedWithUserIds']),
  };
}

export function relationshipBadges(
  product: DataProduct,
  userId = KASSANDRA_USER_ID,
  accessConsumers: readonly OwnedAccessConsumer[] = [],
): readonly RelationshipBadge[] {
  const usage = catalogUsage(product);
  const badges: RelationshipBadge[] = [];
  const isOwner = usage.responsibleUserIds.includes(userId);
  if (isOwner) {
    const summary = accessConsumerSummary(product.id, accessConsumers);
    badges.push({ kind: 'offered', label: 'Von Ihnen angeboten', detail: dataConsumerCountLabel(summary.total) });
  } else if (usage.sharedByUserIds.includes(userId)) {
    const machine = usage.consumerMachineIds[0];
    badges.push({
      kind: 'sharedByMe',
      label: 'Von Ihnen freigegeben',
      detail: machine ? `${machine.label} · ${machine.id}` : 'Aktive Freigabe',
    });
  }
  if (usage.requestedByUserIds.includes(userId)) {
    const machine = usage.consumerMachineIds[0];
    badges.push({
      kind: 'requestedByMe',
      label: 'Von Ihnen angefragt',
      detail: machine ? `Für Machine ID · ${machine.id}` : 'Entscheid ausstehend',
    });
  }
  if (usage.sharedWithUserIds.includes(userId)) {
    badges.push({ kind: 'sharedWithMe', label: 'Für Sie freigegeben', detail: 'Persönlicher Zugriff' });
    for (const machine of usage.consumerMachineIds) {
      badges.push({ kind: 'machine', label: machine.label, detail: `Machine ID · ${machine.id}` });
    }
  }
  return badges;
}

export function connectedAuthorities(product: DataProduct): readonly string[] {
  return strings(product.additionalMetadata['connectedAuthorities']);
}

export function deliveryProtocols(product: DataProduct): readonly string[] {
  return strings(product.additionalMetadata['deliveryProtocols']);
}

export function dataOwner(product: DataProduct): DataOwnerProfile | null {
  const candidate = product.additionalMetadata['dataOwner'];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const owner = candidate as Record<string, unknown>;
  if (!(typeof owner['name'] === 'string'
    && typeof owner['organization'] === 'string'
    && typeof owner['avatarUrl'] === 'string')) return null;
  return {
    name: owner['name'],
    organization: owner['organization'],
    avatarUrl: owner['avatarUrl'],
    ...(typeof owner['phone'] === 'string' ? { phone: owner['phone'] } : {}),
    ...(typeof owner['teamsUrl'] === 'string' ? { teamsUrl: owner['teamsUrl'] } : {}),
  };
}

export function accessRequest(product: DataProduct): AccessRequest | null {
  const candidate = product.additionalMetadata['accessRequest'];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const request = candidate as Record<string, unknown>;
  if (!(typeof request['requestId'] === 'string'
    && isAccessRequestStatus(request['status'])
    && typeof request['detail'] === 'string'
    && typeof request['updatedAt'] === 'string')) return null;
  return {
    requestId: request['requestId'],
    status: request['status'],
    detail: request['detail'],
    updatedAt: request['updatedAt'],
    ...ACCESS_REQUEST_STATUS[request['status']],
  };
}

export function isConsumedProduct(product: DataProduct, userId = KASSANDRA_USER_ID): boolean {
  const usage = catalogUsage(product);
  return usage.sharedWithUserIds.includes(userId)
    || usage.requestedByUserIds.includes(userId)
    || usage.sharedByUserIds.includes(userId);
}

export function canTransferOwnership(product: DataProduct, userId = KASSANDRA_USER_ID): boolean {
  return catalogUsage(product).responsibleUserIds.includes(userId);
}

export function matchesProduct(
  product: DataProduct,
  query: string,
  filter: ProductRelationshipFilter,
  userId = KASSANDRA_USER_ID,
  accessConsumers: readonly OwnedAccessConsumer[] = [],
): boolean {
  const badges = relationshipBadges(product, userId, accessConsumers);
  const usage = catalogUsage(product);
  const productConsumers = consumersForProduct(product.id, accessConsumers);
  const matchesFilter = {
    all: true,
    offered: usage.responsibleUserIds.includes(userId),
    sharedByMe: productConsumers.length > 0,
    requestedByMe: usage.requestedByUserIds.includes(userId),
    sharedWithMe: usage.sharedWithUserIds.includes(userId),
  }[filter];
  if (!matchesFilter) return false;

  const needle = query.trim().toLocaleLowerCase('de-CH');
  if (!needle) return true;
  const searchable = [
    product.title,
    product.description,
    product.owner,
    product.domain,
    product.globalId,
    ...product.keywords,
    ...connectedAuthorities(product),
    ...Object.values(dataOwner(product) ?? {}),
    ...Object.values(accessRequest(product) ?? {}),
    ...productConsumers.flatMap((consumer) => [consumer.displayName, consumer.organization, consumer.identityId]),
    ...badges.flatMap((badge) => [badge.label, badge.detail]),
  ].join(' ').toLocaleLowerCase('de-CH');
  return searchable.includes(needle);
}

export function consumersForProduct(
  productId: string,
  accessConsumers: readonly OwnedAccessConsumer[],
): readonly OwnedAccessConsumer[] {
  return accessConsumers.filter((consumer) => consumer.dataProductId === productId);
}

export function accessConsumerSummary(
  productId: string,
  accessConsumers: readonly OwnedAccessConsumer[],
): AccessConsumerSummary {
  const consumers = consumersForProduct(productId, accessConsumers);
  return {
    total: consumers.length,
    persons: consumers.filter((consumer) => consumer.consumerType === 'person').length,
    machines: consumers.filter((consumer) => consumer.consumerType === 'machine').length,
  };
}

export function dataConsumerCountLabel(count: number): string {
  if (count === 0) return 'Keine Datenkonsumenten';
  return `${count} ${count === 1 ? 'Datenkonsument' : 'Datenkonsumenten'}`;
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function machines(value: unknown): readonly MachineConsumer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const candidate = item as Record<string, unknown>;
    return typeof candidate['id'] === 'string' && typeof candidate['label'] === 'string'
      ? [{ id: candidate['id'], label: candidate['label'] }]
      : [];
  });
}

function isAccessRequestStatus(value: unknown): value is AccessRequestStatus {
  return typeof value === 'string' && value in ACCESS_REQUEST_STATUS;
}
