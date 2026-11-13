import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DomainSummary, GlossaryTermSummary } from '../../core/catalog.models';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { FALLBACK_PRODUCT } from '../../core/catalog.seed';
import { MetadataStudioComponent } from './metadata-studio.component';
import { GlossaryProposalFormComponent, GlossaryProposalFormValue } from '../domains/glossary-proposal-form.component';

vi.mock('@bit-daca/design-system', async () => {
  const { Component } = await import('@angular/core');
  class StatusBadgeStub {}
  Component({ selector: 'daca-status-badge', standalone: true, template: '<ng-content />', inputs: ['tone'] })(StatusBadgeStub);
  return { StatusBadgeComponent: StatusBadgeStub };
});

const PRODUCT_ID = FALLBACK_PRODUCT.id;
const DOMAIN: DomainSummary = {
  id: '22222222-2222-4222-8222-222222222222',
  urn: 'urn:daca:domain:direct-federal-tax',
  originCatalogId: 'catalog',
  revision: 1,
  status: 'active',
  preferredLabel: 'Direkte Bundessteuer',
  definition: 'Fachdomain der direkten Bundessteuer.',
  labels: [{ language: 'de', preferredLabel: 'Direkte Bundessteuer', alternativeLabels: ['DBST'], definition: 'Fachdomain der direkten Bundessteuer.' }],
  ownerUserId: 'domain.owner',
  ownerName: 'Data Owner',
  ownerOrganization: 'ESTV',
  deputyOwnerUserId: 'domain.deputy',
  deputyOwnerName: 'Domain Deputy',
  deputyOwnerOrganization: 'ESTV',
  productCount: 1,
  termCount: 0,
  updatedAt: '2026-08-26T10:00:00Z',
};

const TERM: GlossaryTermSummary = {
  id: '33333333-3333-4333-8333-333333333333',
  urn: 'urn:daca:glossary-term:armoured-vehicle',
  originCatalogId: 'catalog',
  revision: 1,
  status: 'active',
  preferredLabel: 'Gepanzertes Fahrzeug',
  definition: 'Militärfahrzeug mit konstruktivem Schutz.',
  labels: [
    { language: 'de', preferredLabel: 'Gepanzertes Fahrzeug', alternativeLabels: ['GepFz'], definition: 'Militärfahrzeug mit konstruktivem Schutz.' },
    { language: 'en', preferredLabel: 'Armoured vehicle', alternativeLabels: ['Armored vehicle'], definition: 'Protected military vehicle.' },
  ],
  domains: [DOMAIN],
  relations: [],
  updatedAt: '2026-08-26T10:00:00Z',
};

async function setup(userId = 'product.owner') {
  const activeUserId = signal(userId);
  const product = {
    ...FALLBACK_PRODUCT,
    ownerUserId: 'product.owner',
    deputyOwnerUserId: 'product.deputy',
    domains: [DOMAIN],
    title: 'Flottenbestand gepanzerte Fahrzeuge',
    keywords: ['Fahrzeugflotte', 'Einsatzmittel', 'Logistik'],
  };
  const createGlossaryTermProposal = vi.fn(() => of({}));
  const api = {
    product: signal(product),
    usingFallback: signal(false),
    loadProduct: vi.fn(() => of({...product,canManage:['product.owner','product.deputy'].includes(activeUserId())})),
    loadDomains: vi.fn(() => of([DOMAIN])),
    loadGlossaryTerms: vi.fn(() => of([])),
    loadSemanticSuggestions: vi.fn(() => of([])),
    loadProductActivity: vi.fn(() => of({ items: [] })),
    createGlossaryTermProposal,
    updateProductMetadata: vi.fn(),
  };

  await TestBed.configureTestingModule({
    imports: [MetadataStudioComponent],
    providers: [
      provideRouter([]),
      { provide: CatalogApiService, useValue: api },
      { provide: DemoIdentityService, useValue: { userId: activeUserId } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: PRODUCT_ID }) } } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(MetadataStudioComponent);
  fixture.detectChanges();
  const dialog = (fixture.nativeElement as HTMLElement).querySelector<HTMLDialogElement>('dialog')!;
  Object.defineProperties(dialog, {
    showModal: { value: vi.fn(() => dialog.setAttribute('open', '')) },
    close: { value: vi.fn(() => { dialog.removeAttribute('open'); dialog.dispatchEvent(new Event('close')); }) },
  });
  return { fixture, component: fixture.componentInstance, activeUserId, createGlossaryTermProposal, api };
}

