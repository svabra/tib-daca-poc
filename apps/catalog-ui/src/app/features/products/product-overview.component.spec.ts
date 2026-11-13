import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DomainSummary, ProductEffectiveAccessGrant, ProductEffectiveAccessResponse } from '../../core/catalog.models';
import { DemoIdentityService } from '../../core/demo-identity.service';
import type { DemoUser } from '../../core/demo-identity.service';
import { FALLBACK_PRODUCT } from '../../core/catalog.seed';
import { ProductServiceLevelApiService } from '../service-level/product-service-level-api.service';
import { ServiceLevelDefinition, ServiceLevelSummaryResponse } from '../service-level/product-service-level.models';
import { ProductOverviewComponent } from './product-overview.component';
import { ProductCommentsApiService } from './product-comments-api.service';

vi.mock('@bit-daca/design-system', async () => {
  const { Component } = await import('@angular/core');
  class StatusBadgeStub {}
  Component({ selector: 'daca-status-badge', standalone: true, template: '<ng-content />', inputs: ['tone'] })(StatusBadgeStub);
  return { StatusBadgeComponent: StatusBadgeStub };
});

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const DEFINITION: ServiceLevelDefinition = {
  templateVersion: 1,
  purposeAndSuitableUse: 'Kantonale Kennzahlen für freigegebene Steueranalysen.',
  availabilityCommitment: 'best_effort',
  freshnessToleranceBusinessDays: 5,
  supportWindow: { weekdays: ['monday'], start: '08:00', end: '17:00', timezone: 'Europe/Zurich' },
  initialResponseTargetSupportHours: 16,
  plannedMaintenanceNoticeHours: 48,
  usageConditions: ['Nur freigegebene Nutzung.'],
  knownLimitations: ['Best effort.'],
  nextReviewOn: '2027-08-19',
};
const OWNER = { displayName: 'Joel Ruod', organization: 'ESTV', role: 'data_owner' as const };
const CONTROLLER = { displayName: 'Thomas Kriegli', organization: 'ESTV', role: 'control_person' as const };
const PRODUCT_DOMAIN: DomainSummary = {
  id: '22222222-2222-4222-8222-222222222222',
  urn: 'urn:daca:domain:direct-federal-tax',
  originCatalogId: 'catalog',
  revision: 1,
  status: 'active',
  preferredLabel: 'Direkte Bundessteuer',
  definition: 'Fachdomain der direkten Bundessteuer.',
  labels: [],
  ownerUserId: 'joel.ruod',
  ownerName: 'Joel Ruod',
  ownerOrganization: 'ESTV',
  deputyOwnerUserId: 'kassandra.valdata',
  deputyOwnerName: 'Kassandra Valdata',
  deputyOwnerOrganization: 'ESTV',
  productCount: 1,
  termCount: 0,
  updatedAt: '2026-08-26T10:00:00Z',
};

function serviceLevelSummary(canEdit = true): ServiceLevelSummaryResponse {
  return {
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
    canEdit,
    canReview: false,
    owner: OWNER,
    controlPerson: CONTROLLER,
    legalReferences: [],
  };
}

const USERS: DemoUser[] = [
  { id: 'joel.ruod', displayName: 'Joel Ruod', organization: 'ESTV', email: '', phone: null, avatarUrl: '/assets/data-owners/joel-ruod.webp', roles: ['data_owner', 'publication_approver'] },
  { id: 'kassandra.valdata', displayName: 'Kassandra Valdata', organization: 'ESTV', email: '', phone: null, avatarUrl: '/assets/kassandra-valdata.webp', roles: ['data_owner'] },
  { id: 'thomas.bag', displayName: 'Thomas Kriegli', organization: 'BAG', email: '', phone: null, avatarUrl: null, roles: ['publication_approver'] },
  { id: 'thomas.estv', displayName: 'Thomas Kriegli', organization: 'ESTV', email: '', phone: null, avatarUrl: null, roles: ['publication_approver'] },
  { id: 'inactive.user', displayName: 'Inaktiv', organization: 'ESTV', email: '', phone: null, avatarUrl: null, roles: ['data_consumer'] },
];

