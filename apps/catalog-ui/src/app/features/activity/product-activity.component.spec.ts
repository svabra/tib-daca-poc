import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { FALLBACK_PRODUCT } from '../../core/catalog.seed';
import { DataProduct, ProductActivityItem, ProductActivityResponse } from '../../core/catalog.models';
import { ProductActivityComponent } from './product-activity.component';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

function activity(index: number, overrides: Partial<ProductActivityItem> = {}): ProductActivityItem {
  return {
    key: `activity-${index}`,
    eventType: 'metadata-updated',
    category: 'metadata',
    status: 'success',
    title: `Metadaten aktualisiert ${index}`,
    description: 'Der Katalogeintrag wurde aktualisiert.',
    occurredAt: `2026-08-${String(19 - (index % 10)).padStart(2, '0')}T07:15:00Z`,
    actor: { displayName: 'Kassandra Valdata', kind: 'person' },
    productRevision: index,
    policyRevision: null,
    facts: [],
    technicalEvidence: [],
    ...overrides,
  };
}

function response(items: ProductActivityItem[], detailLevel: ProductActivityResponse['detailLevel'] = 'privileged'): ProductActivityResponse {
  return { detailLevel, items };
}

const PRODUCT: DataProduct = { ...FALLBACK_PRODUCT, id: PRODUCT_ID, title: 'Kantonale Gewerbesteuer' };

function apiStub(
  load: () => Observable<ProductActivityResponse>,
  loadProduct: () => Observable<DataProduct> = () => of(PRODUCT),
) {
  return {
    product: signal(PRODUCT),
    loadProduct: vi.fn(loadProduct),
    loadProductActivity: vi.fn(load),
  };
}

async function render(api: ReturnType<typeof apiStub>) {
  await TestBed.configureTestingModule({
    imports: [ProductActivityComponent],
    providers: [
      provideRouter([]),
      { provide: CatalogApiService, useValue: api },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: PRODUCT_ID }) } } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ProductActivityComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('ProductActivityComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders an accessible timeline, safe evidence and twenty entries at first', async () => {
    const items = Array.from({ length: 25 }, (_, index) => activity(index + 1));
    items[0] = activity(1, {
      eventType: 'publication-activated',
      category: 'deployment',
      title: 'Datenprodukt und Zugriffe aktiviert',
      policyRevision: 4,
      facts: [{ label: 'Zustand', value: 'Publiziert' }],
      technicalEvidence: [{ label: 'Zielsystem', value: 'OPA' }],
    });
    const api = apiStub(() => of(response(items)));
    const fixture = await render(api);
    const root = fixture.nativeElement as HTMLElement;

    expect(api.loadProduct).toHaveBeenCalledWith(PRODUCT_ID);
    expect(api.loadProductActivity).toHaveBeenCalledWith(PRODUCT_ID);
    expect(root.textContent).toContain('Kantonale Gewerbesteuer');
    expect(root.querySelectorAll('h1').length).toBe(1);
    expect(root.querySelector('ol[aria-label]')).not.toBeNull();
    expect(root.querySelectorAll('.product-activity-timeline > li').length).toBe(20);
    expect(root.querySelector('time')?.getAttribute('datetime')).toBe(items[0].occurredAt);
    expect(root.querySelector('details code')?.textContent).toContain('OPA');

    (root.querySelector('.product-activity-load-more button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(root.querySelectorAll('.product-activity-timeline > li').length).toBe(25);
    expect(root.querySelector('.product-activity-load-more')).toBeNull();
  });

  it('filters categories immediately and resets the visible page', async () => {
    const items = [
      activity(1),
      activity(2, { eventType: 'quality-reviewed', category: 'quality', title: 'Qualität geprüft' }),
      activity(3, { eventType: 'publication-activated', category: 'deployment', title: 'Aktiviert' }),
    ];
    const fixture = await render(apiStub(() => of(response(items))));
    const root = fixture.nativeElement as HTMLElement;
    const button = [...root.querySelectorAll<HTMLButtonElement>('.product-activity-filters button')]
      .find((candidate) => candidate.textContent?.includes('Technische Aktivierung'))!;

    button.click();
    fixture.detectChanges();

    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelectorAll('.product-activity-timeline > li').length).toBe(1);
    expect(root.textContent).toContain('Aktiviert');
    expect(root.textContent).not.toContain('Qualität geprüft');
  });

  it('does not disclose technical evidence from a malformed summary response', async () => {
    const item = activity(1, {
      technicalEvidence: [{ label: 'Interne Referenz', value: 'must-not-render' }],
    });
    const fixture = await render(apiStub(() => of(response([item], 'summary'))));
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.product-activity-evidence')).toBeNull();
    expect(root.textContent).not.toContain('must-not-render');
  });

  it('announces loading and distinguishes a filter-empty result', async () => {
    const result = new Subject<ProductActivityResponse>();
    const fixture = await render(apiStub(() => result));
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('[role="status"]')?.textContent).toContain('Änderungsverlauf wird geladen');

    result.next(response([activity(1)]));
    result.complete();
    fixture.detectChanges();
    const deploymentFilter = [...root.querySelectorAll<HTMLButtonElement>('.product-activity-filters button')]
      .find((candidate) => candidate.textContent?.includes('Technische Aktivierung'))!;
    deploymentFilter.click();
    fixture.detectChanges();

    expect(root.textContent).toContain('Keine passenden Aktivitäten');
    expect(root.textContent).not.toContain('Noch keine Aktivitäten');
  });

  it('shows a stable empty state and an isolated retryable error', async () => {
    let attempt = 0;
    const api = apiStub(() => {
      attempt += 1;
      return attempt === 1
        ? throwError(() => new Error('token=must-not-leak'))
        : of(response([]));
    });
    const fixture = await render(api);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Änderungsverlauf nicht verfügbar');
    expect(root.textContent).not.toContain('token=must-not-leak');

    (root.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(api.loadProductActivity).toHaveBeenCalledTimes(2);
    expect(root.textContent).toContain('Noch keine Aktivitäten');
  });

  it('never renders a mismatched fallback product in a deep-link history', async () => {
    const mismatched = { ...PRODUCT, id: '22222222-2222-4222-8222-222222222222', title: 'Falsches Produkt' };
    const fixture = await render(apiStub(() => of(response([activity(1)])), () => of(mismatched)));
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Änderungsverlauf nicht verfügbar');
    expect(root.textContent).not.toContain('Falsches Produkt');
    expect(root.textContent).not.toContain('Metadaten aktualisiert 1');
  });
});
