import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { finalize } from 'rxjs';
import { DataModelsApiService } from './data-models-api.service';
import { ApiResult, LogicalModel, LogicalModelSummary } from './data-models.models';

@Component({
  selector: 'daca-logical-field-move-dialog', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="field-move-dialog" aria-labelledby="field-move-title" (cancel)="cancel($event)">
      <header><p class="daca-eyebrow">Entität auswählen</p><h2 id="field-move-title">{{ confirming() ? 'Achtung: Feld verschieben' : 'Anderes logisches Modell suchen' }}</h2></header>
      @if(error()){<p class="daca-alert is-error" role="alert">{{ error() }}</p>}
      @if(!confirming()){
        <p>Wählen Sie das Zielmodell und dessen Entität für «{{ fieldName() }}». Das Feld wird tatsächlich verschoben.</p>
        <label>Logische Modelle suchen<input autofocus type="search" [value]="query()" (input)="query.set(value($event))" placeholder="Name, Kennung oder Organisation"></label>
        @if(loading()){<p role="status">Modelle werden geladen …</p>}
        <ul class="model-results">@for(model of candidates();track model.id){<li><button type="button" [disabled]="busy()||!editable(model)" [attr.aria-pressed]="target()?.id===model.id" (click)="select(model.id)"><strong>{{ model.title.de||model.identifiers[0] }}</strong><small>{{ model.office }} · {{ model.identifiers[0] }}</small>@if(!editable(model)){<small>Keine Bearbeitungsberechtigung oder Modell in Prüfung</small>}</button></li>}@empty{<li>Keine passenden anderen Modelle gefunden.</li>}</ul>
        @if(target();as model){<label>Zielentität<select [disabled]="busy()" [value]="entityId()" (change)="entityId.set(value($event))">@for(entity of model.entities;track entity.rootId){<option [value]="entity.rootId">{{ entity.name }}</option>}</select></label>}
        <footer><button class="daca-button is-secondary" type="button" [disabled]="busy()" (click)="closed.emit()">Abbrechen</button><button class="daca-button" type="button" [disabled]="busy()||!target()||!entityId()" (click)="review()">Verschiebung prüfen</button></footer>
      }@else{
        <div class="move-warning" role="note"><strong>Dieses Feld wird aus dem Ausgangsmodell entfernt.</strong><p>Bestehende physische Zuordnungen dieses Felds werden im Ausgangsmodell beendet und bleiben in der Historie erhalten. Sie werden nicht ins Zielmodell übernommen. Beide Modelle erhalten einen neuen Entwurf und müssen danach erneut geprüft werden.</p></div>
        <dl><dt>Feld</dt><dd>{{ fieldName() }}</dd><dt>Von</dt><dd>{{ source().title.de }} · {{ sourceEntity() }}</dd><dt>Nach</dt><dd>{{ target()?.title?.de }} · {{ targetEntityName() }}</dd></dl>
        <label class="ack"><input type="checkbox" [checked]="acknowledged()" [disabled]="busy()" (change)="acknowledged.set(checked($event))">Ich verstehe, dass das Feld im Ausgangsmodell entfernt wird und seine physischen Zuordnungen nicht mitwandern.</label>
        <label>Zur Bestätigung den Feldnamen «{{ fieldName() }}» eingeben<input autocomplete="off" [disabled]="busy()" [value]="confirmation()" (input)="confirmation.set(value($event))"></label>
        <footer><button class="daca-button is-secondary" type="button" [disabled]="busy()" (click)="confirming.set(false)">Zurück</button><button class="daca-button is-secondary" type="button" [disabled]="busy()" (click)="closed.emit()">Abbrechen</button><button class="daca-button" type="button" [disabled]="busy()||!acknowledged()||confirmation()!==fieldName()" (click)="move()">{{ busy()?'Wird verschoben …':'Feld jetzt verschieben' }}</button></footer>
      }
    </dialog>`,
  styles: [`
    .field-move-dialog{box-sizing:border-box;width:min(700px,calc(100vw - 2rem));max-height:calc(100dvh - 2rem);margin:auto;padding:1.3rem;border:0;border-top:5px solid var(--daca-red);background:#fff;color:var(--daca-ink);box-shadow:0 24px 80px #14202b55}.field-move-dialog::backdrop{background:#1828368f}h2{margin:.4rem 0;font-size:1.2rem}p,dl{font-size:.78rem}label{display:grid;gap:.4rem;margin:1rem 0;font-size:.75rem;font-weight:750}input,select{box-sizing:border-box;width:100%;min-height:42px;padding:.5rem;border:1px solid var(--daca-border-strong);font:inherit;background:#fff;color:var(--daca-ink)}.model-results{list-style:none;padding:0;max-height:240px;overflow:auto}.model-results button{display:grid;gap:.3rem;width:100%;border:1px solid var(--daca-border);padding:.7rem;text-align:left;background:#fff;color:var(--daca-ink);cursor:pointer}.model-results button[aria-pressed=true]{border-left:4px solid var(--daca-blue);background:var(--daca-blue-soft)}.model-results button:disabled{opacity:.55;cursor:default}small{font-size:.65rem}.move-warning{border-left:4px solid var(--daca-red);padding:.8rem;background:var(--daca-red-soft);font-size:.8rem}dt{font-weight:750}dd{margin:0 0 .6rem;overflow-wrap:anywhere}.ack{display:flex;align-items:start}.ack input{flex:none;width:18px;min-height:18px;margin:.1rem .4rem 0 0}footer{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:.6rem;border-top:1px solid var(--daca-border);padding-top:1rem}
  `],
})
export class LogicalFieldMoveDialogComponent {
  readonly source=input.required<LogicalModel>();readonly fieldId=input.required<string>();readonly fieldName=input.required<string>();readonly sourceEntity=input.required<string>();
  readonly editableOrganizations=input<readonly string[]>([]);readonly closed=output<void>();readonly moved=output<ApiResult<LogicalModel>>();
  private readonly api=inject(DataModelsApiService);private readonly dialog=viewChild<ElementRef<HTMLDialogElement>>('dialog');
  readonly models=signal<readonly LogicalModelSummary[]>([]);readonly query=signal('');readonly loading=signal(true);readonly busy=signal(false);readonly error=signal<string|null>(null);
  readonly target=signal<LogicalModel|null>(null);readonly entityId=signal('');readonly confirming=signal(false);readonly acknowledged=signal(false);readonly confirmation=signal('');
  readonly candidates=computed(()=>{const query=this.query().trim().toLocaleLowerCase();return this.models().filter((item)=>item.id!==this.source().id&&`${item.title.de} ${item.identifiers.join(' ')} ${item.office}`.toLocaleLowerCase().includes(query));});
  constructor(){effect(()=>{const dialog=this.dialog()?.nativeElement;if(dialog&&!dialog.open)dialog.showModal();});this.api.listLogicalModels().subscribe({next:(models)=>{this.models.set(models);this.loading.set(false);},error:(error:Error)=>{this.error.set(error.message);this.loading.set(false);}});}
  editable(model:LogicalModelSummary):boolean{return this.editableOrganizations().includes(model.office)&&!['review_pending','retired','superseded'].includes(model.status);}
  value(event:Event):string{return(event.target as HTMLInputElement).value;}
  checked(event:Event):boolean{return(event.target as HTMLInputElement).checked;}
  select(id:string):void{this.busy.set(true);this.error.set(null);this.target.set(null);this.entityId.set('');this.api.loadLogicalModel(id).pipe(finalize(()=>this.busy.set(false))).subscribe({next:({body})=>{this.target.set(body);this.entityId.set(body.entities[0]?.rootId??'');},error:(error:Error)=>this.error.set(error.message)});}
  targetEntityName():string{return this.target()?.entities.find((item)=>item.rootId===this.entityId())?.name??'';}
  review():void{if(!this.target()||!this.entityId())return;this.acknowledged.set(false);this.confirmation.set('');this.confirming.set(true);}
  move():void{const target=this.target();if(!target||this.busy()||!this.confirming()||!this.acknowledged()||this.confirmation()!==this.fieldName())return;this.busy.set(true);this.error.set(null);this.api.moveLogicalField(this.source().id,this.fieldId(),{sourceVersionId:this.source().versionId,targetModelId:target.id,targetVersionId:target.versionId,targetEntityId:this.entityId()}).pipe(finalize(()=>this.busy.set(false))).subscribe({next:(result)=>this.moved.emit(result),error:(error:Error)=>this.error.set(error.message)});}
  cancel(event:Event):void{event.preventDefault();if(!this.busy())this.closed.emit();}
}
