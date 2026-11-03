import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, effect, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { PermissionLogItem, PermissionScope, ProductPermissionsResponse, PublicPermission } from '../../core/catalog.models';
import { AccessEndDatePipe } from '../../shared/access-end-date.pipe';
import { catalogProductMatches } from '../welcome/welcome-search';

@Component({
  selector:'daca-product-permissions',standalone:true,imports:[DatePipe,FormsModule,AccessEndDatePipe],
  template:`
    <section id="consumers" class="daca-card" aria-labelledby="permissions-title">
      <div class="daca-card-header"><div><p class="daca-eyebrow">Freigaben</p><h2 id="permissions-title">Aktuell Berechtigte</h2></div><button class="daca-button is-secondary" type="button" [disabled]="loading()||busy()" (click)="reload()">Aktualisieren</button></div>
      <div class="daca-card-body">
        <p>Personen, Maschinen und Gruppen mit zeitlich gültigen Freigaben. Angezeigte Zeitfenster und Bedingungen gelten weiterhin. Eine Gruppenfreigabe umfasst die aufgeführten Mitglieder.</p>
        @if(notice()){<p class="daca-alert" role="status">{{notice()}}</p>}
        @if(actionError()){<p class="daca-alert is-error" role="alert">{{actionError()}}</p>}
        @if(loading()&&!data()){<p role="status">Berechtigungen werden geladen …</p>}
        @else if(error()){<p role="alert">Berechtigungen konnten nicht verlässlich geladen werden. Bitte erneut versuchen.</p>}
        @else if(data();as state){
          @if(state.state!=='confirmed'){<p class="daca-alert" role="status">{{state.state==='failed'?'Die Aktivierung ist fehlgeschlagen.':'Eine Berechtigungsänderung wird aktiviert.'}} Angezeigt wird der zuletzt bestätigte Stand. Der Entzug ist erst nach Bestätigung beider Durchsetzungsziele abgeschlossen.</p>}
          <label class="permission-search">Berechtigte suchen<input type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Name, Identität, Organisation oder Gruppenmitglied"></label>
          <p class="result-count" aria-live="polite">{{filtered().length}} von {{state.items.length}} Freigaben · {{state.policyRevision===null?'Keine aktive Policy':'Bestätigte Policy-Revision '+state.policyRevision}}</p>
          @if(filtered().length){<div class="permission-table" role="region" aria-label="Aktuell Berechtigte" tabindex="0"><table><thead><tr><th scope="col">Berechtigt</th><th scope="col">Zugriff</th><th scope="col">Gültigkeit</th><th scope="col">Aktion</th></tr></thead><tbody>
            @for(item of filtered();track item.grantId){<tr [attr.data-grant-id]="item.grantId">
              <td><strong>{{item.displayName}}</strong><small>{{typeLabel(item.grant.subject.type)}} · {{item.organization}}</small><small>{{item.grant.subject.id}}</small>
                @if(item.groupMembers.length){<details><summary>{{item.groupMembers.length}} Gruppenmitglieder</summary><ul>@for(member of item.groupMembers;track member.id){<li>{{member.displayName}} · {{member.organization}} · {{member.id}}</li>}</ul></details>}
              </td>
              <td>{{protocolLabel(item.grant)}}<small>{{item.grant.dataVariant==='original'?'Originaldaten':'Modifizierte Daten'}}</small>@if(item.grant.weeklyAvailability;as window){<small>{{window.weekdays.join(', ')}} · {{window.startTime}}–{{window.endTime}} · {{window.timeZone}}</small>}</td>
              <td>{{item.grant.validFrom|date:'dd.MM.yyyy'}}<small>bis {{item.grant.validUntil|accessEndDate}}</small></td>
              <td>@if(canRevoke()){<button class="daca-button is-secondary revoke-permission" type="button" [disabled]="busy()" (click)="openConfirmation(item,$event.currentTarget)">Berechtigung entziehen</button>}@else{<small>{{state.canManage?'Laufende Policy-Prüfung oder Aktivierung abschliessen':'Verwaltung durch den Data Owner'}}</small>}</td>
            </tr>}
          </tbody></table></div>}@else{<p class="permission-empty">{{query().trim()?'Keine Berechtigten passen zur Suche.':'Für dieses Datenprodukt bestehen keine aktuell gültigen Freigaben.'}}</p>}
        }
      </div>
    </section>
    <section id="permission-log" class="daca-card" aria-labelledby="permission-log-title">
      <div class="daca-card-header"><div><p class="daca-eyebrow">Nachvollziehbarkeit</p><h2 id="permission-log-title">Berechtigungsprotokoll</h2></div></div>
      <div class="daca-card-body"><p>Erteilungen, Änderungen, beantragte Entzüge und bestätigte Entzüge. Dieses Protokoll ist für alle einsehbar, die das Datenprodukt sehen dürfen. Frühere Policy-Belege bleiben erhalten.</p>
        <label class="permission-search">Protokoll durchsuchen<input type="search" [ngModel]="logQuery()" (ngModelChange)="logQuery.set($event)" placeholder="Person, Organisation, Aktion, Protokoll oder Revision"></label>
        @if(logLoading()&&!events().length){<p role="status">Berechtigungsprotokoll wird geladen …</p>}
        @else if(logError()){<p role="alert">Das Berechtigungsprotokoll konnte nicht geladen werden.</p><button class="daca-button is-secondary" type="button" (click)="reload()">Erneut versuchen</button>}
        @else{
          <p class="result-count" aria-live="polite">{{filteredEvents().length}} von {{events().length}} Einträgen</p>
          @for(event of visibleEvents();track event.id){<article class="permission-event" [attr.data-permission-event]="event.action"><header><strong>{{actionLabel(event.action)}}</strong><span>{{event.occurredAt|date:'dd.MM.yyyy, HH:mm:ss'}} · Revision {{event.policyRevision}}</span></header><p><strong>{{event.displayName}}</strong> · {{typeLabel(event.subjectType)}} · {{event.organization}} · {{event.subjectId}}</p><p>Veranlasst durch {{event.actorName}} · {{event.actorId}}</p>
            <details><summary>Vorher und nachher anzeigen</summary><div class="permission-comparison"><section><h3>Vorher</h3><ul>@for(scope of event.before;track $index){<li>{{scopeLabel(scope)}}</li>}@empty{<li>Keine Freigabe</li>}</ul></section><section><h3>{{event.action==='revocation_requested'?'Beantragt':event.action==='revocation_rejected'?'Unverändert':'Nachher'}}</h3><ul>@for(scope of event.after;track $index){<li>{{scopeLabel(scope)}}</li>}@empty{<li>Keine Freigabe</li>}</ul></section></div></details>
          </article>}@empty{<p>{{logQuery().trim()?'Keine Protokolleinträge passen zur Suche.':'Noch keine protokollierten Berechtigungsänderungen.'}}</p>}
          @if(visibleEvents().length<filteredEvents().length){<button class="daca-button is-secondary" type="button" (click)="logLimit.update(more)">Weitere Protokolleinträge anzeigen</button>}
        }
      </div>
    </section>
    @if(confirming();as target){<dialog #confirmDialog aria-labelledby="revoke-title" (cancel)="cancel($event)"><h2 id="revoke-title">Berechtigung entziehen?</h2><p><strong>{{target.permission.displayName}}</strong> · {{target.permission.organization}}</p><p>{{scopeLabel(target.permission.grant)}}</p><p>Nur diese Freigabe wird entzogen. Weitere direkte oder über Gruppen erteilte Berechtigungen bleiben bestehen.</p>@if(target.permission.grant.subject.type==='group'){<p>Der Entzug betrifft die gesamte Gruppenfreigabe und ihre {{target.permission.groupMembers.length}} Mitglieder.</p>}<p>Bei einer Vier-Augen-Publikation entscheidet zuerst die Kontrollperson. Der Entzug gilt als abgeschlossen, sobald OPA und PostgreSQL dieselbe neue Revision bestätigt haben.</p><footer><button class="daca-button is-secondary" type="button" [disabled]="busy()" (click)="closeConfirmation()">Abbrechen</button><button class="daca-button" type="button" [disabled]="busy()||!canRevoke()" (click)="confirmRevocation()">{{busy()?'Wird eingereicht …':'Berechtigung entziehen'}}</button></footer></dialog>}
  `,
  styles:[`
    :host{display:grid;grid-template-columns:minmax(0,1fr);gap:1.5rem;min-width:0;max-width:100%}.daca-card,.daca-card-body{min-width:0;max-width:100%}.permission-search{display:grid;gap:.4rem;max-width:48rem;font-weight:700;margin:1rem 0}.permission-search input{min-width:0;width:100%;min-height:44px;border:1px solid var(--daca-border-strong);padding:.65rem;background:var(--daca-surface,#fff);color:inherit}.result-count,small{color:var(--daca-muted);font-size:.8rem}small{display:block;margin-top:.3rem}.permission-table{max-width:100%;overflow-x:auto}.permission-table:focus-visible{outline:3px solid var(--daca-blue)}table{width:100%;border-collapse:collapse;text-align:left}th,td{padding:1rem .7rem;border-bottom:1px solid var(--daca-border);vertical-align:top}td{overflow-wrap:anywhere}th{font-size:.8rem}button{min-height:44px}td details{margin-top:.5rem}summary{cursor:pointer;font-weight:700}.permission-event{padding:1.2rem 0;border-top:1px solid var(--daca-border);overflow-wrap:anywhere}.permission-event header{display:flex;justify-content:space-between;gap:.7rem;flex-wrap:wrap}.permission-event header span{font-size:.8rem;color:var(--daca-muted)}.permission-event p{margin:.6rem 0;font-size:.85rem}.permission-comparison{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.permission-comparison h3{font-size:1rem}dialog{width:min(640px,calc(100vw - 2rem));max-height:calc(100dvh - 2rem);border:1px solid var(--daca-border);border-top:5px solid var(--daca-red);padding:1.5rem;overflow-wrap:anywhere}dialog::backdrop{background:#1828368f}dialog footer{display:flex;justify-content:flex-end;gap:1rem;flex-wrap:wrap;margin-top:1.5rem}@media(max-width:700px){.permission-comparison{grid-template-columns:1fr}table{min-width:680px}.daca-card-header{flex-wrap:wrap}}
  `],
})
export class ProductPermissionsComponent {
  readonly productId=input.required<string>();readonly loaded=output<ProductPermissionsResponse|null>();
  private readonly api=inject(CatalogApiService);private readonly destroyRef=inject(DestroyRef);
  readonly data=signal<ProductPermissionsResponse|null>(null);readonly events=signal<readonly PermissionLogItem[]>([]);
  readonly loading=signal(false);readonly logLoading=signal(false);readonly error=signal(false);readonly logError=signal(false);
  readonly query=signal('');readonly logQuery=signal('');readonly logLimit=signal(50);readonly more=(value:number)=>value+50;
  readonly notice=signal('');readonly actionError=signal('');readonly busy=signal(false);
  private dataActor='';private generation=0;private reads=new Subscription();private writes=new Subscription();
  private pendingRevision:number|null=null;private trigger:HTMLElement|null=null;
  readonly confirming=signal<{permission:PublicPermission;revision:number}|null>(null);
  private readonly dialog=viewChild<ElementRef<HTMLDialogElement>>('confirmDialog');
  readonly canRevoke=computed(()=>Boolean(this.data()?.canRevoke&&this.dataActor===this.api.identityUserId()));
  readonly filtered=computed(()=>(this.data()?.items??[]).filter(item=>!this.query().trim()||catalogProductMatches(this.query(),[
    item.displayName,item.organization,item.grant.subject.id,this.typeLabel(item.grant.subject.type),this.scopeLabel(item.grant),
    ...item.groupMembers.flatMap(member=>[member.id,member.displayName,member.organization]),
  ])));
  readonly filteredEvents=computed(()=>this.events().filter(event=>!this.logQuery().trim()||catalogProductMatches(this.logQuery(),[
    event.displayName,event.organization,event.subjectId,event.actorId,event.actorName,this.actionLabel(event.action),String(event.policyRevision),
    ...[...event.before,...event.after].map(scope=>this.scopeLabel(scope)),
  ])));
  readonly visibleEvents=computed(()=>this.filteredEvents().slice(0,this.logLimit()));
  constructor(){
    effect(()=>{this.productId();this.api.identityUserId();this.confirming.set(null);this.notice.set('');this.pendingRevision=null;this.query.set('');this.logQuery.set('');this.reload();});
    effect(()=>{const dialog=this.dialog()?.nativeElement;if(dialog&&!dialog.open)dialog.showModal();});
    effect(()=>{this.logQuery();this.logLimit.set(50);});
    const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!this.busy()&&!this.loading())this.reload(true);},15000);
    this.destroyRef.onDestroy(()=>{clearInterval(timer);this.reads.unsubscribe();this.writes.unsubscribe();});
  }
  reload(quiet=false):void{
    this.reads.unsubscribe();this.reads=new Subscription();const generation=++this.generation,actor=this.api.identityUserId(),product=this.productId();
    const current=()=>generation===this.generation&&actor===this.api.identityUserId()&&product===this.productId();
    if(!quiet){this.data.set(null);this.events.set([]);this.loaded.emit(null);}
    this.loading.set(true);this.logLoading.set(true);this.error.set(false);this.logError.set(false);
    this.reads.add(this.api.loadProductPermissions(product).subscribe({next:state=>{if(!current())return;this.dataActor=actor;this.data.set(state);this.loading.set(false);this.loaded.emit(state);if(this.pendingRevision===state.policyRevision&&state.state==='confirmed'){this.notice.set('Berechtigung entzogen. OPA und PostgreSQL haben die neue Revision bestätigt.');this.pendingRevision=null;}},error:()=>{if(!current())return;this.data.set(null);this.loaded.emit(null);this.loading.set(false);this.error.set(true);}}));
    this.reads.add(this.api.loadPermissionLog(product).subscribe({next:log=>{if(current()){this.events.set(log.items);this.logLoading.set(false);}},error:()=>{if(current()){this.events.set([]);this.logLoading.set(false);this.logError.set(true);}}}));
  }
  openConfirmation(permission:PublicPermission,trigger:EventTarget|null):void{if(!this.canRevoke()||this.busy())return;this.trigger=trigger instanceof HTMLElement?trigger:null;this.actionError.set('');this.confirming.set({permission,revision:this.data()!.latestRevision});}
  closeConfirmation():void{if(this.busy())return;this.confirming.set(null);queueMicrotask(()=>this.trigger?.isConnected&&this.trigger.focus({preventScroll:true}));}
  cancel(event:Event):void{event.preventDefault();this.closeConfirmation();}
  confirmRevocation():void{
    const target=this.confirming();if(!target||!this.canRevoke()||this.busy())return;
    const actor=this.api.identityUserId(),product=this.productId();this.busy.set(true);this.actionError.set('');
    this.writes.add(this.api.revokeProductPermission(product,target.permission.grantId,target.revision).subscribe({next:result=>{
      this.busy.set(false);if(actor!==this.api.identityUserId()||product!==this.productId())return;
      this.closeConfirmation();this.pendingRevision=result.policyRevision;
      this.notice.set(result.state==='pending_approval'?'Entzug zur Vier-Augen-Prüfung eingereicht. Die Kontrollperson hat eine Aufgabe erhalten.':'Entzug eingereicht. Die Aktivierung wird geprüft.');this.reload(true);
    },error:(error:{status?:number})=>{this.busy.set(false);if(actor!==this.api.identityUserId()||product!==this.productId())return;this.closeConfirmation();this.actionError.set(error.status===409||error.status===412?'Berechtigung oder Policy wurde inzwischen geändert. Bitte die aktualisierte Liste prüfen.':'Der Entzug konnte nicht bestätigt werden. Bitte den aktuellen Status prüfen.');this.reload(true);}}));
  }
  typeLabel(type:string):string{return({person:'Person',machine:'Maschine',group:'Gruppe'} as Record<string,string>)[type]??type;}
  protocolLabel(scope:PermissionScope):string{return scope.protocols.map(protocol=>protocol==='http'?'REST':'PostgreSQL').join(' · ');}
  actionLabel(action:PermissionLogItem['action']):string{return({granted:'Berechtigung erteilt',changed:'Berechtigung geändert',revoked:'Berechtigung entzogen',revocation_requested:'Entzug beantragt',revocation_rejected:'Entzug abgelehnt'})[action];}
  scopeLabel(scope:PermissionScope):string{
    const window=scope.weeklyAvailability,group=scope.groupSnapshot;
    return [this.protocolLabel(scope),scope.dataVariant==='original'?'Originaldaten':'Modifizierte Daten',
      `${scope.validFrom} bis ${scope.validUntil==='9999-12-31'?'Unbestimmtes Enddatum':scope.validUntil}`,
      window?`${window.weekdays.join(', ')} ${window.startTime}–${window.endTime} ${window.timeZone}`:'Keine wöchentliche Einschränkung',
      `KOBY ${scope.metadataChannels?.kobyMcp?'ja':'nein'} · I14Y ${scope.metadataChannels?.i14y?'ja':'nein'}`,
      group?`Gruppenstand ${group.membershipRevision}: ${group.memberIds.join(', ')}`:'',
    ].filter(Boolean).join(' · ');
  }
}
