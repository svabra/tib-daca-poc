import { AssetMapping, LogicalField, LogicalModel, PhysicalSnapshot } from './data-models.models';

const FIELD_BASE: Pick<LogicalField, 'businessObject' | 'entityName' | 'length' | 'comment' | 'sourceSystem' | 'classification' | 'precision' | 'decimalPlaces' | 'nullable' | 'minCount' | 'maxCount' | 'valueListConcept' | 'conceptReferences' | 'primaryConceptId'> = {
  businessObject: 'Organisationseinheit', entityName: 'Organisationseinheiten', length: null, comment: null,
  sourceSystem: 'HR-Core', classification: 'internal', precision: null, decimalPlaces: null, nullable: false,
  minCount: 1, maxCount: 1, valueListConcept: null, conceptReferences: [], primaryConceptId: null,
};

const fields: LogicalField[] = [
  { ...FIELD_BASE, id: 'field-org-id', rootId: 'field-org-id', versionId: 'field-org-id', name: 'organisationseinheit_id', dataType: 'xsd:string', shortDescription: 'Stabiler Schlüssel der Organisationseinheit', order: 1 },
  { ...FIELD_BASE, id: 'field-name', rootId: 'field-name', versionId: 'field-name', name: 'bezeichnung', dataType: 'xsd:string', length: 180, shortDescription: 'Offizielle Bezeichnung', order: 2 },
  { ...FIELD_BASE, id: 'field-parent', rootId: 'field-parent', versionId: 'field-parent', name: 'uebergeordnete_einheit', dataType: 'xsd:string', shortDescription: 'Übergeordnete Organisationseinheit', nullable: true, minCount: 0, order: 3 },
  { ...FIELD_BASE, id: 'field-type', rootId: 'field-type', versionId: 'field-type', name: 'organisationstyp', dataType: 'xsd:string', length: 40, shortDescription: 'Typ der Verwaltungseinheit', order: 4 },
  { ...FIELD_BASE, id: 'field-valid', rootId: 'field-valid', versionId: 'field-valid', name: 'gueltig_ab', dataType: 'xsd:date', shortDescription: 'Beginn der fachlichen Gültigkeit', order: 5 },
];

export const FALLBACK_LOGICAL_MODEL: LogicalModel = {
  id: 'fallback-organisationseinheiten', urn: 'urn:daca:logical-model:organisationseinheiten', revision: 2, lockVersion: 1,
  versionId: 'fallback-model-version-2', status: 'draft', title: { de: 'Organisationseinheiten', fr: 'Unités organisationnelles', it: '', en: 'Organisational units' },
  description: { de: 'Fachliches Modell der Organisationseinheiten der Verteidigung.', fr: '', it: '', en: '' }, identifiers: ['VBS-ORG-UNIT'],
  department: 'VBS', office: 'vbs-verteidigung', dataDomain: { id: 'domain-personal', displayName: 'Personal' },
  dataOwner: { id: 'christian.spider', displayName: 'Christian Spider' }, deputyDataOwner: { id: 'sibilla.micheli', displayName: 'Sibilla Micheli' },
  steward: { id: 'cinthya.thor', displayName: 'Cinthya Thor' }, creator: { type: 'application', applicationName: 'HR-Core' }, classification: 'internal',
  dateCreated: '2026-08-20', mediaFormats: [], fieldCount: fields.length, hasPhysicalMapping: true, productId: null, distributionIds: [],
  createdBy: { id: 'cinthya.thor', displayName: 'Cinthya Thor' }, createdAt: '2026-08-20T08:00:00Z', updatedAt: '2026-09-05T09:10:00Z',
  entityName: 'Organisationseinheiten', entities: [{ id: 'entity-org-v2', rootId: 'entity-org', versionId: 'entity-org-v2', name: 'Organisationseinheiten', businessObject: 'Organisationseinheit', comment: null, order: 1, fields }], fields, conceptReferences: [], predecessorVersionId: 'fallback-model-version-1',
  contactPoints: [{ name: 'Cinthya Thor', email: 'cinthya.thor@vtg.admin.ch' }],
  publisher: { name: 'Verteidigung', identifier: 'vbs-verteidigung', uri: 'urn:daca:organization:vbs-verteidigung' },
  accessRights: 'urn:daca:access-rights:internal', themes: [], mediaFormatHint: null, comment: null,
  distributions: [], dataServices: [],
};

