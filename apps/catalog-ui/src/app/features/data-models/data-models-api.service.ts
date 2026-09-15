import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError, timeout } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import {
  ApiResult,
  AssetMapping,
  AssetMappingWrite,
  CollectionResponse,
  DataClassification,
  DcatContactPoint,
  DriftReport,
  LogicalEntity,
  LogicalEntityWrite,
  LogicalModel,
  LogicalModelReview,
  LogicalModelReadiness,
  LogicalModelSummary,
  LogicalModelWrite,
  LogicalDerivationContext,
  LogicalDerivationPreview,
  MappingStatus,
  MappingType,
  PhysicalSnapshot,
  PhysicalSource,
  PhysicalTable,
} from './data-models.models';

export type ModelingApiErrorKind = 'conflict' | 'permission' | 'validation' | 'not_found' | 'unavailable' | 'unknown';
export type LogicalModelExportRepresentation = 'dcat-ttl' | 'dcat-jsonld' | 'shacl-ttl' | 'shacl-jsonld';

export interface ModelingValidationIssue {
  location: string;
  message: string;
  type: string;
}

export interface ModelingTechnicalDetails {
  category: string;
  sqlState: string;
  constraint: string;
  timestamp: string;
}

export interface LogicalModelExportFile {
  blob: Blob;
  filename: string;
}

export class ModelingApiError extends Error {
  constructor(
    readonly kind: ModelingApiErrorKind,
    readonly status: number,
    message: string,
    readonly issues: readonly ModelingValidationIssue[] = [],
    readonly errorCode: string | null = null,
    readonly suggestedAction: string | null = null,
    readonly requestId: string | null = null,
    readonly technicalDetails: ModelingTechnicalDetails | null = null,
  ) {
    super(message);
    this.name = 'ModelingApiError';
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function textValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.length ? value : null;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === 'string');
}

function languageMap(localizations: Record<string, unknown>[], property: 'title' | 'description') {
  const read = (language: string) => textValue(localizations.find((item) => item['language'] === language)?.[property]);
  return { de: read('de'), fr: read('fr'), it: read('it'), en: read('en'), rm: read('rm') || null };
}

function namedReference(value: unknown, fallbackId: string, fallbackName: string) {
  const item = asRecord(value);
  return { id: textValue(item['id'], fallbackId), displayName: textValue(item['displayName'] ?? item['name'], fallbackName) };
}

function classificationValue(value: unknown): DataClassification {
  return ['unclassified', 'internal', 'confidential', 'secret'].includes(textValue(value))
    ? textValue(value) as DataClassification : 'unclassified';
}

function statusValue(value: unknown): LogicalModel['status'] {
  return ['draft', 'review_pending', 'changes_requested', 'published', 'superseded', 'retired'].includes(textValue(value))
    ? textValue(value) as LogicalModel['status'] : 'draft';
}

function mappingStatusValue(value: unknown): MappingStatus {
  return ['draft', 'review_pending', 'validated', 'broken', 'superseded'].includes(textValue(value))
    ? textValue(value) as MappingStatus : 'draft';
}

function mappingTypeValue(value: unknown): MappingType {
  return ['Direct', 'Renamed', 'Derived', 'Lookup', 'Transformed'].includes(textValue(value))
    ? textValue(value) as MappingType : 'Direct';
}

function conceptTypeValue(value: unknown): 'CodeList' | 'Date' | 'Numeric' | 'String' {
  return ['CodeList', 'Date', 'Numeric', 'String'].includes(textValue(value))
    ? textValue(value) as 'CodeList' | 'Date' | 'Numeric' | 'String' : 'String';
}

@Injectable({ providedIn: 'root' })
export class DataModelsApiService {
  private readonly http = inject(HttpClient);
  private readonly identity = inject(DemoIdentityService);

  listLogicalModels(): Observable<readonly LogicalModelSummary[]> {
    return this.identitySafe(this.http.get<CollectionResponse<unknown> | unknown[]>(
      '/api/v1/logical-models', { headers: this.identity.headers() },
    )).pipe(map((response) => (Array.isArray(response) ? response : response.items).map((item) => this.normalizeLogicalModel(item))));
  }

  loadLogicalModel(id: string): Observable<ApiResult<LogicalModel>> {
    return this.identitySafeResponse(this.http.get<unknown>(
      `/api/v1/logical-models/${encodeURIComponent(id)}`,
      { headers: this.identity.headers(), observe: 'response' },
    )).pipe(map((result) => ({ ...result, body: this.normalizeLogicalModel(result.body) })));
  }

  listLogicalModelVersions(id: string): Observable<readonly LogicalModel[]> {
    return this.identitySafe(this.http.get<CollectionResponse<unknown>>(
      `/api/v1/logical-models/${encodeURIComponent(id)}/versions`,
      { headers: this.identity.headers() },
    )).pipe(map((response) => response.items.map((item) => this.normalizeLogicalModel(item))));
  }

  loadLogicalModelReadiness(id: string, versionId: string): Observable<LogicalModelReadiness> {
    return this.identitySafe(this.http.get<LogicalModelReadiness>(
      `/api/v1/logical-models/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/readiness`,
      { headers: this.identity.headers() },
    ));
  }

  createLogicalModel(value: LogicalModelWrite): Observable<ApiResult<LogicalModel>> {
    return this.identitySafeResponse(this.http.post<unknown>('/api/v1/logical-models', this.toLogicalModelPayload(value), {
      headers: this.identity.headers(), observe: 'response',
    })).pipe(map((result) => ({ ...result, body: this.normalizeLogicalModel(result.body) })));
  }

