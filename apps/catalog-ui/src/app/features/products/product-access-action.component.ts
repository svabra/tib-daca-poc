import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductPersonalAccessService } from './product-personal-access.service';

/** Keep the access entry point visible while its actor-scoped status is loading or unavailable. */
@Component({
  selector: 'daca-product-access-action', standalone: true, imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (eligible()) {
      @if (access.ready()) {
        <a class="daca-button product-overview-request-access" [routerLink]="['/products', productId(), 'access-request']" [queryParams]="access.granted() ? {intent:'change'} : null">{{ access.granted() ? 'Zugriffänderung beantragen' : 'Zugriff anfragen' }}</a>
      } @else if (access.error()) {
        <div class="access-action-status"><p role="alert">Ihr Zugriffsstatus ist derzeit nicht verfügbar.</p><button type="button" class="daca-button is-secondary" (click)="access.retry()">Zugriffsstatus erneut prüfen</button></div>
      } @else {
        <div class="access-action-status"><button type="button" class="daca-button is-secondary" disabled>Zugriff wird geprüft …</button><p role="status">Ihre Berechtigungen werden geladen.</p></div>
      }
    }
  `,
  styles: `:host { display:contents; } .daca-button { min-height:44px; max-width:100%; white-space:normal; } .access-action-status { max-width:320px; } p { font-size:.78rem; margin:0 0 8px; }`,
})
export class ProductAccessActionComponent {
  readonly productId = input.required<string>();
  readonly eligible = input.required<boolean>();
  readonly access = inject(ProductPersonalAccessService);
}
