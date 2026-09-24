import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '@bit-daca/design-system';
import { finalize } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService } from './data-models-api.service';
import { LogicalModel, LogicalModelReview } from './data-models.models';

@Component({
  selector: 'daca-logical-model-review',
  standalone: true,
  imports: [DatePipe, RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="daca-page-heading review-heading">
      <div><p class="daca-eyebrow">Persönlicher Prüfauftrag</p><h1>Logisches Modell prüfen</h1><p>Der eingereichte Stand ist unveränderlich. Der Entscheid bezieht sich exakt auf diesen Snapshot.</p></div>
    </section>

    @if(loading()){<section class="daca-card review-state" aria-live="polite">Prüfauftrag wird geladen …</section>}
    @if(error()){<p class="daca-alert is-error" role="alert">{{ error() }}</p>}
    @if(notice()){<p class="daca-alert is-success" role="status">{{ notice() }}</p>}

    @if(review();as current){
      <section class="daca-card review-summary">
        <header><div><p class="daca-eyebrow">Review-Snapshot</p><h2>{{ current.reviewSnapshot.title.de }}</h2></div><daca-status-badge [tone]="current.status==='pending'?'orange':current.status==='accepted'?'green':'neutral'">{{ statusLabel(current.status) }}</daca-status-badge></header>
        <dl><div><dt>Domäne</dt><dd>{{ current.reviewSnapshot.dataDomain.displayName }}</dd></div><div><dt>Domain Owner</dt><dd>{{ userName(current.reviewerUserId) }}</dd></div><div><dt>Eingereicht durch</dt><dd>{{ userName(current.submitterUserId) }}</dd></div><div><dt>Eingereicht</dt><dd>{{ current.createdAt | date:'dd.MM.yyyy, HH:mm' }}</dd></div><div><dt>Version</dt><dd>{{ current.reviewSnapshot.revision }}</dd></div><div><dt>Identifier</dt><dd>{{ current.reviewSnapshot.identifiers.join(', ') }}</dd></div></dl>
        <p>{{ current.reviewSnapshot.description.de }}</p>
      </section>

      <section class="daca-card review-structure">
        <header><p class="daca-eyebrow">SHACL-Struktur</p><h2>Entitäten und Felder</h2></header>
        @for(entity of current.reviewSnapshot.entities;track entity.id){<article><h3>{{ entity.name }}</h3><p>{{ entity.businessObject }}</p><table><thead><tr><th>Feld</th><th>Datentyp</th><th>Beschreibung</th><th>SHACL</th></tr></thead><tbody>@for(field of entity.fields;track field.id){<tr><td><strong>{{ field.name }}</strong></td><td>{{ field.dataType }}</td><td>{{ field.shortDescription }}</td><td>{{ field.minCount }}…{{ field.maxCount ?? 'n' }}</td></tr>}</tbody></table></article>}
      </section>

      @if(current.status==='pending'&&canDecide()){
        <section class="daca-card review-decision" aria-labelledby="decision-title"><div><p class="daca-eyebrow">Domain-Entscheid</p><h2 id="decision-title">Annehmen oder zurückweisen</h2><p>Die Annahme publiziert unmittelbar eine neue Modellversion. Eine Rückweisung benötigt eine nachvollziehbare Begründung.</p></div><label>Begründung für eine Rückweisung<textarea rows="3" [value]="rejectionComment()" (input)="rejectionComment.set(inputValue($event))"></textarea></label><div><button class="daca-button is-secondary" type="button" [disabled]="deciding()" (click)="reject()">Rückweisen</button><button class="daca-button" type="button" [disabled]="deciding()" (click)="accept()">Annehmen und publizieren</button></div></section>
      } @else if(current.status==='pending') {
        <p class="daca-alert">Dieser Prüfauftrag ist {{ userName(current.reviewerUserId) }} persönlich zugewiesen.</p>
      }
      <nav class="review-navigation" aria-label="Review-Navigation"><a class="daca-button is-secondary" routerLink="/tasks">Zurück zu den Aufgaben</a><a class="daca-button is-secondary" [routerLink]="['/models',current.logicalModelId]">Modell öffnen</a></nav>
    }
  `,
  styles: [`
    .review-heading{align-items:center}.review-state{padding:2rem;box-shadow:none}.review-summary,.review-structure,.review-decision{box-shadow:none;margin-bottom:1rem}.review-summary>header,.review-structure>header{display:flex;align-items:start;justify-content:space-between;gap:1rem;border-bottom:1px solid var(--daca-border);padding:1rem 1.2rem}.review-summary h2,.review-structure h2,.review-decision h2{margin:.2rem 0}.review-summary dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.8rem;margin:0;padding:1rem 1.2rem}.review-summary dl div{display:grid;gap:.2rem}.review-summary dt{color:var(--daca-muted);font-size:.65rem;font-weight:800;text-transform:uppercase}.review-summary dd{margin:0;font-size:.75rem;font-weight:700}.review-summary>p{margin:0;border-top:1px solid var(--daca-border);padding:1rem 1.2rem;color:var(--daca-muted)}.review-structure article{padding:1rem 1.2rem}.review-structure h3,.review-structure article>p{margin:.2rem 0}.review-structure article>p{color:var(--daca-muted);font-size:.72rem}.review-structure table{width:100%;margin-top:.75rem;border-collapse:collapse;font-size:.72rem}.review-structure th,.review-structure td{border-bottom:1px solid var(--daca-border);padding:.55rem;text-align:left}.review-decision{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.8fr) auto;align-items:end;gap:1rem;padding:1.2rem;border-left:5px solid var(--daca-blue)}.review-decision p{margin:.3rem 0;color:var(--daca-muted)}.review-decision label{display:grid;gap:.35rem;font-size:.72rem;font-weight:750}.review-decision textarea{min-height:86px;border:1px solid var(--daca-border-strong);padding:.55rem;resize:vertical}.review-decision>div:last-child,.review-navigation{display:flex;flex-wrap:wrap;gap:.55rem}.review-navigation{justify-content:flex-end;margin-top:1rem}@media(max-width:900px){.review-summary dl{grid-template-columns:1fr 1fr}.review-decision{grid-template-columns:1fr}.review-structure{overflow-x:auto}}@media(max-width:560px){.review-summary dl{grid-template-columns:1fr}.review-navigation,.review-navigation .daca-button{width:100%}}
  `],
})
export class LogicalModelReviewComponent {
  readonly identity=inject(DemoIdentityService);
  private readonly route=inject(ActivatedRoute);
  private readonly api=inject(DataModelsApiService);
  private readonly catalogApi=inject(CatalogApiService);
  readonly review=signal<LogicalModelReview|null>(null);
  readonly etag=signal('');
  readonly loading=signal(false);
  readonly deciding=signal(false);
  readonly error=signal<string|null>(null);
  readonly notice=signal<string|null>(null);
  readonly rejectionComment=signal('');
  readonly decidedModel=signal<LogicalModel|null>(null);
  readonly canDecide=computed(()=>{const review=this.review();return Boolean(review?.status==='pending'&&review.reviewerUserId===this.identity.userId());});

  constructor(){effect(()=>{this.identity.userId();this.load();});}

  load():void{const id=this.route.snapshot.paramMap.get('id');if(!id)return;this.loading.set(true);this.error.set(null);this.api.loadLogicalModelReview(id).pipe(finalize(()=>this.loading.set(false))).subscribe({next:({body,etag})=>{this.review.set(body);this.etag.set(etag);},error:(error:Error)=>{this.review.set(null);this.error.set(error.message);}});}
  accept():void{this.decide('accept',null);}
  reject():void{const comment=this.rejectionComment().trim();if(!comment){this.error.set('Für die Rückweisung ist eine Begründung erforderlich.');return;}this.decide('reject',comment);}
  inputValue(event:Event):string{return(event.target as HTMLTextAreaElement).value;}
  userName(id:string):string{return this.identity.users().find((user)=>user.id===id)?.displayName??id;}
  statusLabel(status:LogicalModelReview['status']):string{return status==='pending'?'Entscheid offen':status==='accepted'?'Angenommen':'Zurückgewiesen';}

  private decide(decision:'accept'|'reject',comment:string|null):void{const review=this.review();if(!review||!this.canDecide()||this.deciding())return;this.deciding.set(true);this.error.set(null);this.api.decideLogicalModelReview(review.id,decision,comment,this.etag()).pipe(finalize(()=>this.deciding.set(false))).subscribe({next:({body})=>{this.decidedModel.set(body);this.review.update((value)=>value?{...value,status:decision==='accept'?'accepted':'rejected',decisionComment:comment,resultVersionId:body.versionId}:value);this.catalogApi.refreshWorkflowTasks();this.notice.set(decision==='accept'?'Das Modell wurde angenommen und publiziert.':'Das Modell wurde mit Änderungsauftrag zurückgewiesen.');},error:(error:Error)=>this.error.set(error.message)});}
}
