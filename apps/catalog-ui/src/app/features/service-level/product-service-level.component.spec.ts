import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { FALLBACK_PRODUCT } from '../../core/catalog.seed';
import { ProductServiceLevelApiService, ServiceLevelApiError } from './product-service-level-api.service';
import { ProductServiceLevelComponent } from './product-service-level.component';
import {
  ServiceLevelDefinition,
  ServiceLevelRevision,
  ServiceLevelRevisionListResponse,
  ServiceLevelSummaryResponse,
} from './product-service-level.models';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const REVISION_ID = '22222222-2222-4222-8222-222222222222';
const OWNER = { displayName: 'Joel Ruod', organization: 'ESTV', role: 'data_owner' as const };
const CONTROLLER = { displayName: 'Thomas Kriegli', organization: 'ESTV', role: 'control_person' as const };
const PRODUCT = {
  ...FALLBACK_PRODUCT,
  id: PRODUCT_ID,
  title: 'Kantonale Gewerbesteuer',
  classification: 'restricted' as const,
  license: 'Nutzung gemäss Freigabe',
  qualityMedal: 'gold' as const,
  qualityScore: 5,
};
const DEFINITION: ServiceLevelDefinition = {
  templateVersion: 1,
  purposeAndSuitableUse: 'Kantonale Kennzahlen für freigegebene Steueranalysen.',
  availabilityCommitment: 'best_effort',
  freshnessToleranceBusinessDays: 5,
  supportWindow: {
    weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    start: '08:00',
    end: '17:00',
    timezone: 'Europe/Zurich',
  },
  initialResponseTargetSupportHours: 16,
  plannedMaintenanceNoticeHours: 48,
  usageConditions: ['Nur für den genehmigten Zweck verwenden.'],
  knownLimitations: ['Best effort ohne technische Verfügbarkeitsmessung.'],
  nextReviewOn: '2027-08-19',
};

function revision(overrides: Partial<ServiceLevelRevision> = {}): ServiceLevelRevision {
  return {
    revisionId: REVISION_ID,
    dataProductId: PRODUCT_ID,
    revision: 1,
    lockVersion: 3,
    status: 'draft',
    source: 'owner_draft',
    validFrom: '2026-08-20',
    validUntil: null,
    effectiveValidUntil: null,
    definition: DEFINITION,
    owner: OWNER,
    controlPerson: CONTROLLER,
    createdAt: '2026-08-19T10:00:00Z',
    updatedAt: '2026-08-19T10:00:00Z',
    submittedAt: null,
    decidedAt: null,
    publishedAt: null,
    decision: null,
    rejectionReason: null,
    supersedesRevision: null,
    supersededByRevision: null,
    supersededFrom: null,
    changes: [],
    ...overrides,
  };
}

function summary(overrides: Partial<ServiceLevelSummaryResponse> = {}): ServiceLevelSummaryResponse {
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
    canEdit: false,
    canReview: false,
    owner: OWNER,
    controlPerson: CONTROLLER,
    legalReferences: [
      { code: 'DSG', title: 'Bundesgesetz über den Datenschutz', reference: 'DSG, SR 235.1', url: 'https://www.fedlex.admin.ch/eli/cc/2022/491/de', applicability: 'Soweit Personendaten bearbeitet werden.' },
      { code: 'BGÖ', title: 'Öffentlichkeitsgesetz', reference: 'BGÖ, SR 152.3', url: 'https://www.fedlex.admin.ch/eli/cc/2006/355/de', applicability: 'Soweit anwendbar.' },
    ],
    ...overrides,
  };
}

function history(items: ServiceLevelRevision[] = []): ServiceLevelRevisionListResponse {
  return { items, detailLevel: 'privileged', latestRevision: items.length, etag: `"${items.length}"` };
}

