import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { AccessRenewalFixtureState } from '../../core/catalog.models';
import { AccessRenewalFixtureComponent } from './access-renewal-fixture.component';

vi.mock('@bit-daca/design-system', async () => {
  const { Component } = await import('@angular/core');
  class StatusBadgeStub {}
  Component({ selector: 'daca-status-badge', standalone: true, template: '<ng-content />', inputs: ['tone'] })(StatusBadgeStub);
  class GlossaryTermStub {}
  Component({ selector: 'daca-glossary-term', standalone: true, template: '', inputs: ['term'] })(GlossaryTermStub);
  return { StatusBadgeComponent: StatusBadgeStub, DacaGlossaryTermComponent: GlossaryTermStub };
});

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const NOT_PREPARED: AccessRenewalFixtureState = {
  fixtureId: 'access-renewal-expiring',
  productId: PRODUCT_ID,
  productTitle: 'ESTV-Steuerstatistik nach Kanton',
  state: 'notPrepared',
  asOfDate: '2026-08-20',
  validFrom: null,
  validUntil: null,
  daysUntilExpiry: null,
  openRenewalCount: 0,
  activePolicyRevision: null,
};
const READY: AccessRenewalFixtureState = {
  ...NOT_PREPARED,
  state: 'ready',
  validFrom: '2026-01-01',
  validUntil: '2026-09-03',
  daysUntilExpiry: 14,
  activePolicyRevision: 2,
};

function apiStub(initial: AccessRenewalFixtureState = NOT_PREPARED) {
  return {
    identityUserId: vi.fn(() => 'kassandra.valdata'),
    loadAccessRenewalFixture: vi.fn(() => of(initial)),
    prepareAccessRenewalFixture: vi.fn(() => of(READY)),
    resetAccessRenewalFixture: vi.fn(() => of(READY)),
    refreshProducts: vi.fn(),
    refreshOwnerAccessRequestInbox: vi.fn(),
    refreshWorkflowTasks: vi.fn(),
  };
}

async function render(api = apiStub()) {
  await TestBed.configureTestingModule({
    imports: [AccessRenewalFixtureComponent],
    providers: [provideRouter([]), { provide: CatalogApiService, useValue: api }],
  }).compileComponents();
  const fixture = TestBed.createComponent(AccessRenewalFixtureComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, api };
}

describe('AccessRenewalFixtureComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads without mutation and offers explicit preparation for an absent fixture', async () => {
    const { fixture, api } = await render();
    const root = fixture.nativeElement as HTMLElement;

    expect(api.loadAccessRenewalFixture).toHaveBeenCalledOnce();
    expect(api.prepareAccessRenewalFixture).not.toHaveBeenCalled();
    expect(root.textContent).toContain('Fixture explizit anlegen');
    expect(root.querySelector('[data-testid="prepare-renewal-fixture"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="reset-renewal-fixture"]')).toBeNull();
  });

  it('prepares only after a click and then exposes stable Beat and owner entries', async () => {
    const { fixture, api } = await render();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('[data-testid="prepare-renewal-fixture"]')!.click();
    fixture.detectChanges();

    expect(api.prepareAccessRenewalFixture).toHaveBeenCalledOnce();
    expect(root.textContent).toContain('In 14 Tagen');
    expect(root.querySelector<HTMLAnchorElement>('a[href*="demoUser=beat.stalder"]')?.getAttribute('href'))
      .toBe(`/products/${PRODUCT_ID}/usage?demoUser=beat.stalder`);
    expect(root.querySelector<HTMLAnchorElement>('a[href*="demoUser=kassandra.valdata"]')?.getAttribute('href'))
      .toContain(`/tasks?product=${PRODUCT_ID}`);
    expect(root.querySelector('[data-testid="prepare-renewal-fixture"]')).toBeNull();
    expect(root.querySelector('[data-testid="reset-renewal-fixture"]')).not.toBeNull();
  });

  it('requires the exact product title before resetting the scoped fixture', async () => {
    const { fixture, api } = await render(apiStub(READY));
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector<HTMLInputElement>('.access-renewal-fixture-reset input')!;
    const reset = root.querySelector<HTMLButtonElement>('[data-testid="reset-renewal-fixture"]')!;

    expect(reset.disabled).toBe(true);
    input.value = 'ESTV-Steuerstatistik nach Kanton';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(reset.disabled).toBe(false);
    reset.click();
    fixture.detectChanges();

    expect(api.resetAccessRenewalFixture).toHaveBeenCalledWith('ESTV-Steuerstatistik nach Kanton');
    expect(root.textContent).toContain('Fixture zurückgesetzt');
  });

  it('reports a safe owner-only load error without exposing backend details', async () => {
    const api = apiStub();
    api.loadAccessRenewalFixture.mockReturnValue(throwError(() => ({ status: 403, error: { detail: 'private' } })) as never);
    const { fixture } = await render(api);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Kassandra Valdata');
    expect(root.textContent).not.toContain('private');
    expect(root.querySelector('[role="alert"]')).not.toBeNull();
  });
});
