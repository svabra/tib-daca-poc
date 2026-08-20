import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { GovernanceSubmission } from '../../core/catalog.models';
import { DemoIdentityService, DemoUser } from '../../core/demo-identity.service';
import { GovernanceReviewComponent } from './governance-review.component';

vi.mock('@bit-daca/design-system', async () => {
  const { Component } = await import('@angular/core');
  class StatusBadgeStub {}
  Component({ selector: 'daca-status-badge', standalone: true, template: '<ng-content />', inputs: ['tone'] })(StatusBadgeStub);
  return { StatusBadgeComponent: StatusBadgeStub };
});

const USERS: DemoUser[] = [
  {
    id: 'owner.user',
    displayName: 'Ariane Keller',
    organization: 'Bundesamt für Statistik BFS',
    email: 'ariane.keller@example.admin.ch',
    phone: null,
    avatarUrl: null,
    roles: ['data_owner'],
  },
];

const RENEWAL: GovernanceSubmission = {
  id: 'submission-renewal',
  dataProductId: 'product-1',
  policyRevisionId: 'policy-8',
  policyRevision: 8,
  ownerUserId: 'owner.user',
  approverUserId: 'approver.user',
  status: 'pending_approval',
  revision: 1,
  reviewSnapshot: {
    snapshotVersion: 1,
    workflowKind: 'access_renewal',
    preservedProductState: { activePolicyRevision: 7, discoverable: true, lifecycle: 'active' },
    dataProduct: {
      id: 'product-1',
      title: 'Kantonale Finanzindikatoren',
      owner: 'Bundesamt für Statistik BFS',
      classification: 'Intern',
      revision: 4,
      ownerUserId: 'owner.user',
    },
    approver: {
      id: 'approver.user',
      displayName: 'Noémie Rochat',
      organization: 'Kanton Neuenburg',
    },
    discoverable: true,
    grants: [{
      subject: { type: 'person', id: 'consumer.user' },
      actions: ['data.read', 'metadata.read'],
      protocols: ['postgresql'],
      validFrom: '2026-01-15',
      validUntil: '2027-02-28',
      dataVariant: 'modified',
      metadataChannels: { kobyMcp: false, i14y: false },
      weeklyAvailability: {
        weekdays: ['tuesday', 'thursday', 'saturday'],
        startTime: '09:15',
        endTime: '13:45',
        timeZone: 'Europe/Zurich',
      },
      groupSnapshot: null,
    }],
    barArchive: { enabled: false },
    policy: { id: 'policy-8', revision: 8, definition: {} },
    renewal: {
      requestId: 'renewal-request',
      renewalOfRequestId: 'source-request',
      originalGrant: {
        sourceGrantId: 'source-grant',
        policyRevision: 7,
        subject: { type: 'person', id: 'consumer.user' },
        actions: ['data.read', 'metadata.read'],
        protocols: ['postgresql'],
        dataVariant: 'modified',
        validFrom: '2026-01-15',
        validUntil: '2026-09-03',
        weeklyAvailability: {
          weekdays: ['tuesday', 'thursday', 'saturday'],
          startTime: '09:15',
          endTime: '13:45',
          timeZone: 'Europe/Zurich',
        },
        metadataChannels: { kobyMcp: false, i14y: false },
        groupSnapshot: null,
        purpose: 'Monatliche kantonale Finanzplanung',
        legalBasis: 'Art. 10 EMBAG und kantonaler Leistungsauftrag',
      },
      requestedPurpose: 'Kantonale Finanzplanung für das Folgejahr',
      requestedValidUntil: '2027-02-28',
    },
    submittedAt: '2026-08-20T08:15:00Z',
  },
  archiveEvidence: { enabled: false },
  decision: null,
  decisionComment: null,
  submittedAt: '2026-08-20T08:15:00Z',
  decidedAt: null,
  updatedAt: '2026-08-20T08:15:00Z',
};

function withStatus(status: GovernanceSubmission['status']): GovernanceSubmission {
  return { ...RENEWAL, status };
}

function genericSubmission(): GovernanceSubmission {
  const { workflowKind: _workflowKind, preservedProductState: _preserved, renewal: _renewal, ...reviewSnapshot } = RENEWAL.reviewSnapshot;
  return {
    ...RENEWAL,
    id: 'submission-publication',
    status: 'pending_approval',
    reviewSnapshot: {
      ...reviewSnapshot,
      discoverable: false,
      grants: [{
        subject: { type: 'machine', id: 'svc-finance-reader' },
        actions: ['metadata.read'],
        protocols: ['postgresql'],
        validFrom: '2026-01-15',
        validUntil: '2026-09-03',
        dataVariant: 'modified',
        weeklyAvailability: null,
      }],
    },
    archiveEvidence: { enabled: true },
  };
}

function apiStub(initial: GovernanceSubmission, decisionResult = withStatus('approved_deploying')) {
  return {
    loadGovernanceSubmission: vi.fn(() => of({ submission: initial, etag: `"${initial.revision}"` })),
    decideGovernanceSubmission: vi.fn(() => of(decisionResult)),
    refreshProducts: vi.fn(),
    refreshWorkflowTasks: vi.fn(),
  };
}

