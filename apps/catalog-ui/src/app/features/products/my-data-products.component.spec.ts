import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { CatalogApiService } from '../../core/catalog-api.service';
import { FALLBACK_PRODUCTS } from '../../core/catalog.seed';
import { OwnedAccessConsumer } from '../../core/catalog.models';
import { MyDataProductsComponent } from './my-data-products.component';

describe('MyDataProductsComponent quality medals', () => {
  it('shows exactly one quality medal for every product in table and records views', async () => {
    const products = FALLBACK_PRODUCTS.slice(0, 2).map((product, index) => ({
      ...product,
      qualityMedal: index === 0 ? 'silver' as const : 'bronze' as const,
      qualityScore: index === 0 ? 4 : 0,
    }));
    const api = {
      identityUser: signal({
        displayName: 'Kassandra Valdata',
        organization: 'Eidgenössische Steuerverwaltung ESTV',
        avatarUrl: null,
      }),
      identityUserId: () => 'kassandra.valdata',
      loading: signal(false),
      usingFallback: signal(false),
      products: signal(products),
      ownedAccessConsumers: signal([]),
    };

    await TestBed.configureTestingModule({
      imports: [MyDataProductsComponent],
      providers: [
        provideRouter([]),
        { provide: CatalogApiService, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(MyDataProductsComponent);
    fixture.componentInstance.filter.set('all');
    fixture.detectChanges();

    const tableRows = fixture.nativeElement.querySelectorAll('.product-table tbody tr');
    expect(tableRows).toHaveLength(products.length);
    expect(fixture.nativeElement.querySelectorAll('.product-table daca-quality-medal')).toHaveLength(products.length);
    expect(fixture.nativeElement.querySelector('.product-table thead')?.textContent).toContain('Zeitstand');
    expect(fixture.nativeElement.querySelectorAll('.product-table-created')).toHaveLength(products.length);
    expect(fixture.nativeElement.querySelector('.product-table-created')?.textContent).toContain('Im Katalog erstellt');
    expect(fixture.nativeElement.querySelector('.product-table-date')?.textContent).toContain('Im Katalog geändert');

    fixture.componentInstance.viewMode.set('records');
    fixture.detectChanges();

    const records = fixture.nativeElement.querySelectorAll('.product-list-item');
    expect(records).toHaveLength(products.length);
    expect(fixture.nativeElement.querySelectorAll('.product-list-item daca-quality-medal')).toHaveLength(products.length);
    const firstRecord = records.item(0) as HTMLElement;
    const recordLabels = Array.from(firstRecord.querySelectorAll<HTMLElement>('dt')).map((item) => item.textContent?.trim());
    expect(recordLabels.indexOf('Im Katalog erstellt')).toBeLessThan(recordLabels.indexOf('Im Katalog geändert'));
    firstRecord.querySelector<HTMLButtonElement>('.product-context-trigger')!.click();
    fixture.detectChanges();
    const recordMenuItems = firstRecord.querySelectorAll<HTMLElement>('[role="menuitem"]');
    expect(recordMenuItems.item(recordMenuItems.length - 1).textContent).toContain('SLA & Nutzungsbedingungen');
  });

  it('keeps SLA last, opens lower-row menus upward and supports menu keyboard navigation', async () => {
    const products = FALLBACK_PRODUCTS.slice(0, 3);
    const api = {
      identityUser: signal({
        displayName: 'Kassandra Valdata',
        organization: 'Eidgenössische Steuerverwaltung ESTV',
        avatarUrl: null,
      }),
      identityUserId: () => 'kassandra.valdata',
      loading: signal(false),
      usingFallback: signal(false),
      products: signal(products),
      ownedAccessConsumers: signal([]),
    };

    await TestBed.configureTestingModule({
      imports: [MyDataProductsComponent],
      providers: [
        provideRouter([]),
        { provide: CatalogApiService, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(MyDataProductsComponent);
    fixture.componentInstance.filter.set('all');
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const rows = root.querySelectorAll<HTMLTableRowElement>('.product-table tbody tr');
    const trigger = rows.item(rows.length - 1).querySelector<HTMLButtonElement>('.product-context-trigger')!;
    trigger.focus();
    trigger.click();
    fixture.detectChanges();

    const menu = rows.item(rows.length - 1).querySelector<HTMLElement>('[role="menu"]')!;
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(rows.item(rows.length - 1).classList.contains('has-open-menu')).toBe(true);
    expect(menu.classList.contains('opens-up')).toBe(true);
    expect(items.at(-1)?.textContent).toContain('SLA & Nutzungsbedingungen');
    expect((items.at(-1) as HTMLAnchorElement).getAttribute('href')).toContain('/sla');

    items[0].focus();
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items[1]);
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(items[0]);
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(items.at(-1));

    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.activeProductMenuId()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('labels a policy-direct consumer grant without fabricating a request number', async () => {
    const product = FALLBACK_PRODUCTS[0];
    const consumers: OwnedAccessConsumer[] = [{
      dataProductId: product.id,
      consumerType: 'person',
      identityId: 'direct.person',
      displayName: 'Direkte Person',
      organization: 'Bundesamt',
      grants: [{
        grantId: 'direct-policy-grant',
        policyRevision: 9,
        requestNumber: null,
        protocol: 'http',
        variant: 'original',
        validFrom: '2026-01-01',
        validUntil: '2026-12-31',
        purpose: null,
        expiresInDays: 133,
        expiryState: 'active',
      }],
    }];
    const api = {
      identityUser: signal({ displayName: 'Kassandra Valdata', organization: 'ESTV', avatarUrl: null }),
      identityUserId: () => 'kassandra.valdata',
      loading: signal(false),
      usingFallback: signal(false),
      products: signal([product]),
      ownedAccessConsumers: signal(consumers),
    };
    await TestBed.configureTestingModule({
      imports: [MyDataProductsComponent],
      providers: [
        provideRouter([]),
        { provide: CatalogApiService, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(MyDataProductsComponent);
    fixture.componentInstance.consumerDrawerProduct.set(product);
    fixture.detectChanges();

    const drawer = fixture.nativeElement.querySelector('.access-consumer-drawer') as HTMLElement;
    expect(drawer.textContent).toContain('Direkte Policy-Freigabe · Revision 9');
    expect(drawer.textContent).not.toContain('null');
  });
});
