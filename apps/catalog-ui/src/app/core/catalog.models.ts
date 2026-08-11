export type EndpointDescriptor =
  | {
      id: string;
      protocol: 'http-rest';
      title: string;
      method: string;
      url: string;
      mediaType: string;
      secretRef?: string;
    }
  | {
      id: string;
      protocol: 'postgresql';
      title: string;
      host: string;
      port: number;
      database: string;
      schema: string;
      relation: string;
      secretRef?: string;
    };

export interface DataProduct {
  id: string;
  globalId: string;
  originCatalog: string;
  revision: number;
  title: string;
  description: string;
  owner: string;
  domain: string;
  lifecycle: 'draft' | 'active' | 'deprecated' | 'retired';
  classification: 'public' | 'internal' | 'confidential' | 'restricted';
  keywords: string[];
  contact: string;
  license: string;
  quality: string;
  updateFrequency: string;
  additionalMetadata: Record<string, unknown>;
  endpoints: EndpointDescriptor[];
  updatedAt: string;
}

export interface LineageNode {
  id: string;
  label: string;
  detail: string;
  kind: 'source' | 'transform' | 'product' | 'consumer';
  catalog: string;
}

export interface LineageEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  state: 'verified' | 'declared';
}

export interface ProvenanceEvent {
  id: string;
  type: string;
  actor: string;
  occurredAt: string;
  summary: string;
  evidence: string;
}

export interface PolicyDefinition {
  id: string;
  revision: number;
  state: 'draft' | 'published' | 'revoked';
  effect: 'allow' | 'deny';
  subjects: string[];
  resources: { productId: string; owner: string };
  actions: string[];
  protocols: ('http' | 'postgresql')[];
  generatedRego: string;
  opaRevision: number;
  postgresRevision: number;
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

export interface AccessRequestSubmission {
  consumerType: 'person' | 'machine';
  machineId: string | null;
  purpose: string;
  legalBasis: string;
  requestedProtocol: 'http' | 'postgresql' | 'both';
  requestedVariant: 'original' | 'modified' | 'either';
  validFrom: string;
  validUntil: string;
  contactEmail: string;
  notes: string | null;
  conditionsAccepted: true;
}

export interface StoredAccessRequest extends Omit<AccessRequestSubmission, 'conditionsAccepted'> {
  id: string;
  requestNumber: string;
  dataProductId: string;
  requesterId: string;
  requesterName: string;
  requesterOrganization: string;
  status: AccessRequestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AccessConsumerGrant {
  requestNumber: string;
  protocol: 'http' | 'postgresql' | 'both';
  variant: 'original' | 'modified';
  validFrom: string;
  validUntil: string;
}

export interface OwnedAccessConsumer {
  dataProductId: string;
  consumerType: 'person' | 'machine';
  identityId: string;
  displayName: string;
  organization: string;
  grants: AccessConsumerGrant[];
}
