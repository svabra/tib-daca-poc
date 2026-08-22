import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '@bit-daca/design-system';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { ProductServiceLevelApiService } from '../service-level/product-service-level-api.service';
import { ServiceLevelSummaryResponse } from '../service-level/product-service-level.models';
import { ProductWorkspaceNavComponent } from '../../shared/product-workspace-nav.component';
import { accessConsumerSummary, DataOwnerProfile, deliveryProtocols, resolvedDataOwner, resolvedDeputyDataOwner } from './my-data-products';

@Component({
  selector: 'daca-product-overview',
  standalone: true,
  imports: [ProductWorkspaceNavComponent, RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './product-overview.component.css',
  template: `
    <daca-product-workspace-nav
      [productId]="product().id"
      [productTitle]="product().title"
      activeSection="overview"
    />

    <section class="daca-page-heading product-overview-heading">
      <div>
        <p class="daca-eyebrow">Datenprodukt</p>
        <h1>{{ product().title }}</h1>
        <p>{{ product().description }}</p>
      </div>
      <daca-status-badge [tone]="product().lifecycle === 'active' ? 'green' : 'orange'">
        @if (product().qualityMedal) { {{ qualityLabel() }} · }{{ product().lifecycle === 'active' ? 'Aktiv' : 'Entwurf' }} · Revision {{ product().revision }}
      </daca-status-badge>
    </section>

    @for (alert of simulationAlerts(); track alert.eventId) {
      <section class="daca-alert is-error product-overview-simulation-alert" role="alert"><strong>{{ alert.title }}</strong><span>{{ alert.detail }}</span><a routerLink="/tasks">Aufgabe öffnen</a></section>
    }

    <div class="product-overview-grid">
      <section class="daca-card product-overview-main" aria-labelledby="product-summary-title">
        <div class="daca-card-header">
          <div><p class="daca-eyebrow">Auf einen Blick</p><h2 id="product-summary-title">Produktübersicht</h2></div>
          <span>{{ product().classification === 'restricted' ? 'Eingeschränkt' : product().classification }}</span>
        </div>
        <div class="daca-card-body">
          <dl class="product-overview-facts">
            <div><dt>Fachgebiet</dt><dd>{{ product().domain }}</dd></div>
            <div><dt>Eigentümerin</dt><dd>@if (owner(); as owner) { {{ owner.name }} · {{ owner.organization }} } @else { {{ product().owner }} }</dd></div>
            <div><dt>Aktualisierung</dt><dd>{{ product().updateFrequency }}</dd></div>
            <div><dt>Schnittstellen</dt><dd>{{ protocols().join(' · ') }}</dd></div>
            <div><dt>Datenkonsumenten</dt><dd>{{ consumerSummary().total }}</dd></div>
            <div>
              <dt>Kontrollperson</dt>
              <dd>
                {{ serviceLevel()?.controlPerson?.displayName ?? (serviceLevelLoading() ? 'Wird geladen …' : serviceLevelError() ? 'Kontrollperson derzeit nicht verfügbar' : 'Noch nicht zugewiesen') }}
                @if (serviceLevel()?.controlPerson; as controlPerson) {
                  <small>{{ controlPerson.organization }} · Kontrollperson / Publication Approver</small>
                }
              </dd>
            </div>
            <div><dt>Identifier</dt><dd><code>{{ product().globalId }}</code></dd></div>
          </dl>
          @if (serviceLevel()?.canEdit) {
            <section class="product-overview-control-person" aria-labelledby="control-person-title">
              <div><h3 id="control-person-title">Kontrollperson für Vier-Augen-Prüfungen</h3><p>Die Kontrollperson prüft sowohl SLA-Freigaben als auch Publikations- und Policy-Governance. Dafür kommen nur aktive Publication Approvers infrage; die Kontrollperson darf nicht der Data Owner sein.</p></div>
              <div>
                <label><span>Kontrollperson</span><select [value]="selectedControlPersonId()" (change)="selectedControlPersonId.set($any($event.target).value)"><option value="">Bitte auswählen</option>@for (candidate of activePublicationApprovers(); track candidate.id) { <option [value]="candidate.id">{{ candidate.displayName }} · {{ candidate.organization }}</option> }</select></label>
                <button type="button" class="daca-button is-secondary" [disabled]="!selectedControlPersonId() || controlPersonSaving()" (click)="saveControlPerson()">{{ controlPersonSaving() ? 'Wird gespeichert …' : 'Zuweisung speichern' }}</button>
              </div>
              @if (controlPersonError()) { <p class="daca-alert is-error" role="alert">{{ controlPersonError() }}</p> }
              @if (controlPersonNotice()) { <p class="daca-alert" role="status">{{ controlPersonNotice() }}</p> }
            </section>
          }
          <div class="product-overview-actions">
            <a class="daca-button is-secondary" [routerLink]="['/products', product().id, 'sla']">SLA öffnen</a>
            <a class="daca-button" [routerLink]="['/products', product().id, 'access']">Freigaben verwalten</a>
            <a class="daca-button is-secondary" [routerLink]="['/products', product().id, 'metadata']">Metadaten bearbeiten</a>
          </div>
        </div>
      </section>

      @if (owner(); as owner) {
        <aside class="daca-card product-overview-owner" aria-labelledby="product-owner-title">
          <div class="daca-card-header"><h2 id="product-owner-title">Data Owner</h2></div>
          <div class="daca-card-body">
            <section class="product-overview-owner-person">
              <img [src]="owner.avatarUrl" alt="">
              <span>Data Owner</span>
              <strong>{{ owner.name }} · {{ owner.organization }}</strong>
              @if (owner.phone; as phone) { <a [href]="'tel:' + phone.replaceAll(' ', '')">{{ phone }}</a> }
              @if (owner.teamsUrl; as teamsUrl) { <a [href]="teamsUrl" target="_blank" rel="noreferrer">Über Teams kontaktieren</a> }
            </section>
            @if (deputy(); as deputy) {
              <section class="product-overview-owner-person is-deputy">
                <img [src]="deputy.avatarUrl" alt="">
                <span>Stv. Data Owner</span>
                <strong>{{ deputy.name }} · {{ deputy.organization }}</strong>
                @if (deputy.phone; as phone) { <a [href]="'tel:' + phone.replaceAll(' ', '')">{{ phone }}</a> }
              </section>
            }
          </div>
        </aside>
      }
    </div>

    <section class="daca-card product-overview-endpoints" aria-labelledby="product-endpoints-title">
      <div class="daca-card-header"><h2 id="product-endpoints-title">Bereitgestellte Schnittstellen</h2><span>{{ product().endpoints.length }}</span></div>
      <div class="daca-card-body">
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
  private readonly identity = inject(DemoIdentityService);
  private readonly serviceLevelApi = inject(ProductServiceLevelApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly productId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly product = this.api.product;
  readonly serviceLevel = signal<ServiceLevelSummaryResponse | null>(null);
  readonly serviceLevelLoading = signal(true);
  readonly serviceLevelError = signal(false);
  readonly selectedControlPersonId = signal('');
  readonly controlPersonSaving = signal(false);
  readonly controlPersonError = signal<string | null>(null);
  readonly controlPersonNotice = signal<string | null>(null);
  readonly activePublicationApprovers = computed(() => this.identity.users().filter((user) =>
    user.roles.includes('publication_approver') && user.id !== this.product().ownerUserId,
  ));
  readonly owner = computed<DataOwnerProfile | null>(() => resolvedDataOwner(
    this.product(),
    this.identity.users(),
  ));
  readonly deputy = computed<DataOwnerProfile | null>(() => resolvedDeputyDataOwner(
    this.product(),
    this.identity.users(),
  ));
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
    this.api.selectProduct(this.productId);
    effect(() => {
      this.identity.userId();
      this.loadServiceLevel();
    });
  }

  saveControlPerson(): void {
    const controlPersonUserId = this.selectedControlPersonId();
    if (!controlPersonUserId || !this.serviceLevel()?.canEdit) return;
    this.controlPersonSaving.set(true);
    this.controlPersonError.set(null);
    this.controlPersonNotice.set(null);
    this.serviceLevelApi.updateControlPerson(this.productId, controlPersonUserId, this.product().revision).subscribe({
      next: () => {
        this.controlPersonSaving.set(false);
        this.controlPersonNotice.set('Die Kontrollperson wurde für künftige SLA-Einreichungen aktualisiert.');
        this.api.loadProduct(this.productId).subscribe({
          next: () => this.loadServiceLevel(false),
          error: () => {
            this.serviceLevel.set(null);
            this.controlPersonError.set('Die Zuweisung wurde gespeichert, aber die neue Produktrevision konnte nicht geladen werden. Bitte laden Sie die Seite neu.');
          },
        });
      },
      error: () => {
        this.controlPersonSaving.set(false);
        this.controlPersonError.set('Die Kontrollperson konnte nicht gespeichert werden. Bitte laden Sie die Produktübersicht neu.');
      },
    });
  }

  private loadServiceLevel(showLoading = true): void {
    if (showLoading) this.serviceLevelLoading.set(true);
    this.serviceLevelError.set(false);
    this.serviceLevel.set(null);
    this.selectedControlPersonId.set('');
    this.serviceLevelApi.loadSummary(this.productId).subscribe({
      next: (summary) => {
        this.serviceLevel.set(summary);
        this.serviceLevelLoading.set(false);
        const currentId = this.activePublicationApprovers().find((candidate) =>
          candidate.displayName === summary.controlPerson?.displayName
          && candidate.organization === summary.controlPerson?.organization,
        )?.id
          ?? '';
        this.selectedControlPersonId.set(currentId);
      },
      error: () => {
        this.serviceLevel.set(null);
        this.serviceLevelLoading.set(false);
        this.serviceLevelError.set(true);
      },
    });
  }
}