function serviceLevelStub(initialSummary = summary(), initialHistory = history()) {
  return {
    loadSummary: vi.fn(() => of(initialSummary)),
    loadRevisions: vi.fn(() => of(initialHistory)),
    loadRevision: vi.fn((_: string, revisionId: string) => {
      const item = initialHistory.items.find((candidate) => candidate.revisionId === revisionId) ?? revision();
      return of({ body: item, etag: `"${item.lockVersion}"` });
    }),
    createRevision: vi.fn(() => of({ body: revision(), etag: '"1"' })),
    updateRevision: vi.fn(() => of({ body: revision(), etag: '"4"' })),
    submitRevision: vi.fn(() => of({ body: revision({ status: 'pending_approval' }), etag: '"4"' })),
    withdrawRevision: vi.fn(() => of({ body: revision({ status: 'withdrawn' }), etag: '"4"' })),
    decideRevision: vi.fn(() => of({ body: revision({ status: 'published' }), etag: '"4"' })),
  };
}

async function render(
  serviceLevel = serviceLevelStub(),
  options: { identityId?: ReturnType<typeof signal<string>>; review?: string } = {},
) {
  const identityId = options.identityId ?? signal('beat.stalder');
  const catalog = {
    loadProduct: vi.fn(() => of(PRODUCT)),
    refreshWorkflowTasks: vi.fn(),
  };
  await TestBed.configureTestingModule({
    imports: [ProductServiceLevelComponent],
    providers: [
      provideRouter([]),
      { provide: CatalogApiService, useValue: catalog },
      { provide: ProductServiceLevelApiService, useValue: serviceLevel },
      { provide: DemoIdentityService, useValue: { userId: identityId } },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({ id: PRODUCT_ID }),
            queryParamMap: convertToParamMap(options.review ? { review: options.review } : {}),
          },
        },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ProductServiceLevelComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, serviceLevel, catalog, identityId };
}