  checkLogicalModelIdentifier(identifier: string, excludeModelId?: string): Observable<{ available: boolean }> {
    let params = new HttpParams().set('identifier', identifier);
    if (excludeModelId) params = params.set('excludeModelId', excludeModelId);
    return this.identitySafe(this.http.get<{ available: boolean }>('/api/v1/logical-model-identifiers/availability', {
      headers: this.identity.headers(), params,
    }));
  }

  updateLogicalModel(id: string, versionId: string, value: LogicalModelWrite, etag: string): Observable<ApiResult<LogicalModel>> {
    return this.identitySafeResponse(this.http.put<unknown>(
      `/api/v1/logical-models/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`, this.toLogicalModelPayload(value),
      { headers: this.writeHeaders(etag), observe: 'response' },
    )).pipe(map((result) => ({ ...result, body: this.normalizeLogicalModel(result.body) })));
  }

  createLogicalModelVersion(id: string, etag: string): Observable<ApiResult<LogicalModel>> {
    return this.identitySafeResponse(this.http.post<unknown>(
      `/api/v1/logical-models/${encodeURIComponent(id)}/versions`, null,
      { headers: this.writeHeaders(etag), observe: 'response' },
    )).pipe(map((result) => ({ ...result, body: this.normalizeLogicalModel(result.body) })));
  }

  submitLogicalModel(id: string, versionId: string, etag: string): Observable<ApiResult<LogicalModel>> {
    return this.identitySafeResponse(this.http.post<unknown>(
      `/api/v1/logical-models/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/submit`, null,
      { headers: this.writeHeaders(etag), observe: 'response' },
    )).pipe(map((result) => ({ ...result, body: this.normalizeLogicalModel(result.body) })));
  }

  loadLogicalModelReview(reviewId: string): Observable<ApiResult<LogicalModelReview>> {
    return this.identitySafeResponse(this.http.get<Record<string, unknown>>(
      `/api/v1/logical-model-reviews/${encodeURIComponent(reviewId)}`,
      { headers: this.identity.headers(), observe: 'response' },
    )).pipe(map((result) => {
      const value = asRecord(result.body);
      return {
        etag: result.etag,
        body: {
          id: textValue(value['id']),
          logicalModelId: textValue(value['logicalModelId']),
          submittedVersionId: textValue(value['submittedVersionId']),
          domainId: textValue(value['domainId']),
          submitterUserId: textValue(value['submitterUserId']),
          reviewerUserId: textValue(value['reviewerUserId']),
          status: textValue(value['status'], 'pending') as LogicalModelReview['status'],
          reviewSnapshot: this.normalizeLogicalModel(value['reviewSnapshot']),
          decisionComment: nullableText(value['decisionComment']),
          decidedAt: nullableText(value['decidedAt']),
          resultVersionId: nullableText(value['resultVersionId']),
          createdAt: textValue(value['createdAt']),
        },
      };
    }));
  }

  decideLogicalModelReview(reviewId: string, decision: 'accept' | 'reject', comment: string | null, etag: string): Observable<ApiResult<LogicalModel>> {
    return this.identitySafeResponse(this.http.post<unknown>(
      `/api/v1/logical-model-reviews/${encodeURIComponent(reviewId)}/decision`, { decision, comment },
      { headers: this.writeHeaders(etag), observe: 'response' },
    )).pipe(map((result) => ({ ...result, body: this.normalizeLogicalModel(result.body) })));
  }

  retireLogicalModel(id: string, versionId: string, etag: string): Observable<ApiResult<LogicalModel>> {
    return this.identitySafeResponse(this.http.post<unknown>(
      `/api/v1/logical-models/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/retire`, null,
      { headers: this.writeHeaders(etag), observe: 'response' },
    )).pipe(map((result) => ({ ...result, body: this.normalizeLogicalModel(result.body) })));
  }

  previewLogicalModelDerivation(tableId: string, value: LogicalDerivationContext): Observable<LogicalDerivationPreview> {
    return this.identitySafe(this.http.post<LogicalDerivationPreview>(`/api/v1/physical-tables/${encodeURIComponent(tableId)}/derivation-preview`, value, {
      headers: this.identity.headers(),
    }));
  }

  deriveLogicalModel(tableId: string, value: LogicalDerivationContext & { fields: LogicalDerivationPreview['fields'] }): Observable<ApiResult<LogicalModel>> {
    return this.identitySafeResponse(this.http.post<unknown>(`/api/v1/physical-tables/${encodeURIComponent(tableId)}/derive-logical-model`, value, {
      headers: this.identity.headers(), observe: 'response',
    }))
      .pipe(map((result) => {
        const response = asRecord(result.body);
        return { ...result, body: this.normalizeLogicalModel(response['logicalModel'] ?? response['model'] ?? result.body) };
      }));
  }

  exportUrl(modelId: string, versionId: string, representation: LogicalModelExportRepresentation): string {
    const [profile, format] = representation.split('-');
    return `/api/v1/logical-models/${encodeURIComponent(modelId)}/versions/${encodeURIComponent(versionId)}/exports/${profile}/${format}`;
  }

  downloadLogicalModelExport(modelId: string, versionId: string, representation: LogicalModelExportRepresentation): Observable<LogicalModelExportFile> {
    return this.identitySafe(this.http.get(this.exportUrl(modelId, versionId, representation), {
      headers: this.identity.headers(), observe: 'response', responseType: 'blob',
    })).pipe(map((response) => {
      if (!response.body) throw new ModelingApiError('unknown', 502, 'Die Katalog-API hat keinen Export geliefert.');
      const fallbackExtension = representation.endsWith('jsonld') ? 'jsonld' : 'ttl';
      const fallbackName = `logical-model-${modelId}-${representation}.${fallbackExtension}`;
      return { blob: response.body, filename: this.downloadFilename(response.headers.get('content-disposition'), fallbackName) };
    }));
  }

