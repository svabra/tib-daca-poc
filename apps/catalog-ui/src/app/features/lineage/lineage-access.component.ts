import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { LineageAccessPage } from '../../core/catalog.models';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator.component';
import { SearchIconComponent } from '../search/search-icon.component';

@Component({
  selector: 'daca-lineage-access', standalone: true,
  imports: [DatePipe, RouterLink, FormsModule, LoadingIndicatorComponent, SearchIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a [routerLink]="['/products',params().get('id'),'lineage']">← Lineage &amp; Provenienz</a>
    <section class="daca-page-heading"><div><p class="daca-eyebrow">Datenfluss · Nur Data Owner</p><h1>Zugriffsprotokolle</h1><p>Personen und Maschinen des Konsumenten, die auf diese Quelle oder dieses Produkt zugegriffen haben.</p></div></section>
    @if(page(); as value){<section class="daca-card access-context"><div><small>Quelle / Produkt</small><strong>{{value.resourceLabel}}</strong><code>{{value.resourceUrn}}</code></div><span aria-hidden="true">→</span><div><small>Konsument</small><strong>{{value.consumerLabel}}</strong><code>{{value.consumerUrn}}</code></div></section>}
    <form class="access-filters daca-card" (submit)="$event.preventDefault();load()">
      <label>Identität<select name="subject" [(ngModel)]="subjectType" (ngModelChange)="load()"><option value="">Alle</option><option value="person">Personen</option><option value="machine">Maschinen</option></select></label>
      <label>Ergebnis<select name="outcome" [(ngModel)]="outcome" (ngModelChange)="load()"><option value="success">Erfolgreiche Zugriffe</option><option value="">Alle Versuche</option><option value="denied">Abgewiesen</option><option value="error">Fehler</option></select></label>
      <label>Zeitraum<select name="period" [(ngModel)]="days" (ngModelChange)="load()"><option value="1">Letzte 24 Stunden</option><option value="7">Letzte 7 Tage</option><option value="30">Letzte 30 Tage</option><option value="">Gesamter Zeitraum</option></select></label>
      <button class="daca-button is-secondary" type="submit">Aktualisieren</button>
    </form>
    @if(error()){<p class="daca-alert is-error" role="alert">{{error()}}</p>}
    @if(loading()){<daca-loading-indicator label="Zugriffsprotokolle werden geladen …"/>}
    @if(page(); as value){
      <section class="daca-card access-results" aria-label="Gemeldete Datenzugriffe"><div class="access-table"><table><thead><tr><th>Zeitpunkt (UTC)</th><th>Person / Maschine</th><th>Typ</th><th>Protokoll</th><th>Ergebnis</th></tr></thead><tbody>
        @for(event of value.items;track event.id){<tr><td><time [attr.datetime]="event.occurredAt">{{event.occurredAt | date:'dd.MM.yyyy HH:mm:ss':'UTC'}}</time></td><td><strong>{{event.subjectName}}</strong>@if(event.subjectName!==event.subjectId){<code>{{event.subjectId}}</code>}</td><td><daca-search-icon [name]="event.subjectType==='person'?'user':'server'"/> {{event.subjectType==='person'?'Person':'Maschine'}}</td><td>{{event.protocol==='http-rest'?'HTTP / REST':'PostgreSQL'}}</td><td><span [class]="'access-outcome is-'+event.outcome">{{event.outcome==='success'?'Erfolgreich':event.outcome==='denied'?'Abgewiesen':'Fehler'}}</span></td></tr>}
        @empty{<tr><td colspan="5">Keine gemeldeten Zugriffe für diese Auswahl.</td></tr>}
      </tbody></table></div>
      @if(value.nextCursor){<button class="daca-button is-secondary" type="button" [disabled]="loading()" (click)="load(true)">Weitere laden</button>}
      </section>
      <p class="access-note">Angezeigt werden gemeldete Zugriffe dieser Datenflusskante. Freigaben sind keine Zugriffe. Für externe Quellen und direkte PostgreSQL-Zugriffe muss die ausführende Stelle Ereignisse melden; ohne Meldung lässt sich keine Nutzung ausschliessen.</p>
    }
  `,
  styles: [`:host{display:block;min-width:0}.access-context{display:flex;align-items:center;gap:1.5rem;padding:1.2rem;margin-bottom:1rem}.access-context>div{display:grid;gap:.4rem;min-width:0;flex:1}.access-context code,.access-results code{display:block;overflow-wrap:anywhere;font-size:.7rem;color:var(--daca-muted)}.access-context small{color:var(--daca-muted)}.access-filters{display:flex;align-items:end;flex-wrap:wrap;gap:1rem;padding:1rem;margin-bottom:1.2rem}.access-filters label{display:grid;gap:.4rem;flex:1;min-width:180px;font-size:.8rem;font-weight:700}.access-filters select{width:100%;min-height:44px;padding:.55rem .7rem;border:1px solid var(--daca-border-strong);background:var(--daca-surface,#fff);color:var(--daca-ink);font:inherit;font-weight:400}.access-table{overflow:auto}.access-results table{border-collapse:collapse;width:100%;font-size:.8rem}.access-results th,.access-results td{padding:1rem;text-align:left;border-bottom:1px solid var(--daca-border);vertical-align:top}.access-results th{background:var(--daca-blue-soft);white-space:nowrap}.access-results strong{font-weight:600}.access-results time{white-space:nowrap}.access-results>button{margin:1rem}.access-outcome{white-space:nowrap;color:var(--daca-green)}.access-outcome.is-denied{color:var(--daca-orange)}.access-outcome.is-error{color:var(--daca-red)}.access-note{color:var(--daca-muted);font-size:.75rem;line-height:1.6}@media(max-width:650px){.access-context{align-items:stretch;flex-direction:column;gap:.7rem}.access-filters label{flex-basis:100%;min-width:0}}`],
})
export class LineageAccessComponent {
  readonly api = inject(CatalogApiService);
  private readonly route = inject(ActivatedRoute);
  readonly params = toSignal(this.route.paramMap, {initialValue: this.route.snapshot.paramMap});
  private readonly destroy = inject(DestroyRef);
  readonly page = signal<LineageAccessPage | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  subjectType = ''; outcome = 'success'; days = '7';
  private subscription?: Subscription;
  constructor(){
    effect(()=>{this.params();this.api.identityUserId();this.load();});
    this.destroy.onDestroy(()=>this.subscription?.unsubscribe());
  }
  load(append=false): void {
    this.subscription?.unsubscribe();
    const previous = append ? this.page() : null;
    this.page.set(previous); this.error.set(''); this.loading.set(true);
    const params:Record<string,string>={};
    if(this.subjectType)params['subjectType']=this.subjectType;
    if(this.outcome)params['outcome']=this.outcome;
    if(this.days)params['after']=new Date(Date.now()-Number(this.days)*86400000).toISOString();
    if(previous?.nextCursor)params['cursor']=previous.nextCursor;
    this.subscription=this.api.loadLineageAccessEvents(this.params().get('id')!,this.params().get('edgeId')!,params).subscribe({
      next:value=>{this.page.set({...value,items:[...(previous?.items??[]),...value.items]});this.loading.set(false);},
      error:failure=>{this.page.set(null);this.loading.set(false);this.error.set(failure.status===403?'Nur der aktuelle Data Owner dieser Quelle oder dieses Produkts darf diese Protokolle einsehen.':failure.status===404?'Diese Datenflusskante wurde nicht gefunden.':'Die Zugriffsprotokolle konnten nicht geladen werden. Bitte erneut versuchen.');},
    });
  }
}
