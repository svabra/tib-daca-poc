import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { ClipboardService } from '../../core/clipboard.service';
import { FALLBACK_PRODUCT } from '../../core/catalog.seed';
import { DataProduct, ProductEffectiveAccessResponse, ProductQualityWorkspace, StoredAccessRequest } from '../../core/catalog.models';
import { ProductUsageComponent } from './product-usage.component';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT: DataProduct = {
  ...FALLBACK_PRODUCT,
  id: PRODUCT_ID,
  title: 'Kantonale Gewerbesteuer',
  ownerUserId: 'kassandra.valdata',
  endpoints: [
    {
      id: 'rest', protocol: 'http-rest', title: 'Parquet REST API', method: 'GET',
      url: 'http://daca-sample-data-product:8000/api/v1/product', mediaType: 'application/vnd.apache.parquet',
      secretRef: 'must-not-leak', authorization: 'must-not-leak',
    } as never,
    {
      id: 'pg', protocol: 'postgresql', title: 'Analytische Relation', host: 'postgres', port: 5432,
      database: 'daca_sample', schema: 'analytics', relation: 'tax_facts', sslMode: 'require',
      secretRef: 'must-not-leak', password: 'must-not-leak',
    } as never,
  ],
};
const QUALITY: ProductQualityWorkspace = {
  quality: {
    dataProductId: PRODUCT_ID,
    score: 4,
    medal: 'silver',
    dcatReviewed: true,
    criteria: [],
  },
  fields: [
    { id: 'canton', name: 'canton_code', dataType: 'VARCHAR', nullable: false, keyField: true, businessDescription: 'Offizielles Kantonskürzel' },
    { id: 'amount', name: 'amount_chf', dataType: 'DECIMAL', nullable: true, keyField: false, businessDescription: null },
  ],
  graph: null,
  graphStatus: 'missing',
  mappings: [{ id: 'mapping', fieldId: 'canton', mappingType: 'field_property', status: 'confirmed', termUri: 'urn:daca:CantonCode', termLabel: 'Kanton' }],
};

const EFFECTIVE_ACCESS: ProductEffectiveAccessResponse = {
  granted: true,
  grants: [{
    protocols: ['http'],
    validFrom: '2026-08-13',
    validUntil: '2027-08-13',
    weeklyAvailability: {
      weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      startTime: '07:00',
      endTime: '19:00',
      timeZone: 'Europe/Zurich',
    },
  }],
};

function apiStub(options: {
  userId?: string;
  product?: Observable<DataProduct>;
  quality?: Observable<ProductQualityWorkspace>;
  requests?: Observable<readonly StoredAccessRequest[]>;
  effectiveAccess?: Observable<ProductEffectiveAccessResponse>;
} = {}) {
  return {
    identityUserId: vi.fn(() => options.userId ?? 'beat.stalder'),
    loadProduct: vi.fn(() => options.product ?? of(PRODUCT)),
    loadProductQuality: vi.fn(() => options.quality ?? of(QUALITY)),
    loadMyAccessRequests: vi.fn(() => options.requests ?? of([])),
    loadEffectiveAccess: vi.fn(() => options.effectiveAccess ?? of({ granted: false, grants: [] })),
    product: signal(PRODUCT),
  };
}

async function render(
  api: ReturnType<typeof apiStub>,
  clipboard = { writeText: vi.fn().mockResolvedValue(undefined) },
  fragment: string | null = null,
) {
  await TestBed.configureTestingModule({
    imports: [ProductUsageComponent],
    providers: [
      provideRouter([]),
      { provide: CatalogApiService, useValue: api },
      { provide: ClipboardService, useValue: clipboard },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: PRODUCT_ID }), fragment } } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ProductUsageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, clipboard };
}

