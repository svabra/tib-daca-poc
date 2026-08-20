import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { FALLBACK_PRODUCT } from '../../core/catalog.seed';
import { ProductEffectiveAccessResponse, StoredAccessRequest } from '../../core/catalog.models';
import { AccessRenewalFormComponent } from './access-renewal-form.component';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const GRANT_ID = 'policy-7-person-beat-rest';
const PRODUCT = { ...FALLBACK_PRODUCT, id: PRODUCT_ID, title: 'ESTV-Steuerstatistik nach Kanton' };
const ACCESS: ProductEffectiveAccessResponse = {
  granted: true,
  asOfDate: '2026-08-20',
  policyRevision: 7,
  grants: [{
    grantId: GRANT_ID,
    subjectType: 'person',
    protocols: ['http'],
    dataVariant: 'original',
    validFrom: '2026-01-01',
    validUntil: '2026-09-03',
    weeklyAvailability: {
      weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      startTime: '07:00',
      endTime: '19:00',
      timeZone: 'Europe/Zurich',
    },
    purpose: 'Kantonale Steuerstatistik für die Finanzplanung auswerten.',
    expiresInDays: 14,
    expiryState: 'expiringSoon',
    sourceRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    sourceRequestNumber: 'ZA-2026-BEAT',
    renewalEligibility: { eligible: true, reason: 'eligible', renewalRequestId: null },
  }],
};
const SOURCE_REQUEST = {
  id: ACCESS.grants[0].sourceRequestId,
  requestNumber: ACCESS.grants[0].sourceRequestNumber,
  dataProductId: PRODUCT_ID,
  requesterId: 'beat.stalder',
  requesterName: 'Beat Stalder',
  requesterOrganization: 'Kanton St. Gallen',
  contactEmail: 'beat.stalder@sg.ch',
  consumerType: 'person',
  machineId: null,
  purpose: ACCESS.grants[0].purpose,
  legalBasis: 'Gesetzlicher Auftrag der ESTV',
  requestedProtocol: 'http',
  requestedVariant: 'original',
  validFrom: ACCESS.grants[0].validFrom,
  validUntil: ACCESS.grants[0].validUntil,
  notes: null,
  status: 'granted_original',
  requestKind: 'initial',
  renewalOfRequestId: null,
  renewalOfRequestNumber: null,
  renewalContext: null,
  createdAt: '2026-01-01T08:00:00Z',
  updatedAt: '2026-01-01T08:00:00Z',
} as StoredAccessRequest;

function apiStub(access: ProductEffectiveAccessResponse = ACCESS) {
  return {
    selectProduct: vi.fn(),
    identityUserId: vi.fn(() => 'beat.stalder'),
    identityUser: vi.fn(() => ({ displayName: 'Beat Stalder' })),
    loadProduct: vi.fn(() => of(PRODUCT)),
    loadEffectiveAccess: vi.fn(() => of(access)),
    loadMyAccessRequests: vi.fn(() => of([SOURCE_REQUEST])),
    createAccessRenewal: vi.fn(() => of({
      requestNumber: 'ZA-2026-RENEW',
      validUntil: '2027-09-03',
    } as StoredAccessRequest)),
  };
}

async function render(api = apiStub()) {
  await TestBed.configureTestingModule({
    imports: [AccessRenewalFormComponent],
    providers: [
      provideRouter([]),
      { provide: CatalogApiService, useValue: api },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: PRODUCT_ID, grantId: GRANT_ID }) } } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AccessRenewalFormComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, api };
}

describe('AccessRenewalFormComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('prefills purpose and a later end date while rendering scope as immutable context', async () => {
    const { fixture } = await render();
    const root = fixture.nativeElement as HTMLElement;
    const purpose = root.querySelector<HTMLTextAreaElement>('textarea[formcontrolname="purpose"]');
    const validUntil = root.querySelector<HTMLInputElement>('input[formcontrolname="validUntil"]');

    expect(purpose?.value).toBe(ACCESS.grants[0].purpose);
    expect(validUntil?.value).toBe('2027-09-03');
    expect(validUntil?.min).toBe('2026-09-04');
    expect(root.querySelectorAll('select')).toHaveLength(0);
    expect(root.querySelector('[data-testid="renewal-immutable-context"]')?.textContent).toContain('eIAM · beat.stalder');
    expect(root.querySelector('[data-testid="renewal-immutable-context"]')?.textContent).toContain('REST');
    expect(root.querySelector('[data-testid="renewal-immutable-context"]')?.textContent).toContain('Originaldaten');
    expect(root.querySelector('[data-testid="renewal-immutable-context"]')?.textContent).toContain('Gesetzlicher Auftrag der ESTV');
    expect(root.textContent).toContain('Bestehender Zugriff bleibt unverändert');
  });

  it('posts only the source grant, updated purpose, new end date and explicit confirmation', async () => {
    const { fixture, api } = await render();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    fixture.componentInstance.form.setValue({
      purpose: 'Weiterführung der kantonalen Finanzplanung für 2027.',
      validUntil: '2027-12-31',
      conditionsAccepted: true,
    });

    fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(api.createAccessRenewal).toHaveBeenCalledWith(PRODUCT_ID, {
      sourceGrantId: GRANT_ID,
      purpose: 'Weiterführung der kantonalen Finanzplanung für 2027.',
      validUntil: '2027-12-31',
      conditionsAccepted: true,
    });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('bestehende Freigabe bleibt bis zu ihrem bisherigen Enddatum wirksam');
    scrollTo.mockRestore();
  });

  it('fails closed when the grant has no direct source-request evidence', async () => {
    const access = {
      ...ACCESS,
      grants: [{
        ...ACCESS.grants[0],
        sourceRequestId: null,
        sourceRequestNumber: null,
        renewalEligibility: { eligible: false, reason: 'sourceRequestUnavailable' as const, renewalRequestId: null },
      }],
    };
    const { fixture, api } = await render(apiStub(access));
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Verlängerung nicht verfügbar');
    expect(root.querySelector('form')).toBeNull();
    expect(api.createAccessRenewal).not.toHaveBeenCalled();
  });

  it('shows a safe load error without fallback grant data or private API details', async () => {
    const api = apiStub();
    api.loadEffectiveAccess.mockReturnValue(throwError(() => new Error('private policy payload')) as never);
    const { fixture } = await render(api);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('wirksame Freigabekontext konnte nicht vollständig geladen werden');
    expect(root.textContent).not.toContain('private policy payload');
    expect(root.querySelector('form')).toBeNull();
  });
});