  listPhysicalSources(): Observable<readonly PhysicalSource[]> {
    return this.identitySafe(this.http.get<CollectionResponse<unknown> | unknown[]>(
      '/api/v1/physical-sources', { headers: this.identity.headers() },
    )).pipe(map((response) => (Array.isArray(response) ? response : response.items).map((item) => this.normalizePhysicalSource(item))));
  }

  listPhysicalSnapshots(sourceId?: string): Observable<readonly PhysicalSnapshot[]> {
    const params = sourceId ? new HttpParams().set('sourceId', sourceId) : undefined;
    return this.identitySafe(this.http.get<CollectionResponse<unknown> | unknown[]>(
      '/api/v1/physical-snapshots', { headers: this.identity.headers(), params },
    )).pipe(map((response) => (Array.isArray(response) ? response : response.items).map((item) => this.normalizePhysicalSnapshot(item))));
  }

  loadPhysicalSnapshot(snapshotId: string): Observable<PhysicalSnapshot> {
    return this.identitySafe(this.http.get<unknown>(`/api/v1/physical-snapshots/${encodeURIComponent(snapshotId)}`, {
      headers: this.identity.headers(),
    })).pipe(map((response) => this.normalizePhysicalSnapshot(response)));
  }

  importPhysicalSource(sourceId: string, revision: number, fixtureVariant?: 'baseline' | 'drift'): Observable<ApiResult<PhysicalSnapshot>> {
    return this.identitySafeResponse(this.http.post<unknown>(
      `/api/v1/physical-sources/${encodeURIComponent(sourceId)}/imports`, fixtureVariant ? { fixtureVariant } : {},
      { headers: this.writeHeaders(`"${revision}"`), observe: 'response' },
    )).pipe(map((result) => ({ ...result, body: this.normalizePhysicalSnapshot(result.body) })));
  }

  listMappings(logicalModelId?: string, physicalSnapshotId?: string): Observable<readonly AssetMapping[]> {
    let params = new HttpParams();
    if (logicalModelId) params = params.set('logicalModelId', logicalModelId);
    if (physicalSnapshotId) params = params.set('physicalSnapshotId', physicalSnapshotId);
    return this.identitySafe(this.http.get<CollectionResponse<unknown> | unknown[]>(
      '/api/v1/asset-mappings', { headers: this.identity.headers(), params },
    )).pipe(map((response) => (Array.isArray(response) ? response : response.items).map((item) => this.normalizeMapping(item))));
  }

  createMapping(value: AssetMappingWrite): Observable<ApiResult<AssetMapping>> {
    return this.identitySafeResponse(this.http.post<unknown>('/api/v1/asset-mappings', this.mappingPayload(value), {
      headers: this.identity.headers(), observe: 'response',
    })).pipe(map((result) => ({ ...result, body: this.normalizeMapping(result.body) })));
  }

  updateMapping(id: string, versionId: string, value: AssetMappingWrite, etag: string): Observable<ApiResult<AssetMapping>> {
    return this.identitySafeResponse(this.http.put<unknown>(
      `/api/v1/asset-mappings/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`, this.mappingPayload(value),
      { headers: this.writeHeaders(etag), observe: 'response' },
    )).pipe(map((result) => ({ ...result, body: this.normalizeMapping(result.body) })));
  }

  createMappingVersion(id: string, etag: string): Observable<ApiResult<AssetMapping>> {
    return this.identitySafeResponse(this.http.post<unknown>(
      `/api/v1/asset-mappings/${encodeURIComponent(id)}/versions`, null,
      { headers: this.writeHeaders(etag), observe: 'response' },
    )).pipe(map((result) => ({ ...result, body: this.normalizeMapping(result.body) })));
  }

  validateMapping(id: string, versionId: string, etag: string): Observable<ApiResult<AssetMapping>> {
    return this.identitySafeResponse(this.http.post<unknown>(
      `/api/v1/asset-mappings/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/validate`, null,
      { headers: this.writeHeaders(etag), observe: 'response' },
    )).pipe(map((result) => ({ ...result, body: this.normalizeMapping(result.body) })));
  }

  submitMapping(id: string, versionId: string, etag: string): Observable<ApiResult<AssetMapping>> {
    return this.identitySafeResponse(this.http.post<unknown>(
      `/api/v1/asset-mappings/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/submit`, null,
      { headers: this.writeHeaders(etag), observe: 'response' },
    )).pipe(map((result) => ({ ...result, body: this.normalizeMapping(result.body) })));
  }

  supersedeMapping(id: string, versionId: string, etag: string): Observable<ApiResult<AssetMapping>> {
    return this.identitySafeResponse(this.http.post<unknown>(
      `/api/v1/asset-mappings/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/supersede`, null,
      { headers: this.writeHeaders(etag), observe: 'response' },
    )).pipe(map((result) => ({ ...result, body: this.normalizeMapping(result.body) })));
  }

  loadDrift(snapshotId: string): Observable<DriftReport | null> {
    return this.identitySafe(this.http.get<unknown>(`/api/v1/physical-snapshots/${encodeURIComponent(snapshotId)}/drift`, {
      headers: this.identity.headers(),
    })).pipe(map((value) => value ? this.normalizeDrift(value) : null));
  }

