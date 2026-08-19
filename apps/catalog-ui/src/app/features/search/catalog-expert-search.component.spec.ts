import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { FALLBACK_PRODUCT } from '../../core/catalog.seed';
import { CatalogExpertSearchComponent } from './catalog-expert-search.component';

describe('CatalogExpertSearchComponent quality medal', () => {
  it('shows the canonical quality badge in the result tag area', async () => {
    const queryParamMap = convertToParamMap({ q: 'Steuerstatistik' });
    const product = {
      ...FALLBACK_PRODUCT,
      qualityMedal: 'gold' as const,
      qualityScore: 5,
      additionalMetadata: {
        ...FALLBACK_PRODUCT.additionalMetadata,
        deliveryProtocols: ['REST'],
      },
    };
    const api = {
      loading: signal(false),
      products: signal([product]),
    };

    await TestBed.configureTestingModule({
      imports: [CatalogExpertSearchComponent],
      providers: [
        provideRouter([]),
        { provide: CatalogApiService, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap },
            queryParamMap: of(queryParamMap),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(CatalogExpertSearchComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.expert-search-result')).toHaveLength(1);
    const medal = fixture.nativeElement.querySelector('.expert-search-result-tags daca-quality-medal');
    expect(medal).not.toBeNull();
    expect(medal.textContent.trim()).toBe('Gold · 5/6');
    expect(fixture.componentInstance.protocolLabel(product)).toBe('REST');
    const interfaceValue = [...fixture.nativeElement.querySelectorAll('dt')]
      .find((term: HTMLElement) => term.textContent.trim() === 'Schnittstellen')
      ?.nextElementSibling?.textContent.trim();
    expect(interfaceValue).toBe('REST');
  });
});
