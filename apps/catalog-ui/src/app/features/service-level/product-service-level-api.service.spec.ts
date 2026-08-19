import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DemoIdentityService } from '../../core/demo-identity.service';
import {
  ProductServiceLevelApiService,
  ServiceLevelApiError,
} from './product-service-level-api.service';
import {
  ServiceLevelDefinition,
  ServiceLevelRevision,
  ServiceLevelSummaryResponse,
} from './product-service-level.models';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const REVISION_ID = '22222222-2222-4222-8222-222222222222';
const DEFINITION: ServiceLevelDefinition = {
  templateVersion: 1,
  purposeAndSuitableUse: 'Kantonale Kennzahlen für freigegebene Steueranalysen.',
  availabilityCommitment: 'best_effort',
  freshnessToleranceBusinessDays: 5,
  supportWindow: { weekdays: ['monday', 'tuesday'], start: '08:00', end: '17:00', timezone: 'Europe/Zurich' },
  initialResponseTargetSupportHours: 8,
  plannedMaintenanceNoticeHours: 48,
  usageConditions: ['Nur für den genehmigten Zweck verwenden.'],
  knownLimitations: ['Best effort ohne technische Verfügbarkeitsmessung.'],
  nextReviewOn: '2027-01-31',
};
const OWNER = { displayName: 'Joel Ruod', organization: 'ESTV', role: 'data_owner' as const };
const CONTROLLER = { displayName: 'Thomas Kriegli', organization: 'ESTV', role: 'control_person' as const };
const REVISION: ServiceLevelRevision = {
  revisionId: REVISION_ID,
  dataProductId: PRODUCT_ID,
  revision: 1,
  lockVersion: 3,
  status: 'draft',
  source: 'owner_draft',
  validFrom: '2026-08-20',
  validUntil: null,
  effectiveValidUntil: null,
  definition: DEFINITION,
  owner: OWNER,
  controlPerson: CONTROLLER,
  createdAt: '2026-08-19T10:00:00Z',
  updatedAt: '2026-08-19T10:00:00Z',
  submittedAt: null,
  decidedAt: null,
  publishedAt: null,
  decision: null,
  rejectionReason: null,
  supersedesRevision: null,
  supersededByRevision: null,
  supersededFrom: null,
  changes: [],
};
const SUMMARY: ServiceLevelSummaryResponse = {
  dataProductId: PRODUCT_ID,
  asOf: '2026-08-19',
  source: 'platform_default',
  state: 'baseline',
  current: {
    revisionId: null,
    revision: 0,
    lockVersion: 0,
    status: 'baseline',
    source: 'platform_default',
    validFrom: '2026-08-13',
    validUntil: null,
    effectiveValidUntil: null,
    definition: DEFINITION,
    publishedAt: null,
  },
  nextScheduled: null,
  canEdit: true,
  canReview: false,
  owner: OWNER,
  controlPerson: CONTROLLER,
  legalReferences: [],
};