export const FALLBACK_PHYSICAL_SNAPSHOT: PhysicalSnapshot = {
  id: 'fallback-hr-snapshot-2', sourceId: 'fallback-hr-core', sourceName: 'HR-PROD', sourceType: 'postgresql', systemName: 'PostgreSQL', databaseName: 'hr_core', revision: 2,
  contentHash: 'sha256:fallback', importedAt: '2026-09-05T07:20:00Z', importedBy: { id: 'cinthya.thor', displayName: 'Cinthya Thor' }, previousSnapshotId: 'fallback-hr-snapshot-1', driftCount: 1,
  tables: [{ id: 'table-org-unit', schemaName: 'public', name: 'org_unit', kind: 'table', storageLocation: null, mediaType: null, objectCount: null, sizeBytes: null, schemaConfidence: 'declared', partitionKeys: [], columns: [
    { id: 'column-org-id', name: 'org_unit_id', ordinalPosition: 1, dataType: 'uuid', length: null, precision: null, scale: null, nullable: false, comment: null },
    { id: 'column-org-name', name: 'name', ordinalPosition: 2, dataType: 'varchar', length: 180, precision: null, scale: null, nullable: false, comment: null },
    { id: 'column-parent-id', name: 'parent_org_unit_id', ordinalPosition: 3, dataType: 'uuid', length: null, precision: null, scale: null, nullable: true, comment: null },
    { id: 'column-type', name: 'unit_type', ordinalPosition: 4, dataType: 'varchar', length: 40, precision: null, scale: null, nullable: false, comment: null },
    { id: 'column-valid', name: 'valid_from', ordinalPosition: 5, dataType: 'date', length: null, precision: null, scale: null, nullable: false, comment: null },
  ] }, { id: 'table-employee', schemaName: 'public', name: 'employee', kind: 'table', storageLocation: null, mediaType: null, objectCount: null, sizeBytes: null, schemaConfidence: 'declared', partitionKeys: [], columns: [
    { id: 'column-employee-org-id', name: 'org_unit_id', ordinalPosition: 1, dataType: 'uuid', length: null, precision: null, scale: null, nullable: false, comment: null },
    { id: 'column-employee-org-name', name: 'org_unit_name', ordinalPosition: 2, dataType: 'varchar', length: 120, precision: null, scale: null, nullable: true, comment: null },
  ] }],
};

const MAPPING_BASE: Pick<AssetMapping, 'logicalModelId' | 'logicalModelVersion' | 'logicalModelVersionId' | 'physicalSnapshotId' | 'classification' | 'responsibleUserId' | 'responsibleName' | 'validFrom' | 'validTo' | 'version' | 'predecessorId' | 'lastDriftCheckAt' | 'createdBy' | 'createdAt' | 'updatedAt'> = {
  logicalModelId: FALLBACK_LOGICAL_MODEL.id, logicalModelVersion: 2, logicalModelVersionId: FALLBACK_LOGICAL_MODEL.versionId,
  physicalSnapshotId: FALLBACK_PHYSICAL_SNAPSHOT.id, classification: 'internal', responsibleUserId: 'cinthya.thor', responsibleName: 'Cinthya Thor', validFrom: '2026-09-01', validTo: null,
  version: 1, predecessorId: null, lastDriftCheckAt: '2026-09-05T07:21:00Z', createdBy: { id: 'cinthya.thor', displayName: 'Cinthya Thor' }, createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-05T07:21:00Z',
};

export const FALLBACK_MAPPINGS: AssetMapping[] = [
  { ...MAPPING_BASE, id: 'mapping-org-id', versionId: 'mapping-org-id-v1', lockVersion: 1, logicalFieldVersionIds: ['field-org-id'], physicalColumnIds: ['column-org-id','column-employee-org-id'], mappingType: 'Direct', transformationRule: null, comment: 'Stabile ID in beiden operativen Tabellen.', status: 'validated', validationResult: { valid: true, issues: [] }, lastValidatedAt: '2026-09-04T08:00:00Z' },
  { ...MAPPING_BASE, id: 'mapping-name', versionId: 'mapping-name-v1', lockVersion: 1, logicalFieldVersionIds: ['field-name'], physicalColumnIds: ['column-org-name','column-employee-org-name'], mappingType: 'Renamed', transformationRule: null, comment: null, status: 'review_pending', validationResult: { valid: true, issues: [{ severity:'warning',code:'length_changed',message:'employee.org_unit_name ist kürzer als das logische Feld.',logicalFieldVersionId:'field-name',physicalColumnId:'column-employee-org-name' }] }, lastValidatedAt: '2026-09-05T07:21:00Z' },
  { ...MAPPING_BASE, id: 'mapping-parent', versionId: 'mapping-parent-v1', lockVersion: 1, logicalFieldVersionIds: ['field-parent'], physicalColumnIds: ['column-parent-id'], mappingType: 'Direct', transformationRule: null, comment: null, status: 'validated', validationResult: { valid: true, issues: [] }, lastValidatedAt: '2026-09-04T08:00:00Z' },
  { ...MAPPING_BASE, id: 'mapping-type', versionId: 'mapping-type-v1', lockVersion: 1, logicalFieldVersionIds: ['field-type'], physicalColumnIds: ['column-type'], mappingType: 'Lookup', transformationRule: 'I14Y CodeList organisation-type', comment: 'Werteliste wird fachlich geprüft.', status: 'broken', validationResult: { valid: false, issues: [{ severity:'error',code:'lookup_missing',message:'Die referenzierte Lookup-Version ist nicht mehr verfügbar.',logicalFieldVersionId:'field-type',physicalColumnId:'column-type' }] }, lastValidatedAt: '2026-09-05T07:21:00Z' },
];
