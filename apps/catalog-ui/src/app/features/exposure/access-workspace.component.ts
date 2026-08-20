import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '@bit-daca/design-system';
import { CatalogApiService } from '../../core/catalog-api.service';
import { AccessConsumerGrant, OwnedAccessConsumer } from '../../core/catalog.models';
import { ProductWorkspaceNavComponent } from '../../shared/product-workspace-nav.component';
import { accessConsumerSummary, consumersForProduct } from '../products/my-data-products';

@Component({
  selector: 'daca-access-workspace',
  standalone: true,
  imports: [DatePipe, ProductWorkspaceNavComponent, RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <daca-product-workspace-nav
      [productId]="product().id"
      [productTitle]="product().title"
      activeSection="access"
      accessView="overview"
    />

    <section class="daca-page-heading access-workspace-heading">
      <div>
        <p class="daca-eyebrow">Datenprodukt · Freigaben</p>
        <h1>Freigaben</h1>
        <p>Bearbeiten Sie Zugriffsanfragen, aktive Datenkonsumenten sowie die Metadatenkanäle für KOBY und I14Y an einem Ort.</p>
      </div>
      <a class="daca-button" [routerLink]="['/products', product().id, 'access', 'grant']">Zugriff einstellen</a>
    </section>

    <div class="access-workspace-kpis">
      <a class="daca-card" routerLink="/tasks" [queryParams]="{ product: product().id }">
        <span>Offene Zugriffsanfragen</span><strong>{{ requests().length }}</strong><small>Entscheide im Aufgabenbereich bearbeiten</small>
      </a>
      <a class="daca-card" [routerLink]="['/products', product().id, 'access']" fragment="consumers">
        <span>Aktive Datenkonsumenten</span><strong>{{ consumersLoading() ? '…' : consumersError() ? '–' : consumerSummary().total }}</strong><small>{{ consumersError() ? 'Status nicht verfügbar' : consumerSummary().persons + ' Personen · ' + consumerSummary().machines + ' Maschinen' }}</small>
      </a>
      <a class="daca-card" [routerLink]="['/products', product().id, 'access', 'grant']" fragment="koby">
        <span>KOBY- und I14Y-Metadaten</span><strong>Unabhängige Opt-ins</strong><small>Pro Zugriffseinstellung ausdrücklich festlegen</small>
      </a>
    </div>

    @if (!consumersLoading() && !consumersError() && expiringEntitlements().length) {
      <section id="expiring-entitlements" class="daca-card access-workspace-expiring" aria-labelledby="expiring-entitlements-title">
        <div class="daca-card-header">
          <div><p class="daca-eyebrow">In den nächsten 30 Tagen</p><h2 id="expiring-entitlements-title">Auslaufende Freigaben</h2></div>
          <daca-status-badge tone="orange">{{ expiringEntitlements().length }} {{ expiringEntitlements().length === 1 ? 'Freigabe' : 'Freigaben' }}</daca-status-badge>
        </div>
        <div class="daca-card-body">
          @for (entitlement of expiringEntitlements(); track entitlement.grant.grantId) {
            <article class="access-workspace-entitlement">
              <div>
                <strong>{{ entitlement.consumer.displayName }}</strong>
                <small>{{ entitlement.consumer.consumerType === 'person' ? 'eIAM' : 'M2M' }} · {{ entitlement.consumer.identityId }}</small>
              </div>
              <div><span>{{ protocolLabel(entitlement.grant.protocol) }}</span><small>{{ entitlement.grant.variant === 'original' ? 'Originaldaten' : 'Modifiziert' }}</small></div>
              <div><strong>{{ expiryLabel(entitlement.grant.expiresInDays) }}</strong><small>Gültig bis {{ entitlement.grant.validUntil | date: 'dd.MM.yyyy' }}</small></div>
            </article>
          }
          <p class="access-workspace-expiry-note">Diese Liste stammt aus der aktuell aktiven Policy. Offene Verlängerungen ändern die wirksame Freigabe erst nach Vier-Augen-Entscheid und bestätigtem OPA-/PostgreSQL-Deployment.</p>
        </div>
      </section>
    }

    <section id="consumers" class="daca-card access-workspace-consumers" aria-labelledby="access-consumers-title">
      <div class="daca-card-header">
        <div><p class="daca-eyebrow">Aktuell berechtigt</p><h2 id="access-consumers-title">Datenkonsumenten</h2></div>
        @if (consumersLoading()) { <daca-status-badge tone="orange">Wird geladen</daca-status-badge> }
        @else if (consumersError()) { <daca-status-badge tone="red">Nicht verfügbar</daca-status-badge> }
        @else { <daca-status-badge tone="green">{{ consumerSummary().total }} aktiv</daca-status-badge> }
      </div>
      <div class="daca-card-body">
        @if (consumersLoading()) {
          <p class="access-workspace-empty" role="status">Aktive Freigaben werden aus der veröffentlichten Policy geladen …</p>
        } @else if (consumersError()) {
          <div class="access-workspace-consumer-error" role="alert"><p>Aktive Freigaben konnten nicht verlässlich geladen werden. Es werden keine Ersatzdaten angezeigt.</p><button class="daca-button is-secondary" type="button" (click)="loadConsumers()">Erneut versuchen</button></div>
        } @else if (consumers().length) {
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
  private readonly ownedConsumers = signal<readonly OwnedAccessConsumer[]>([]);
  readonly consumersLoading = signal(true);
  readonly consumersError = signal(false);
  private consumersGeneration = 0;
  readonly consumers = computed(() => consumersForProduct(this.product().id, this.ownedConsumers()));
  readonly consumerSummary = computed(() => accessConsumerSummary(this.product().id, this.ownedConsumers()));
  readonly expiringEntitlements = computed(() => this.consumers()
    .flatMap((consumer) => consumer.grants
      .filter((grant) => grant.expiryState === 'expiringSoon' && grant.expiresInDays >= 0 && grant.expiresInDays <= 30)
      .map((grant) => ({ consumer, grant })))
    .sort((left, right) => left.grant.expiresInDays - right.grant.expiresInDays));
  readonly requests = computed(() => this.api.ownerAccessRequests().filter((request) => request.dataProductId === this.product().id));

  constructor() {
    this.api.selectProduct(this.route.snapshot.paramMap.get('id'));
    effect(() => {
      this.api.identityUserId();
      this.loadConsumers();
    });
  }

  loadConsumers(): void {
    const generation = ++this.consumersGeneration;
    this.consumersLoading.set(true);
    this.consumersError.set(false);
    this.ownedConsumers.set([]);
    this.api.loadOwnedAccessConsumers().subscribe({
      next: (consumers) => {
        if (generation !== this.consumersGeneration) return;
        this.ownedConsumers.set(consumers);
        this.consumersLoading.set(false);
      },
      error: () => {
        if (generation !== this.consumersGeneration) return;
        this.consumersError.set(true);
        this.consumersLoading.set(false);
      },
    });
  }

  protocolLabel(protocol: AccessConsumerGrant['protocol']): string {
    return ({ http: 'REST', postgresql: 'PostgreSQL', both: 'REST & PostgreSQL' })[protocol];
  }

  expiryLabel(days: number): string {
    return days === 0 ? 'Läuft heute ab' : days === 1 ? 'Läuft morgen ab' : `Läuft in ${days} Tagen ab`;
  }
}
