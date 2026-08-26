import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DataProduct, DomainSummary, GlossaryTermSummary } from '../../core/catalog.models';
import { GlossaryProposalFormComponent, GlossaryProposalFormValue } from './glossary-proposal-form.component';

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
  definition: 'Geschütztes militärisches Landfahrzeug.',
  labels: [
    { language: 'de-CH', preferredLabel: 'Gepanzertes Fahrzeug', alternativeLabels: ['GepFz'], definition: 'Geschütztes militärisches Landfahrzeug.' },
    { language: 'en-GB', preferredLabel: 'Armored Vehicle', alternativeLabels: ['Armoured Vehicle'], definition: 'Protected military land vehicle.' },
    { language: 'fr', preferredLabel: 'Véhicule blindé', alternativeLabels: ['Vhl blindé'], definition: 'Véhicule militaire protégé.' },
  ],
  domains: [DOMAIN],
  relations: [
    { id: 'relation-1', relationType: 'broader', targetTermId: '33333333-3333-4333-8333-333333333333', targetUri: '', targetLabel: 'Militärfahrzeug' },
    { id: 'relation-2', relationType: 'exactMatch', targetTermId: null, targetUri: 'https://example.test/armored-vehicle', targetLabel: 'Armored vehicle' },
  ],
  updatedAt: '2026-08-25T10:00:00Z',
};

const RELATED_TERM: GlossaryTermSummary = {
  ...EXISTING_TERM,
  id: '33333333-3333-4333-8333-333333333333',
  urn: 'urn:daca:glossary-term:military-vehicle',
  preferredLabel: 'Militärfahrzeug',
  labels: [{ language: 'de', preferredLabel: 'Militärfahrzeug', alternativeLabels: ['MilFz'], definition: 'Fahrzeug für militärische Aufgaben.' }],
  relations: [],
};

const PRODUCT = {
  id: '44444444-4444-4444-8444-444444444444',
  title: 'Flottenbestand gepanzerte Fahrzeuge',
  ownerUserId: 'sandro.wenger',
  deputyOwnerUserId: 'lea.hofmann',
  domains: [DOMAIN],
} as DataProduct;

