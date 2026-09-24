export interface MultiLanguageText {
  de: string;
  fr: string;
  it: string;
  en: string;
  rm?: string | null;
}

export type LogicalModelStatus = 'draft' | 'review_pending' | 'changes_requested' | 'published' | 'superseded' | 'retired';
export type DataClassification = 'unclassified' | 'internal' | 'confidential' | 'secret';
export type CreatorType = 'application' | 'internal_organisation' | 'internal_person' | 'external_organisation_or_person';
export type LogicalModelCreator =
  | { type: 'application'; applicationName: string }
  | { type: 'internal_organisation'; organizationId: string; englishName: string }
  | { type: 'internal_person'; userId: string }
  | { type: 'external_organisation_or_person'; organizationName: string; personName?: string | null };
export type MappingType = 'Direct' | 'Renamed' | 'Derived' | 'Lookup' | 'Transformed';
export type MappingStatus = 'draft' | 'review_pending' | 'validated' | 'broken' | 'superseded';

export interface NamedReference {
  id: string;
  displayName: string;
}

export interface I14yConceptReference {
  id: string;
  identifier: string;
  uri: string;
  version: string;
  name: string;
  conceptType: 'CodeList' | 'Date' | 'Numeric' | 'String';
  assignedAt?: string | null;
}

export interface LogicalField {
  id: string;
  rootId: string;
  versionId: string;
  businessObject: string;
  businessObjectVersionId?: string | null;
  entityName: string;
  name: string;
  dataType: string;
  length: number | null;
  shortDescription: string;
  comment: string | null;
  sourceSystem: string | null;
  classification: DataClassification;
  precision: number | null;
  decimalPlaces: number | null;
  nullable: boolean;
  minCount: number;
  maxCount: number | null;
  order: number;
  valueListConcept: I14yConceptReference | null;
  conceptReferences: I14yConceptReference[];
  primaryConceptId: string | null;
}

export interface LogicalEntity {
  id: string;
  rootId: string;
  versionId: string;
  name: string;
  businessObject: string;
  businessObjectVersionId?: string | null;
  comment: string | null;
  order: number;
  fields: LogicalField[];
}

export interface LogicalModelSummary {
  id: string;
  urn: string;
  revision: number;
  lockVersion: number;
  status: LogicalModelStatus;
  title: MultiLanguageText;
  description: MultiLanguageText;
  identifiers: string[];
  identifierMode?: 'manual' | 'organization_derived';
  department: string;
  office: string;
  dataDomain: NamedReference;
  dataOwner: NamedReference;
  deputyDataOwner: NamedReference | null;
  steward: NamedReference | null;
  creator: LogicalModelCreator | null;
  classification: DataClassification;
  dateCreated: string;
  mediaFormats: string[];
  fieldCount: number;
  hasPhysicalMapping: boolean;
  mappingInconsistencyCount?: number;
  productId: string | null;
  distributionIds: string[];
  createdBy: NamedReference;
  createdAt: string;
  updatedAt: string;
}

export interface LogicalModel extends LogicalModelSummary {
  versionId: string;
  reviewId?: string | null;
  entityName: string;
  entities: LogicalEntity[];
  fields: LogicalField[];
  conceptReferences: I14yConceptReference[];
  predecessorVersionId: string | null;
  contactPoints: DcatContactPoint[];
  publisher: DcatPublisher;
  accessRights: string;
  themes: string[];
  mediaFormatHint: string | null;
  comment: string | null;
  distributions: DcatDistribution[];
  dataServices: DcatDataService[];
  assistanceProvenance?: readonly LogicalModelAssistanceProvenance[];
}

export interface LogicalModelReview {
  id: string;
  logicalModelId: string;
  submittedVersionId: string;
  domainId: string;
  submitterUserId: string;
  reviewerUserId: string;
  status: 'pending' | 'accepted' | 'rejected';
  reviewSnapshot: LogicalModel;
  decisionComment: string | null;
  decidedAt: string | null;
  resultVersionId: string | null;
  createdAt: string;
}

export interface LogicalModelAssistanceProvenance {
  fieldPath: string;
  language: 'de' | 'fr' | 'it' | 'en' | 'rm' | null;
  provider: 'deepl' | 'termdat';
  sourceTextHash: string;
  sourceIdentifier: string | null;
  sourceUri: string | null;
  sourceModifiedAt: string | null;
  retrievedAt: string;
  payloadHash: string;
  origin: 'machine_translated' | 'accepted_suggestion' | 'edited' | 'source_import';
}

