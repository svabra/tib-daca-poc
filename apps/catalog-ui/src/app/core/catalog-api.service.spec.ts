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