describe('MetadataStudioComponent glossary proposals', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts with Description and selects domains through search without checkboxes or losing existing selections',async()=>{
    const {fixture,component}=await setup();const root=fixture.nativeElement as HTMLElement;
    const other:DomainSummary={...DOMAIN,id:'other-domain',preferredLabel:'Kantonale Finanzplanung',definition:'Planung der kantonalen Finanzen.',
      labels:[{language:'de',preferredLabel:'Kantonale Finanzplanung',alternativeLabels:['KFin'],definition:'Planung der kantonalen Finanzen.'}]};
    component.availableDomains.set([DOMAIN,other]);component.availableTerms.set([TERM]);component.selectedTermIds.set([TERM.id]);fixture.detectChanges();
    expect(root.querySelector('.metadata-form-grid [formcontrolname]')?.getAttribute('formcontrolname')).toBe('description');
    const picker=root.querySelector('daca-domain-picker')!;
    expect(picker.querySelector('input[type="checkbox"]')).toBeNull();
    const search=picker.querySelector<HTMLInputElement>('[role="combobox"]')!;
    search.value='kfin';search.dispatchEvent(new Event('input'));fixture.detectChanges();
    expect(picker.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(picker.querySelector('[role="option"]')?.textContent).toContain('Kantonale Finanzplanung');
    const enter=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});search.dispatchEvent(enter);fixture.detectChanges();
    expect(enter.defaultPrevented).toBe(true);expect(component.selectedDomainIds()).toEqual([DOMAIN.id,other.id]);
    expect(component.selectedTermIds()).toEqual([TERM.id]);expect(component.form.dirty).toBe(true);
    expect(search.value).toBe('');expect(picker.querySelectorAll('[role="option"]')).toHaveLength(0);
    picker.querySelector<HTMLButtonElement>('button[aria-label="Kantonale Finanzplanung entfernen"]')!.click();fixture.detectChanges();
    expect(component.selectedDomainIds()).toEqual([DOMAIN.id]);expect(component.selectedTermIds()).toEqual([TERM.id]);
    picker.querySelector<HTMLButtonElement>('button[aria-label="Direkte Bundessteuer entfernen"]')!.click();fixture.detectChanges();
    expect(component.selectedDomainIds()).toEqual([]);expect(component.selectedTermIds()).toEqual([]);
    search.value='DBST';search.dispatchEvent(new Event('input'));fixture.detectChanges();
    search.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));fixture.detectChanges();
    search.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));fixture.detectChanges();
    expect(search.getAttribute('aria-expanded')).toBe('false');expect(component.selectedDomainIds()).toEqual([]);
    search.dispatchEvent(new FocusEvent('focus'));fixture.detectChanges();
    picker.querySelector<HTMLElement>('[role="option"]')!.click();fixture.detectChanges();
    expect(component.selectedDomainIds()).toEqual([DOMAIN.id]);
  });

  it('keeps metadata read-only for readers, including a direct route and identity switch', async () => {
    const {fixture,component,activeUserId,api}=await setup('other.owner');
    expect(component.canEditMetadata()).toBe(false);expect(component.form.disabled).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('.metadata-form button[type="submit"]')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('daca-domain-picker input')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('daca-domain-picker button')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('daca-semantic-picker[kind="term"] input')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('daca-semantic-picker[kind="term"] button')).toBeNull();
    component.save();expect(api.updateProductMetadata).not.toHaveBeenCalled();
    activeUserId.set('product.owner');fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(component.canEditMetadata()).toBe(true);expect(component.form.enabled).toBe(true);
    activeUserId.set('other.owner');fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(component.form.disabled).toBe(true);
  });

  it('keeps automatic attachment eligibility owner-bound in the reusable governed form', async () => {
    const { fixture, component, activeUserId } = await setup();
    expect(component.canAutoAttach()).toBe(true);
    component.openProposal('Gepanzertes Fahrzeug');
    fixture.detectChanges();
    const form = fixture.debugElement.query(By.directive(GlossaryProposalFormComponent)).componentInstance as GlossaryProposalFormComponent;
    expect(form.form.controls.labelDe.value).toBe('Gepanzertes Fahrzeug');
    component.closeProposal();

    activeUserId.set('authenticated.consumer');
    expect(component.canAutoAttach()).toBe(false);
  });

  it('derives candidates from unsaved values without leaving the editor and shows duplicate hints', async () => {
    const { fixture, component } = await setup();
    component.availableTerms.set([TERM]);
    component.form.controls.title.setValue('Flottenbestand gepanzerte Fahrzeuge');
    component.form.controls.keywords.setValue('GepFz, Fahrzeugflotte, Einsatzmittel, Logistik');
    component.form.markAsDirty();

    component.deriveTermCandidates();
    const candidates = component.derivedCandidates();
    component.openProposal(candidates[0].label, candidates[0].reason);
    fixture.detectChanges();
    const proposalForm = fixture.debugElement.query(By.directive(GlossaryProposalFormComponent)).componentInstance as GlossaryProposalFormComponent;

    expect(candidates).toHaveLength(3);
    expect(candidates[0].label).toBe('gepanzerte Fahrzeuge');
    expect(component.form.dirty).toBe(true);
    expect(proposalForm.form.controls.labelDe.value).toBe('gepanzerte Fahrzeuge');
    expect(proposalForm.duplicateHints()).toEqual([expect.objectContaining({ term: TERM })]);
    expect(component.proposalContext()).toContain('Produkttitel');
  });

  it('submits the reusable proposal payload without changing unsaved metadata', async () => {
    const { component, createGlossaryTermProposal } = await setup();
    component.form.controls.title.setValue('Ungespeicherter Titel');
    component.form.controls.title.markAsDirty();
    const payload = {
      operation: 'create',
      sourceProductId: PRODUCT_ID,
      autoAttach: true,
      domainIds: [DOMAIN.id],
      labels: [{ language: 'de', preferredLabel: 'Gepanzertes Fahrzeug', alternativeLabels: ['GepFz'], definition: 'Militärfahrzeug mit Schutz.' }],
      relations: [],
    } satisfies GlossaryProposalFormValue;

    component.submitProposal(payload);

    expect(createGlossaryTermProposal).toHaveBeenCalledWith(payload);
    expect(component.form.controls.title.value).toBe('Ungespeicherter Titel');
    expect(component.form.dirty).toBe(true);
  });

  it('places suggestions first and selects domain-bound terminology through search with persistent selected tags', async () => {
    const {fixture,component,api}=await setup();
    const root=fixture.nativeElement as HTMLElement;
    const foreign:GlossaryTermSummary={...TERM,id:'foreign-term',domains:[{...DOMAIN,id:'foreign-domain'}]};
    component.availableTerms.set([TERM,foreign]);fixture.detectChanges();
    const picker=root.querySelector('daca-semantic-picker[kind="term"]')!;
    const domains=root.querySelector('daca-domain-picker')!.closest('fieldset')!;
    const suggestions=root.querySelector('.suggestion-panel')!;
    expect(suggestions.compareDocumentPosition(domains)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(suggestions.compareDocumentPosition(picker)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(root.querySelector('.metadata-form-grid input[type="checkbox"]')).toBeNull();
    const search=picker.querySelector<HTMLInputElement>('[role="combobox"]')!;
    search.value='GepFz';search.dispatchEvent(new Event('input'));fixture.detectChanges();
    expect(picker.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(picker.querySelector('[role="option"]')?.textContent).toContain('GepFz');
    const enter=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});
    search.dispatchEvent(enter);fixture.detectChanges();
    expect(enter.defaultPrevented).toBe(true);
    expect(component.selectedTermIds()).toEqual([TERM.id]);expect(component.form.dirty).toBe(true);
    expect(api.updateProductMetadata).not.toHaveBeenCalled();
    expect(search.value).toBe('');
    const remove=picker.querySelector<HTMLButtonElement>('button[aria-label="Gepanzertes Fahrzeug entfernen"]')!;
    expect(remove).not.toBeNull();
    search.value='unbekannt';search.dispatchEvent(new Event('input'));fixture.detectChanges();
    expect(picker.querySelector('[role="status"]')?.textContent).toContain('Keine weiteren passenden Terminologiebegriffe.');
    expect(picker.contains(remove)).toBe(true);
    remove.click();fixture.detectChanges();expect(component.selectedTermIds()).toEqual([]);
    search.value='Armored';search.dispatchEvent(new Event('input'));fixture.detectChanges();
    picker.querySelector<HTMLElement>('[role="option"]')!.click();fixture.detectChanges();
    expect(component.selectedTermIds()).toEqual([TERM.id]);
    search.value='GepFz';search.dispatchEvent(new Event('input'));fixture.detectChanges();
    expect(picker.querySelectorAll('[role="option"]')).toHaveLength(0);
    component.toggleDomain(DOMAIN.id);fixture.detectChanges();
    expect(component.selectedTermIds()).toEqual([]);
    expect(picker.querySelector('input')).toBeNull();
    expect(root.textContent).toContain('Wählen Sie zuerst mindestens eine Fachdomäne.');
  });

  it('reflects an explicitly accepted semantic suggestion in the terminology selection',async()=>{
    const {fixture,component}=await setup();
    component.availableTerms.set([TERM]);
    component.suggestions.set([{kind:'glossaryTerm',id:TERM.id,label:TERM.preferredLabel,score:95,
      matchedFields:['title'],reason:'Passender Titel',source:'deterministic-fuzzy'}]);
    fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    const apply=[...root.querySelectorAll<HTMLButtonElement>('.suggestion-panel button')].find(button=>button.textContent?.trim()==='Übernehmen')!;
    apply.click();fixture.detectChanges();
    expect(root.querySelector('daca-semantic-picker[kind="term"]')?.textContent).toContain(TERM.preferredLabel);
    expect(component.selectedTermIds()).toEqual([TERM.id]);
    expect(apply.disabled).toBe(true);expect(apply.textContent?.trim()).toBe('Ausgewählt');
  });

  it('switches a duplicate hint to an update in the same dialog without losing metadata edits', async () => {
    const { fixture, component } = await setup();
    component.availableTerms.set([TERM]);
    component.form.controls.title.setValue('Ungespeicherter Flottenentwurf');
    component.form.controls.title.markAsDirty();
    component.openProposal('Gepanzertes Fahrzeug');
    fixture.detectChanges();
    let proposalForm = fixture.debugElement.query(By.directive(GlossaryProposalFormComponent)).componentInstance as GlossaryProposalFormComponent;

    proposalForm.targetSelect.emit(TERM);
    fixture.detectChanges();
    proposalForm = fixture.debugElement.query(By.directive(GlossaryProposalFormComponent)).componentInstance as GlossaryProposalFormComponent;

    expect(component.proposalTarget()).toEqual(TERM);
    expect(proposalForm.target).toEqual(TERM);
    expect(proposalForm.form.controls.labelDe.value).toBe('Gepanzertes Fahrzeug');
    expect(component.form.controls.title.value).toBe('Ungespeicherter Flottenentwurf');
    expect(component.form.dirty).toBe(true);
  });
});
