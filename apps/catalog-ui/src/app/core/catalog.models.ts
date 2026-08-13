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
  ownerUserId?: string | null;
  discoverable?: boolean;
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
  qualityMedal?: 'bronze' | 'silver' | 'gold' | 'platinum';
  qualityScore?: number;
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
  grants?: Array<{
    subject: { type: 'person' | 'machine' | 'group'; id: string };
    actions: string[];
    protocols: ('http' | 'postgresql')[];
    validFrom: string;
    validUntil: string;
    dataVariant: 'original' | 'modified';
    metadataChannels?: { kobyMcp: boolean; i14y: boolean };
    groupSnapshot?: { groupId: string; membershipRevision: number; memberIds: string[] } | null;
  }>;
  generatedRego: string;
  opaRevision: number;
  postgresRevision: number;
}

export type IdentityDirectorySource = 'federal' | 'cantonal' | 'municipal' | 'federal_related';

export interface IdentityDirectoryEntry {
  id: string;
  displayName: string;
  organization: string;
  organizationId: string | null;
  email: string;
  source: IdentityDirectorySource;
  sourceSystem: string;
}

export interface IdentityGroupSummary {
  id: string;
  label: string;
  description: string;
  source: IdentityDirectorySource;
  membershipRevision: number;
  memberCount: number;
  userManaged: boolean;
}

export interface IdentityGroupDetail extends IdentityGroupSummary {
  members: IdentityDirectoryEntry[];
}

export interface AdministrativeOrganization {
  id: string;
  departmentCode: string;
  officeCode: string | null;
  displayName: string;
  organizationType: 'federal_council' | 'chancellery' | 'department' | 'office' | 'affiliated';
  label: string;
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