  private toLogicalModelPayload(value: LogicalModelWrite): Record<string, unknown> {
    const actor = this.identity.user();
    const creator = value.creator ? (() => {
      switch (value.creator.type) {
        case 'application': return { type: 'Application', applicationName: value.creator.applicationName };
        case 'internal_organisation': return { type: 'InternalOrganisation', organizationId: value.creator.organizationId, englishName: value.creator.englishName };
        case 'internal_person': return { type: 'InternalPerson', userId: value.creator.userId };
        case 'external_organisation_or_person': return { type: 'ExternalOrganisationOrPerson', organizationName: value.creator.organizationName, personName: value.creator.personName ?? null };
      }
    })() : null;
    const defaultPublisherName = actor.organization || value.office;
    const sourceContactPoints: DcatContactPoint[] = value.contactPoints?.length
      ? value.contactPoints
      : [{ name: actor.displayName, email: actor.email }];
    const contactPoints = sourceContactPoints
      .map((contactPoint) => {
        const email = contactPoint.email?.trim();
        const uri = contactPoint.uri?.trim();
        return {
          name: contactPoint.name.trim(),
          ...(email ? { email } : {}),
          ...(uri ? { uri } : {}),
        };
      });
    const fallbackEntities: LogicalEntityWrite[] = [...new Set(value.fields.map((field) => field.entityName || value.entityName))]
      .map((entityName, entityIndex) => ({
        name: entityName,
        businessObject: value.fields.find((field) => (field.entityName || value.entityName) === entityName)?.businessObject ?? entityName,
        comment: null,
        order: entityIndex + 1,
        fields: value.fields.filter((field) => (field.entityName || value.entityName) === entityName),
      }));
    if (!fallbackEntities.length) fallbackEntities.push({ name: value.entityName, businessObject: value.entityName, comment: null, order: 1, fields: [] });
    const entities = value.entities?.length ? value.entities : fallbackEntities;
    return {
      identifiers: value.identifiers,
      identifierMode: value.identifierMode ?? 'manual',
      localizations: (['de', 'fr', 'it', 'en', 'rm'] as const)
        .filter((language) => language === 'de' || Boolean(value.title[language]?.trim() && value.description[language]?.trim()))
        .map((language) => ({
          language,
          title: value.title[language]?.trim() ?? '',
          description: value.description[language]?.trim() ?? '',
        })),
      dataOwnerUserId: value.dataOwnerId,
      deputyOwnerUserId: value.deputyDataOwnerId,
      creator,
      dataDomainId: value.dataDomainId,
      organizationUnitId: value.organizationUnitId ?? value.office,
      dataClassification: value.classification,
      dateCreated: value.dateCreated,
      contactPoints,
      publisher: value.publisher ?? { name: defaultPublisherName, identifier: value.office, uri: `urn:daca:organization:${value.office}` },
      accessRights: value.accessRights ?? 'urn:daca:access-rights:internal',
      themes: value.themes ?? [],
      mediaFormatHint: value.mediaFormatHint ?? null,
      comment: value.comment ?? null,
      conceptIds: value.conceptIds,
      entities: entities.map((entity) => ({
        ...(entity.id ? { id: entity.id } : {}),
        name: entity.name,
        businessObject: entity.businessObject,
        businessObjectVersionId: entity.businessObjectVersionId ?? null,
        comment: entity.comment,
        position: entity.order,
        fields: entity.fields.map((field) => ({
          ...(field.id ? { id: field.id } : {}),
          businessObject: field.businessObject,
          businessObjectVersionId: field.businessObjectVersionId ?? null,
          name: field.name,
          dataType: field.dataType,
          length: field.length,
          shortDescription: field.shortDescription,
          comment: field.comment,
          sourceSystem: field.sourceSystem,
          classification: field.classification,
          precision: field.precision,
          decimalPlaces: field.decimalPlaces,
          valueListConceptId: field.valueListConceptId,
          primaryConceptId: field.primaryConceptId,
          nullable: field.nullable,
          minCount: field.minCount,
          maxCount: field.maxCount,
          position: field.order,
          conceptIds: field.conceptIds,
        })),
      })),
      distributions: value.distributions ?? [],
      dataServices: value.dataServices ?? [],
      assistanceProvenance: value.assistanceProvenance ?? [],
    };
  }

  private mappingPayload(value: AssetMappingWrite): Record<string, unknown> {
    return {
      logicalModelVersionId: value.logicalModelVersionId,
      physicalSnapshotId: value.physicalSnapshotId,
      mappingType: value.mappingType,
      classification: value.classification,
      transformationRule: value.transformationRule,
      comment: value.comment,
      responsibleUserId: value.responsibleUserId,
      validFrom: value.validFrom,
      validTo: value.validTo,
      logicalFieldVersionIds: value.logicalFieldVersionIds,
      physicalColumnIds: value.physicalColumnIds,
    };
  }

