import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DomainSummary, GlossaryTermProposal } from '../../core/catalog.models';
import { GlossaryReviewComponent, buildGlossaryReviewPayload } from './glossary-review.component';

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
  labels: [],
  ownerUserId: 'sibilla.micheli',
  ownerName: 'Sibilla Micheli',
  ownerOrganization: 'VBS',
  deputyOwnerUserId: 'sandro.wenger',
  deputyOwnerName: 'Sandro Wenger',
  deputyOwnerOrganization: 'BAZG',
  productCount: 0,
  termCount: 1,
  updatedAt: '2026-08-25T10:00:00Z',
};

const REVIEW_PAYLOAD: Record<string, unknown> = {
  domainIds: [DOMAIN.id],
  sourceEvidence: { field: 'vehicle_type', productRevision: 7 },
  localizations: [
    { language: 'de-CH', preferredLabel: 'Gepanzertes Fahrzeug', alternativeLabels: ['GepFz', 'Panzerfahrzeug'], definition: 'Geschütztes militärisches Landfahrzeug.', sourceUri: 'https://example.test/de' },
    { language: 'en', preferredLabel: 'Armored Vehicle', alternativeLabels: ['Armoured Vehicle', 'AFV'], definition: 'Protected military land vehicle.', sourceUri: 'https://example.test/en' },
    { language: 'fr', preferredLabel: 'Véhicule blindé', alternativeLabels: ['Vhl blindé'], definition: 'Véhicule militaire protégé.', sourceUri: 'https://example.test/fr' },
  ],
  relations: [
    { relation: 'broader', targetTermId: '22222222-2222-4222-8222-222222222222', source: 'curated' },
    { relation: 'exactMatch', targetUri: 'https://example.test/armored-vehicle', source: 'external-register' },
  ],
};

const PROPOSAL: GlossaryTermProposal = {
  id: '33333333-3333-4333-8333-333333333333',
  operation: 'update',
  targetTermId: '44444444-4444-4444-8444-444444444444',
  sourceProductId: null,
  autoAttach: false,
  revision: 3,
  status: 'in_review',
  requesterUserId: 'beat.stalder',
  requesterName: 'Beat Stalder',
  requestedPayload: REVIEW_PAYLOAD,
  reviewPayload: REVIEW_PAYLOAD,
  reviews: [{
    id: 'review-1',
    domainId: DOMAIN.id,
    domainLabel: DOMAIN.preferredLabel,
    ownerUserId: DOMAIN.ownerUserId,
    ownerName: DOMAIN.ownerName,
    status: 'pending',
    decisionComment: null,
    decidedAt: null,
  }],
  decisionComment: null,
  createdAt: '2026-08-25T10:00:00Z',
  updatedAt: '2026-08-25T10:00:00Z',
};