describe('ProductServiceLevelComponent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('renders the safe baseline, fixed boundaries and legal references without creating a nested main landmark', async () => {
    const { fixture } = await render();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelector('main')).toBeNull();
    expect(root.textContent).toContain('DaCa PoC-Standardvorlage');
    expect(root.textContent).toContain('PoC · unverbindliche Orientierung');
    expect(root.textContent).not.toContain('Bundesweiter PoC-Basisstandard');
    expect(root.textContent).not.toContain('Basisstandard');
    expect(root.textContent).toContain('Eingeschränkt');
    expect(root.textContent).toContain('Nutzung gemäss Freigabe');
    expect(root.textContent).toContain('Gold · 5/6');
    expect(root.textContent).toContain('Katalogsichtbarkeit und diese SLA ändern weder die aktiv publizierten Zugriffs-Policies noch den OGD-Status');
    expect(root.querySelector('.service-level-boundaries input, .service-level-boundaries button')).toBeNull();
    expect(root.querySelectorAll('.service-level-law a[href="https://www.fedlex.admin.ch/eli/cc/2006/355/de"]')).toHaveLength(1);
    expect(root.querySelector('.service-level-law a')?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(root.querySelector('.service-level-law a')?.textContent).toContain('öffnet in neuem Tab');
    expect(root.textContent).not.toContain('token=');
    expect(root.querySelector('.service-level-owner-actions')).toBeNull();
    expect(root.querySelector('.service-level-decision')).toBeNull();
  });

  it('creates an owner draft from the Zurich as-of date and enforces structured list/date validation', async () => {
    const ownerSummary = summary({ canEdit: true });
    const serviceLevel = serviceLevelStub(ownerSummary);
    const { fixture, component } = await render(serviceLevel);
    const root = fixture.nativeElement as HTMLElement;

    (root.querySelector('.service-level-owner-actions .daca-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.form.controls.validFrom.value).toBe('2026-08-20');
    expect((root.querySelector('input[formcontrolname="validFrom"]') as HTMLInputElement).min).toBe('2026-08-19');

    component.form.patchValue({
      validFrom: '2026-08-20',
      validUntil: '2026-08-25',
      nextReviewOn: '2026-08-26',
    });
    component.saveDraft();
    expect(serviceLevel.createRevision).not.toHaveBeenCalled();
    expect(component.form.errors?.['reviewOrder']).toBe(true);

    component.form.patchValue({
      nextReviewOn: '2026-08-24',
      usageConditions: 'Nur fachlich verwenden.\nnur fachlich verwenden.',
    });
    component.saveDraft();
    expect(serviceLevel.createRevision).not.toHaveBeenCalled();
    expect(component.actionError()).toContain('Doppelte Einträge');

    component.form.patchValue({ usageConditions: 'Nur fachlich verwenden.' });
    component.saveDraft();
    expect(serviceLevel.createRevision).toHaveBeenCalledWith(
      PRODUCT_ID,
      expect.objectContaining({
        validFrom: '2026-08-20',
        validUntil: '2026-08-25',
        definition: expect.objectContaining({ nextReviewOn: '2026-08-24', availabilityCommitment: 'best_effort' }),
      }),
      '"0"',
    );
  });

  it('loads a task-linked pending revision and permits only the assigned review action', async () => {
    const pending = revision({ status: 'pending_approval', revision: 2 });
    const controllerSummary = summary({ canReview: true });
    const serviceLevel = serviceLevelStub(controllerSummary, history([pending]));
    const { fixture, component, catalog } = await render(serviceLevel, { review: REVISION_ID });
    const root = fixture.nativeElement as HTMLElement;

    expect(serviceLevel.loadRevision).toHaveBeenCalledWith(PRODUCT_ID, REVISION_ID);
    expect(root.querySelector('#sla-review')).not.toBeNull();
    expect(root.textContent).toContain('Vier-Augen-Prüfung');
    component.decide('reject');
    expect(serviceLevel.decideRevision).not.toHaveBeenCalled();
    expect(component.actionError()).toContain('Bitte begründen');

    component.rejectionReason.set('Gültigkeitsbereich präzisieren.');
    component.decide('reject');
    expect(serviceLevel.decideRevision).toHaveBeenCalledWith(
      PRODUCT_ID,
      REVISION_ID,
      3,
      'reject',
      'Gültigkeitsbereich präzisieren.',
    );
    expect(catalog.refreshWorkflowTasks).toHaveBeenCalled();
  });

  it('keeps owner input on an optimistic concurrency conflict and offers a deliberate reload', async () => {
    const draft = revision();
    const serviceLevel = serviceLevelStub(summary({ canEdit: true }), history([draft]));
    serviceLevel.updateRevision.mockReturnValue(throwError(() => new ServiceLevelApiError(
      'conflict', 412, 'Die SLA wurde zwischenzeitlich geändert. Ihre Eingaben wurden nicht gespeichert.',
    )));
    const { fixture, component } = await render(serviceLevel);

    component.startEdit(draft);
    component.form.controls.purposeAndSuitableUse.setValue('Eine ausreichend lange, ungespeicherte neue Zweckbeschreibung.');
    component.saveDraft();
    fixture.detectChanges();

    expect(component.editorMode()).toBe('edit');
    expect(component.form.controls.purposeAndSuitableUse.value).toContain('ungespeicherte');
    expect(component.conflict()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Aktuelle Version laden');
  });

  it('fails closed on a partial load error and clears identity-bound review state after an identity switch', async () => {
    const identityId = signal('thomas.kriegli');
    const pending = revision({ status: 'pending_approval' });
    const serviceLevel = serviceLevelStub(summary({ canReview: true }), history([pending]));
    const result = await render(serviceLevel, { identityId, review: REVISION_ID });
    expect(result.component.selectedRevision()?.revisionId).toBe(REVISION_ID);

    serviceLevel.loadSummary.mockReturnValue(throwError(() => new Error('secret=must-not-leak')));
    identityId.set('beat.stalder');
    result.fixture.detectChanges();

    expect(result.component.selectedRevision()).toBeNull();
    expect(result.component.loadError()).toContain('rollenrichtig');
    expect((result.fixture.nativeElement as HTMLElement).textContent).not.toContain('must-not-leak');
  });

  it('announces an in-flight load and renders scheduled and expired states without implying a guarantee', async () => {
    const waiting = new Subject<ServiceLevelSummaryResponse>();
    const serviceLevel = serviceLevelStub();
    serviceLevel.loadSummary.mockReturnValue(waiting);
    const rendered = await render(serviceLevel);
    expect((rendered.fixture.nativeElement as HTMLElement).querySelector('[role="status"]')?.textContent).toContain('SLA wird geladen');

    waiting.next(summary({ state: 'expired' }));
    waiting.complete();
    rendered.fixture.detectChanges();
    expect((rendered.fixture.nativeElement as HTMLElement).textContent).toContain('Abgelaufen');
    expect((rendered.fixture.nativeElement as HTMLElement).textContent).toContain('keine technische Garantie');
    expect((rendered.fixture.nativeElement as HTMLElement).textContent).toContain('keine Zusicherungen für Uptime, RTO/RPO oder Lösungszeiten');
  });

  it('uses the effective supersession end only for the currently applicable SLA', async () => {
    const current = revision({
      status: 'published',
      source: 'published',
      validFrom: '2026-08-20',
      validUntil: null,
      effectiveValidUntil: '2026-09-30',
      publishedAt: '2026-08-19T10:00:00Z',
    });
    const scheduled = revision({
      revisionId: '33333333-3333-4333-8333-333333333333',
      revision: 2,
      status: 'published',
      source: 'published',
      validFrom: '2026-10-01',
      publishedAt: '2026-08-19T11:00:00Z',
    });
    const currentSummary = summary({ source: 'published', state: 'active', current, nextScheduled: scheduled });
    const { fixture } = await render(serviceLevelStub(currentSummary, history([scheduled, current])));
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.service-level-current > header > div > p:last-child')?.textContent).toContain('2026-08-20 bis 2026-09-30');
    expect(root.querySelector('.service-level-current > header > div > p:last-child')?.textContent).toContain('vereinbart unbefristet');
    expect(root.querySelector('.service-level-scheduled')?.textContent).toContain('01.10.2026');
    const currentHistoryItem = [...root.querySelectorAll('.service-level-history li')]
      .find((item) => item.textContent?.includes('Revision 1'));
    expect(currentHistoryItem?.textContent).toContain('ab 2026-08-20, unbefristet');
  });

  it('starts a new revision with future-safe validity defaults even when the current SLA is expired', async () => {
    const expired = revision({
      status: 'published',
      source: 'published',
      validFrom: '2025-01-01',
      validUntil: '2026-01-31',
      effectiveValidUntil: '2026-01-31',
      definition: { ...DEFINITION, nextReviewOn: '2026-01-15' },
    });
    const expiredSummary = summary({ source: 'published', state: 'expired', current: expired, canEdit: true });
    const { component } = await render(serviceLevelStub(expiredSummary));

    component.startCreate();

    expect(component.form.controls.validFrom.value).toBe('2026-08-20');
    expect(component.form.controls.validUntil.value).toBe('');
    expect(component.form.controls.nextReviewOn.value).toBe('2027-08-20');
    expect(component.form.errors?.['reviewOrder']).toBeUndefined();
  });

  it('suggests a start after every already published future revision', async () => {
    const current = revision({ status: 'published', source: 'published', validFrom: '2026-08-20' });
    const scheduled = revision({
      revisionId: '33333333-3333-4333-8333-333333333333',
      revision: 2,
      status: 'published',
      source: 'published',
      validFrom: '2027-01-10',
    });
    const withScheduled = summary({
      source: 'published',
      state: 'active',
      current,
      nextScheduled: scheduled,
      canEdit: true,
    });
    const { component } = await render(serviceLevelStub(withScheduled, history([scheduled, current])));

    component.startCreate();

    expect(component.form.controls.validFrom.value).toBe('2027-01-11');
    expect(component.form.controls.nextReviewOn.value).toBe('2028-01-11');
  });
});
