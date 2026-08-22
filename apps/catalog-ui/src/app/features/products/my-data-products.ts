import { DataProduct, OwnedAccessConsumer } from '../../core/catalog.models';
import type { DemoUser } from '../../core/demo-identity.service';

export const KASSANDRA_USER_ID = 'kassandra.valdata';

export type ProductRelationshipFilter = 'all' | 'offered' | 'sharedByMe' | 'requestedByMe' | 'sharedWithMe';

export const DEFAULT_PRODUCT_RELATIONSHIP_FILTER: ProductRelationshipFilter = 'offered';

export function initialProductRelationshipFilter(value: string | null | undefined): ProductRelationshipFilter {
  const supportedFilters: readonly ProductRelationshipFilter[] = [
    'all',
    'offered',
    'sharedByMe',
    'requestedByMe',
    'sharedWithMe',
  ];
  return supportedFilters.includes(value as ProductRelationshipFilter)
    ? value as ProductRelationshipFilter
    : DEFAULT_PRODUCT_RELATIONSHIP_FILTER;
}

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
  tone: 'normal' | 'attention';
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

function teamsChatUrl(email: string): string {
  return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(email)}`;
}

const PERSON_ORGANIZATION_ABBREVIATIONS: Readonly<Record<string, string>> = {
  'Eidgenössische Steuerverwaltung ESTV': 'ESTV',
  'Eidg. Steuerverwaltung': 'ESTV',
  'Eidgenössische Finanzverwaltung EFV': 'EFV',
  'Eidg. Finanzverwaltung': 'EFV',
  'Bundesamt für Zoll und Grenzsicherheit BAZG': 'BAZG',
  'Bundesamt für Zoll BAZG': 'BAZG',
  'EFD - ESTV': 'ESTV',
  'EFD - EFV': 'EFV',
  'EFD - BAZG': 'BAZG',
  'EDI - BFS': 'BFS',
  'EFD - BIT': 'BIT',
};

export function personOrganizationLabel(organization: string): string {
  return PERSON_ORGANIZATION_ABBREVIATIONS[organization] ?? organization;
}

export type AccessRequestStatus =
  | 'submitted'
  | 'identity_review'
  | 'legal_review'
  | 'conditions_review'
  | 'approved_policy_pending'
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
  approved_policy_pending: { label: 'Genehmigt · Policy wird publiziert', tone: 'open' },
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
    badges.push({
      kind: 'offered',
      label: 'Von Ihnen angeboten',
      detail: dataConsumerCountLabel(summary.total),
      tone: summary.total === 0 ? 'attention' : 'normal',
    });
  } else if (usage.sharedByUserIds.includes(userId)) {
    const machine = usage.consumerMachineIds[0];
    badges.push({
      kind: 'sharedByMe',
      label: 'Von Ihnen freigegeben',
      detail: machine ? `${machine.label} · ${machine.id}` : 'Aktive Freigabe',
      tone: 'normal',
    });
  }
  if (hasOpenAccessRequest(product, userId)) {
    const machine = usage.consumerMachineIds[0];
    badges.push({
      kind: 'requestedByMe',
      label: 'Von Ihnen angefragt',
      detail: machine ? `Für Machine ID · ${machine.id}` : 'Entscheid ausstehend',
      tone: 'attention',
    });
  }
  if (usage.sharedWithUserIds.includes(userId)) {
    badges.push({ kind: 'sharedWithMe', label: 'Für Sie freigegeben', detail: 'Persönlicher Zugriff', tone: 'normal' });
    for (const machine of usage.consumerMachineIds) {
      badges.push({ kind: 'machine', label: machine.label, detail: `Machine ID · ${machine.id}`, tone: 'normal' });
    }
  }
  return badges;
}

export function hasOpenAccessRequest(product: DataProduct, userId = KASSANDRA_USER_ID): boolean {
  if (!catalogUsage(product).requestedByUserIds.includes(userId)) return false;
  const request = accessRequest(product);
  return request === null || request.tone === 'open';
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
    organization: personOrganizationLabel(owner['organization']),
    avatarUrl: owner['avatarUrl'],
    ...(typeof owner['phone'] === 'string' ? { phone: owner['phone'] } : {}),
    ...(typeof owner['teamsUrl'] === 'string' ? { teamsUrl: owner['teamsUrl'] } : {}),
  };
}

export function resolvedDataOwner(
  product: DataProduct,
  users: readonly DemoUser[],
): DataOwnerProfile | null {
  const metadataOwner = dataOwner(product);
  const canonicalUser = users.find((user) => user.id === product.ownerUserId)
    ?? (metadataOwner
      ? users.find((user) => user.displayName === metadataOwner.name)
      : undefined);
  if (!canonicalUser?.avatarUrl) return metadataOwner;
  return {
    ...(metadataOwner ?? {}),
    name: canonicalUser.displayName,
    organization: personOrganizationLabel(canonicalUser.organization),
    avatarUrl: canonicalUser.avatarUrl,
    ...(canonicalUser.phone ? { phone: canonicalUser.phone } : {}),
    teamsUrl: metadataOwner?.teamsUrl ?? teamsChatUrl(canonicalUser.email),
  };
}

export function resolvedDeputyDataOwner(
  product: DataProduct,
  users: readonly DemoUser[],
): DataOwnerProfile | null {
  if (!product.deputyOwnerUserId) return null;
  const deputy = users.find((user) => user.id === product.deputyOwnerUserId);
  if (!deputy?.avatarUrl) return null;
  return {
    name: deputy.displayName,
    organization: personOrganizationLabel(deputy.organization),
    avatarUrl: deputy.avatarUrl,
    ...(deputy.phone ? { phone: deputy.phone } : {}),
    teamsUrl: teamsChatUrl(deputy.email),
  };
}

export function productReviewer(
  product: DataProduct,
  users: readonly DemoUser[],
): DemoUser | null {
  if (!product.controlPersonUserId) return null;
  return users.find((user) => user.id === product.controlPersonUserId) ?? null;
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
    || hasOpenAccessRequest(product, userId)
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
    requestedByMe: hasOpenAccessRequest(product, userId),
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