describe('ProductUsageComponent', () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('renders the dictionary, gaps, exact anchors and credential-free endpoint quickstarts', async () => {
    const { fixture } = await render(apiStub());
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelectorAll('h1').length).toBe(1);
    expect(root.querySelector('h1')?.textContent).toContain('Datenprodukt verstehen und nutzen');
    expect(root.querySelector('#data-dictionary')).not.toBeNull();
    expect(root.querySelector('#endpoint-quickstart')).not.toBeNull();
    expect(root.querySelector('.product-dictionary-table-wrap')?.getAttribute('role')).toBe('region');
    expect(root.querySelector('.product-dictionary-table-wrap')?.getAttribute('tabindex')).toBe('0');
    expect(root.textContent).toContain('Offizielles Kantonskürzel');
    expect(root.textContent).toContain('Fachliche Beschreibung fehlt');
    expect(root.textContent).toContain('application/vnd.apache.parquet');
    expect(root.textContent).toContain('sslmode=require');
    expect(root.textContent).toContain('X-DaCa-User: beat.stalder');
    expect(root.textContent).not.toContain('must-not-leak');
    expect(root.textContent).not.toContain('Authorization:');
  });

  it('filters the dictionary immediately and exposes a distinct filter-empty state', async () => {
    const { fixture } = await render(apiStub());
    const root = fixture.nativeElement as HTMLElement;
    const search = root.querySelector<HTMLInputElement>('.product-dictionary-search input')!;

    search.value = 'DECIMAL';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(root.querySelectorAll('.product-dictionary-table tbody tr').length).toBe(1);
    expect(root.textContent).toContain('amount_chf');
    expect(root.textContent).not.toContain('canton_code');

    search.value = 'does-not-exist';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(root.textContent).toContain('Keine passenden Felder');
    expect(root.textContent).not.toContain('Noch kein Feldschema dokumentiert');
  });

  it('copies the exact generated curl and reports non-blocking success', async () => {
    const { fixture, clipboard } = await render(apiStub());
    const root = fixture.nativeElement as HTMLElement;
    const copy = [...root.querySelectorAll<HTMLButtonElement>('.product-endpoint-snippet button')]
      .find((button) => button.textContent?.includes('Befehl kopieren'))!;

    copy.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(clipboard.writeText).toHaveBeenCalledOnce();
    const copied = clipboard.writeText.mock.calls[0][0] as string;
    expect(copied).toContain("--header 'Accept: application/vnd.apache.parquet'");
    expect(copied).toContain("--header 'X-DaCa-User: beat.stalder'");
    expect(copied).not.toMatch(/authorization|password|secret|token/i);
    expect(root.querySelector('.product-usage-feedback')?.textContent).toContain('kopiert');
  });

  it('shows a non-blocking clipboard error without exposing the rejected value', async () => {
    const clipboard = { writeText: vi.fn().mockRejectedValue(new Error('private clipboard detail')) };
    const { fixture } = await render(apiStub(), clipboard);
    const root = fixture.nativeElement as HTMLElement;
    const copy = [...root.querySelectorAll<HTMLButtonElement>('.product-endpoint-snippet button')]
      .find((button) => button.textContent?.includes('Befehl kopieren'))!;

    copy.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('.product-usage-feedback')?.textContent).toContain('Kopieren ist in diesem Browser nicht verfügbar');
    expect(root.textContent).not.toContain('private clipboard detail');
  });

  it('shows an honest empty endpoint state', async () => {
    const productWithoutEndpoints = { ...PRODUCT, endpoints: [] };
    const { fixture } = await render(apiStub({ product: of(productWithoutEndpoints) }));
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Noch keine Schnittstelle dokumentiert');
    expect(root.querySelector('.product-endpoint-card')).toBeNull();
  });

  it('shows a load error and retries the real API without fallback data', async () => {
    const api = apiStub({ product: throwError(() => new Error('private API detail')) });
    const { fixture } = await render(api);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Daten & Nutzung nicht verfügbar');
    expect(root.textContent).not.toContain('private API detail');
    api.loadProduct.mockReturnValue(of(PRODUCT));
    root.querySelector<HTMLButtonElement>('.product-usage-state button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.textContent).toContain('Offizielles Kantonskürzel');
    expect(root.textContent).not.toContain('Daten & Nutzung nicht verfügbar');
  });

  it('shows owner and consumer-specific empty-schema actions', async () => {
    const emptyQuality = { ...QUALITY, fields: [], mappings: [] };
    const owner = await render(apiStub({ userId: 'kassandra.valdata', quality: of(emptyQuality) }));
    expect((owner.fixture.nativeElement as HTMLElement).textContent).toContain('Schema und Metadaten ergänzen');
    expect((owner.fixture.nativeElement as HTMLElement).textContent).toContain('Ihre Rolle · Data Owner');
    TestBed.resetTestingModule();

    const consumer = await render(apiStub({ userId: 'beat.stalder', quality: of(emptyQuality) }));
    const root = consumer.fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('noch kein Feldschema veröffentlicht');
    expect(root.textContent).toContain('Ihre Rolle · Data Consumer');
    expect(root.textContent).not.toContain('Schema und Metadaten ergänzen');
    expect(root.textContent).toContain('Zugriff anfragen');
  });

  it('does not offer a new request when the personal request status cannot be loaded', async () => {
    const { fixture } = await render(apiStub({ requests: throwError(() => new Error('sensitive-error')) }));
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Zugriffsstatus derzeit nicht verfügbar');
    expect(root.textContent).toContain('wirksame Zugriffsstatus konnte nicht vollständig geladen werden');
    expect(root.querySelector('a[href$="/access-request"]')).toBeNull();
    expect(root.textContent).not.toContain('sensitive-error');
  });

  it('recognizes an effective group grant and does not offer a redundant access request', async () => {
    const { fixture } = await render(apiStub({ effectiveAccess: of(EFFECTIVE_ACCESS) }));
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Freigabe dokumentiert');
    expect(root.textContent).toContain('REST');
    expect(root.textContent).toContain('13.08.2026');
    expect(root.textContent).toContain('Mo, Di, Mi, Do, Fr, 07:00–19:00 Europe/Zurich');
    expect(root.querySelector('a[href$="/access-request"]')).toBeNull();
    expect(root.querySelector('a[href$="/history"]')?.textContent).toContain('Änderungsverlauf');
  });

  it('fails closed when the published policy status cannot be loaded', async () => {
    const { fixture } = await render(apiStub({
      effectiveAccess: throwError(() => new Error('private-policy-error')),
    }));
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Zugriffsstatus derzeit nicht verfügbar');
    expect(root.querySelector('a[href$="/access-request"]')).toBeNull();
    expect(root.textContent).not.toContain('private-policy-error');
  });

  it('fails closed on an inconsistent effective-access response', async () => {
    const { fixture } = await render(apiStub({ effectiveAccess: of({ granted: true, grants: [] }) }));
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Zugriffsstatus derzeit nicht verfügbar');
    expect(root.querySelector('a[href$="/access-request"]')).toBeNull();
  });

  it('scrolls to the requested endpoint section only after asynchronous data renders', async () => {
    vi.useFakeTimers();
    const product = new Subject<DataProduct>();
    const quality = new Subject<ProductQualityWorkspace>();
    const requests = new Subject<readonly StoredAccessRequest[]>();
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    const rendered = await render(apiStub({ product, quality, requests }), undefined, 'endpoint-quickstart');
    const root = rendered.fixture.nativeElement as HTMLElement;
    expect(root.querySelector('#endpoint-quickstart')).toBeNull();

    product.next(PRODUCT); product.complete();
    quality.next(QUALITY); quality.complete();
    requests.next([]); requests.complete();
    rendered.fixture.detectChanges();
    expect(root.querySelector('#endpoint-quickstart')).not.toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();

    vi.runOnlyPendingTimers();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  });
});
