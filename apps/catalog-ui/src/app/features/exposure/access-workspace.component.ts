import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '@bit-didaca/design-system';
import { CatalogApiService } from '../../core/catalog-api.service';
import { ProductWorkspaceNavComponent } from '../../shared/product-workspace-nav.component';
import { accessConsumerSummary, consumersForProduct } from '../products/my-data-products';

@Component({
  selector: 'didaca-access-workspace',
  standalone: true,
  imports: [ProductWorkspaceNavComponent, RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <didaca-product-workspace-nav
      [productId]="product().id"
      [productTitle]="product().title"
      activeSection="access"
      accessView="overview"
    />

    <section class="didaca-page-heading access-workspace-heading">
      <div>
        <p class="didaca-eyebrow">Datenprodukt · Freigaben</p>
        <h1>Freigaben</h1>
        <p>Bearbeiten Sie Zugriffsanfragen, aktive Datenkonsumenten sowie die Metadatenkanäle für KOBY und I14Y an einem Ort.</p>
      </div>
      <a class="didaca-button" [routerLink]="['/products', product().id, 'access', 'grant']">Zugriff einstellen</a>
    </section>

    <div class="access-workspace-kpis">
      <a class="didaca-card" routerLink="/tasks" [queryParams]="{ product: product().id }">
        <span>Offene Zugriffsanfragen</span><strong>{{ requests().length }}</strong><small>Entscheide im Aufgabenbereich bearbeiten</small>
      </a>
      <a class="didaca-card" [routerLink]="['/products', product().id, 'access']" fragment="consumers">
        <span>Aktive Datenkonsumenten</span><strong>{{ consumerSummary().total }}</strong><small>{{ consumerSummary().persons }} Personen · {{ consumerSummary().machines }} Maschinen</small>
      </a>
      <a class="didaca-card" [routerLink]="['/products', product().id, 'access', 'grant']" fragment="koby">
        <span>KOBY- und I14Y-Metadaten</span><strong>Unabhängige Opt-ins</strong><small>Pro Zugriffseinstellung ausdrücklich festlegen</small>
      </a>
    </div>

    <section id="consumers" class="didaca-card access-workspace-consumers" aria-labelledby="access-consumers-title">
      <div class="didaca-card-header">
        <div><p class="didaca-eyebrow">Aktuell berechtigt</p><h2 id="access-consumers-title">Datenkonsumenten</h2></div>
        <didaca-status-badge tone="green">{{ consumerSummary().total }} aktiv</didaca-status-badge>
      </div>
      <div class="didaca-card-body">
        @if (consumers().length) {
          @for (consumer of consumers(); track consumer.consumerType + consumer.identityId) {
            <article class="access-workspace-consumer">
              <span>{{ consumer.consumerType === 'person' ? 'eIAM' : 'M2M' }}</span>
              <div><strong>{{ consumer.displayName }}</strong><small>{{ consumer.organization }} · {{ consumer.identityId }}</small></div>
              <small>{{ consumer.grants.length }} {{ consumer.grants.length === 1 ? 'aktive Freigabe' : 'aktive Freigaben' }}</small>
            </article>
          }
        } @else {
          <p class="access-workspace-empty">Für dieses Datenprodukt bestehen noch keine aktiven Freigaben.</p>
        }
      </div>
    </section>

    <aside class="access-workspace-technical">
      <div><strong>Erweiterte technische Kontrolle</strong><span>PBAC-Regeln und deren Durchsetzung über OPA und PostgreSQL prüfen.</span></div>
      <a [routerLink]="['/products', product().id, 'security']">Technische Durchsetzung öffnen</a>
    </aside>
  `,
})
export class AccessWorkspaceComponent {
  readonly api = inject(CatalogApiService);
  private readonly route = inject(ActivatedRoute);
  readonly product = this.api.product;
  readonly consumers = computed(() => consumersForProduct(this.product().id, this.api.ownedAccessConsumers()));
  readonly consumerSummary = computed(() => accessConsumerSummary(this.product().id, this.api.ownedAccessConsumers()));
  readonly requests = computed(() => this.api.ownerAccessRequests().filter((request) => request.dataProductId === this.product().id));

  constructor() {
    this.api.selectProduct(this.route.snapshot.paramMap.get('id'));
  }
}
