import { ProductActivityCategory, ProductActivityItem, ProductActivityStatus } from '../../core/catalog.models';

export type ProductActivityFilter =
  | 'all'
  | 'metadata_quality'
  | 'access_governance'
  | 'deployment'
  | 'poc_system';

export interface ProductActivityFilterOption {
  id: ProductActivityFilter;
  label: string;
  categories: readonly ProductActivityCategory[];
}

export interface ProductActivityPresentation {
  title: string;
  description: string;
  categoryLabel: string;
  statusLabel: string;
  actorKindLabel: string;
}

export const PRODUCT_ACTIVITY_FILTERS: readonly ProductActivityFilterOption[] = [
  { id: 'all', label: 'Alle', categories: [] },
  { id: 'metadata_quality', label: 'Metadaten & Qualität', categories: ['metadata', 'quality'] },
  { id: 'access_governance', label: 'Zugriff & Freigabe', categories: ['access', 'governance'] },
  { id: 'deployment', label: 'Technische Aktivierung', categories: ['deployment'] },
  { id: 'poc_system', label: 'PoC & System', categories: ['poc_system'] },
] as const;

const KNOWN_EVENT_TYPES = new Set([
  'metadata-publication-received',
  'metadata-updated',
  'quality-reviewed',
  'semantic-mappings-updated',
  'endpoint-created',
  'access-governance-draft-created',
  'policy-draft-created',
  'access-setting-draft-upserted',
  'policy-published',
  'policy-revoked',
  'access-request-submitted',
  'access-request-rejected',
  'access-request-approved',
  'governance-submitted',
  'governance-rejected',
  'publication-approved-deploying',
  'publication-deployment-failed',
  'publication-activated',
  'poc-simulation-triggered',
  'poc-simulation-reset',
  'poc-fixture-reset',
  'catalog-seeded',
  'technical-catalog-event',
]);

const CATEGORY_LABELS: Record<ProductActivityCategory, string> = {
  metadata: 'Metadaten',
  quality: 'Qualität',
  access: 'Zugriff',
  governance: 'Governance',
  deployment: 'Aktivierung',
  poc_system: 'PoC & System',
};

const STATUS_LABELS: Record<ProductActivityStatus, string> = {
  info: 'Information',
  pending: 'In Bearbeitung',
  success: 'Erfolgreich',
  warning: 'Hinweis',
  failure: 'Fehlgeschlagen',
};

export function productActivityMatchesFilter(
  item: ProductActivityItem,
  filter: ProductActivityFilter,
): boolean {
  const option = PRODUCT_ACTIVITY_FILTERS.find((candidate) => candidate.id === filter);
  return !option || option.categories.length === 0 || option.categories.includes(item.category);
}

export function presentProductActivity(item: ProductActivityItem): ProductActivityPresentation {
  const known = KNOWN_EVENT_TYPES.has(item.eventType);
  return {
    title: known ? item.title : 'Technisches Katalogereignis',
    description: known
      ? item.description
      : 'Im Katalog wurde eine technische Zustandsänderung protokolliert.',
    categoryLabel: CATEGORY_LABELS[item.category],
    statusLabel: STATUS_LABELS[item.status],
    actorKindLabel: ({ person: 'Person', system: 'System', role: 'Rolle' } as const)[item.actor.kind],
  };
}
