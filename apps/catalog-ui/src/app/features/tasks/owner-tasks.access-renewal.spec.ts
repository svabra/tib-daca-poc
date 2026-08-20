import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { CatalogApiService, PolicyWire } from '../../core/catalog-api.service';
import { FALLBACK_PRODUCT } from '../../core/catalog.seed';
import { GovernanceSubmission, StoredAccessRequest } from '../../core/catalog.models';
import { OwnerTasksComponent } from './owner-tasks.component';

vi.mock('@bit-daca/design-system', async () => {
  const { Component } = await import('@angular/core');
  class StatusBadgeStub {}
  Component({ selector: 'daca-status-badge', standalone: true, template: '<ng-content />', inputs: ['tone'] })(StatusBadgeStub);
  class GlossaryTermStub {}
  Component({ selector: 'daca-glossary-term', standalone: true, template: '', inputs: ['term'] })(GlossaryTermStub);
  return { StatusBadgeComponent: StatusBadgeStub, DacaGlossaryTermComponent: GlossaryTermStub };
});

const PRODUCT_ID = FALLBACK_PRODUCT.id;
const RENEWAL = {
  id: 'renewal-request',
  requestNumber: 'ZA-2026-RENEW',
  dataProductId: PRODUCT_ID,
  requesterId: 'beat.stalder',
  requesterName: 'Beat Stalder',
  requesterOrganization: 'Kanton St. Gallen',
  contactEmail: 'beat.stalder@sg.ch',
  consumerType: 'person',
  machineId: null,
  purpose: 'Kantonale Steuerstatistik für die Finanzplanung 2027 auswerten.',
  legalBasis: 'Gesetzlicher Auftrag der ESTV',
  requestedProtocol: 'http',
  requestedVariant: 'original',
  validFrom: '2026-01-01',
  validUntil: '2027-09-03',
  notes: null,
  status: 'submitted',
  requestKind: 'renewal',
  renewalOfRequestId: 'source-request',
  renewalOfRequestNumber: 'ZA-2025-SOURCE',
  renewalContext: {
    sourceGrantId: 'source-grant',
    policyRevision: 7,
    subject: { type: 'person', id: 'beat.stalder' },
    actions: ['data.read'],
    protocols: ['http'],
    dataVariant: 'original',
    validFrom: '2026-01-01',
    validUntil: '2026-09-03',
    weeklyAvailability: {
      weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      startTime: '08:00',
      endTime: '18:00',
      timeZone: 'Europe/Zurich',
    },
    metadataChannels: { kobyMcp: false, i14y: false },
    groupSnapshot: null,
    purpose: 'Kantonale Steuerstatistik für die Finanzplanung auswerten.',
    legalBasis: 'Gesetzlicher Auftrag der ESTV',
  },
  createdAt: '2026-08-20T08:00:00Z',
  updatedAt: '2026-08-20T08:00:00Z',
} satisfies StoredAccessRequest;

function apiStub(request: StoredAccessRequest = RENEWAL) {
  return {
    ownerAccessRequests: signal<readonly StoredAccessRequest[]>([request]),
    ownerAccessRequestLoading: signal(false),
    ownerAccessRequestError: signal<string | null>(null),
    workflowTasks: signal([]),
    workflowTasksLoading: signal(false),
    workflowTasksError: signal<string | null>(null),
    products: signal([{ ...FALLBACK_PRODUCT, id: PRODUCT_ID }]),
    refreshOwnerAccessRequestInbox: vi.fn(),
    refreshWorkflowTasks: vi.fn(),
    decideAccessRequest: vi.fn(() => of({
      request: { ...request, status: 'approved_policy_pending' },
      policy: { id: 'policy-8', revision: 8 } as PolicyWire,
      governanceSubmission: {
        id: 'governance-8',
        reviewSnapshot: { approver: { displayName: 'Alex Muster' } },
      } as GovernanceSubmission,
    })),
    publishPolicy: vi.fn(),
  };
}

async function render(api = apiStub()) {
  const queryParamMap = convertToParamMap({});
  await TestBed.configureTestingModule({
    imports: [OwnerTasksComponent],
    providers: [
      provideRouter([]),
      { provide: CatalogApiService, useValue: api },
      { provide: ActivatedRoute, useValue: { queryParamMap: of(queryParamMap), snapshot: { queryParamMap } } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(OwnerTasksComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, api };
}

describe('OwnerTasksComponent access renewal', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows an accessible old/new review and states that current access remains active', async () => {
    const { fixture } = await render();
    const root = fixture.nativeElement as HTMLElement;
    const diff = root.querySelector('.owner-renewal-diff');

    expect(root.textContent).toContain('Verlängerungsantrag');
    expect(diff?.textContent).toContain('03.09.2026');
    expect(diff?.textContent).toContain('03.09.2027');
    expect(diff?.textContent).toContain('Unverändert');
    expect(diff?.textContent).toContain('Gesetzlicher Auftrag der ESTV');
    expect(diff?.textContent).toContain('01.01.2026');
    expect(diff?.textContent).toContain('Mo, Di, Mi, Do, Fr · 08:00–18:00 · Europe/Zurich');
    expect(diff?.getAttribute('tabindex')).toBe('0');
    expect(root.textContent).toContain('Die bisherige Policy bleibt bis zu ihrem Enddatum wirksam');
    expect(root.querySelector('[data-testid="access-request-to-setting"]')).toBeNull();
  });

  it('approves with the immutable variant and links the resulting four-eyes submission', async () => {
    const { fixture, api } = await render();
    const root = fixture.nativeElement as HTMLElement;
    const approve = [...root.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Verlängerung genehmigen'))!;

    approve.click();
    fixture.detectChanges();

    expect(api.decideAccessRequest).toHaveBeenCalledWith(RENEWAL.id, 'approve', 'original');
    expect(root.textContent).toContain('Alex Muster zur Vier-Augen-Prüfung übermittelt');
    expect(root.textContent).not.toContain('Thomas Kriegli');
    expect(root.querySelector<HTMLAnchorElement>('a[href="/governance-submissions/governance-8"]')?.textContent)
      .toContain('Vier-Augen-Aufgabe öffnen');
    expect(api.publishPolicy).not.toHaveBeenCalled();
  });

  it('sends only one renewal decision for two rapid approval clicks', async () => {
    const api = apiStub();
    const pendingDecision = new Subject<never>();
    api.decideAccessRequest.mockReturnValue(pendingDecision as never);
    const { fixture } = await render(api);
    const root = fixture.nativeElement as HTMLElement;
    const approve = [...root.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Verlängerung genehmigen'))!;

    approve.click();
    approve.click();
    fixture.detectChanges();

    expect(api.decideAccessRequest).toHaveBeenCalledOnce();
    expect(api.decideAccessRequest).toHaveBeenCalledWith(RENEWAL.id, 'approve', 'original');
    expect([...root.querySelectorAll<HTMLButtonElement>('.owner-task-actions button')].every((button) => button.disabled)).toBe(true);
    expect(root.textContent).toContain('Genehmigung wird verarbeitet…');
  });

  it('refuses approval when immutable renewal evidence is missing', async () => {
    const broken = { ...RENEWAL, renewalContext: null };
    const { fixture, api } = await render(apiStub(broken));

    fixture.componentInstance.approve(broken);
    fixture.detectChanges();

    expect(api.decideAccessRequest).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Ausgangskontext fehlt');
  });
});
