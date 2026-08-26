import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataProduct, DomainSummary, GlossaryTermProposal, GlossaryTermSummary } from '../../core/catalog.models';
import { GlossaryProposalFormComponent } from './glossary-proposal-form.component';
import { GlossaryProposalNewComponent, queryDomainIds } from './glossary-proposal-new.component';

vi.mock('@bit-daca/design-system', async () => {
  const { Component } = await import('@angular/core');
  class StatusBadgeStub {}
  Component({ selector: 'daca-status-badge', standalone: true, template: '<ng-content />', inputs: ['tone'] })(StatusBadgeStub);
  return { StatusBadgeComponent: StatusBadgeStub };
});

const DOMAIN: DomainSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  urn: 'urn:daca:domain:defence',
  originCatalogId: 'catalog',
  revision: 1,
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
  termCount: 1,
  updatedAt: '2026-08-25T10:00:00Z',
};

const EXISTING_TERM: GlossaryTermSummary = {
  id: '22222222-2222-4222-8222-222222222222',
  urn: 'urn:daca:glossary-term:armoured-vehicle',
  originCatalogId: 'catalog',
  revision: 1,
  status: 'active',
  preferredLabel: 'Gepanzertes Fahrzeug',
  definition: 'Geschütztes Fahrzeug.',
  labels: [{ language: 'de', preferredLabel: 'Gepanzertes Fahrzeug', alternativeLabels: ['GepFz'], definition: 'Geschütztes Fahrzeug.' }],
  domains: [DOMAIN],
  relations: [],
  updatedAt: '2026-08-25T10:00:00Z',
};

const PRODUCT = {
  id: '44444444-4444-4444-8444-444444444444',
  title: 'Flottenbestand gepanzerte Fahrzeuge',
  ownerUserId: 'sandro.wenger',
  deputyOwnerUserId: 'lea.hofmann',
  domains: [DOMAIN],
} as DataProduct;

const PROPOSAL: GlossaryTermProposal = {
  id: '55555555-5555-4555-8555-555555555555',
  operation: 'create',
  targetTermId: null,
  sourceProductId: PRODUCT.id,
  autoAttach: true,
  revision: 1,
  status: 'in_review',
  requesterUserId: 'sandro.wenger',
  requesterName: 'Sandro Wenger',
  requestedPayload: {},
  reviewPayload: {},
  reviews: [],
  decisionComment: null,
  createdAt: '2026-08-26T10:00:00Z',
  updatedAt: '2026-08-26T10:00:00Z',
};

describe('GlossaryProposalNewComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('uses contextual query parameters and submits the reusable form with eligible auto-attach', async () => {
    const api = {
      loadDomains: vi.fn(() => of([DOMAIN])),
      loadGlossaryTerms: vi.fn(() => of([EXISTING_TERM])),
      loadProduct: vi.fn(() => of(PRODUCT)),
      createGlossaryTermProposal: vi.fn(() => of(PROPOSAL)),
    };
    await TestBed.configureTestingModule({
      imports: [GlossaryProposalNewComponent],
      providers: [
        provideRouter([]),
        { provide: CatalogApiService, useValue: api },
        { provide: DemoIdentityService, useValue: { userId: signal('sandro.wenger') } },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({ domainId: DOMAIN.id, domainIds: `${DOMAIN.id},unknown`, sourceProductId: PRODUCT.id, q: 'Gepanzertes Fahrzeug' })) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(GlossaryProposalNewComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const form = fixture.debugElement.query(By.directive(GlossaryProposalFormComponent)).componentInstance as GlossaryProposalFormComponent;

    expect(api.loadProduct).toHaveBeenCalledWith(PRODUCT.id);
    expect(form.initialDomainIds).toEqual([DOMAIN.id]);
    expect(form.form.controls.labelDe.value).toBe('Gepanzertes Fahrzeug');
    expect(form.form.controls.autoAttach.value).toBe(true);
    form.form.patchValue({ definitionDe: 'Geschütztes Fahrzeug.' });
    form.submit();

    expect(api.createGlossaryTermProposal).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'create',
      sourceProductId: PRODUCT.id,
      domainIds: [DOMAIN.id],
      autoAttach: true,
    }));
    expect(fixture.componentInstance.submitted()).toEqual(PROPOSAL);
  });

  it('parses singular and comma-separated domain parameters deterministically', () => {
    expect(queryDomainIds('one', 'two, one, three,')).toEqual(['one', 'two', 'three']);
  });

  it('reloads the target when a duplicate link changes termId on the reused route', async () => {
    const second = { ...EXISTING_TERM, id: '66666666-6666-4666-8666-666666666666', preferredLabel: 'Panzerfahrzeug', labels: [{ ...EXISTING_TERM.labels[0], preferredLabel: 'Panzerfahrzeug' }] };
    const params = new BehaviorSubject(convertToParamMap({ termId: EXISTING_TERM.id }));
    const api = {
      loadDomains: vi.fn(() => of([DOMAIN])),
      loadGlossaryTerms: vi.fn(() => of([EXISTING_TERM, second])),
      createGlossaryTermProposal: vi.fn(() => of(PROPOSAL)),
    };
    await TestBed.configureTestingModule({
      imports: [GlossaryProposalNewComponent],
      providers: [
        provideRouter([]),
        { provide: CatalogApiService, useValue: api },
        { provide: DemoIdentityService, useValue: { userId: signal('sandro.wenger') } },
        { provide: ActivatedRoute, useValue: { queryParamMap: params } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(GlossaryProposalNewComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.target()?.id).toBe(EXISTING_TERM.id);

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.componentInstance.selectTarget(second);
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { termId: second.id, q: null },
      queryParamsHandling: 'merge',
    }));

    params.next(convertToParamMap({ termId: second.id }));
    fixture.detectChanges();

    expect(fixture.componentInstance.target()?.id).toBe(second.id);
    const form = fixture.debugElement.query(By.directive(GlossaryProposalFormComponent)).componentInstance as GlossaryProposalFormComponent;
    expect(form.form.controls.labelDe.value).toBe('Panzerfahrzeug');
  });
});
