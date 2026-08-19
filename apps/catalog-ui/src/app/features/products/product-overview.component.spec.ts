import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import type { DemoUser } from '../../core/demo-identity.service';
import { FALLBACK_PRODUCT } from '../../core/catalog.seed';
import { ProductServiceLevelApiService } from '../service-level/product-service-level-api.service';
import { ServiceLevelDefinition, ServiceLevelSummaryResponse } from '../service-level/product-service-level.models';
import { ProductOverviewComponent } from './product-overview.component';

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
  { id: 'joel.ruod', displayName: 'Joel Ruod', organization: 'ESTV', email: '', phone: null, avatarUrl: null, roles: ['data_owner', 'publication_approver'] },
  { id: 'thomas.bag', displayName: 'Thomas Kriegli', organization: 'BAG', email: '', phone: null, avatarUrl: null, roles: ['publication_approver'] },
  { id: 'thomas.estv', displayName: 'Thomas Kriegli', organization: 'ESTV', email: '', phone: null, avatarUrl: null, roles: ['publication_approver'] },
  { id: 'inactive.user', displayName: 'Inaktiv', organization: 'ESTV', email: '', phone: null, avatarUrl: null, roles: ['data_consumer'] },
];

async function render(canEdit = true, summaryFails = false) {
  const product = signal({ ...FALLBACK_PRODUCT, id: PRODUCT_ID, ownerUserId: 'joel.ruod', revision: 8 });
  const catalog = {
    product,
    products: signal([product()]),
    ownedAccessConsumers: signal([]),
    selectProduct: vi.fn(),
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
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: PRODUCT_ID }) } } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ProductOverviewComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, catalog, serviceLevelApi, product };
}

describe('ProductOverviewComponent SLA control person', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows the safe controller identity, organization and role and resolves duplicate names by organization', async () => {
    const { fixture, component } = await render();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Thomas Kriegli');
    expect(root.textContent).toContain('ESTV · Kontrollperson / Publication Approver');
    expect(component.selectedControlPersonId()).toBe('thomas.estv');
    expect(component.activePublicationApprovers().map((user) => user.id)).toEqual(['thomas.bag', 'thomas.estv']);
    expect(root.textContent).not.toContain('Inaktiv');
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
});