describe('GlossaryProposalFormComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function render(inputs: Partial<GlossaryProposalFormComponent> = {}) {
    await TestBed.configureTestingModule({
      imports: [GlossaryProposalFormComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(GlossaryProposalFormComponent);
    fixture.componentRef.setInput('domains', [DOMAIN]);
    fixture.componentRef.setInput('terms', [EXISTING_TERM]);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    return fixture;
  }

  it('prefills product context, warns about a duplicate and emits eligible automatic attachment', async () => {
    const fixture = await render({
      product: PRODUCT,
      initialDomainIds: [DOMAIN.id],
      initialLabel: 'Gepanzertes Fahrzeug',
      canAttachProduct: true,
    });
    const component = fixture.componentInstance;
    const emitted: GlossaryProposalFormValue[] = [];
    component.proposalSubmit.subscribe((value) => emitted.push(value));

    expect(component.form.controls.labelDe.value).toBe('Gepanzertes Fahrzeug');
    expect(component.form.controls.autoAttach.value).toBe(true);
    expect(component.duplicateHints()).toEqual([
      expect.objectContaining({ term: EXISTING_TERM, exact: true, matchedLabel: 'Gepanzertes Fahrzeug' }),
    ]);

    component.form.patchValue({ definitionDe: 'Fahrzeug mit ballistischem Schutz.', alternativeLabelsDe: 'GepFz, Panzerfahrzeug' });
    component.submit();

    expect(emitted).toEqual([expect.objectContaining({
      operation: 'create',
      sourceProductId: PRODUCT.id,
      autoAttach: true,
      domainIds: [DOMAIN.id],
      labels: [expect.objectContaining({ language: 'de', alternativeLabels: ['GepFz', 'Panzerfahrzeug'] })],
    })]);
  });

  it('prefills an update and preserves additional languages and every existing relation', async () => {
    const fixture = await render({ target: EXISTING_TERM });
    const component = fixture.componentInstance;
    const emitted: GlossaryProposalFormValue[] = [];
    component.proposalSubmit.subscribe((value) => emitted.push(value));

    expect(component.form.controls.alternativeLabelsDe.value).toBe('GepFz');
    expect(component.form.controls.alternativeLabelsEn.value).toBe('Armoured Vehicle');
    expect(component.duplicateHints()).toEqual([]);
    component.submit();

    expect(emitted[0]).toEqual(expect.objectContaining({
      operation: 'update',
      targetTermId: EXISTING_TERM.id,
      autoAttach: false,
      domainIds: [DOMAIN.id],
      labels: EXISTING_TERM.labels,
      relations: [
        { relation: 'broader', targetTermId: EXISTING_TERM.relations[0].targetTermId },
        { relation: 'exactMatch', targetUri: EXISTING_TERM.relations[1].targetUri },
      ],
    }));
  });

  it('disables automatic attachment for a product actor without owner rights', async () => {
    const fixture = await render({
      product: PRODUCT,
      initialDomainIds: [DOMAIN.id],
      initialLabel: 'Neuer Begriff',
      canAttachProduct: false,
    });
    const component = fixture.componentInstance;
    component.form.patchValue({ definitionDe: 'Neue fachliche Definition.', autoAttach: true });
    const emitted: GlossaryProposalFormValue[] = [];
    component.proposalSubmit.subscribe((value) => emitted.push(value));

    component.submit();

    expect(component.autoAttachEligible()).toBe(false);
    expect(emitted[0].autoAttach).toBe(false);
  });

  it('flags inflected metadata candidates as a possible existing concept', async () => {
    const fixture = await render({ initialLabel: 'gepanzerte Fahrzeuge' });
    const component = fixture.componentInstance;

    expect(component.duplicateHints()).toEqual([
      expect.objectContaining({ term: EXISTING_TERM, exact: false }),
    ]);
  });

  it('adds an internal SKOS relation to an accepted term without replacing existing data', async () => {
    const fixture = await render({
      terms: [EXISTING_TERM, RELATED_TERM],
      initialDomainIds: [DOMAIN.id],
      initialLabel: 'Neues Fahrzeugkonzept',
    });
    const component = fixture.componentInstance;
    const emitted: GlossaryProposalFormValue[] = [];
    component.proposalSubmit.subscribe((value) => emitted.push(value));
    component.form.patchValue({
      definitionDe: 'Ein neues fachliches Fahrzeugkonzept.',
      relationType: 'broader',
      relationTargetTermId: RELATED_TERM.id,
    });

    component.submit();

    expect(emitted[0].relations).toEqual([{ relation: 'broader', targetTermId: RELATED_TERM.id }]);
  });

  it('reconciles asynchronously loaded domains and identity rights without resetting typed content', async () => {
    const fixture = await render({
      domains: [],
      product: PRODUCT,
      initialDomainIds: [DOMAIN.id],
      initialLabel: 'Entwurf',
      canAttachProduct: true,
    });
    const component = fixture.componentInstance;
    component.form.controls.labelDe.setValue('Weiterbearbeiteter Entwurf');
    component.form.controls.labelDe.markAsDirty();

    fixture.componentRef.setInput('domains', [DOMAIN]);
    fixture.detectChanges();

    expect(component.selectedDomainIds()).toEqual([DOMAIN.id]);
    expect(component.form.controls.labelDe.value).toBe('Weiterbearbeiteter Entwurf');
    expect(component.form.controls.autoAttach.enabled).toBe(true);
    expect(component.form.controls.autoAttach.value).toBe(true);

    fixture.componentRef.setInput('canAttachProduct', false);
    fixture.detectChanges();
    expect(component.form.controls.autoAttach.disabled).toBe(true);
    expect(component.form.controls.autoAttach.value).toBe(false);

    fixture.componentRef.setInput('canAttachProduct', true);
    fixture.detectChanges();
    expect(component.form.controls.autoAttach.enabled).toBe(true);
    expect(component.form.controls.labelDe.value).toBe('Weiterbearbeiteter Entwurf');
  });
});
