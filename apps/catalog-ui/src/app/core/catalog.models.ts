export type EndpointDescriptor =
  | {
      id: string;
      protocol: 'http-rest';
      title: string;
      method: 'GET' | 'POST';
      url: string;
      mediaType: string;
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
      sslMode: 'disable' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';
    };

export interface ProductQualityCriterion {
  id: 'access' | 'discoverability' | 'technical' | 'business' | 'graph' | 'ontology';
  label: string;
  complete: boolean;
}

export interface ProductQualitySummary {
  dataProductId: string;
  score: number;
  medal: 'bronze' | 'silver' | 'gold' | 'platinum';
  criteria: ProductQualityCriterion[];
  dcatReviewed: boolean;
}

export interface ProductDictionaryField {
  id: string;
  name: string;
  dataType: string;
  nullable: boolean;
  keyField: boolean;
  businessDescription: string | null;
}

export interface ProductQualityMapping {
  id: string;
  fieldId: string | null;
  mappingType: 'product_class' | 'field_property';
  status: 'suggested' | 'confirmed' | 'unresolved';
  termUri: string;
  termLabel: string;
}

export interface ProductQualityWorkspace {
  quality: ProductQualitySummary;
  fields: ProductDictionaryField[];
  graph: Record<string, unknown> | null;
  graphStatus: 'missing' | 'suggested' | 'confirmed';
  mappings: ProductQualityMapping[];
}

export interface ProductEffectiveAccessGrant {
  protocols: ('http' | 'postgresql')[];
  validFrom: string;
  validUntil: string;
  weeklyAvailability?: {
    weekdays: ('monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday')[];
    startTime: string;
    endTime: string;
    timeZone: string;
  } | null;
}

export interface ProductEffectiveAccessResponse {
  granted: boolean;
  grants: ProductEffectiveAccessGrant[];
}

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
  createdAt: string;
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
    weeklyAvailability?: {
      weekdays: ('monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday')[];
      startTime: string;
      endTime: string;
      timeZone: string;
    } | null;
    groupSnapshot?: { groupId: string; membershipRevision: number; memberIds: string[] } | null;
  }>;
  generatedRego: string;
  opaRevision: number;
  postgresRevision: number;
}

export interface GovernanceSubmission {
  id: string;
  dataProductId: string;
  policyRevisionId: string;
  policyRevision: number;
  ownerUserId: string;
  approverUserId: string;
  status: 'pending_approval' | 'approved_deploying' | 'approved' | 'rejected' | 'deployment_failed';
  revision: number;
  reviewSnapshot: {
    dataProduct: { id: string; title: string; owner: string; classification: string };
    approver: { id: string; displayName: string; organization: string };
    discoverable: boolean;
    grants: NonNullable<PolicyDefinition['grants']>;
    accessRequestFulfillments?: Array<{
      accessRequestId: string;
      requestNumber: string;
      requesterId: string;
      fulfillmentSubject: { type: 'person' | 'machine' | 'group'; id: string };
      groupMembershipRevision: number | null;
      policyRevisionId: string;
    }>;
    barArchive: Record<string, unknown>;
    policy: { id: string; revision: number; definition: Record<string, unknown> };
    submittedAt: string;
  };
  archiveEvidence: Record<string, unknown>;
  decision: 'approve' | 'reject' | null;
  decisionComment: string | null;
  submittedAt: string;
  decidedAt: string | null;
  updatedAt: string;
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
  organizationId: string | null;
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
  fulfillmentSubjectType?: 'person' | 'machine' | 'group' | null;
  fulfillmentSubjectId?: string | null;
  fulfillmentGroupRevision?: number | null;
  decisionPolicyRevisionId?: string | null;
  grantedVariant?: 'original' | 'modified' | null;
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

export type ProductActivityCategory =
  | 'metadata'
  | 'quality'
  | 'access'
  | 'governance'
  | 'deployment'
  | 'poc_system';

export type ProductActivityStatus = 'info' | 'pending' | 'success' | 'warning' | 'failure';

export interface ProductActivityActor {
  displayName: string;
  kind: 'person' | 'system' | 'role';
}

export interface ProductActivityFact {
  label: string;
  value: string;
}

export interface ProductActivityItem {
  key: string;
  eventType: string;
  category: ProductActivityCategory;
  status: ProductActivityStatus;
  title: string;
  description: string;
  occurredAt: string;
  actor: ProductActivityActor;
  productRevision: number | null;
  policyRevision: number | null;
  facts: ProductActivityFact[];
  technicalEvidence: ProductActivityFact[];
}

export interface ProductActivityResponse {
  detailLevel: 'summary' | 'privileged';
  items: ProductActivityItem[];
}
