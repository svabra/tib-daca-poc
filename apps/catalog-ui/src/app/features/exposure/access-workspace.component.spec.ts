import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { FALLBACK_PRODUCT } from '../../core/catalog.seed';
import { OwnedAccessConsumer } from '../../core/catalog.models';
import { AccessWorkspaceComponent } from './access-workspace.component';

vi.mock('@bit-daca/design-system', async () => {
  const { Component } = await import('@angular/core');
  class StatusBadgeStub {}
  Component({ selector: 'daca-status-badge', standalone: true, template: '<ng-content />', inputs: ['tone'] })(StatusBadgeStub);
  class GlossaryTermStub {}
  Component({ selector: 'daca-glossary-term', standalone: true, template: '', inputs: ['term'] })(GlossaryTermStub);
  return { StatusBadgeComponent: StatusBadgeStub, DacaGlossaryTermComponent: GlossaryTermStub };
});

const PRODUCT_ID = FALLBACK_PRODUCT.id;
const CONSUMERS: OwnedAccessConsumer[] = [{
  dataProductId: PRODUCT_ID,
  consumerType: 'person',
  identityId: 'beat.stalder',
  displayName: 'Beat Stalder',
  organization: 'Kanton St. Gallen',
  grants: [{
    grantId: 'grant-beat',
    policyRevision: 7,
    requestNumber: 'ZA-2026-BEAT',
    protocol: 'http',
    variant: 'original',
    validFrom: '2026-01-01',
    validUntil: '2026-09-03',
    purpose: 'Kantonale Finanzplanung',
    expiresInDays: 14,
    expiryState: 'expiringSoon',
  }],
}];

function apiStub(consumers = of<readonly OwnedAccessConsumer[]>(CONSUMERS)) {
  return {
    product: signal({ ...FALLBACK_PRODUCT, id: PRODUCT_ID }),
    ownerAccessRequests: signal([]),
    selectProduct: vi.fn(),
    identityUserId: vi.fn(() => 'kassandra.valdata'),
    loadOwnedAccessConsumers: vi.fn(() => consumers),
  };
}

async function render(api = apiStub()) {
  await TestBed.configureTestingModule({
    imports: [AccessWorkspaceComponent],
    providers: [
      provideRouter([]),
      { provide: CatalogApiService, useValue: api },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: PRODUCT_ID }) } } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AccessWorkspaceComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, api };
}

describe('AccessWorkspaceComponent access expiry', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows expiring policy-authoritative entitlements with consumer and expiry context', async () => {
    const { fixture } = await render();
    const root = fixture.nativeElement as HTMLElement;
    const expiry = root.querySelector('#expiring-entitlements');

    expect(expiry?.textContent).toContain('Auslaufende Freigaben');
    expect(expiry?.textContent).toContain('Beat Stalder');
    expect(expiry?.textContent).toContain('Läuft in 14 Tagen ab');
    expect(expiry?.textContent).toContain('03.09.2026');
    expect(expiry?.textContent).toContain('aktuell aktiven Policy');
    expect(root.textContent).toContain('1 aktiv');
  });

  it('shows a truthful fail-closed error and no preview consumers when the API fails', async () => {
    const api = apiStub(throwError(() => new Error('private consumer payload')));
    const { fixture } = await render(api);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Aktive Freigaben konnten nicht verlässlich geladen werden');
    expect(root.textContent).not.toContain('Beat Stalder');
    expect(root.textContent).not.toContain('private consumer payload');
    expect(root.querySelector('#expiring-entitlements')).toBeNull();
    expect(root.querySelector('[role="alert"]')).not.toBeNull();
  });
});