  private normalizeLogicalModel(value: unknown): LogicalModel {
    const root = asRecord(value);
    const version = asRecord(root['version'] ?? root['currentVersion'] ?? root);
    const localizations = asArray(root['localizations'] ?? version['localizations']).map(asRecord);
    const localized = (property: 'title' | 'description') => {
      const translations = languageMap(localizations, property);
      return translations.de || localizations.length
        ? translations
        : { ...translations, de: textValue(root[property] ?? version[property]) };
    };
    const entityRecords = asArray(root['entities'] ?? version['entities']).map(asRecord);
    const entities: LogicalEntity[] = entityRecords.map((entity, entityIndex) => {
      const entityRootId = textValue(entity['id'], `entity-${entityIndex + 1}`);
      const entityVersionId = textValue(entity['entityVersionId'] ?? entity['versionId'], entityRootId);
      const entityName = textValue(entity['name'], `Entitaet_${entityIndex + 1}`);
      const entityFields = asArray(entity['fields']).map((fieldValue, fieldIndex) => {
      const field = asRecord(fieldValue);
      const rootId = textValue(field['id'], `field-${entityIndex + 1}-${fieldIndex + 1}`);
      const versionId = textValue(field['fieldVersionId'] ?? field['versionId'], rootId);
      const conceptReferences = asArray(field['conceptReferences']).length
        ? asArray(field['conceptReferences']).map((reference) => this.normalizeConceptReference(reference))
        : stringArray(field['conceptIds']).map((conceptId) => this.normalizeConceptReference({ id: conceptId }));
      const valueListConceptId = nullableText(field['valueListConceptId']);
      return {
        id: versionId,
        rootId,
        versionId,
        businessObject: textValue(field['businessObject'], textValue(entity['businessObject'])),
        businessObjectVersionId: nullableText(field['businessObjectVersionId']),
        entityName,
        name: textValue(field['name'], `feld_${fieldIndex + 1}`),
        dataType: textValue(field['dataType'], 'xsd:string'),
        length: nullableNumber(field['length']),
        shortDescription: textValue(field['shortDescription']),
        comment: nullableText(field['comment']),
        sourceSystem: nullableText(field['sourceSystem']),
        classification: classificationValue(field['classification']),
        precision: nullableNumber(field['precision']),
        decimalPlaces: nullableNumber(field['decimalPlaces']),
        nullable: booleanValue(field['nullable'], true),
        minCount: numberValue(field['minCount'], booleanValue(field['nullable'], true) ? 0 : 1),
        maxCount: nullableNumber(field['maxCount']) ?? 1,
        order: numberValue(field['position'] ?? field['order'], fieldIndex + 1),
        valueListConcept: field['valueListConcept']
          ? this.normalizeConceptReference(field['valueListConcept'])
          : valueListConceptId ? this.normalizeConceptReference({ id: valueListConceptId }) : null,
        conceptReferences,
        primaryConceptId: nullableText(field['primaryConceptId']),
      };
      });
      return {
        id: entityVersionId,
        rootId: entityRootId,
        versionId: entityVersionId,
        name: entityName,
        businessObject: textValue(entity['businessObject'], entityName),
        businessObjectVersionId: nullableText(entity['businessObjectVersionId']),
        comment: nullableText(entity['comment']),
        order: numberValue(entity['position'] ?? entity['order'], entityIndex + 1),
        fields: entityFields,
      };
    });
    const fields = entities.flatMap((entity) => entity.fields);
    const status = statusValue(version['status'] ?? root['status']);
    const id = textValue(root['id'], 'unknown-model');
    const dataOwnerId = textValue(root['dataOwnerUserId'] ?? asRecord(root['dataOwner'])['id']);
    const deputyId = nullableText(root['deputyOwnerUserId'] ?? asRecord(root['deputyDataOwner'])['id']);
    const stewardId = nullableText(root['stewardUserId'] ?? asRecord(root['steward'])['id']);
    const creator = asRecord(root['creator']);
    const normalizedCreator: LogicalModel['creator'] = !root['creator'] ? null : (() => {
      switch (textValue(creator['type'])) {
        case 'InternalOrganisation': return {
          type: 'internal_organisation', organizationId: textValue(creator['organizationId']), englishName: textValue(creator['englishName']),
        };
        case 'InternalPerson': return { type: 'internal_person', userId: textValue(creator['userId']) };
        case 'ExternalOrganisationOrPerson': return {
          type: 'external_organisation_or_person', organizationName: textValue(creator['organizationName']), personName: nullableText(creator['personName']),
        };
        default: return { type: 'application', applicationName: textValue(creator['applicationName']) };
      }
    })();
    return {
      id,
      urn: textValue(root['urn'], `urn:daca:logical-model:${id}`),
      revision: numberValue(root['revision'], 1),
      lockVersion: numberValue(version['lockVersion'] ?? root['lockVersion'], 0),
      versionId: textValue(version['versionId'] ?? root['versionId'], id),
      reviewId: nullableText(root['reviewId'] ?? version['reviewId']),
      status,
      title: localized('title'),
      description: localized('description'),
      identifiers: stringArray(root['identifiers']),
      identifierMode: textValue(root['identifierMode']) === 'organization_derived' ? 'organization_derived' : 'manual',
      department: textValue(root['departmentCode'], 'VBS'),
      office: textValue(root['organizationUnitId'] ?? root['organizationId'], 'vbs-verteidigung'),
      dataDomain: namedReference(root['dataDomain'], textValue(root['dataDomainId']), textValue(root['dataDomainLabel'], textValue(root['dataDomainId']))),
      dataOwner: namedReference(root['dataOwner'], dataOwnerId, textValue(asRecord(root['dataOwner'])['displayName'], dataOwnerId)),
      deputyDataOwner: deputyId ? namedReference(root['deputyDataOwner'], deputyId, textValue(asRecord(root['deputyDataOwner'])['displayName'], deputyId)) : null,
      steward: stewardId ? namedReference(root['steward'], stewardId, textValue(asRecord(root['steward'])['displayName'], stewardId)) : null,
      creator: normalizedCreator,
      classification: classificationValue(root['dataClassification'] ?? root['classification']),
      dateCreated: textValue(root['dateCreated']),
      mediaFormats: stringArray(root['mediaFormats'] ?? (root['mediaFormatHint'] ? [root['mediaFormatHint']] : [])),
      entityName: entities[0]?.name ?? 'Entitaet_1',
      entities,
      fields,
      fieldCount: numberValue(root['fieldCount'], fields.length),
      hasPhysicalMapping: booleanValue(root['hasPhysicalMapping'], false),
      productId: nullableText(root['productId']),
      distributionIds: stringArray(root['distributionIds']).length
        ? stringArray(root['distributionIds'])
        : asArray(root['distributions']).map((item) => textValue(asRecord(item)['id'])).filter(Boolean),
      conceptReferences: asArray(root['conceptReferences']).length
        ? asArray(root['conceptReferences']).map((reference) => this.normalizeConceptReference(reference))
        : stringArray(root['conceptIds']).map((conceptId) => this.normalizeConceptReference({ id: conceptId })),
      predecessorVersionId: nullableText(version['predecessorVersionId']),
      contactPoints: asArray(root['contactPoints']).map((itemValue) => {
        const item = asRecord(itemValue);
        return { name: textValue(item['name']), email: nullableText(item['email']), uri: nullableText(item['uri']) };
      }),
      publisher: {
        name: textValue(asRecord(root['publisher'])['name']),
        identifier: nullableText(asRecord(root['publisher'])['identifier']),
        uri: nullableText(asRecord(root['publisher'])['uri']),
      },
      accessRights: textValue(root['accessRights'], 'urn:daca:access-rights:internal'),
      themes: stringArray(root['themes']),
      mediaFormatHint: nullableText(root['mediaFormatHint']),
      comment: nullableText(root['comment']),
      distributions: asArray(root['distributions']).map((itemValue) => {
        const item = asRecord(itemValue);
        return {
          id: nullableText(item['id']), title: asRecord(item['title']), accessUrl: nullableText(item['accessUrl']),
          downloadUrl: nullableText(item['downloadUrl']), mediaType: nullableText(item['mediaType']), format: nullableText(item['format']),
          licenseUri: nullableText(item['licenseUri']),
        };
      }),
      dataServices: asArray(root['dataServices']).map((itemValue) => {
        const item = asRecord(itemValue);
        return { id: nullableText(item['id']), title: asRecord(item['title']), endpointUrl: textValue(item['endpointUrl']), endpointDescription: nullableText(item['endpointDescription']) };
      }),
      assistanceProvenance: asArray(root['assistanceProvenance']).map((itemValue) => {
        const item = asRecord(itemValue);
        return {
          fieldPath: textValue(item['fieldPath']), language: nullableText(item['language']) as 'de'|'fr'|'it'|'en'|'rm'|null,
          provider: textValue(item['provider']) as 'deepl'|'termdat', sourceTextHash: textValue(item['sourceTextHash']),
          sourceIdentifier: nullableText(item['sourceIdentifier']), sourceUri: nullableText(item['sourceUri']),
          sourceModifiedAt: nullableText(item['sourceModifiedAt']), retrievedAt: textValue(item['retrievedAt']),
          payloadHash: textValue(item['payloadHash']), origin: textValue(item['origin']) as 'machine_translated'|'accepted_suggestion'|'edited'|'source_import',
        };
      }),
      createdBy: namedReference(root['createdBy'], textValue(root['createdByUserId']), textValue(asRecord(root['createdBy'])['displayName'], textValue(root['createdByUserId']))),
      createdAt: textValue(version['createdAt'] ?? root['createdAt']),
      updatedAt: textValue(version['updatedAt'] ?? root['updatedAt']),
    };
  }

