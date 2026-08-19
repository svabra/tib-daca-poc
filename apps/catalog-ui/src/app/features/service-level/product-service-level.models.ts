export type ServiceLevelRevisionStatus =
  | 'draft'
  | 'pending_approval'
  | 'published'
  | 'rejected'
  | 'withdrawn';
export type ServiceLevelStatus = 'baseline' | ServiceLevelRevisionStatus;

export type ServiceLevelSummaryState = 'baseline' | 'active' | 'scheduled' | 'expired';

export type ServiceLevelWeekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface ServiceLevelPerson {
  displayName: string;
  organization: string;
  role: 'data_owner' | 'control_person';
}

export interface ServiceLevelLegalReference {
  code: string;
  title: string;
  reference: string;
  url: string;
  applicability: string;
}

export interface ServiceLevelDefinition {
  templateVersion: 1;
  purposeAndSuitableUse: string;
  freshnessToleranceBusinessDays: number;
  supportWindow: {
    weekdays: ServiceLevelWeekday[];
    start: string;
    end: string;
    timezone: 'Europe/Zurich';
  };
  initialResponseTargetSupportHours: number;
  plannedMaintenanceNoticeHours: number;
  usageConditions: string[];
  knownLimitations: string[];
  nextReviewOn: string;
  availabilityCommitment: 'best_effort';
}

export interface ServiceLevelChange {
  field: string;
  previousValue: unknown | null;
  currentValue: unknown | null;
}

export interface ServiceLevelRevision {
  revisionId: string;
  dataProductId: string;
  revision: number;
  lockVersion: number;
  status: ServiceLevelRevisionStatus;
  source: 'published' | 'owner_draft';
  validFrom: string;
  validUntil: string | null;
  effectiveValidUntil: string | null;
  definition: ServiceLevelDefinition;
  owner: ServiceLevelPerson;
  controlPerson: ServiceLevelPerson | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  decidedAt: string | null;
  publishedAt: string | null;
  decision: 'approve' | 'reject' | null;
  rejectionReason: string | null;
  supersedesRevision?: number | null;
  supersededByRevision?: number | null;
  supersededFrom: string | null;
  changes: ServiceLevelChange[];
}

export interface ServiceLevelBaseline {
  revisionId: null;
  revision: 0;
  lockVersion: 0;
  status: 'baseline';
  source: 'platform_default';
  validFrom: string;
  validUntil: null;
  effectiveValidUntil: null;
  definition: ServiceLevelDefinition;
  publishedAt: null;
}

export interface ServiceLevelSummaryResponse {
  dataProductId: string;
  asOf: string;
  source: 'platform_default' | 'published';
  state: ServiceLevelSummaryState;
  current: ServiceLevelBaseline | ServiceLevelRevision;
  nextScheduled: ServiceLevelRevision | null;
  canEdit: boolean;
  canReview: boolean;
  owner: ServiceLevelPerson;
  controlPerson: ServiceLevelPerson | null;
  legalReferences: ServiceLevelLegalReference[];
}

export interface ServiceLevelRevisionListResponse {
  items: ServiceLevelRevision[];
  detailLevel: 'public' | 'privileged';
  latestRevision: number;
  etag: string;
}

export interface ServiceLevelRevisionWrite {
  validFrom: string;
  validUntil: string | null;
  definition: ServiceLevelDefinition;
}

export interface ServiceLevelControlPersonUpdateResponse {
  dataProductId: string;
  productRevision: number;
  controlPerson: ServiceLevelPerson;
}

export interface ServiceLevelHttpResult<T> {
  body: T;
  etag: string;
}

export interface ServiceLevelDiffRow {
  key: string;
  label: string;
  before: string;
  after: string;
}

export interface SupplementalLegalReference {
  code: 'BGÖ' | 'VBGÖ' | 'BGA' | 'VBGA';
  title: string;
  reference: string;
  url: string;
  applicability: string;
}
