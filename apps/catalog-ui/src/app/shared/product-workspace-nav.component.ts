import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export type ProductWorkspaceSection = 'overview' | 'metadata' | 'access' | 'lineage';
export type ProductAccessView = 'overview' | 'grant' | 'technical' | null;

@Component({
  selector: 'daca-product-workspace-nav',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="product-workspace-context">
      <nav class="product-workspace-breadcrumb" aria-label="Brotkrümelnavigation">
        <a routerLink="/products">Meine Datenprodukte</a>
        <span aria-hidden="true">›</span>
        <strong>{{ productTitle() }}</strong>
      </nav>

      <nav class="product-workspace-nav" aria-label="Bereiche dieses Datenprodukts">
        <a
          [routerLink]="['/products', productId(), 'overview']"
          [class.is-active]="activeSection() === 'overview'"
          [attr.aria-current]="activeSection() === 'overview' ? 'page' : null"
        >Übersicht</a>
        <a
          [routerLink]="['/products', productId(), 'metadata']"
          [class.is-active]="activeSection() === 'metadata'"
          [attr.aria-current]="activeSection() === 'metadata' ? 'page' : null"
        >Metadaten</a>
        <a
          [routerLink]="['/products', productId(), 'access']"
          [class.is-active]="activeSection() === 'access'"
          [attr.aria-current]="activeSection() === 'access' ? 'page' : null"
        >Freigaben</a>
        <a
          [routerLink]="['/products', productId(), 'lineage']"
          [class.is-active]="activeSection() === 'lineage'"
          [attr.aria-current]="activeSection() === 'lineage' ? 'page' : null"
        >Lineage &amp; Provenienz</a>
      </nav>

      @if (activeSection() === 'access') {
        <nav class="product-access-nav" aria-label="Freigabeverwaltung">
          <a
            [routerLink]="['/products', productId(), 'access']"
            [class.is-active]="accessView() === 'overview'"
            [attr.aria-current]="accessView() === 'overview' ? 'page' : null"
          >Übersicht</a>
          <a routerLink="/tasks" [queryParams]="{ product: productId() }">Zugriffsanfragen</a>
          <a [routerLink]="['/products', productId(), 'access']" fragment="consumers">Datenkonsumenten</a>
          <a
            [routerLink]="['/products', productId(), 'access', 'grant']"
            [class.is-active]="accessView() === 'grant'"
            [attr.aria-current]="accessView() === 'grant' ? 'page' : null"
          >Zugriff einstellen</a>
          <a [routerLink]="['/products', productId(), 'access', 'grant']" fragment="koby">Metadatenkanäle</a>
          <a
            class="is-advanced"
            [routerLink]="['/products', productId(), 'security']"
            [class.is-active]="accessView() === 'technical'"
            [attr.aria-current]="accessView() === 'technical' ? 'page' : null"
          >Technische Durchsetzung</a>
        </nav>
      }
    </div>
  `,
})
export class ProductWorkspaceNavComponent {
  readonly productId = input.required<string>();
  readonly productTitle = input.required<string>();
  readonly activeSection = input.required<ProductWorkspaceSection>();
  readonly accessView = input<ProductAccessView>(null);
}
