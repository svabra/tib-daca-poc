import { AccessEndDatePipe } from '../../shared/access-end-date.pipe';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '@bit-daca/design-system';
import { CatalogApiService } from '../../core/catalog-api.service';
import { AccessConsumerGrant, ProductPermissionsResponse } from '../../core/catalog.models';
import { ProductWorkspaceNavComponent } from '../../shared/product-workspace-nav.component';
import { ProductPermissionsComponent } from './product-permissions.component';
import { ProductAccessRequestsComponent } from './product-access-requests.component';
import { ProductAccessActionComponent } from '../products/product-access-action.component';
import { ProductEndpointAccessComponent } from '../products/product-endpoint-access.component';
import { ProductPersonalAccessService } from '../products/product-personal-access.service';
import { canTransferOwnership, deliveryProtocols } from '../products/my-data-products';

@Component({
  selector: 'daca-access-workspace',
  standalone: true,
  imports: [AccessEndDatePipe, ProductWorkspaceNavComponent, RouterLink, StatusBadgeComponent, ProductPermissionsComponent, ProductAccessRequestsComponent, ProductAccessActionComponent, ProductEndpointAccessComponent],
  providers: [ProductPersonalAccessService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <daca-product-workspace-nav
      [productId]="product().id"
      [productTitle]="product().title"
      activeSection="access"
      accessView="overview"
      [manageAccess]="canManage()"
    />

    <section class="daca-page-heading access-workspace-heading">
      <div>
        <p class="daca-eyebrow">Datenprodukt · Freigaben</p>
        <h1>Freigaben</h1>
        @if (canManage()) { <p>Bearbeiten Sie Zugriffsanfragen, aktive Datenkonsumenten sowie die Metadatenkanäle für KOBY und I14Y an einem Ort.</p> }
        @else { <p>Prüfen Sie Ihre Berechtigungen und die veröffentlichten Freigaben dieses Datenprodukts. Die Verwaltung erfolgt durch den zuständigen Data Owner.</p> }
      </div>
      @if(permissionState()?.canManage){<a class="daca-button" [routerLink]="['/products', product().id, 'access', 'grant']">Zugriff einstellen</a>}
      <daca-product-access-action [productId]="productId" [eligible]="requesterContext()" />
    </section>

    @if (!canManage()) {
      <section class="daca-card" aria-label="Ihre Zugriffsberechtigungen"><div class="daca-card-body">
        @for (protocol of protocols(); track protocol) {
          <h2>{{ protocol }}</h2><daca-product-endpoint-access [protocol]="protocol === 'REST' ? 'http-rest' : 'postgresql'" />
        }
      </div></section>
    }
    <div class="access-workspace-kpis" [class.is-read-only]="!canManage()">
      @if (canManage()) {
      <a class="daca-card" [routerLink]="['/products', product().id, 'access']" fragment="access-requests">
        <span>Offene Zugriffsanfragen</span><strong>{{ requests().length }}</strong><small>Offene und beantwortete Anfragen auf dieser Seite anzeigen</small>
      </a>
      }
      <a class="daca-card" [routerLink]="['/products', product().id, 'access']" fragment="consumers">
        <span>Aktive Datenkonsumenten</span><strong>{{ consumersLoading() ? '…' : consumersError() ? '–' : consumerSummary().total }}</strong><small>{{ consumersError() ? 'Status nicht verfügbar' : consumerSummary().persons + ' Personen · ' + consumerSummary().machines + ' Maschinen · ' + consumerSummary().groups + ' Gruppen' }}</small>
      </a>
      @if (canManage()) {
      <a class="daca-card" [routerLink]="['/products', product().id, 'access', 'grant']" fragment="koby">
        <span>KOBY- und I14Y-Metadaten</span><strong>Unabhängige Opt-ins</strong><small>Pro Zugriffseinstellung ausdrücklich festlegen</small>
      </a>
      }
    </div>

    @if (canManage() && !consumersLoading() && !consumersError() && expiringEntitlements().length) {
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
              <div><strong>{{ expiryLabel(entitlement.grant.expiresInDays) }}</strong><small>Gültig bis {{ entitlement.grant.validUntil | accessEndDate }}</small></div>
            </article>
          }
          <p class="access-workspace-expiry-note">Diese Liste stammt aus der aktuell aktiven Policy. Offene Verlängerungen ändern die wirksame Freigabe erst nach Vier-Augen-Entscheid und bestätigtem OPA-/PostgreSQL-Deployment.</p>
        </div>
      </section>
    }

    @if (canManage()) { <daca-product-access-requests [productId]="productId" /> }
    <daca-product-permissions [productId]="product().id" (loaded)="permissionState.set($event)" />

    @if (canManage()) { <aside class="access-workspace-technical">
      <div><strong>Erweiterte technische Kontrolle</strong><span>PBAC-Regeln und deren Durchsetzung über OPA und PostgreSQL prüfen.</span></div>
      <a [routerLink]="['/products', product().id, 'security']">Technische Durchsetzung öffnen</a>
    </aside> }
  `,
  styles: `.access-workspace-kpis.is-read-only { grid-template-columns:minmax(0,1fr); }`,
})
export class AccessWorkspaceComponent {
  readonly api = inject(CatalogApiService);
  private readonly route = inject(ActivatedRoute);
  readonly productId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly personalAccess = inject(ProductPersonalAccessService);
  readonly product = this.api.product;
  readonly permissionState=signal<ProductPermissionsResponse|null>(null);
  readonly canManage = computed(() => this.product().id === this.productId && this.permissionState()?.canManage === true);
  readonly requesterContext = computed(() => this.product().id === this.productId && !this.canManage()
    && this.product().canManage !== true && !canTransferOwnership(this.product(), this.api.identityUserId()));
  readonly protocols = computed(() => deliveryProtocols(this.product()));
  readonly consumersLoading=computed(()=>false);
  readonly consumersError=computed(()=>!this.permissionState()||this.permissionState()?.state!=='confirmed');
  readonly consumerSummary=computed(()=>{
    const ids=new Map((this.permissionState()?.items??[]).map(item=>[item.grant.subject.type+':'+item.grant.subject.id,item.grant.subject.type]));
    const kinds=[...ids.values()];return{total:ids.size,persons:kinds.filter(kind=>kind==='person').length,machines:kinds.filter(kind=>kind==='machine').length,groups:kinds.filter(kind=>kind==='group').length};
  });
  readonly expiringEntitlements=computed(()=>{
    const state=this.permissionState();if(!state||state.state!=='confirmed')return[];
    const today=Date.parse(state.asOfDate+'T00:00:00Z');
    return state.items.flatMap(item=>{
      if(item.grant.validUntil==='9999-12-31')return[];
      const days=Math.round((Date.parse(item.grant.validUntil+'T00:00:00Z')-today)/86400000);
      return days>=0&&days<=30?[{consumer:{displayName:item.displayName,consumerType:item.grant.subject.type,identityId:item.grant.subject.id},grant:{grantId:item.grantId,protocol:item.grant.protocols.length===2?'both' as const:item.grant.protocols[0],variant:item.grant.dataVariant,validUntil:item.grant.validUntil,expiresInDays:days}}]:[];
    }).sort((left,right)=>left.grant.expiresInDays-right.grant.expiresInDays);
  });
  readonly requests = computed(() => this.api.ownerAccessRequests().filter((request) => request.dataProductId === this.product().id));

  constructor() {
    this.api.selectProduct(this.productId);
    effect(() => {
      this.api.identityUserId();
      untracked(() => { this.permissionState.set(null); this.personalAccess.load(this.productId); });
    });
  }

  protocolLabel(protocol: AccessConsumerGrant['protocol']): string {
    return ({ http: 'REST', postgresql: 'PostgreSQL', both: 'REST & PostgreSQL' })[protocol];
  }

  expiryLabel(days: number): string {
    return days === 0 ? 'Läuft heute ab' : days === 1 ? 'Läuft morgen ab' : `Läuft in ${days} Tagen ab`;
  }
}
