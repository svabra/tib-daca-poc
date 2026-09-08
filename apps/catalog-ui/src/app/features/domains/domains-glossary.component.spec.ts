import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DomainSummary, GlossaryTermProposal, GlossaryTermSummary } from '../../core/catalog.models';
import { DomainsGlossaryComponent, resolveSemanticTab } from './domains-glossary.component';

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

  it('keeps the legacy tab query contract while route-specific pages remain authoritative', () => {
    expect(resolveSemanticTab('domains', 'terms')).toBe('terms');
    expect(resolveSemanticTab(undefined, 'governance')).toBe('governance');
    expect(resolveSemanticTab('terms', 'governance')).toBe('terms');
    expect(resolveSemanticTab('governance', 'terms')).toBe('governance');
  });

  it('shows a tab-aware create action and routes accepted-term updates through the central form', async () => {
    const { fixture } = await render();
    const component = fixture.componentInstance;
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.daca-page-heading button')?.textContent).toContain('Domain beantragen');
    component.tab.set('terms');
    fixture.detectChanges();

    const createLink = root.querySelector<HTMLAnchorElement>('.daca-page-heading a');
    const updateLink = root.querySelector<HTMLAnchorElement>('.term-actions a');
    expect(createLink?.textContent).toContain('Neuen Term vorschlagen');
    expect(createLink?.getAttribute('href')).toBe('/glossary/proposals/new');
    expect(updateLink?.textContent).toContain('Änderung vorschlagen');
    expect(updateLink?.getAttribute('href')).toBe(`/glossary/proposals/new?termId=${TERM.id}`);

    component.tab.set('governance');
    fixture.detectChanges();
    expect(root.querySelector('.daca-page-heading button')).toBeNull();
    expect(root.querySelector('.daca-page-heading a')).toBeNull();
  });

  it('exposes the sections as addressable navigation links with the current page announced', async () => {
    const { fixture } = await render();
    const component = fixture.componentInstance;
    const root = fixture.nativeElement as HTMLElement;
    const navigation = root.querySelector<HTMLElement>('.semantic-tabs');
    const links = [...root.querySelectorAll<HTMLAnchorElement>('.semantic-tabs > a')];

    expect(navigation?.getAttribute('role')).toBeNull();
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/domains',
      '/domains/terminology',
      '/domains/concepts',
      '/domains/themes',
      '/domains/governance',
    ]);
    expect(links[0].getAttribute('aria-current')).toBe('page');
    expect(links[2].getAttribute('aria-current')).toBeNull();

    component.tab.set('terms');
    fixture.detectChanges();
    expect(links[0].getAttribute('aria-current')).toBeNull();
    expect(links[1].getAttribute('aria-current')).toBe('page');
  });

  it('submits a confirmed retirement proposal with the existing governed payload', async () => {
    const { fixture, api } = await render();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const selectTab = vi.spyOn(fixture.componentInstance, 'selectTab').mockImplementation((tab) => fixture.componentInstance.tab.set(tab));

    fixture.componentInstance.requestTermRetirement(TERM);

    expect(api.createGlossaryTermProposal).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'retire',
      targetTermId: TERM.id,
      autoAttach: false,
      domainIds: [DEFENCE.id, MOBILITY.id],
      labels: TERM.labels,
      relations: [{ relation: 'exactMatch', targetUri: 'https://example.test/armored-vehicle' }],
    }));
    expect(selectTab).toHaveBeenCalledWith('governance');
    expect(fixture.componentInstance.tab()).toBe('governance');
    expect(fixture.componentInstance.notice()).toContain('Stilllegungsantrag');
    confirm.mockRestore();
  });

  it('finds every editable term by an alternative label and shows the abbreviation', async () => {
    const { fixture } = await render();
    const component = fixture.componentInstance;
    component.tab.set('terms');
    component.termQuery.set('Panzerfahrzeug');
    fixture.detectChanges();

    expect(component.filteredTerms()).toEqual([TERM]);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.semantic-card')?.textContent).toContain('Panzerfahrzeug');
    expect(root.querySelector<HTMLAnchorElement>('.term-actions a')?.getAttribute('href')).toBe(
      `/glossary/proposals/new?termId=${TERM.id}`,
    );

    component.termQuery.set('nicht vorhanden');
    fixture.detectChanges();
    expect(root.textContent).toContain('Keine passenden Terminology-Terme gefunden.');
  });
});
