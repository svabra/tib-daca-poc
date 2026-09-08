import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { I14yConceptsApiService } from './i14y-concepts-api.service';
import { I14yConcept } from './i14y-concepts.models';

const CONCEPT: I14yConcept = {
  id: '89bc55cc-3858-4c13-a5c8-7dc935dff29b', identifiers: ['legalForm'],
  name: { de: 'Rechtsform', fr: '', it: '', en: '' }, description: { de: 'Rechtsform einer Organisation', fr: '', it: '', en: '' },
  conceptType: 'CodeList', publisher: null, version: '1.2.0', publicationLevel: 'public', registrationStatus: 'registered',
  themes: ['Unternehmen'], validFrom: null, validTo: null, conformsTo: [], constraints: {},
  codeList: { entryCount: 0, entriesLoaded: false }, sourceUrl: 'https://api.i14y.admin.ch/api/public/v1/concepts/89bc55cc-3858-4c13-a5c8-7dc935dff29b',
  detailLoaded: false, systemCreatedAt: null, systemModifiedAt: null, fetchedAt: '2026-09-07T12:00:00Z',
};

describe('I14yConceptsApiService', () => {
  let api: I14yConceptsApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    const userId = signal('cinthya.thor');
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: DemoIdentityService, useValue: {
        userId,
        headers: computed(() => new HttpHeaders({ 'X-DaCa-User': userId() })),
      } },
    ] });
    api = TestBed.inject(I14yConceptsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  it('forwards language and theme together with the remaining local-cache filters', () => {
    api.search({ query: 'recht', language: 'de', theme: ' Unternehmen ', conceptType: 'CodeList', publisher: 'BFS', status: 'registered' }).subscribe();

    const request = http.expectOne((candidate) => candidate.url === '/api/v1/i14y/concepts');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('X-DaCa-User')).toBe('cinthya.thor');
    expect(request.request.params.get('q')).toBe('recht');
    expect(request.request.params.get('language')).toBe('de');
    expect(request.request.params.get('theme')).toBe('Unternehmen');
    expect(request.request.params.get('conceptType')).toBe('CodeList');
    expect(request.request.params.get('publisher')).toBe('BFS');
    expect(request.request.params.get('status')).toBe('registered');
    request.flush({ items: [CONCEPT], total: 1 });
  });

  it('keeps reads cache-only and exposes detail refresh as the targeted POST contract', () => {
    api.load(CONCEPT.id).subscribe();
    const cached = http.expectOne(`/api/v1/i14y/concepts/${CONCEPT.id}`);
    expect(cached.request.method).toBe('GET');
    cached.flush(CONCEPT);

    api.refreshDetail(CONCEPT.id).subscribe();
    const refresh = http.expectOne(`/api/v1/i14y/concepts/${CONCEPT.id}/refresh`);
    expect(refresh.request.method).toBe('POST');
    expect(refresh.request.body).toBeNull();
    refresh.flush({ ...CONCEPT, detailLoaded: true });
  });

  it('synchronizes CodeList entries only through the explicit targeted POST', () => {
    api.syncCodeListEntries(CONCEPT.id).subscribe();
    const request = http.expectOne(`/api/v1/i14y/concepts/${CONCEPT.id}/code-list-entries/sync`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    expect(request.request.headers.get('X-DaCa-User')).toBe('cinthya.thor');
    request.flush([]);
  });
});
