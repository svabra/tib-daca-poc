import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { AccessRequestStatus, StoredAccessRequest } from '../../core/catalog.models';
import { AccessEndDatePipe } from '../../shared/access-end-date.pipe';

@Component({
  selector: 'daca-product-access-requests', standalone: true,
  imports: [DatePipe, AccessEndDatePipe], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section id="access-requests" class="daca-card" aria-labelledby="product-requests-title">
      <div class="daca-card-header">
        <div><p class="daca-eyebrow">Freigaben</p><h2 id="product-requests-title">Zugriffsanfragen</h2></div>
        <button class="daca-button is-secondary" type="button" [disabled]="loading()" (click)="reload()">Aktualisieren</button>
      </div>
      <div class="daca-card-body">
        <p>Offene und beantwortete Anfragen für dieses Datenprodukt. Details öffnen direkt in der Liste.</p>
        @if(loading() && !requests().length){<p role="status">Zugriffsanfragen werden geladen …</p>}
        @else if(forbidden()){<p>Die Antragsdetails sind nur für den zuständigen Data Owner und weitere zuständige Personen einsehbar.</p>}
        @else if(error()){<p role="alert">Die Zugriffsanfragen konnten nicht geladen werden. Bitte erneut versuchen.</p>}
        @else{
          <div class="request-list-controls">
            <p aria-live="polite">{{requests().length}} Anfragen · {{answeredCount()}} beantwortet</p>
            <label>Sortierung nach Eingang<select [value]="direction()" (change)="setDirection($event)"><option value="desc">Neueste zuerst</option><option value="asc">Älteste zuerst</option></select></label>
          </div>
          @for(request of sortedRequests(); track request.id){
            <article class="product-access-request" [attr.data-access-request-id]="request.id">
              <header><div><strong>{{request.requesterName}}</strong><span>{{request.requesterOrganization}}</span><small>{{request.requestNumber}} · {{request.requestKind === 'renewal' ? 'Verlängerungsantrag' : 'Zugriffsanfrage'}}</small></div>
                <span class="request-outcome" [class.is-granted]="request.status.startsWith('granted_')" [class.is-rejected]="request.status === 'rejected'">{{statusLabel(request.status)}}</span>
              </header>
              <dl><div><dt>Eingegangen</dt><dd><time [attr.datetime]="request.createdAt">{{request.createdAt | date:'dd.MM.yyyy, HH:mm:ss'}}</time></dd></div><div><dt>Zuletzt bearbeitet</dt><dd><time [attr.datetime]="request.updatedAt">{{request.updatedAt | date:'dd.MM.yyyy, HH:mm:ss'}}</time></dd></div></dl>
              <details><summary>Antragsdetails anzeigen</summary><dl class="request-details">
                <div><dt>Identität</dt><dd>{{request.consumerType === 'machine' ? 'M2M · ' + request.machineId : 'eIAM · ' + request.requesterId}}</dd></div>
                <div><dt>Verwendungszweck</dt><dd>{{request.purpose}}</dd></div><div><dt>Rechtsgrundlage / Auftrag</dt><dd>{{request.legalBasis}}</dd></div>
                <div><dt>Gewünschter Zugriff</dt><dd>{{protocolLabel(request.requestedProtocol)}} · {{variantLabel(request.requestedVariant)}}</dd></div>
                <div><dt>Gültigkeit</dt><dd>{{request.validFrom | date:'dd.MM.yyyy'}} bis {{request.validUntil | accessEndDate}}</dd></div>
                <div><dt>Kontakt</dt><dd>{{request.contactEmail}}</dd></div>
                @if(request.notes){<div><dt>Ergänzende Hinweise</dt><dd>{{request.notes}}</dd></div>}
              </dl></details>
            </article>
          }@empty{<p>Für dieses Datenprodukt liegen noch keine Zugriffsanfragen vor.</p>}
        }
      </div>
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0;max-width:100%;margin-bottom:1.5rem}section{scroll-margin-top:1rem}.daca-card-header,.request-list-controls,.product-access-request header{display:flex;align-items:start;justify-content:space-between;gap:1rem;flex-wrap:wrap}.request-list-controls{align-items:center;margin:1rem 0}.request-list-controls label{display:grid;gap:.4rem;font-size:.85rem;font-weight:700}select,button{min-height:44px}select{border:1px solid var(--daca-border-strong);background:white;color:inherit;padding:.6rem}.product-access-request{padding:1.25rem 0;border-top:1px solid var(--daca-border);overflow-wrap:anywhere}.product-access-request header div{display:grid;gap:.3rem}.product-access-request small,dt{color:var(--daca-muted);font-size:.8rem}.request-outcome{padding:.4rem .65rem;background:var(--daca-blue-soft);font-weight:700;font-size:.85rem}.request-outcome.is-granted{color:var(--daca-green-dark,#176b48);background:var(--daca-green-soft,#edf7f1)}.request-outcome.is-rejected{color:var(--daca-red-dark)}dl{display:flex;gap:1rem 3rem;flex-wrap:wrap;margin:1rem 0}dd{margin:.3rem 0 0}summary{cursor:pointer;font-weight:700;min-height:32px}.request-details{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1rem}@media(max-width:700px){.request-details{grid-template-columns:minmax(0,1fr)}.request-list-controls label{width:100%}}
  `],
})
export class ProductAccessRequestsComponent {
  readonly productId = input.required<string>();
  private readonly api = inject(CatalogApiService);
  private readonly destroyRef = inject(DestroyRef);
  readonly requests = signal<readonly StoredAccessRequest[]>([]);
  readonly direction = signal<'asc' | 'desc'>('desc');
  readonly loading = signal(false);
  readonly forbidden = signal(false);
  readonly error = signal(false);
  private reads = new Subscription();
  private generation = 0;
  readonly answeredCount = computed(() => this.requests().filter(request => ['approved_policy_pending','granted_original','granted_modified','rejected','withdrawn'].includes(request.status)).length);
  readonly sortedRequests = computed(() => [...this.requests()].sort((a,b) => {
    const comparison = Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id);
    return this.direction() === 'asc' ? comparison : -comparison;
  }));
  constructor() {
    effect(() => { this.productId(); this.api.identityUserId(); this.direction.set('desc'); this.reload(); });
    const timer = setInterval(() => { if(document.visibilityState === 'visible' && !this.loading())this.reload(true); },15000);
    this.destroyRef.onDestroy(() => { clearInterval(timer); this.reads.unsubscribe(); });
  }
  setDirection(event: Event): void { this.direction.set((event.target as HTMLSelectElement).value === 'asc' ? 'asc' : 'desc'); }
  reload(quiet = false): void {
    this.reads.unsubscribe(); this.reads = new Subscription();
    const generation = ++this.generation, actor = this.api.identityUserId(), product = this.productId();
    const current = () => generation === this.generation && actor === this.api.identityUserId() && product === this.productId();
    if(!quiet)this.requests.set([]);
    this.loading.set(true); this.error.set(false); this.forbidden.set(false);
    this.reads.add(this.api.loadProductAccessRequests(product).subscribe({
      next: requests => { if(current()){ this.requests.set(requests); this.loading.set(false); } },
      error: (error: {status?: number}) => { if(current()){ this.requests.set([]); this.loading.set(false); this.forbidden.set(error.status === 403); this.error.set(error.status !== 403); } },
    }));
  }
  protocolLabel(protocol: StoredAccessRequest['requestedProtocol']): string { return ({http:'REST',postgresql:'PostgreSQL',both:'REST & PostgreSQL'})[protocol]; }
  variantLabel(variant: StoredAccessRequest['requestedVariant']): string { return ({original:'Originaldaten',modified:'Modifizierte Daten',either:'Data Owner entscheidet'})[variant]; }
  statusLabel(status: AccessRequestStatus): string {
    return ({submitted:'Anfrage eingegangen',identity_review:'Identität wird geprüft',legal_review:'Rechtslage wird geprüft',conditions_review:'Zugriffskonditionen werden geprüft',approved_policy_pending:'Genehmigt · Aktivierung ausstehend',granted_modified:'Zugriff gewährt (modifiziert)',granted_original:'Zugriff gewährt (original)',rejected:'Abgelehnt',withdrawn:'Zurückgezogen'})[status];
  }
}
