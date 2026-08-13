import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '@bit-didaca/design-system';
import { CatalogApiService } from '../../core/catalog-api.service';
import { ProductWorkspaceNavComponent } from '../../shared/product-workspace-nav.component';
import { accessConsumerSummary, dataOwner, DataOwnerProfile, deliveryProtocols } from './my-data-products';

@Component({
  selector: 'didaca-product-overview',
  standalone: true,
  imports: [ProductWorkspaceNavComponent, RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <didaca-product-workspace-nav
      [productId]="product().id"
      [productTitle]="product().title"
      activeSection="overview"
    />

    <section class="didaca-page-heading product-overview-heading">
      <div>
        <p class="didaca-eyebrow">Datenprodukt</p>
        <h1>{{ product().title }}</h1>
        <p>{{ product().description }}</p>
      </div>
      <didaca-status-badge [tone]="product().lifecycle === 'active' ? 'green' : 'orange'">
        @if (product().qualityMedal) { {{ qualityLabel() }} · }{{ product().lifecycle === 'active' ? 'Aktiv' : 'Entwurf' }} · Revision {{ product().revision }}
      </didaca-status-badge>
    </section>

    @for (alert of simulationAlerts(); track alert.eventId) {
      <section class="didaca-alert is-error product-overview-simulation-alert" role="alert"><strong>{{ alert.title }}</strong><span>{{ alert.detail }}</span><a routerLink="/tasks">Aufgabe öffnen</a></section>
    }

    <div class="product-overview-grid">
      <section class="didaca-card product-overview-main" aria-labelledby="product-summary-title">
        <div class="didaca-card-header">
          <div><p class="didaca-eyebrow">Auf einen Blick</p><h2 id="product-summary-title">Produktübersicht</h2></div>
          <span>{{ product().classification === 'restricted' ? 'Eingeschränkt' : product().classification }}</span>
        </div>
        <div class="didaca-card-body">
          <dl class="product-overview-facts">
            <div><dt>Fachgebiet</dt><dd>{{ product().domain }}</dd></div>
            <div><dt>Eigentümerin</dt><dd>{{ owner().name }} · {{ owner().organization }}</dd></div>
            <div><dt>Aktualisierung</dt><dd>{{ product().updateFrequency }}</dd></div>
            <div><dt>Schnittstellen</dt><dd>{{ protocols().join(' · ') }}</dd></div>
            <div><dt>Datenkonsumenten</dt><dd>{{ consumerSummary().total }}</dd></div>
            <div><dt>Identifier</dt><dd><code>{{ product().globalId }}</code></dd></div>
          </dl>
          <div class="product-overview-actions">
            <a class="didaca-button" [routerLink]="['/products', product().id, 'access']">Freigaben verwalten</a>
            <a class="didaca-button is-secondary" [routerLink]="['/products', product().id, 'metadata']">Metadaten bearbeiten</a>
          </div>
        </div>
      </section>

      <aside class="didaca-card product-overview-owner" aria-labelledby="product-owner-title">
        <div class="didaca-card-header"><h2 id="product-owner-title">Data Owner</h2></div>
        <div class="didaca-card-body">
          <img [src]="owner().avatarUrl" alt="">
          <strong>{{ owner().name }}</strong>
          <span>{{ owner().organization }}</span>
          @if (owner().phone; as phone) { <a [href]="'tel:' + phone.replaceAll(' ', '')">{{ phone }}</a> }
          @if (owner().teamsUrl; as teamsUrl) { <a [href]="teamsUrl" target="_blank" rel="noreferrer">Über Teams kontaktieren</a> }
        </div>
      </aside>
    </div>

    <section class="didaca-card product-overview-endpoints" aria-labelledby="product-endpoints-title">
      <div class="didaca-card-header"><h2 id="product-endpoints-title">Bereitgestellte Schnittstellen</h2><span>{{ product().endpoints.length }}</span></div>
      <div class="didaca-card-body">
        @for (endpoint of product().endpoints; track endpoint.id) {
          <article>
            <strong>{{ endpoint.title }}</strong>
            <span>{{ endpoint.protocol === 'http-rest' ? 'REST' : 'PostgreSQL' }}</span>
          </article>
        }
      </div>
    </section>
  `,
})
export class ProductOverviewComponent {
  readonly api = inject(CatalogApiService);
  private readonly route = inject(ActivatedRoute);
  readonly product = this.api.product;
  readonly owner = computed<DataOwnerProfile>(() => dataOwner(this.product()) ?? ({
    name: `${this.product().owner} Data Owner`,
    organization: this.product().owner,
    avatarUrl: '/assets/kassandra-valdata.webp',
  }));
  readonly protocols = computed(() => deliveryProtocols(this.product()));
  readonly consumerSummary = computed(() => accessConsumerSummary(this.product().id, this.api.ownedAccessConsumers()));
  readonly simulationAlerts = computed(() => {
    const value = this.product().additionalMetadata['simulationAlerts'];
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is { eventId: string; title: string; detail: string } => Boolean(item && typeof item === 'object' && 'eventId' in item && 'title' in item && 'detail' in item));
  });
  readonly qualityLabel = computed(() => {
    const medal = ({ bronze: 'Bronze', silver: 'Silber', gold: 'Gold', platinum: 'Platinum' } as const)[this.product().qualityMedal ?? 'bronze'];
    return this.product().qualityScore === undefined ? medal : `${medal} ${this.product().qualityScore}/6`;
  });

  constructor() {
    this.api.selectProduct(this.route.snapshot.paramMap.get('id'));
  }
}
