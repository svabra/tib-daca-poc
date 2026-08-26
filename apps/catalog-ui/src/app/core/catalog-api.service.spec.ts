import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CatalogApiService, resolveProductQuality } from './catalog-api.service';
import { DemoIdentityService } from './demo-identity.service';

describe('CatalogApiService quality normalization', () => {
  it('keeps the canonical list summary when stale detail metadata is hydrated', () => {
    const listSummary = resolveProductQuality(
      { medal: 'gold', score: 5 },
      undefined,
      false,
    );

    const hydratedSummary = resolveProductQuality(
      { medal: 'bronze', score: 1 },
      listSummary,
      true,
    );

    expect(hydratedSummary).toEqual({ qualityMedal: 'gold', qualityScore: 5 });
  });

  it('lets a fresh list response replace the previous cached summary', () => {
    const refreshedSummary = resolveProductQuality(
      { medal: 'platinum', score: 6 },
      { qualityMedal: 'bronze', qualityScore: 0 },
      false,
    );

    expect(refreshedSummary).toEqual({ qualityMedal: 'platinum', qualityScore: 6 });
  });
});

describe('CatalogApiService identity refresh', () => {
  const userId = signal('kassandra.valdata');
  const identity = {
    userId,
    users: computed(() => []),
    headers: computed(() => new HttpHeaders({ 'X-DaCa-User': userId() })),
    user: computed(() => ({
      id: userId(),
      displayName: userId(),
      organization: 'Test',
      email: `${userId()}@example.test`,
      phone: null,
      avatarUrl: null,
      roles: [],
    })),
  };

  beforeEach(() => {
    userId.set('kassandra.valdata');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DemoIdentityService, useValue: identity },
      ],
    });
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
  });

  it('keeps the newest identity data when older product, inbox and task requests finish later', () => {
    const api = TestBed.inject(CatalogApiService);
    const http = TestBed.inject(HttpTestingController);
    const kassandraRequests = requestsFor(http, 'kassandra.valdata');

    userId.set('beat.stalder');
    TestBed.tick();
    expect(api.products()).toEqual([]);
    expect(api.ownerAccessRequests()).toEqual([]);
    expect(api.ownedAccessConsumers()).toEqual([]);
    expect(api.workflowTasks()).toEqual([]);
    expect(api.product().title).toBe('Datenprodukt wird geladen');
    const beatRequests = requestsFor(http, 'beat.stalder');

    flushRefresh(beatRequests, 'Beat product', 'Beat inbox', 'Beat task');
    const beatDetailRequests = requestsFor(http, 'beat.stalder');
    flushProductDetail(beatDetailRequests, 'Beat product');
    flushRefresh(kassandraRequests, 'Kassandra product', 'Kassandra inbox', 'Kassandra task');

    expect(api.products().map((product) => product.title)).toEqual(['Beat product']);
    expect(api.ownerAccessRequests().map((request) => request.purpose)).toEqual(['Beat inbox']);
    expect(api.workflowTasks().map((task) => task.title)).toEqual(['Beat task']);
  });

  it('keeps a successful empty product result empty instead of exposing preview products', () => {
    const api = TestBed.inject(CatalogApiService);
    const http = TestBed.inject(HttpTestingController);
    const requests = requestsFor(http, 'kassandra.valdata');

    findRequest(requests, '/api/v1/data-products?limit=25').flush({ items: [], nextCursor: null });
    findRequest(requests, '/api/v1/access-requests/mine').flush([]);
    findRequest(requests, '/api/v1/access-consumers/owned').flush([]);
    findRequest(requests, '/api/v1/access-requests/inbox').flush([]);
    findRequest(requests, '/api/v1/tasks/mine').flush([]);

    expect(api.products()).toEqual([]);
    expect(api.usingFallback()).toBe(false);
    expect(api.loading()).toBe(false);
  });

  it('keeps the last owner inbox and exposes an unknown status when refresh fails', () => {
    const api = TestBed.inject(CatalogApiService);
    const http = TestBed.inject(HttpTestingController);
    flushRefresh(requestsFor(http, 'kassandra.valdata'), 'Owner product', 'Known owner request', 'Known task');
    flushProductDetail(requestsFor(http, 'kassandra.valdata'), 'Owner product');

    api.refreshOwnerAccessRequestInbox();
    http.expectOne('/api/v1/access-requests/inbox').flush(
      { detail: 'upstream unavailable' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    expect(api.ownerAccessRequests().map((request) => request.purpose)).toEqual(['Known owner request']);
    expect(api.ownerAccessRequestLoading()).toBe(false);
    expect(api.ownerAccessRequestError()).toContain('Aufgabenstatus ist unbekannt');
  });

  it('keeps the last approver tasks and exposes an unknown status when refresh fails', () => {
    const api = TestBed.inject(CatalogApiService);
    const http = TestBed.inject(HttpTestingController);
    flushRefresh(requestsFor(http, 'kassandra.valdata'), 'Approver product', 'Known owner request', 'Known approver task');
    flushProductDetail(requestsFor(http, 'kassandra.valdata'), 'Approver product');

    api.refreshWorkflowTasks();
    http.expectOne('/api/v1/tasks/mine').flush(
      { detail: 'upstream unavailable' },
      { status: 504, statusText: 'Gateway Timeout' },
    );

    expect(api.workflowTasks().map((task) => task.title)).toEqual(['Known approver task']);
    expect(api.workflowTasksLoading()).toBe(false);
    expect(api.workflowTasksError()).toContain('Aufgabenstatus ist unbekannt');
  });

  it('propagates forbidden policy evidence instead of returning the deterministic fallback policy', () => {
    const api = TestBed.inject(CatalogApiService);
    const http = TestBed.inject(HttpTestingController);
    flushRefresh(requestsFor(http, 'kassandra.valdata'), 'Protected product', 'Known owner request', 'Known task');
    flushProductDetail(requestsFor(http, 'kassandra.valdata'), 'Protected product');
    let status: number | null = null;

    api.loadPolicy().subscribe({ error: (error) => { status = error.status; } });
    http.expectOne('/api/v1/data-products/11111111-1111-4111-8111-111111111111/policies').flush(
      { detail: 'Forbidden' },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(status).toBe(403);
    expect(api.policyUsingFallback()).toBe(false);
  });

  it('discards a product detail response that belongs to the previous identity', () => {
    const api = TestBed.inject(CatalogApiService);
    const http = TestBed.inject(HttpTestingController);
    const kassandraRequests = requestsFor(http, 'kassandra.valdata');
    flushRefresh(kassandraRequests, 'Kassandra product', 'Kassandra inbox', 'Kassandra task');
    const staleDetailRequests = requestsFor(http, 'kassandra.valdata');

    userId.set('beat.stalder');
    TestBed.tick();
    const beatRequests = requestsFor(http, 'beat.stalder');
    flushRefresh(beatRequests, 'Beat product', 'Beat inbox', 'Beat task');
    const beatDetailRequests = requestsFor(http, 'beat.stalder');
    flushProductDetail(beatDetailRequests, 'Beat product');

    flushProductDetail(staleDetailRequests, 'Kassandra stale detail');

    expect(api.products().map((product) => product.title)).toEqual(['Beat product']);
    expect(api.product().title).toBe('Beat product');
  });

  it('keeps an explicitly routed product when the initial product list finishes later', () => {
    const selectedId = '3a2930ed-3eee-599b-82b5-e138b149d1a2';
    const api = TestBed.inject(CatalogApiService);
    const http = TestBed.inject(HttpTestingController);

    api.selectProduct(selectedId);
    flushProductDetailById(http, selectedId, 'Routed product');

    http.expectOne('/api/v1/data-products?limit=25').flush({
      items: [
        wireProduct('First list product'),
        wireProduct('Routed product', selectedId),
      ],
      nextCursor: null,
    });
    http.expectOne('/api/v1/access-requests/mine').flush([]);
    http.expectOne('/api/v1/access-consumers/owned').flush([]);
    flushProductDetailById(http, selectedId, 'Routed product');
    http.expectOne('/api/v1/access-requests/inbox').flush([]);
    http.expectOne('/api/v1/tasks/mine').flush([]);

    expect(api.product().id).toBe(selectedId);
    expect(api.product().title).toBe('Routed product');
    expect(api.product().createdAt).toBe('2026-08-13T08:00:00Z');
  });

  it('submits a renewal with only the opaque source grant and the two editable values', () => {
    userId.set('beat.stalder');
    const api = TestBed.inject(CatalogApiService);
    const http = TestBed.inject(HttpTestingController);
    const initialRequests = requestsFor(http, 'beat.stalder');
    flushRefresh(initialRequests, 'Beat product', 'Beat inbox', 'Beat task');
    flushProductDetail(requestsFor(http, 'beat.stalder'), 'Beat product');

    let createdNumber: string | null = null;
    api.createAccessRenewal('11111111-1111-4111-8111-111111111111', {
      sourceGrantId: 'policy-7-person-beat-rest',
      purpose: 'Kantonale Steuerstatistik für die Finanzplanung 2027 auswerten.',
      validUntil: '2027-09-03',
      conditionsAccepted: true,
    }).subscribe((created) => { createdNumber = created.requestNumber; });

    const request = http.expectOne('/api/v1/data-products/11111111-1111-4111-8111-111111111111/access-renewals');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('X-DaCa-User')).toBe('beat.stalder');
    expect(request.request.body).toEqual({
      sourceGrantId: 'policy-7-person-beat-rest',
      purpose: 'Kantonale Steuerstatistik für die Finanzplanung 2027 auswerten.',
      validUntil: '2027-09-03',
      conditionsAccepted: true,
    });
    expect(Object.keys(request.request.body).sort()).toEqual([
      'conditionsAccepted', 'purpose', 'sourceGrantId', 'validUntil',
    ]);
    request.flush({
      id: 'renewal-request',
      requestNumber: 'ZA-2026-RENEW',
      dataProductId: '11111111-1111-4111-8111-111111111111',
      purpose: 'Kantonale Steuerstatistik für die Finanzplanung 2027 auswerten.',
      status: 'submitted',
      updatedAt: '2026-08-20T08:00:00Z',
      createdAt: '2026-08-20T08:00:00Z',
    });

    expect(createdNumber).toBe('ZA-2026-RENEW');
  });

  it('maps the domain wire contract and nests domain and glossary proposal payloads', () => {
    const api = TestBed.inject(CatalogApiService);
    const http = TestBed.inject(HttpTestingController);
    flushRefresh(requestsFor(http, 'kassandra.valdata'), 'Product', 'Inbox', 'Task');
    flushProductDetail(requestsFor(http, 'kassandra.valdata'), 'Product');

    let domainLabel = '';
    api.loadDomains().subscribe((items) => { domainLabel = items[0]?.preferredLabel ?? ''; });
    http.expectOne('/api/v1/domains').flush([domainWire()]);
    expect(domainLabel).toBe('Verteidigung');
    expect(api.domains()[0]).toEqual(expect.objectContaining({ status: 'active', definition: 'Fachliche Verteidigungsdaten', ownerName: 'kassandra.valdata' }));

    api.createDomainChangeRequest({ operation: 'create', requestedPayload: { ownerUserId: 'sibilla.micheli', deputyOwnerUserId: 'sandro.wenger', localizations: [{ language: 'de', preferredLabel: 'Verteidigung', definition: 'Definition' }] } }).subscribe();
    const domainRequest = http.expectOne('/api/v1/domain-change-requests');
    expect(domainRequest.request.body).toEqual({ operation: 'create', targetDomainId: undefined, payload: { ownerUserId: 'sibilla.micheli', deputyOwnerUserId: 'sandro.wenger', localizations: [{ language: 'de', preferredLabel: 'Verteidigung', definition: 'Definition' }] } });
    domainRequest.flush({ id: 'request', operation: 'create', targetDomainId: null, requesterUserId: 'kassandra.valdata', status: 'submitted', requestedPayload: {}, reviewPayload: {}, revision: 1, decisionComment: null, createdAt: '', updatedAt: '' });

    api.createGlossaryTermProposal({ operation: 'create', sourceProductId: 'product', autoAttach: true, domainIds: ['domain'], labels: [{ language: 'de', preferredLabel: 'Fahrzeug', alternativeLabels: [], definition: 'Definition' }] }).subscribe();
    const termRequest = http.expectOne('/api/v1/glossary/term-proposals');
    expect(termRequest.request.body).toEqual({ operation: 'create', sourceProductId: 'product', autoAttach: true, payload: { domainIds: ['domain'], localizations: [{ language: 'de', preferredLabel: 'Fahrzeug', alternativeLabels: [], definition: 'Definition' }], relations: [] } });
    termRequest.flush({ id: 'proposal', operation: 'create', targetTermId: null, requesterUserId: 'kassandra.valdata', sourceProductId: 'product', autoAttach: true, status: 'in_review', requestedPayload: {}, reviewPayload: {}, revision: 1, decisionComment: null, reviews: [], createdAt: '', updatedAt: '' });
    http.expectOne('/api/v1/tasks/mine').flush([]);

    api.createGlossaryTermProposal({ operation: 'update', targetTermId: 'term', autoAttach: false, domainIds: ['domain'], labels: [{ language: 'de', preferredLabel: 'Geschütztes Fahrzeug', alternativeLabels: ['Panzerfahrzeug'], definition: 'Überarbeitete Definition' }], relations: [{ relation: 'exactMatch', targetUri: 'https://example.test/armored-vehicle' }] }).subscribe();
    const termUpdateRequest = http.expectOne('/api/v1/glossary/term-proposals');
    expect(termUpdateRequest.request.body).toEqual({ operation: 'update', targetTermId: 'term', sourceProductId: undefined, autoAttach: false, payload: { domainIds: ['domain'], localizations: [{ language: 'de', preferredLabel: 'Geschütztes Fahrzeug', alternativeLabels: ['Panzerfahrzeug'], definition: 'Überarbeitete Definition' }], relations: [{ relation: 'exactMatch', targetUri: 'https://example.test/armored-vehicle' }] } });
    termUpdateRequest.flush({ id: 'update-proposal', operation: 'update', targetTermId: 'term', requesterUserId: 'kassandra.valdata', sourceProductId: null, autoAttach: false, status: 'in_review', requestedPayload: {}, reviewPayload: {}, revision: 1, decisionComment: null, reviews: [], createdAt: '', updatedAt: '' });
    http.expectOne('/api/v1/tasks/mine').flush([]);
  });

  it('uses the domain-scoped review decision endpoint and maps taskKind', () => {
    const api = TestBed.inject(CatalogApiService);
    const http = TestBed.inject(HttpTestingController);
    const requests = requestsFor(http, 'kassandra.valdata');
    findRequest(requests, '/api/v1/data-products?limit=25').flush({ items: [], nextCursor: null });
    findRequest(requests, '/api/v1/access-requests/mine').flush([]);
    findRequest(requests, '/api/v1/access-consumers/owned').flush([]);
    findRequest(requests, '/api/v1/access-requests/inbox').flush([]);
    findRequest(requests, '/api/v1/tasks/mine').flush([{ id: 'info', taskType: 'glossary_term_decision', taskKind: 'information', status: 'open', assigneeUserId: 'kassandra.valdata', dataProductId: null, accessRequestId: null, title: 'Entscheid', detail: '', createdAt: '', updatedAt: '', completedAt: null }]);
    expect(api.workflowTasks()[0].kind).toBe('information');

    const proposal = { id: 'proposal', revision: 3 } as never;
    api.decideGlossaryTermProposal(proposal, 'domain', 'approve', 'Geprüft').subscribe();
    const decision = http.expectOne('/api/v1/glossary/term-proposals/proposal/reviews/domain/decision');
    expect(decision.request.headers.get('If-Match')).toBe('"3"');
    decision.flush({ id: 'proposal', operation: 'create', targetTermId: null, requesterUserId: 'kassandra.valdata', sourceProductId: null, autoAttach: false, status: 'accepted', requestedPayload: {}, reviewPayload: {}, revision: 3, decisionComment: null, reviews: [], createdAt: '', updatedAt: '' });
    http.expectOne('/api/v1/tasks/mine').flush([]);
    const refresh = http.match((request) => request.urlWithParams === '/api/v1/data-products?limit=25');
    expect(refresh.length).toBe(1);
    refresh[0].flush({ items: [], nextCursor: null });
    http.expectOne('/api/v1/access-requests/mine').flush([]);
    http.expectOne('/api/v1/access-consumers/owned').flush([]);
  });
});

