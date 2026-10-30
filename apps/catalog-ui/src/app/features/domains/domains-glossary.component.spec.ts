import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DomainSummary, GlossaryTermProposal, GlossaryTermSummary, SemanticGraphState } from '../../core/catalog.models';
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
  ownerUserId: 'noemie.rochat',
  deputyOwnerUserId: 'lucien.morel',
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
    loadSemanticGraph: vi.fn(() => of<SemanticGraphState>({revision: 0, positions: {}, relations: [], canEditLayout: false, canEditRelations: false, scopeDomainIds: [DEFENCE.id], scopeTermIds: [TERM.id]})),
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
    office: 'bazg',
    email: 'sandro.wenger@example.test',
    phone: null,
    avatarUrl: null,
    roles: ['data_owner', 'data_consumer'],
  });
  const identity = { user, userId: signal('sandro.wenger'), users: signal([
    {id:'noemie.rochat',displayName:'Noémie Rochat'},
    {id:'lucien.morel',displayName:'Lucien Morel'},
  ]) };
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
  return { fixture, api, identity };
}

describe('DomainsGlossaryComponent term lifecycle proposals', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('disables activation without an office and never falls back to all offices for an active URL filter',async()=>{
    const {fixture, api, identity}=await render(),component=fixture.componentInstance;
    identity.user.update(user=>({...user,office:''}));fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.office-filter input').disabled).toBe(true);
    component.ownOfficeOnly.set(true);fixture.detectChanges();
    expect(component.filteredDomains()).toEqual([]);expect(component.filteredTerms()).toEqual([]);
    expect(api.loadSemanticGraph).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.office-filter input').disabled).toBe(false);
  });

  it('filters by trusted independent object scope and combines it with text search', async () => {
    const {fixture, api} = await render(), component = fixture.componentInstance;
    // The scoped term belongs to a foreign domain: classification is not office ownership.
    component.terms.set([{...TERM, domains: [MOBILITY]}, {...TERM, id: 'foreign', preferredLabel: 'Fremd', domains: [DEFENCE]}]);
    const checkbox = fixture.nativeElement.querySelector('.office-filter input') as HTMLInputElement;
    checkbox.click(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(component.ownOfficeOnly()).toBe(true);
    expect(api.loadSemanticGraph).toHaveBeenCalledWith('organizations', 'bazg');
    expect(component.filteredDomains().map(item => item.id)).toEqual([DEFENCE.id]);
    expect(component.filteredTerms().map(item => item.id)).toEqual([TERM.id]);
    component.termQuery.set('Armored'); expect(component.filteredTerms()).toHaveLength(1);
    component.termQuery.set('Fremd'); expect(component.filteredTerms()).toEqual([]);
    expect((fixture.nativeElement.querySelector('a[href^="/domains/terminology"]') as HTMLAnchorElement).search).toContain('ownOffice=1');
    checkbox.click(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(component.filteredDomains()).toHaveLength(2);
    expect(component.filteredTerms()[0].id).toBe('foreign');
  });

  it('shows a spinner, retains an empty scope on failure and cancels reads across identities', async () => {
    const {fixture, api, identity} = await render(), component = fixture.componentInstance;
    const pending = new Subject<SemanticGraphState>();
    api.loadSemanticGraph.mockReturnValueOnce(pending);
    component.ownOfficeOnly.set(true); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.office-filter .small-spinner')).not.toBeNull();
    expect(component.filteredDomains()).toEqual([]);
    api.loadSemanticGraph.mockReturnValueOnce(throwError(() => new Error('offline')));
    identity.userId.set('other'); fixture.detectChanges();
    pending.next({revision: 0, positions: {}, relations: [], canEditLayout: false, canEditRelations: false, scopeDomainIds: [MOBILITY.id]});
    expect(component.officeError()).toBe(true); expect(component.filteredDomains()).toEqual([]);
    component.loadOfficeScope(); fixture.detectChanges();
    expect(component.filteredDomains().map(item => item.id)).toEqual([DEFENCE.id]);
    expect(component.officeError()).toBe(false);
  });

  it('clears the former identity capability and reloads transfer rights',async()=>{
    const {fixture,api,identity}=await render(),component=fixture.componentInstance;
    api.loadDomains.mockReturnValueOnce(of([{...DEFENCE,canTransferOwnership:true}]));component.load();fixture.detectChanges();
    expect(component.domains()[0].canTransferOwnership).toBe(true);
    const pending=new Subject<DomainSummary[]>();api.loadDomains.mockReturnValueOnce(pending.asObservable());identity.userId.set('cinthya.thor');fixture.detectChanges();
    expect(component.domains()).toEqual([]);
    pending.next([{...DEFENCE,canTransferOwnership:false}]);pending.complete();fixture.detectChanges();
    expect(component.domains()[0].canTransferOwnership).toBe(false);
  });

  it('makes the complete domain heading a link and moves every action into its menu',async()=>{
    const {fixture}=await render(),root=fixture.nativeElement as HTMLElement;
    const card=root.querySelector<HTMLElement>('.domain-card')!,heading=card.querySelector<HTMLAnchorElement>('.domain-card-heading')!;
    expect(heading.tagName).toBe('A');expect(heading.getAttribute('href')).toBe(`/domains/${DEFENCE.id}`);
    expect(heading.contains(card.querySelector('daca-status-badge'))).toBe(true);
    expect(card.querySelectorAll('button')).toHaveLength(1);expect(card.querySelector('.domain-actions>a')).toBeNull();
    card.querySelector<HTMLButtonElement>('.domain-actions-trigger')!.click();fixture.detectChanges();await fixture.whenStable();
    const edit=[...card.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(button=>button.textContent?.includes('Direkt bearbeiten'))!;
    edit.click();fixture.detectChanges();await fixture.whenStable();
    expect(card.querySelector('[role=menu]')).toBeNull();expect(fixture.componentInstance.directAction()).toBe(true);
    expect(root.querySelector('.semantic-dialog')?.textContent).toContain('Domain direkt bearbeiten');
    expect((document.activeElement as HTMLInputElement)?.value).toBe(DEFENCE.preferredLabel);
  });

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

    expect(root.querySelectorAll('.term-card button')).toHaveLength(1);
    root.querySelector<HTMLButtonElement>('.term-actions-trigger')!.click();fixture.detectChanges();await fixture.whenStable();
    const createLink = root.querySelector<HTMLAnchorElement>('.daca-page-heading a');
    const updateLink = root.querySelector<HTMLAnchorElement>('.term-actions a');
    expect(createLink?.textContent).toContain('Neuen Term vorschlagen');
    expect(createLink?.getAttribute('href')).toBe('/glossary/proposals/new');
    expect(updateLink?.textContent).toContain('Änderung vorschlagen');
    expect(updateLink?.getAttribute('href')).toBe(`/glossary/proposals/new?termId=${TERM.id}`);
    const retirement=root.querySelector<HTMLButtonElement>('[data-term-action=request-retirement]');
    expect(retirement?.getAttribute('role')).toBe('menuitem');
    const termdat=root.querySelector<HTMLButtonElement>('[data-term-action=termdat]');
    expect(termdat?.disabled).toBe(true);expect(termdat?.textContent).toContain('TERMDAT');

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
    expect(links[1].getAttribute('aria-current')).toBeNull();

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

  it('finds terms by labels and their own owners, and domains by owners or deputies', async () => {
    const { fixture } = await render();
    const component = fixture.componentInstance;
    component.query.set('  sIbILLA  ');
    expect(component.filteredDomains()).toEqual([DEFENCE]);
    component.query.set('Sandro Wenger');
    expect(component.filteredDomains()).toEqual([DEFENCE, MOBILITY]);
    component.termQuery.set('noemie rochat');
    expect(component.filteredTerms()).toEqual([TERM]);
    component.termQuery.set('LUCIEN');
    expect(component.filteredTerms()).toEqual([TERM]);
    component.termQuery.set('sibilla');
    expect(component.filteredTerms()).toEqual([]);
    component.tab.set('terms');
    component.termQuery.set('Panzerfahrzeug');
    fixture.detectChanges();

    expect(component.filteredTerms()).toEqual([TERM]);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.semantic-card')?.textContent).toContain('Panzerfahrzeug');
    root.querySelector<HTMLButtonElement>('.term-actions-trigger')!.click();fixture.detectChanges();await fixture.whenStable();
    expect(root.querySelector<HTMLAnchorElement>('.term-actions a')?.getAttribute('href')).toBe(
      `/glossary/proposals/new?termId=${TERM.id}`,
    );

    component.termQuery.set('nicht vorhanden');
    fixture.detectChanges();
    expect(root.textContent).toContain('Keine passenden Terminologie-Terme gefunden.');
  });
});
