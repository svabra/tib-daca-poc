import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { CatalogApiService } from '../../core/catalog-api.service';
import { FALLBACK_PRODUCTS } from '../../core/catalog.seed';
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

    fixture.componentInstance.viewMode.set('records');
    fixture.detectChanges();

    const records = fixture.nativeElement.querySelectorAll('.product-list-item');
    expect(records).toHaveLength(products.length);
    expect(fixture.nativeElement.querySelectorAll('.product-list-item daca-quality-medal')).toHaveLength(products.length);
  });
});
