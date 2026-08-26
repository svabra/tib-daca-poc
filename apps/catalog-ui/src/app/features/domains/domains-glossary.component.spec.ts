import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DomainSummary, GlossaryTermProposal, GlossaryTermSummary } from '../../core/catalog.models';
import { DomainsGlossaryComponent } from './domains-glossary.component';

vi.mock('@bit-daca/design-system', async () => {
  const { Component } = await import('@angular/core');
  class StatusBadgeStub {}
  Component({ selector: 'daca-status-badge', standalone: true, template: '<ng-content />', inputs: ['tone'] })(StatusBadgeStub);
  return { StatusBadgeComponent: StatusBadgeStub };
});

const DEFENCE: DomainSummary = {
  id: '11111111-1111-4111-8111-111111111111',
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
  termCount: 1,
  updatedAt: '2026-08-25T10:00:00Z',
};

const MOBILITY: DomainSummary = {
  ...DEFENCE,
  id: '22222222-2222-4222-8222-222222222222',
  urn: 'urn:daca:domain:mobility-logistics',
  preferredLabel: 'Mobilität & Logistik',
  labels: [{ language: 'de', preferredLabel: 'Mobilität & Logistik', alternativeLabels: [], definition: 'Mobilitätsdaten' }],
  definition: 'Mobilitätsdaten',
  ownerUserId: 'kassandra.valdata',
  ownerName: 'Kassandra Valdata',
};

const TERM: GlossaryTermSummary = {
  id: '33333333-3333-4333-8333-333333333333',
  urn: 'urn:daca:glossary-term:armoured-vehicle',
  originCatalogId: 'catalog',
  revision: 4,
  status: 'active',
  preferredLabel: 'Gepanzertes Fahrzeug',
  definition: 'Militärisches Landfahrzeug mit Schutzwirkung.',
  labels: [
    { language: 'de', preferredLabel: 'Gepanzertes Fahrzeug', alternativeLabels: ['Panzerfahrzeug'], definition: 'Militärisches Landfahrzeug mit Schutzwirkung.' },
    { language: 'en', preferredLabel: 'Armored Vehicle', alternativeLabels: ['Armoured Vehicle'], definition: 'Protected military land vehicle.' },
    { language: 'fr', preferredLabel: 'Véhicule blindé', alternativeLabels: [], definition: 'Véhicule militaire protégé.' },
  ],
  domains: [DEFENCE, MOBILITY],
  relations: [{ id: 'relation', relationType: 'exactMatch', targetTermId: null, targetUri: 'https://example.test/armored-vehicle', targetLabel: 'Armored vehicle' }],
  updatedAt: '2026-08-25T10:00:00Z',
};

const PROPOSAL: GlossaryTermProposal = {
  id: '44444444-4444-4444-8444-444444444444',
  operation: 'update',
  targetTermId: TERM.id,
  sourceProductId: null,
  autoAttach: false,
  revision: 1,
  status: 'in_review',
  requesterUserId: 'sandro.wenger',
  requesterName: 'Sandro Wenger',
  requestedPayload: {},
  reviewPayload: {},
  reviews: [],
  decisionComment: null,
  createdAt: '2026-08-25T10:00:00Z',
  updatedAt: '2026-08-25T10:00:00Z',
};

function apiStub() {
  return {
    loadDomains: vi.fn(() => of([DEFENCE, MOBILITY])),
    loadGlossaryTerms: vi.fn(() => of([TERM])),
    loadDomainChangeRequests: vi.fn(() => of([])),
    loadGlossaryTermProposals: vi.fn(() => of([])),
    createGlossaryTermProposal: vi.fn(() => of(PROPOSAL)),
  };
}

async function render() {
  const api = apiStub();
  const user = signal({
    id: 'sandro.wenger',
    displayName: 'Sandro Wenger',
    organization: 'BAZG',
    email: 'sandro.wenger@example.test',
    phone: null,
    avatarUrl: null,
    roles: ['data_owner', 'data_consumer'],
  });
  const identity = { user, userId: signal('sandro.wenger') };
  await TestBed.configureTestingModule({
    imports: [DomainsGlossaryComponent],
    providers: [
      provideRouter([]),
      { provide: CatalogApiService, useValue: api },
      { provide: DemoIdentityService, useValue: identity },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(DomainsGlossaryComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, api };
}

describe('DomainsGlossaryComponent term lifecycle proposals', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('prefills an accepted term and submits an update proposal without losing other labels or relations', async () => {
    const { fixture, api } = await render();
    const component = fixture.componentInstance;
    component.tab.set('terms');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const updateButton = [...root.querySelectorAll<HTMLButtonElement>('.term-actions button')]
      .find((button) => button.textContent?.includes('Änderung vorschlagen'));

    expect(updateButton).toBeTruthy();
    updateButton!.click();
    fixture.detectChanges();
    expect(component.termRequestForm.controls.labelDe.value).toBe('Gepanzertes Fahrzeug');
    expect(component.termRequestForm.controls.labelEn.value).toBe('Armored Vehicle');
    expect(component.selectedTermDomainIds()).toEqual([DEFENCE.id, MOBILITY.id]);

    component.termRequestForm.patchValue({ labelDe: 'Geschütztes Fahrzeug', alternativeLabelsDe: 'Panzerfahrzeug, Schutzfahrzeug' });
    component.toggleTermDomain(MOBILITY.id, false);
    component.submitTermUpdate();

    expect(api.createGlossaryTermProposal).toHaveBeenCalledWith({
      operation: 'update',
      targetTermId: TERM.id,
      autoAttach: false,
      domainIds: [DEFENCE.id],
      labels: [
        { language: 'de', preferredLabel: 'Geschütztes Fahrzeug', alternativeLabels: ['Panzerfahrzeug', 'Schutzfahrzeug'], definition: TERM.labels[0].definition },
        { language: 'en', preferredLabel: 'Armored Vehicle', alternativeLabels: ['Armoured Vehicle'], definition: TERM.labels[1].definition },
        TERM.labels[2],
      ],
      relations: [{ relation: 'exactMatch', targetUri: 'https://example.test/armored-vehicle' }],
    });
    expect(component.termRequestOpen()).toBe(false);
    expect(component.tab()).toBe('governance');
    expect(component.notice()).toContain('Änderungsantrag');
  });

  it('submits a confirmed retirement proposal with the existing governed payload', async () => {
    const { fixture, api } = await render();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    fixture.componentInstance.requestTermRetirement(TERM);

    expect(api.createGlossaryTermProposal).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'retire',
      targetTermId: TERM.id,
      autoAttach: false,
      domainIds: [DEFENCE.id, MOBILITY.id],
      labels: TERM.labels,
      relations: [{ relation: 'exactMatch', targetUri: 'https://example.test/armored-vehicle' }],
    }));
    expect(fixture.componentInstance.tab()).toBe('governance');
    expect(fixture.componentInstance.notice()).toContain('Stilllegungsantrag');
    confirm.mockRestore();
  });
});
