import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { FALLBACK_PRODUCT } from '../../core/catalog.seed';
import { DomainSummary } from '../../core/catalog.models';
import { DomainDetailComponent } from './domain-detail.component';

vi.mock('@bit-daca/design-system', async () => {
  const { Component } = await import('@angular/core');
  class StatusBadgeStub {}
  Component({ selector: 'daca-status-badge', standalone: true, template: '<ng-content />', inputs: ['tone'] })(StatusBadgeStub);
  return { StatusBadgeComponent: StatusBadgeStub };
});

const DOMAIN_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const DOMAIN: DomainSummary = {
  id: DOMAIN_ID,
  urn: 'urn:daca:domain:defence',
  originCatalogId: 'catalog',
  revision: 2,
  status: 'active',
  preferredLabel: 'Verteidigung',
  definition: 'Fachliche Verteidigungsdaten',
  labels: [{ language: 'de', preferredLabel: 'Verteidigung', alternativeLabels: [], definition: 'Fachliche Verteidigungsdaten' }],
  ownerUserId: 'sibilla.micheli',
  ownerName: 'Sibilla Micheli',
  ownerOrganization: 'VBS',
  deputyOwnerUserId: 'sandro.wenger',
  deputyOwnerName: 'Sandro Wenger',
  deputyOwnerOrganization: 'BAZG',
  productCount: 1,
  termCount: 0,
  updatedAt: '2026-08-25T10:00:00Z',
};
const PRODUCT = {
  ...FALLBACK_PRODUCT,
  id: PRODUCT_ID,
  globalId: 'urn:daca:product:armoured-fleet',
  title: 'Flottenbestand gepanzerte Fahrzeuge',
  domains: [DOMAIN],
};

describe('DomainDetailComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads products through the domain endpoint and renders them in the accessible graph alternative', async () => {
    const api = {
      loadDomain: vi.fn(() => of(DOMAIN)),
      loadDataProductsForDomain: vi.fn(() => of([PRODUCT])),
      loadGlossaryTerms: vi.fn(() => of([])),
      loadDomainAuditEvents: vi.fn(() => of([])),
    };
    await TestBed.configureTestingModule({
      imports: [DomainDetailComponent],
      providers: [
        provideRouter([]),
        { provide: CatalogApiService, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: DOMAIN_ID }) } } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(DomainDetailComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const textAlternative = root.querySelector<HTMLElement>('.sr-only-graph');

    expect(api.loadDataProductsForDomain).toHaveBeenCalledOnce();
    expect(api.loadDataProductsForDomain).toHaveBeenCalledWith(DOMAIN_ID);
    expect(textAlternative?.textContent).toContain('Flottenbestand gepanzerte Fahrzeuge');
    expect(textAlternative?.textContent).toContain('Domain Verteidigung klassifiziert Produkt');
    expect(textAlternative?.querySelector<HTMLAnchorElement>('a')?.getAttribute('href'))
      .toBe(`/products/${PRODUCT_ID}/overview`);
    expect(root.querySelector('.semantic-graph')?.getAttribute('aria-label'))
      .toContain('mit 1 Produkten und 0 Termen');
  });
});