export interface LogicalFieldWrite {
  id?: string;
  businessObject: string;
  businessObjectVersionId?: string | null;
  entityName: string;
  name: string;
  dataType: string;
  length: number | null;
  shortDescription: string;
  comment: string | null;
  sourceSystem: string | null;
  classification: DataClassification;
  precision: number | null;
  decimalPlaces: number | null;
  nullable: boolean;
  minCount: number;
  maxCount: number | null;
  order: number;
  valueListConceptId: string | null;
  conceptIds: string[];
  primaryConceptId: string | null;
  conceptMatchExplicitlyNone?: boolean;
}

export interface LogicalEntityWrite {
  id?: string;
  name: string;
  businessObject: string;
  businessObjectVersionId?: string | null;
  comment: string | null;
  order: number;
  fields: LogicalFieldWrite[];
}

export interface DcatContactPoint {
  name: string;
  email?: string | null;
  uri?: string | null;
}

export interface DcatPublisher {
  name: string;
  identifier?: string | null;
  uri?: string | null;
}

export interface DcatDistribution {
  id?: string | null;
  title: Partial<MultiLanguageText>;
  accessUrl?: string | null;
  downloadUrl?: string | null;
  mediaType?: string | null;
  format?: string | null;
  licenseUri?: string | null;
}

export interface DcatDataService {
  id?: string | null;
  title: Partial<MultiLanguageText>;
  endpointUrl: string;
  endpointDescription?: string | null;
}

export interface LogicalModelWrite {
  title: MultiLanguageText;
  description: MultiLanguageText;
  identifiers: string[];
  identifierMode?: 'manual' | 'organization_derived';
  department: string;
  office: string;
  organizationUnitId?: string;
  dataDomainId: string;
  dataOwnerId: string;
  deputyDataOwnerId: string | null;
  creator: LogicalModelCreator | null;
  classification: DataClassification;
  dateCreated: string;
  entityName: string;
  entities?: LogicalEntityWrite[];
  conceptIds: string[];
  fields: LogicalFieldWrite[];
  sourceSnapshotId?: string | null;
  contactPoints?: DcatContactPoint[];
  publisher?: DcatPublisher;
  accessRights?: string;
  themes?: string[];
  mediaFormatHint?: string | null;
  comment?: string | null;
  distributions?: DcatDistribution[];
  dataServices?: DcatDataService[];
  assistanceProvenance?: readonly LogicalModelAssistanceProvenance[];
}

export interface PhysicalColumn {
  id: string;
  name: string;
  ordinalPosition: number;
  dataType: string;
  length: number | null;
  precision: number | null;
  scale: number | null;
  nullable: boolean;
  comment: string | null;
}

export interface PhysicalTable {
  id: string;
  stableKey: string;
  schemaName: string;
  name: string;
  kind: 'table' | 'view' | 'materialized_view' | 'parquet';
  storageLocation: string | null;
  mediaType: string | null;
  objectCount: number | null;
  sizeBytes: number | null;
  schemaConfidence: 'declared' | 'embedded' | 'inferred' | null;
  partitionKeys: string[];
  comment: string | null;
  columns: PhysicalColumn[];
}

export interface PhysicalSnapshot {
  id: string;
  sourceId: string;
  sourceName: string;
  dataOwnerName: string | null;
  catalogPath: string;
  sourceType: 'postgresql' | 's3' | 'fixture';
  systemName: string;
  databaseName: string;
  revision: number;
  contentHash: string;
  importedAt: string;
  importedBy: NamedReference;
  tables: PhysicalTable[];
  previousSnapshotId: string | null;
  driftCount: number;
}

export interface PhysicalSource {
  id: string;
  revision: number;
  name: string;
  description?: string | null;
  connectorType: 'postgresql' | 's3' | 'oracle' | 'fixture';
  systemName: string;
  databaseName: string;
  department: string;
  office: string;
  latestSnapshotId: string | null;
  latestSnapshotSequence: number | null;
  latestSnapshot: PhysicalSnapshot | null;
  catalogPath: string;
  ownerName: string;
  updatedAt: string;
}