function requestsFor(http: HttpTestingController, identity: string): TestRequest[] {
  return http.match((request) => request.headers.get('X-DaCa-User') === identity);
}

function findRequest(requests: readonly TestRequest[], url: string): TestRequest {
  const match = requests.find((request) => request.request.urlWithParams === url);
  if (!match) throw new Error(`Missing request ${url}`);
  return match;
}

function flushRefresh(
  requests: readonly TestRequest[],
  title: string,
  inboxPurpose: string,
  taskTitle: string,
): void {
  findRequest(requests, '/api/v1/data-products?limit=25').flush({
    items: [wireProduct(title)],
    nextCursor: null,
  });
  findRequest(requests, '/api/v1/access-requests/mine').flush([]);
  findRequest(requests, '/api/v1/access-consumers/owned').flush([]);
  findRequest(requests, '/api/v1/access-requests/inbox').flush([{ purpose: inboxPurpose }]);
  findRequest(requests, '/api/v1/tasks/mine').flush([{ title: taskTitle }]);
}

function flushProductDetail(requests: readonly TestRequest[], title: string): void {
  findRequest(requests, '/api/v1/data-products/11111111-1111-4111-8111-111111111111').flush(
    wireProduct(title),
    { headers: { ETag: '"1"' } },
  );
  findRequest(requests, '/api/v1/data-products/11111111-1111-4111-8111-111111111111/endpoints').flush([]);
}

