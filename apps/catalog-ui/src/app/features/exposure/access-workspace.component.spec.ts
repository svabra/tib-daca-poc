import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { map, of, throwError } from 'rxjs';
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
    loadEffectiveAccess: vi.fn(() => of({granted:false,asOfDate:'2026-08-20',policyRevision:7,grants:[]})),
    loadProductAccessRequests: vi.fn(() => of([])),
    loadProductPermissions: vi.fn(() => consumers.pipe(map(rows=>({productId:PRODUCT_ID,asOfDate:'2026-08-20',policyRevision:7,latestRevision:7,state:'confirmed' as const,canManage:true,canRevoke:true,items:rows.flatMap(consumer=>consumer.grants.map(grant=>({grantId:grant.grantId,displayName:consumer.displayName,organization:consumer.organization,groupMembers:[],grant:{subject:{type:consumer.consumerType,id:consumer.identityId},actions:['data.read'],protocols:grant.protocol==='both'?['http' as const,'postgresql' as const]:[grant.protocol],validFrom:grant.validFrom,validUntil:grant.validUntil,dataVariant:grant.variant,metadataChannels:{kobyMcp:false,i14y:false}}})))})))),
    loadPermissionLog:vi.fn(()=>of({items:[],total:0})),
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

  it('offers a reader an initial request and personal status without requesting private owner lists or showing management links', async () => {
    const api = apiStub();
    api.identityUserId.mockReturnValue('jan.waser');
    api.product.update(product => ({...product,canManage:false}));
    const permissions = api.loadProductPermissions;
    const ownerRead = permissions.getMockImplementation()!;
    permissions.mockImplementation(() => ownerRead().pipe(map(state => ({...state,canManage:false,canRevoke:false}))));
    const {fixture} = await render(api);
    const root=fixture.nativeElement as HTMLElement;
    expect(api.loadProductAccessRequests).not.toHaveBeenCalled();
    expect(root.querySelector('daca-product-access-requests')).toBeNull();
    expect(root.querySelector('.product-overview-request-access')?.textContent).toBe('Zugriff anfragen');
    expect(root.querySelector('.product-overview-request-access')?.getAttribute('href')).toBe(`/products/${PRODUCT_ID}/access-request`);
    expect(root.textContent).toContain('keine gültige persönliche oder Gruppenfreigabe');
    expect(root.querySelector('.product-access-nav')?.textContent).not.toContain('Zugriff einstellen');
    expect(root.querySelector('.access-workspace-technical')).toBeNull();
    expect(root.querySelector('daca-product-permissions')).not.toBeNull();
  });

  it('shows expiring policy-authoritative entitlements with consumer and expiry context', async () => {
    const { fixture } = await render();
    const root = fixture.nativeElement as HTMLElement;
    const expiry = root.querySelector('#expiring-entitlements');

    expect(expiry?.textContent).toContain('Auslaufende Freigaben');
    expect(expiry?.textContent).toContain('Beat Stalder');
    expect(expiry?.textContent).toContain('Läuft in 14 Tagen ab');
    expect(expiry?.textContent).toContain('03.09.2026');
    expect(expiry?.textContent).toContain('aktuell aktiven Policy');
    expect(root.querySelector('.access-workspace-kpis a:nth-child(2) strong')?.textContent).toBe('1');
  });

  it('shows a truthful fail-closed error and no preview consumers when the API fails', async () => {
    const api = apiStub(throwError(() => new Error('private consumer payload')));
    const { fixture } = await render(api);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Berechtigungen konnten nicht verlässlich geladen werden');
    expect(root.textContent).not.toContain('Beat Stalder');
    expect(root.textContent).not.toContain('private consumer payload');
    expect(root.querySelector('#expiring-entitlements')).toBeNull();
    expect(root.querySelector('[role="alert"]')).not.toBeNull();
  });
});