describe('GlossaryReviewComponent lossless editing', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('preserves alternative labels, non-editable languages, source evidence and all relations', async () => {
    const updated = { ...PROPOSAL, revision: 4 };
    const api = {
      domains: signal([DOMAIN]),
      loadGlossaryTermProposal: vi.fn(() => of(PROPOSAL)),
      updateGlossaryTermProposal: vi.fn(() => of(updated)),
      decideGlossaryTermProposal: vi.fn(() => of(updated)),
    };
    await TestBed.configureTestingModule({
      imports: [GlossaryReviewComponent],
      providers: [
        provideRouter([]),
        { provide: CatalogApiService, useValue: api },
        { provide: DemoIdentityService, useValue: { userId: signal('sandro.wenger') } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: PROPOSAL.id }) } } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(GlossaryReviewComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(component.form.controls.alternativeLabelsDe.value).toBe('GepFz, Panzerfahrzeug');
    expect(component.form.controls.alternativeLabelsEn.value).toBe('Armoured Vehicle, AFV');
    component.form.patchValue({ definitionDe: 'Präzisierte Definition.' });
    component.saveDraft();

    expect(api.updateGlossaryTermProposal).toHaveBeenCalledWith(PROPOSAL, {
      ...REVIEW_PAYLOAD,
      localizations: [
        { ...(REVIEW_PAYLOAD['localizations'] as Array<Record<string, unknown>>)[0], definition: 'Präzisierte Definition.' },
        (REVIEW_PAYLOAD['localizations'] as Array<Record<string, unknown>>)[1],
        (REVIEW_PAYLOAD['localizations'] as Array<Record<string, unknown>>)[2],
      ],
      relations: REVIEW_PAYLOAD['relations'],
    });
  });

  it('uses review domains only as a fallback and never drops unknown payload fields', () => {
    const payload = buildGlossaryReviewPayload(
      { sourceFieldNames: ['vehicle_type'], localizations: REVIEW_PAYLOAD['localizations'], relations: REVIEW_PAYLOAD['relations'] },
      [DOMAIN.id],
      {
        labelDe: 'Gepanzertes Fahrzeug',
        alternativeLabelsDe: 'GepFz, Panzerfahrzeug',
        definitionDe: 'Geschütztes militärisches Landfahrzeug.',
        labelEn: 'Armored Vehicle',
        alternativeLabelsEn: 'Armoured Vehicle, AFV',
        definitionEn: 'Protected military land vehicle.',
        semanticMode: 'same_concept',
        relationType: 'broader',
        relationTargetUri: '',
      },
    );

    expect(payload['sourceFieldNames']).toEqual(['vehicle_type']);
    expect(payload['domainIds']).toEqual([DOMAIN.id]);
    expect(payload['relations']).toEqual(REVIEW_PAYLOAD['relations']);
    expect(payload['localizations']).toHaveLength(3);
  });

  it('requires a complete English label-definition pair and blocks finalized drafts', async () => {
    const api = {
      domains: signal([DOMAIN]),
      loadGlossaryTermProposal: vi.fn(() => of(PROPOSAL)),
      updateGlossaryTermProposal: vi.fn(() => of(PROPOSAL)),
      decideGlossaryTermProposal: vi.fn(() => of(PROPOSAL)),
    };
    await TestBed.configureTestingModule({
      imports: [GlossaryReviewComponent],
      providers: [
        provideRouter([]),
        { provide: CatalogApiService, useValue: api },
        { provide: DemoIdentityService, useValue: { userId: signal('sandro.wenger') } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: PROPOSAL.id }) } } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(GlossaryReviewComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.form.controls.definitionEn.setValue('');
    expect(component.reviewFormValid()).toBe(false);
    component.saveDraft();
    expect(api.updateGlossaryTermProposal).not.toHaveBeenCalled();

    component.form.controls.definitionEn.setValue('Protected military land vehicle.');
    component.proposal.set({ ...PROPOSAL, status: 'accepted' });
    component.saveDraft();
    expect(api.updateGlossaryTermProposal).not.toHaveBeenCalled();
  });

  it('shows the review fields read-only for viewers and after a final decision', async () => {
    const actor = signal('beat.stalder');
    const api = {
      domains: signal([DOMAIN]),
      loadGlossaryTermProposal: vi.fn(() => of(PROPOSAL)),
      updateGlossaryTermProposal: vi.fn(() => of(PROPOSAL)),
      decideGlossaryTermProposal: vi.fn(() => of(PROPOSAL)),
    };
    await TestBed.configureTestingModule({
      imports: [GlossaryReviewComponent],
      providers: [
        provideRouter([]),
        { provide: CatalogApiService, useValue: api },
        { provide: DemoIdentityService, useValue: { userId: actor } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: PROPOSAL.id }) } } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(GlossaryReviewComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const reviewFields = root.querySelector<HTMLFieldSetElement>('.review-form');

    expect(reviewFields?.disabled).toBe(true);
    expect(root.textContent).toContain('Bearbeiten dürfen nur die zuständigen Data Owners');

    actor.set('sandro.wenger');
    fixture.detectChanges();
    expect(reviewFields?.disabled).toBe(false);

    fixture.componentInstance.proposal.set({ ...PROPOSAL, status: 'accepted' });
    fixture.detectChanges();
    expect(reviewFields?.disabled).toBe(true);
    expect(root.textContent).toContain('Der geprüfte Review-Stand wird schreibgeschützt angezeigt.');
  });
});