async function render(canEdit = true, summaryFails = false) {
  const product = signal({ ...FALLBACK_PRODUCT, canManage: canEdit, id: PRODUCT_ID, ownerUserId: 'joel.ruod', deputyOwnerUserId: 'kassandra.valdata', revision: 8, domains: [PRODUCT_DOMAIN] });
  const catalog = {
    product,
    products: signal([product()]),
    ownedAccessConsumers: signal([]),
    selectProduct: vi.fn(),
    identityUserId: () => identity.userId(),
    loadEffectiveAccess: vi.fn((_id:string):Observable<ProductEffectiveAccessResponse> => of({granted:false,asOfDate:'2026-11-12',policyRevision:null,grants:[]})),
    loadProduct: vi.fn(() => {
      product.update((value) => ({ ...value, revision: value.revision + 1 }));
      return of(product());
    }),
  };
  const serviceLevelApi = {
    loadSummary: vi.fn(() => summaryFails
      ? throwError(() => new Error('subjectId=must-not-leak'))
      : of(serviceLevelSummary(canEdit))),
    updateControlPerson: vi.fn(() => of({ dataProductId: PRODUCT_ID, productRevision: 9, controlPerson: CONTROLLER })),
  };
  const identity = { userId: signal('joel.ruod'), users: signal<readonly DemoUser[]>(USERS) };
  await TestBed.configureTestingModule({
    imports: [ProductOverviewComponent],
    providers: [
      provideRouter([]),
      { provide: CatalogApiService, useValue: catalog },
      { provide: ProductServiceLevelApiService, useValue: serviceLevelApi },
      { provide: DemoIdentityService, useValue: identity },
      { provide: ProductCommentsApiService, useValue: {list: () => Promise.resolve({items:[],canViewPrivate:false,nextOffset:null})} },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: PRODUCT_ID }) } } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ProductOverviewComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, catalog, serviceLevelApi, product, identity };
}