  private normalizeConceptReference(value: unknown) {
    const item = asRecord(value);
    return {
      id: textValue(item['id']), identifier: textValue(item['identifier'] ?? asArray(item['identifiers'])[0]),
      uri: textValue(item['uri'] ?? item['sourceUrl']), version: textValue(item['version']),
      name: textValue(item['name'] ?? asRecord(item['name'])['de']),
      conceptType: conceptTypeValue(item['conceptType']), assignedAt: nullableText(item['assignedAt']),
    };
  }

  private normalizeDrift(value: unknown): DriftReport {
    const root = asRecord(value);
    const breakingKinds = new Set(['table_removed', 'column_removed', 'type_changed', 'nullability_changed']);
    return {
      id: textValue(root['id'], `drift-${textValue(root['currentSnapshotId'], 'snapshot')}`),
      sourceId: textValue(root['sourceId']),
      previousSnapshotId: textValue(root['previousSnapshotId']),
      currentSnapshotId: textValue(root['currentSnapshotId']),
      createdAt: textValue(root['createdAt']),
      changes: asArray(root['changes']).map((changeValue, index) => {
        const change = asRecord(changeValue);
        const kind = textValue(change['changeType'] ?? change['kind'], 'column_added') as DriftReport['changes'][number]['kind'];
        const assetKey = textValue(change['assetKey']);
        const keyParts = assetKey.split('.').filter(Boolean);
        const before = asRecord(change['before']);
        const after = asRecord(change['after']);
        const scalar = (record: Record<string, unknown>): string | null => {
          for (const key of ['name', 'rawDataType', 'normalizedDataType', 'characterLength', 'numericPrecision', 'numericScale', 'nullable']) {
            if (record[key] !== undefined && record[key] !== null) return String(record[key]);
          }
          return Object.keys(record).length ? JSON.stringify(record) : null;
        };
        return {
          id: textValue(change['id'], `drift-change-${index + 1}`), kind,
          severity: breakingKinds.has(kind) ? 'breaking' as const : kind === 'table_added' || kind === 'column_added' ? 'info' as const : 'warning' as const,
          tableName: keyParts.slice(0, -1).join('.') || assetKey || 'Unbekanntes Asset',
          columnName: keyParts.length > 1 ? keyParts.at(-1) ?? null : null,
          previousValue: scalar(before), currentValue: scalar(after),
          confidence: nullableNumber(change['confidence']),
          impactedMappingIds: stringArray(change['impactedMappingIds']),
          impactedLogicalFieldIds: stringArray(change['impactedLogicalFieldIds']),
          resolved: !['pending', ''].includes(textValue(change['reviewStatus'])),
        };
      }),
    };
  }