function flushProductDetailById(
  http: HttpTestingController,
  productId: string,
  title: string,
): void {
  http.expectOne(`/api/v1/data-products/${productId}`).flush(
    wireProduct(title, productId),
    { headers: { ETag: '"1"' } },
  );
  http.expectOne(`/api/v1/data-products/${productId}/endpoints`).flush([]);
}

function wireProduct(
  title: string,
  id = '11111111-1111-4111-8111-111111111111',
): Record<string, unknown> {
  return {
    id,
    urn: 'urn:daca:test:product',
    revision: 1,
    title,
    description: `${title} description`,
    owner: 'Test owner',
    domain: 'Test domain',
    lifecycle: 'active',
    classification: 'internal',
    keywords: [],
    contact: { email: 'owner@example.test' },
    quality: { medal: 'gold', score: 5 },
    metadata: { deliveryProtocols: ['REST'], catalogUsage: {} },
    createdAt: '2026-08-13T08:00:00Z',
    updatedAt: '2026-08-19T08:00:00Z',
  };
}

function domainWire(): Record<string, unknown> {
  return { id: 'domain', urn: 'urn:daca:domain:defence', originCatalogId: 'catalog', revision: 1, lifecycle: 'active', ownerUserId: 'kassandra.valdata', deputyOwnerUserId: 'sandro.wenger', preferredLabel: 'Verteidigung', localizations: [{ language: 'de', preferredLabel: 'Verteidigung', definition: 'Fachliche Verteidigungsdaten', normalizedLabel: 'verteidigung' }], productCount: 1, termCount: 0, updatedAt: '2026-08-25T00:00:00Z' };
}