describe('ProductOverviewComponent SLA control person', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('links consumers directly from the heading to this product request and reacts to identity changes', async () => {
    const {fixture,identity,product}=await render();
    const root=fixture.nativeElement as HTMLElement;
    product.update(value=>({...value,additionalMetadata:{...value.additionalMetadata,catalogUsage:{responsibleUserIds:['joel.ruod']}}}));
    identity.userId.set('inactive.user');fixture.detectChanges();
    const link=root.querySelector<HTMLAnchorElement>('.product-overview-heading-actions .product-overview-request-access');
    expect(link?.textContent?.trim()).toBe('Zugriff anfragen');
    expect(link?.getAttribute('href')).toBe(`/products/${PRODUCT_ID}/access-request`);
    identity.userId.set('joel.ruod');fixture.detectChanges();
    expect(root.querySelector('.product-overview-request-access')).toBeNull();
    identity.userId.set('inactive.user');product.update(value=>({...value,id:'another-product'}));fixture.detectChanges();
    expect(root.querySelector('.product-overview-request-access')).toBeNull();
  });

  it('shows direct and group grants per endpoint and offers an access change instead of a new request', async () => {
    const {fixture,component,catalog,identity,product}=await render();
    const direct:ProductEffectiveAccessGrant={grantId:'direct',subjectType:'person',subjectDisplayName:'Jan Waser',subjectOrganization:'Kanton St. Gallen',groupId:null,
      protocols:['http'],dataVariant:'original',validFrom:'2026-11-01',validUntil:'2027-11-12',weeklyAvailability:null,purpose:null,expiresInDays:365,expiryState:'active',
      sourceRequestId:null,sourceRequestNumber:null,renewalEligibility:{eligible:false,reason:'sourceRequestUnavailable',renewalRequestId:null}};
    const group:ProductEffectiveAccessGrant={...direct,grantId:'group',subjectType:'group',subjectDisplayName:'Steueranalyse SG',groupId:'steueranalyse-sg',protocols:['postgresql'],dataVariant:'modified'};
    catalog.loadEffectiveAccess.mockReturnValue(of({granted:true,asOfDate:'2026-11-12',policyRevision:2,grants:[direct,group]}));
    identity.userId.set('jan.waser');fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    const action=root.querySelector<HTMLAnchorElement>('.product-overview-request-access')!;
    expect(action.textContent?.trim()).toBe('Zugriffänderung beantragen');
    expect(action.getAttribute('href')).toBe(`/products/${PRODUCT_ID}/access-request?intent=change`);
    expect(root.querySelector('.product-overview-heading-actions')?.textContent).not.toContain('Zugriff anfragen');
    const cards=[...root.querySelectorAll('.product-overview-endpoints article')];
    const rest=cards.find(card=>card.querySelector('.product-overview-endpoint-heading span')?.textContent==='HTTP / REST (JSON)')!;
    const postgres=cards.find(card=>card.querySelector('.product-overview-endpoint-heading span')?.textContent==='PostgreSQL')!;
    expect(rest.textContent).toContain('Individuell berechtigt · Jan Waser');
    expect(rest.textContent).toContain('Originaldaten');expect(rest.textContent).toContain('12.11.2027');
    expect(rest.textContent).not.toContain('Steueranalyse SG');
    expect(postgres.textContent).toContain('Über Gruppe · Steueranalyse SG');expect(postgres.textContent).toContain('Modifiziert / minimiert');
    expect(postgres.textContent).not.toContain('Jan Waser');
    expect(component.personalAccess.granted()).toBe(true);
    product.update(value=>({...value,id:'another-product'}));fixture.detectChanges();
    expect(root.querySelector('daca-product-endpoint-access')).toBeNull();
    expect(root.textContent).toContain('Schnittstellen werden geladen');
  });

  it('shows an unavailable status and no new request when permission lookup fails',async()=>{
    const {fixture,component,catalog,identity}=await render();
    catalog.loadEffectiveAccess.mockReturnValue(throwError(()=>new Error('private policy data')));
    identity.userId.set('jan.waser');fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(component.canRequestAccess()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Ihre Berechtigungen sind derzeit nicht verfügbar');
    expect(fixture.nativeElement.textContent).not.toContain('private policy data');
    expect(fixture.nativeElement.querySelector('.product-overview-request-access')).toBeNull();
    const heading=fixture.nativeElement.querySelector('.product-overview-heading-actions') as HTMLElement;
    expect(heading.querySelector('[role="alert"]')?.textContent).toContain('Zugriffsstatus');
    catalog.loadEffectiveAccess.mockReturnValue(of({granted:false,asOfDate:'2026-11-12',policyRevision:2,grants:[]}));
    heading.querySelector<HTMLButtonElement>('button')!.click();fixture.detectChanges();
    expect(heading.querySelector('.product-overview-request-access')?.textContent).toBe('Zugriff anfragen');
  });

  it('shows the safe controller identity, organization and role and resolves duplicate names by organization', async () => {
    const { fixture, component } = await render();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Thomas Kriegli');
    expect(root.textContent).toContain('ESTV · Kontrollperson / Publication Approver');
    expect(root.textContent).toContain('Joel Ruod · EFD ESTV');
    expect(root.querySelector<HTMLImageElement>('.product-overview-owner img')?.src).toContain('/assets/data-owners/joel-ruod.webp');
    const ownerPeople = root.querySelectorAll<HTMLElement>('.product-overview-owner-person');
    expect(ownerPeople).toHaveLength(2);
    expect(ownerPeople[1].textContent).toContain('Stv. Data Owner');
    expect(ownerPeople[1].textContent).toContain('Kassandra Valdata · EFD ESTV');
    expect(ownerPeople[1].querySelector<HTMLImageElement>('img')?.src).toContain('/assets/kassandra-valdata.webp');
    expect(component.selectedControlPersonId()).toBe('thomas.estv');
    expect(component.activePublicationApprovers().map((user) => user.id)).toEqual(['thomas.bag', 'thomas.estv']);
    expect(root.textContent).not.toContain('Inaktiv');
  });

  it('places the two small reader actions in the footer and hides management actions for non-owners', async () => {
    const {fixture,identity,product}=await render();
    const root=fixture.nativeElement as HTMLElement;
    expect([...root.querySelectorAll('.product-overview-actions a')].some(link=>link.textContent?.includes('Freigaben verwalten'))).toBe(true);
    identity.userId.set('thomas.estv');
    product.update(value=>({...value,canManage:false}));fixture.detectChanges();await fixture.whenStable();
    expect(root.textContent).not.toContain('Freigaben verwalten');
    expect(root.textContent).not.toContain('Metadaten bearbeiten');
    expect(root.querySelector('.product-overview-heading-actions a[href*="creation-requests"]')).toBeNull();
    const actions=root.querySelector('.product-overview-main .product-overview-feedback-actions')!;
    expect(actions.textContent).toContain('Abgeleitetes Datenprodukt beantragen');
    expect(actions.textContent).toContain('Kommentar zum Datenprodukt erfassen');
    expect(actions.querySelectorAll('.product-overview-small-action')).toHaveLength(2);
  });

  it('refreshes the product revision after saving so a second controller update is not stale', async () => {
    const { component, catalog, serviceLevelApi } = await render();

    component.selectedControlPersonId.set('thomas.estv');
    component.saveControlPerson();
    expect(serviceLevelApi.updateControlPerson).toHaveBeenNthCalledWith(1, PRODUCT_ID, 'thomas.estv', 8);
    expect(catalog.loadProduct).toHaveBeenCalledWith(PRODUCT_ID);
    expect(serviceLevelApi.loadSummary).toHaveBeenCalledTimes(2);

    component.selectedControlPersonId.set('thomas.bag');
    component.saveControlPerson();
    expect(serviceLevelApi.updateControlPerson).toHaveBeenNthCalledWith(2, PRODUCT_ID, 'thomas.bag', 9);
  });

  it('keeps controller editing owner-only while consumers still see the safe controller facts', async () => {
    const { fixture } = await render(false);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Thomas Kriegli');
    expect(root.textContent).toContain('Kontrollperson / Publication Approver');
    expect(root.querySelector('.product-overview-control-person')).toBeNull();
  });

  it('shows a safe retry instruction when controller assignment fails', async () => {
    const { fixture, component, serviceLevelApi } = await render();
    serviceLevelApi.updateControlPerson.mockReturnValue(throwError(() => new Error('subjectId=must-not-leak')));
    component.selectedControlPersonId.set('thomas.estv');
    component.saveControlPerson();
    fixture.detectChanges();

    expect(component.controlPersonError()).toContain('Bitte laden Sie die Produktübersicht neu');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('must-not-leak');
  });

  it('distinguishes an unavailable controller summary from a real empty assignment', async () => {
    const { fixture } = await render(false, true);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Kontrollperson derzeit nicht verfügbar');
    expect(root.textContent).not.toContain('Noch nicht zugewiesen');
    expect(root.textContent).not.toContain('must-not-leak');
    expect(root.querySelector('.product-overview-control-person')).toBeNull();
  });

  it('offers a quiet term proposal link with product and domain context', async () => {
    const { fixture, product } = await render();
    const root = fixture.nativeElement as HTMLElement;
    const link = root.querySelector<HTMLAnchorElement>('.product-overview-term-link');
    const domainIds = product().domains.map((domain) => domain.id).join(',');

    expect(link?.textContent?.trim()).toBe('Term fehlt?');
    expect(link?.getAttribute('href')).toBe(`/glossary/proposals/new?sourceProductId=${PRODUCT_ID}&domainIds=${encodeURIComponent(domainIds)}`);
  });
});