describe('ProductServiceLevelApiService', () => {
  const identityId = signal('joel.ruod');
  const identity = {
    userId: identityId,
    headers: computed(() => new HttpHeaders({ 'X-DaCa-User': identityId() })),
  };
  let api: ProductServiceLevelApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    identityId.set('joel.ruod');
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: DemoIdentityService, useValue: identity },
    ] });
    api = TestBed.inject(ProductServiceLevelApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('loads the safe summary and privileged revision history with the active demo identity', () => {
    let summary: ServiceLevelSummaryResponse | undefined;
    let latestRevision = -1;
    api.loadSummary(PRODUCT_ID).subscribe((value) => summary = value);
    api.loadRevisions(PRODUCT_ID).subscribe((value) => latestRevision = value.latestRevision);

    const summaryRequest = http.expectOne(`/api/v1/data-products/${PRODUCT_ID}/service-level`);
    const historyRequest = http.expectOne(`/api/v1/data-products/${PRODUCT_ID}/service-level/revisions`);
    expect(summaryRequest.request.headers.get('X-DaCa-User')).toBe('joel.ruod');
    expect(historyRequest.request.headers.get('X-DaCa-User')).toBe('joel.ruod');
    summaryRequest.flush(SUMMARY);
    historyRequest.flush({ items: [REVISION], detailLevel: 'privileged', latestRevision: 1, etag: '"1"' });

    expect(summary).toEqual(SUMMARY);
    expect(latestRevision).toBe(1);
  });

  it('uses the collection ETag and exact create payload for a new draft', () => {
    const value = { validFrom: REVISION.validFrom, validUntil: null, definition: DEFINITION };
    api.createRevision(PRODUCT_ID, value, '"7"').subscribe();

    const request = http.expectOne(`/api/v1/data-products/${PRODUCT_ID}/service-level/revisions`);
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('If-Match')).toBe('"7"');
    expect(request.request.body).toEqual(value);
    request.flush(REVISION, { headers: { ETag: '"3"' } });
  });

  it('uses the revision lock version for update, submit, withdraw and decision', () => {
    const value = { validFrom: REVISION.validFrom, validUntil: null, definition: DEFINITION };
    api.updateRevision(PRODUCT_ID, REVISION_ID, value, 3).subscribe();
    api.submitRevision(PRODUCT_ID, REVISION_ID, 3).subscribe();
    api.withdrawRevision(PRODUCT_ID, REVISION_ID, 3).subscribe();
    api.decideRevision(PRODUCT_ID, REVISION_ID, 3, 'reject', 'Die Gültigkeit muss präzisiert werden.').subscribe();

    const base = `/api/v1/data-products/${PRODUCT_ID}/service-level/revisions/${REVISION_ID}`;
    const update = http.expectOne(base);
    const submit = http.expectOne(`${base}/submit`);
    const withdraw = http.expectOne(`${base}/withdraw`);
    const decision = http.expectOne(`${base}/decision`);
    for (const request of [update, submit, withdraw, decision]) expect(request.request.headers.get('If-Match')).toBe('"3"');
    expect(update.request.method).toBe('PUT');
    expect(submit.request.body).toBeNull();
    expect(withdraw.request.body).toBeNull();
    expect(decision.request.body).toEqual({ decision: 'reject', reason: 'Die Gültigkeit muss präzisiert werden.' });
    update.flush(REVISION); submit.flush(REVISION); withdraw.flush(REVISION); decision.flush(REVISION);
  });

  it('updates the controller via the dedicated owner endpoint without sending a subject anywhere else', () => {
    api.updateControlPerson(PRODUCT_ID, 'thomas.kriegli', 9).subscribe();

    const request = http.expectOne(`/api/v1/data-products/${PRODUCT_ID}/control-person`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.headers.get('If-Match')).toBe('"9"');
    expect(request.request.body).toEqual({ controlPersonUserId: 'thomas.kriegli' });
    request.flush({ dataProductId: PRODUCT_ID, productRevision: 10, controlPerson: CONTROLLER });
  });

  it('maps an optimistic concurrency failure without leaking the backend response', () => {
    let error: ServiceLevelApiError | undefined;
    api.submitRevision(PRODUCT_ID, REVISION_ID, 3).subscribe({ error: (value) => error = value });
    http.expectOne(`/api/v1/data-products/${PRODUCT_ID}/service-level/revisions/${REVISION_ID}/submit`)
      .flush({ detail: 'internal row and actor detail' }, { status: 412, statusText: 'Precondition Failed' });

    expect(error?.kind).toBe('conflict');
    expect(error?.message).toContain('zwischenzeitlich geändert');
    expect(error?.message).not.toContain('internal row');
  });

  it('fails closed when the demo identity changes before a response completes', () => {
    let error: ServiceLevelApiError | undefined;
    api.loadSummary(PRODUCT_ID).subscribe({ error: (value) => error = value });
    const request = http.expectOne(`/api/v1/data-products/${PRODUCT_ID}/service-level`);
    identityId.set('beat.stalder');
    request.flush(SUMMARY);

    expect(error?.kind).toBe('permission');
    expect(error?.message).toContain('Demo-Identität');
  });
});