async function render(initial: GovernanceSubmission = RENEWAL, decisionResult?: GovernanceSubmission) {
  const api = apiStub(initial, decisionResult);
  await TestBed.configureTestingModule({
    imports: [GovernanceReviewComponent],
    providers: [
      provideRouter([]),
      { provide: CatalogApiService, useValue: api },
      { provide: DemoIdentityService, useValue: { users: signal<readonly DemoUser[]>(USERS) } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: initial.id }) } } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(GovernanceReviewComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, api };
}

describe('GovernanceReviewComponent access renewal', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders the stored old/new evidence and every immutable condition without assumptions', async () => {
    const { fixture } = await render();
    const root = fixture.nativeElement as HTMLElement;
    const comparison = root.querySelector<HTMLTableElement>('.renewal-comparison-table');

    expect(root.querySelector('h1')?.textContent).toContain('Zugriffsverlängerung prüfen');
    expect(root.textContent).toContain('Ariane Keller');
    expect(root.textContent).toContain('Noémie Rochat');
    expect(root.textContent).toContain('Kanton Neuenburg');
    expect(root.textContent).not.toContain('owner.user');
    expect(root.textContent).not.toContain('Thomas Kriegli');
    expect(root.textContent).not.toContain('Joel Ruod');

    expect(comparison?.querySelectorAll('thead th[scope="col"]')).toHaveLength(3);
    expect(comparison?.querySelector('caption')?.textContent).toContain('Vergleich der veränderbaren Angaben');
    expect(comparison?.querySelector('time[datetime="2026-09-03"]')?.textContent).toContain('03.09.2026');
    expect(comparison?.querySelector('time[datetime="2027-02-28"]')?.textContent).toContain('28.02.2027');
    expect(comparison?.textContent).toContain('Monatliche kantonale Finanzplanung');
    expect(comparison?.textContent).toContain('Kantonale Finanzplanung für das Folgejahr');

    const immutable = root.querySelector('.renewal-immutable-list');
    expect(immutable?.textContent).toContain('Person · consumer.user');
    expect(immutable?.textContent).toContain('data.read, metadata.read');
    expect(immutable?.textContent).toContain('PostgreSQL');
    expect(immutable?.textContent).toContain('Modifiziert');
    expect(immutable?.textContent).toContain('Art. 10 EMBAG und kantonaler Leistungsauftrag');
    expect(immutable?.textContent).toContain('Di, Do, Sa · 09:15–13:45 · Europe/Zurich');
    expect(root.textContent).not.toContain('Montag–Freitag');
    expect(root.textContent).not.toContain('REST · data.read');

    const stages = [...root.querySelectorAll<HTMLElement>('[data-deployment-stage]')];
    expect(stages.map((stage) => stage.dataset['deploymentStage'])).toEqual(['opa', 'postgresql']);
    expect(stages[0].textContent).toContain('zuerst');
    expect(stages[1].textContent).toContain('Danach');
    expect(root.querySelector('.renewal-table-wrap')?.getAttribute('tabindex')).toBe('0');
    expect(root.textContent).toContain('Die bestehende Policy bleibt aktiv');
  });

  it('starts the staged OPA-then-PostgreSQL activation and describes continuity truthfully', async () => {
    const deploying = withStatus('approved_deploying');
    const { fixture, api } = await render(RENEWAL, deploying);
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('[data-testid="governance-approve"]')!.click();
    fixture.detectChanges();

    expect(api.decideGovernanceSubmission).toHaveBeenCalledWith(RENEWAL.id, 1, 8, 'approve', null);
    expect(root.textContent).toContain('DaCa aktiviert zuerst OPA und danach PostgreSQL');
    expect(root.textContent).toContain('Die bestehende Policy bleibt bis zur Bestätigung beider Ziele aktiv');
    expect(root.textContent).not.toContain('PostgreSQL ist bestätigt');
  });

  it.each([
    ['rejected', 'Die Verlängerung wurde abgelehnt'],
    ['deployment_failed', 'Die technische Aktivierung ist nicht abgeschlossen'],
  ] as const)('keeps the existing policy truthful for %s', async (status, expected) => {
    const { fixture } = await render(withStatus(status));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain(expected);
    expect(text).toContain('Die bestehende Policy bleibt aktiv');
    expect(text).toContain('bisherigen Enddatum');
    expect(text).not.toContain('Korrekturaufgabe');
    expect(text).not.toContain('Produkt und Zugriff bleiben gesperrt');
  });

  it('fails closed when a renewal snapshot has lost its immutable evidence', async () => {
    const broken = {
      ...RENEWAL,
      reviewSnapshot: { ...RENEWAL.reviewSnapshot, renewal: undefined },
    };
    const { fixture } = await render(broken);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('[data-testid="renewal-evidence-missing"]')?.textContent).toContain('Ein Entscheid ist nicht möglich');
    expect(root.querySelector('[data-testid="governance-approve"]')).toBeNull();
  });

  it('preserves the generic publication review while rendering its real protocol and actors', async () => {
    const { fixture } = await render(genericSubmission());
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('h1')?.textContent).toContain('Governance-Snapshot prüfen');
    expect(root.textContent).toContain('Publikation freigeben');
    expect(root.textContent).toContain('Ariane Keller');
    expect(root.textContent).toContain('Noémie Rochat');
    expect(root.textContent).toContain('PostgreSQL · metadata.read');
    expect(root.textContent).toContain('BAR');
    expect(root.textContent).toContain('Genehmigen und Deployment starten');
    expect(root.querySelector('.renewal-comparison')).toBeNull();
  });
});
