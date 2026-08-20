import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { FALLBACK_PRODUCT } from '../../core/catalog.seed';
import { PolicyDefinition } from '../../core/catalog.models';
import { SecurityPolicyComponent } from './security-policy.component';

vi.mock('@bit-daca/design-system', async () => {
  const { Component } = await import('@angular/core');
  class StatusBadgeStub {}
  Component({ selector: 'daca-status-badge', standalone: true, template: '<ng-content />', inputs: ['tone'] })(StatusBadgeStub);
  class GlossaryTermStub {}
  Component({ selector: 'daca-glossary-term', standalone: true, template: '', inputs: ['term'] })(GlossaryTermStub);
  return { StatusBadgeComponent: StatusBadgeStub, DacaGlossaryTermComponent: GlossaryTermStub };
});

const POLICY: PolicyDefinition = {
  id: 'policy-8',
  revision: 8,
  state: 'published',
  effect: 'allow',
  subjects: ['beat.stalder'],
  resources: { productId: FALLBACK_PRODUCT.id, owner: 'ESTV' },
  actions: ['data.read'],
  protocols: ['http'],
  grants: [{
    subject: { type: 'person', id: 'beat.stalder' },
    actions: ['data.read'],
    protocols: ['http'],
    validFrom: '2026-01-01',
    validUntil: '2027-09-03',
    dataVariant: 'original',
    weeklyAvailability: {
      weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      startTime: '08:00',
      endTime: '18:00',
      timeZone: 'Europe/Zurich',
    },
  }],
  generatedRego: 'package daca.test',
  opaRevision: 8,
  postgresRevision: 8,
};

function apiStub(policy: Observable<PolicyDefinition>) {
  return {
    product: signal(FALLBACK_PRODUCT),
    selectProduct: vi.fn(),
    identityUserId: vi.fn(() => 'kassandra.valdata'),
    loadPolicy: vi.fn(() => policy),
    publishPolicy: vi.fn(),
  };
}

async function render(api: ReturnType<typeof apiStub>) {
  const paramMap = convertToParamMap({ id: FALLBACK_PRODUCT.id });
  await TestBed.configureTestingModule({
    imports: [SecurityPolicyComponent],
    providers: [
      provideHttpClient(),
      provideRouter([]),
      { provide: CatalogApiService, useValue: api },
      { provide: DemoIdentityService, useValue: { users: signal([]) } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap } } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(SecurityPolicyComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, api };
}

describe('SecurityPolicyComponent evidence state', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows a fail-closed authorization error and no deterministic policy evidence', async () => {
    const api = apiStub(throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })));
    const { fixture } = await render(api);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Policy-Evidenz nicht verfügbar');
    expect(root.textContent).toContain('nicht berechtigt');
    expect(root.querySelector('.policy-editor')).toBeNull();
    expect(root.textContent).not.toContain('Demo policy preview');
    expect(root.textContent).not.toContain('policy-estv-sg-read');
    root.querySelector<HTMLButtonElement>('[data-testid="retry-policy"]')!.click();
    expect(api.loadPolicy).toHaveBeenCalledTimes(2);
  });

  it('renders the immutable weekly time window with timezone after live evidence loads', async () => {
    const { fixture } = await render(apiStub(of(POLICY)));
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Policy revision 8');
    expect(root.textContent).toContain('Zeitfenster');
    expect(root.textContent).toContain('Mo, Di, Mi, Do, Fr · 08:00–18:00 · Europe/Zurich');
    expect(root.textContent).not.toContain('Policy-Evidenz nicht verfügbar');
  });
});