  private normalizePhysicalSnapshot(value: unknown): PhysicalSnapshot {
    const root = asRecord(value);
    const snapshot = asRecord(root['snapshot'] ?? root);
    const databases = asArray(root['databases']);
    const tables = databases.flatMap((databaseValue) => {
      const database = asRecord(databaseValue);
      return asArray(database['schemas']).flatMap((schemaValue) => {
        const schema = asRecord(schemaValue);
        return asArray(schema['tables']).map((tableValue) => {
          const table = asRecord(tableValue);
          const kind = textValue(table['kind'], 'table');
          return {
            id: textValue(table['id']), schemaName: textValue(schema['name']), name: textValue(table['name']),
            kind: (['table', 'view', 'materialized_view', 'parquet'].includes(kind) ? kind : 'table') as PhysicalTable['kind'],
            storageLocation: nullableText(table['storageLocation']), mediaType: nullableText(table['mediaType']),
            objectCount: nullableNumber(table['objectCount']), sizeBytes: nullableNumber(table['sizeBytes']),
            schemaConfidence: (['declared', 'embedded', 'inferred'].includes(textValue(table['schemaConfidence'])) ? textValue(table['schemaConfidence']) : null) as PhysicalTable['schemaConfidence'],
            partitionKeys: stringArray(table['partitionKeys']),
            columns: asArray(table['columns']).map((columnValue, index) => {
              const column = asRecord(columnValue);
              return {
                id: textValue(column['id']), name: textValue(column['name']),
                ordinalPosition: numberValue(column['ordinalPosition'], index + 1),
                dataType: textValue(column['normalizedDataType'] ?? column['rawDataType']),
                length: nullableNumber(column['characterLength']), precision: nullableNumber(column['numericPrecision']),
                scale: nullableNumber(column['numericScale']), nullable: booleanValue(column['nullable'], true),
                comment: nullableText(column['comment']),
              };
            }),
          };
        });
      });
    });
    const firstDatabase = asRecord(databases[0]);
    const sourceType = textValue(snapshot['sourceAdapterType'], 'fixture') as PhysicalSnapshot['sourceType'];
    return {
      id: textValue(snapshot['id']), sourceId: textValue(snapshot['sourceId']), sourceName: textValue(snapshot['sourceName'], textValue(snapshot['sourceId'])), sourceType,
      systemName: sourceType === 's3' ? 'S3 Object Storage' : 'PostgreSQL', databaseName: textValue(firstDatabase['name'], textValue(root['databaseName'])),
      revision: numberValue(snapshot['sequence'], numberValue(snapshot['revision'], 1)), contentHash: textValue(snapshot['fingerprint'] ?? snapshot['contentHash']),
      importedAt: textValue(snapshot['importedAt']), importedBy: namedReference(snapshot['importedBy'], textValue(snapshot['importedByUserId']), textValue(snapshot['importedByUserId'])),
      tables, previousSnapshotId: nullableText(snapshot['predecessorSnapshotId'] ?? snapshot['previousSnapshotId']),
      driftCount: numberValue(root['driftCount'] ?? asRecord(root['summary'])['total'], 0),
    };
  }

  private normalizePhysicalSource(value: unknown): PhysicalSource {
    const item = asRecord(value);
    const connector = textValue(item['connectorType'] ?? item['adapterType'] ?? item['adapterKind']);
    const connectorType = (['fixture', 'postgresql', 's3'].includes(connector) ? connector : 'postgresql') as PhysicalSource['connectorType'];
    return {
      id: textValue(item['id']), revision: numberValue(item['revision'], 1), name: textValue(item['name'], textValue(item['displayName'], 'PostgreSQL-Quelle')),
      connectorType,
      systemName: textValue(item['systemName'], connectorType === 's3' ? 'S3 Object Storage' : 'PostgreSQL'), databaseName: textValue(item['databaseName']),
      department: textValue(item['departmentCode'], 'VBS'), office: textValue(item['organizationId'], 'vbs-verteidigung'),
      latestSnapshot: item['latestSnapshot'] ? this.normalizePhysicalSnapshot(item['latestSnapshot']) : null,
      updatedAt: textValue(item['updatedAt']),
    };
  }

  private normalizeMapping(value: unknown): AssetMapping {
    const item = asRecord(value);
    const validation = item['validationResult'] ? asRecord(item['validationResult']) : null;
    return {
      id: textValue(item['id']), versionId: textValue(item['versionId'], textValue(item['id'])), lockVersion: numberValue(item['lockVersion'], 0),
      logicalModelId: textValue(item['logicalModelId']), logicalModelVersion: numberValue(item['logicalModelVersion'], 0),
      logicalModelVersionId: textValue(item['logicalModelVersionId']), logicalFieldVersionIds: stringArray(item['logicalFieldVersionIds']),
      physicalSnapshotId: textValue(item['physicalSnapshotId']), physicalColumnIds: stringArray(item['physicalColumnIds']),
      mappingType: mappingTypeValue(item['mappingType']), classification: classificationValue(item['classification']), transformationRule: nullableText(item['transformationRule']), comment: nullableText(item['comment']),
      responsibleUserId: textValue(item['responsibleUserId']), responsibleName: textValue(item['responsibleName'], textValue(item['responsibleUserId'])),
      validFrom: textValue(item['validFrom']), validTo: nullableText(item['validTo']), status: mappingStatusValue(item['status']),
      version: numberValue(item['revision'], numberValue(item['version'], 1)), predecessorId: nullableText(item['predecessorId']),
      validationResult: validation ? {
        valid: booleanValue(validation['valid'], false),
        issues: asArray(validation['issues']).map((issueValue) => {
          const issue = asRecord(issueValue);
          return { code: textValue(issue['code']), severity: textValue(issue['severity']) === 'error' ? 'error' as const : 'warning' as const,
            message: textValue(issue['message']), logicalFieldVersionId: nullableText(issue['logicalFieldVersionId']), physicalColumnId: nullableText(issue['physicalColumnId']) };
        }),
      } : null,
      lastValidatedAt: nullableText(item['lastValidatedAt']), lastDriftCheckAt: nullableText(item['lastDriftCheckAt']),
      createdBy: namedReference(item['createdBy'], textValue(item['createdByUserId']), textValue(asRecord(item['createdBy'])['displayName'], textValue(item['createdByUserId']))),
      createdAt: textValue(item['createdAt']), updatedAt: textValue(item['updatedAt']),
    };
  }

