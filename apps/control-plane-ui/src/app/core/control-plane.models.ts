export interface CatalogInstance {
  id: string;
  name: string;
  organization: string;
  environment: string;
  endpoint: string;
  version: string;
  lifecycle: 'active' | 'suspended' | 'retired';
  health: 'healthy' | 'degraded' | 'unreachable';
  latencyMs: number | null;
  desiredRevision: number;
  observedRevision: number;
  capabilities: string[];
  lastSeenAt: string;
}

export interface TrustGrant {
  id: string;
  providerId: string;
  consumerId: string;
  state: 'draft' | 'pending' | 'approved' | 'suspended' | 'revoked' | 'expired';
  validFrom: string;
  validUntil: string;
  resourceTypes: ('metadata' | 'lineage' | 'provenance' | 'policies')[];
  productFilter?: string;
  ownerFilter?: string;
  domainFilter?: string;
}

export interface SyncConfiguration {
  id: string;
  name: string;
  sourceId: string;
  targetId: string;
  direction: 'push' | 'pull';
  resourceScopes: ('metadata' | 'lineage' | 'provenance' | 'policies')[];
  schedule: string;
  enabled: boolean;
  conflictStrategy: 'origin-wins';
  trustGrantId: string;
  lastValidation: 'valid' | 'blocked' | 'pending';
  revision: number;
}

export interface HealthEvent {
  catalogId: string;
  health: CatalogInstance['health'];
  latencyMs: number | null;
  observedAt: string;
}