export interface LogicalDerivationField {
  physicalColumnId: string;
  name: string;
  dataType: string;
  length: number | null;
  precision: number | null;
  scale: number | null;
  nullable: boolean;
  minCount: number;
  maxCount: number | null;
  classification: DataClassification;
  conceptIds: string[];
  primaryConceptId: string | null;
  conceptMatchExplicitlyNone: boolean;
  selected: boolean;
}

export interface LogicalDerivationPreview {
  tableId: string;
  snapshotId: string;
  fields: LogicalDerivationField[];
}

export interface LogicalDerivationContext {
  title: string;
  description: string;
  dataDomainId: string;
  dataOwnerUserId: string;
  deputyOwnerUserId?: string | null;
}

export interface DerivedFieldBinding {
  physicalColumnId: string;
  entityName: string;
  logicalFieldName: string;
}

export interface DerivedLogicalModelWrite {
  logicalModel: LogicalModelWrite;
  fieldMappings: DerivedFieldBinding[];
}

export interface LogicalModelReadiness {
  logicalModelId: string;
  logicalModelVersionId: string;
  datasetId: string;
  dcatReady: boolean;
  i14yReady: boolean;
  dcatIssues: string[];
  i14yIssues: string[];
}

export interface AssetMappingValidationIssue {
  code: string;
  severity: 'warning' | 'error';
  message: string;
  logicalFieldVersionId?: string | null;
  physicalColumnId?: string | null;
}

export interface AssetMapping {
  id: string;
  versionId: string;
  lockVersion: number;
  logicalModelId: string;
  logicalModelVersion: number;
  logicalModelVersionId: string;
  logicalFieldVersionIds: string[];
  physicalSnapshotId: string;
  physicalColumnIds: string[];
  mappingType: MappingType;
  classification: DataClassification;
  transformationRule: string | null;
  comment: string | null;
  responsibleUserId: string;
  responsibleName: string;
  validFrom: string;
  validTo: string | null;
  status: MappingStatus;
  version: number;
  predecessorId: string | null;
  validationResult: { valid: boolean; issues: AssetMappingValidationIssue[] } | null;
  lastValidatedAt: string | null;
  lastDriftCheckAt: string | null;
  createdBy: NamedReference;
  createdAt: string;
  updatedAt: string;
}

export interface AssetMappingWrite {
  id?: string;
  logicalModelVersionId: string;
  logicalFieldVersionIds: string[];
  physicalSnapshotId: string;
  physicalColumnIds: string[];
  mappingType: MappingType;
  classification: DataClassification;
  transformationRule: string | null;
  comment: string | null;
  responsibleUserId: string;
  validFrom: string;
  validTo: string | null;
}

export interface DriftChange {
  id: string;
  kind: 'table_added' | 'table_removed' | 'column_added' | 'column_removed' | 'type_changed' | 'length_changed' | 'precision_changed' | 'scale_changed' | 'nullability_changed' | 'rename_candidate';
  severity: 'info' | 'warning' | 'breaking';
  tableName: string;
  columnName: string | null;
  previousValue: string | null;
  currentValue: string | null;
  confidence: number | null;
  impactedMappingIds: string[];
  impactedLogicalFieldIds: string[];
  resolved: boolean;
}

export interface DriftReport {
  id: string;
  sourceId: string;
  previousSnapshotId: string;
  currentSnapshotId: string;
  createdAt: string;
  changes: DriftChange[];
}

export interface CollectionResponse<T> {
  items: T[];
  total?: number;
  etag?: string;
}

export interface ApiResult<T> {
  body: T;
  etag: string;
}

export const LOGICAL_MODEL_STATUS_LABELS: Record<LogicalModelStatus, string> = {
  draft: 'Entwurf',
  review_pending: 'Zur Prüfung',
  changes_requested: 'Änderungen verlangt',
  published: 'Publiziert',
  superseded: 'Abgelöst',
  retired: 'Stillgelegt',
};

export const MAPPING_STATUS_LABELS: Record<MappingStatus, string> = {
  draft: 'Entwurf',
  review_pending: 'Prüfen',
  validated: 'Gültig',
  broken: 'Gebrochen',
  superseded: 'Abgelöst',
};

export const CLASSIFICATION_LABELS: Record<DataClassification, string> = {
  unclassified: 'Nicht klassifiziert',
  internal: 'Intern',
  confidential: 'Vertraulich',
  secret: 'Geheim',
};