  private identitySafe<T>(request: Observable<T>): Observable<T> {
    const requestedIdentity = this.identity.userId();
    return request.pipe(
      timeout(8000),
      map((body) => {
        this.assertIdentity(requestedIdentity);
        return body;
      }),
      catchError((error: unknown) => throwError(() => this.presentError(error))),
    );
  }

  private identitySafeResponse<T>(request: Observable<HttpResponse<T>>): Observable<ApiResult<T>> {
    return this.identitySafe(request).pipe(map((response) => {
      if (!response.body) throw new ModelingApiError('unknown', 502, 'Die Katalog-API hat keine Modelldaten geliefert.');
      return { body: response.body, etag: response.headers.get('etag') ?? `"${this.lockVersion(response.body)}"` };
    }));
  }

  private lockVersion(body: unknown): number {
    if (!body || typeof body !== 'object' || !('lockVersion' in body)) return 0;
    return Number((body as { lockVersion: unknown }).lockVersion) || 0;
  }

  private writeHeaders(etag: string): HttpHeaders {
    return this.identity.headers().set('If-Match', etag || '"0"');
  }

  private downloadFilename(contentDisposition: string | null, fallback: string): string {
    if (!contentDisposition) return fallback;
    const encoded = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition)?.[1];
    const plain = /filename="?([^";]+)"?/i.exec(contentDisposition)?.[1];
    try { return decodeURIComponent(encoded ?? plain ?? fallback); } catch { return plain ?? fallback; }
  }

  private assertIdentity(expected: string): void {
    if (this.identity.userId() !== expected) {
      throw new ModelingApiError('permission', 403, 'Die Demo-Identität wurde während der Anfrage gewechselt. Veraltete Modelldaten wurden verworfen.');
    }
  }

  private presentError(error: unknown): ModelingApiError {
    if (error instanceof ModelingApiError) return error;
    if (!(error instanceof HttpErrorResponse)) return new ModelingApiError('unavailable', 0, 'Die Modelldaten sind derzeit nicht erreichbar. Es wurde nichts gespeichert.');
    if (error.status === 401 || error.status === 403) return new ModelingApiError('permission', error.status, 'Für diese Aktion fehlt die erforderliche Rolle oder Organisationszuordnung.');
    if (error.status === 404) return new ModelingApiError('not_found', 404, 'Das Modell oder Asset ist nicht mehr verfügbar.');
    const problem = asRecord(error.error);
    const detail = textValue(problem['detail']);
    const errorCode = nullableText(problem['errorCode']);
    const suggestedAction = nullableText(problem['suggestedAction']);
    const requestId = nullableText(problem['requestId']) ?? nullableText(error.headers?.get('x-request-id'));
    const technical = asRecord(problem['technicalDetails']);
    const technicalDetails = technical['category'] && technical['sqlState'] && technical['constraint'] && technical['timestamp']
      ? { category: textValue(technical['category']), sqlState: textValue(technical['sqlState']), constraint: textValue(technical['constraint']), timestamp: textValue(technical['timestamp']) }
      : null;
    const issues = asArray(problem['errors']).map((item) => {
      const issue = asRecord(item);
      return {
        location: textValue(issue['location']),
        message: textValue(issue['message'], 'Der Wert ist ungültig.'),
        type: textValue(issue['type'], 'validation'),
      };
    }).filter((issue) => issue.location);
    if (error.status === 412) return new ModelingApiError('conflict', 412, detail || 'Eine neuere Version dieses Entwurfs liegt bereits vor.', issues, errorCode ?? 'DACA-LM-ETAG-CONFLICT', suggestedAction ?? 'Laden Sie den Entwurf neu und prüfen Sie Ihre Änderungen, bevor Sie erneut speichern.', requestId, technicalDetails);
    if (error.status === 428) return new ModelingApiError('conflict', 428, detail || 'Die Aktion enthält keinen gültigen Speicherstand der Modellversion.', issues, errorCode ?? 'DACA-LM-ETAG-REQUIRED', suggestedAction ?? 'Öffnen Sie den Entwurf erneut und versuchen Sie die Aktion nochmals.', requestId, technicalDetails);
    if (error.status === 409) return new ModelingApiError('conflict', 409, errorCode && detail ? detail : 'Die Änderung steht im Konflikt mit einem bestehenden Katalogeintrag.', issues, errorCode, suggestedAction ?? 'Prüfen Sie die Angaben und speichern Sie danach erneut.', requestId, technicalDetails);
    if (error.status === 422) return new ModelingApiError('validation', 422, errorCode && detail ? detail : 'Die Angaben sind unvollständig oder widersprüchlich. Bitte prüfen Sie die markierten Felder.', issues, errorCode, suggestedAction ?? 'Prüfen Sie die markierten Angaben und speichern Sie danach erneut.', requestId, technicalDetails);
    if (error.status === 0 || error.status === 503 || error.status === 504) return new ModelingApiError('unavailable', error.status, 'Die Katalog-API ist derzeit nicht erreichbar. Es wurde nichts gespeichert.');
    return new ModelingApiError('unknown', error.status, 'Die Aktion ist fehlgeschlagen. Es wurde nichts gespeichert.');
  }
}
