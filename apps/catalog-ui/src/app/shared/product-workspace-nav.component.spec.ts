import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ProductWorkspaceNavComponent } from './product-workspace-nav.component';

describe('ProductWorkspaceNavComponent', () => {
  it('links to the product history after lineage and marks it as the current page', async () => {
    await TestBed.configureTestingModule({
      imports: [ProductWorkspaceNavComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(ProductWorkspaceNavComponent);
    fixture.componentRef.setInput('productId', 'product-1');
    fixture.componentRef.setInput('productTitle', 'Testprodukt');
    fixture.componentRef.setInput('activeSection', 'history');
    fixture.detectChanges();

    const links = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('.product-workspace-nav a')];
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      'Übersicht',
      'Metadaten',
      'Freigaben',
      'Lineage & Provenienz',
      'Änderungsverlauf',
    ]);
    expect(links.at(-1)?.getAttribute('href')).toBe('/products/product-1/history');
    expect(links.at(-1)?.getAttribute('aria-current')).toBe('page');
  });
});
