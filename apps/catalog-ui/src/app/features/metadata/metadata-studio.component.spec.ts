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
  ownerName: 'Domain Owner',
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
    loadProduct: vi.fn(() => of(product)),
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
  return { fixture, component: fixture.componentInstance, activeUserId, createGlossaryTermProposal };
}

describe('MetadataStudioComponent glossary proposals', () => {
  afterEach(() => TestBed.resetTestingModule());

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

  it('filters accepted domain terms by abbreviation and exposes that abbreviation in the picker', async () => {
    const { fixture, component } = await setup();
    component.availableTerms.set([TERM]);
    component.termQuery.set('GepFz');
    fixture.detectChanges();

    expect(component.filteredTerms()).toEqual([TERM]);
    expect(component.termAlternativeLabels(TERM)).toContain('GepFz');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('GepFz');
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
