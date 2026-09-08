import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { MappingDraftFacade } from './mapping-draft.facade';
import { AssetMappingWrite, DataClassification, MappingType } from './data-models.models';

@Component({
  selector: 'daca-mapping-editor-dialog', standalone: true, imports: [ReactiveFormsModule], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="mapping-dialog" (cancel)="cancel($event)">
      @if(facade.editor()){
        <form [formGroup]="form" (ngSubmit)="save()">
          <header><div><p class="daca-eyebrow">DaCa Asset Mapping</p><h2>{{ facade.selectedMapping()?.status === 'broken' ? 'Gebrochene Zuordnung auflösen' : facade.editor()?.mappingId ? 'Zuordnung bearbeiten' : 'Zuordnung hinzufügen' }}</h2></div><button type="button" aria-label="Dialog schliessen" (click)="facade.closeEditor()">×</button></header>
          <p>@if(facade.selectedMapping()?.status === 'broken'){Wählen Sie gültige Spalten des aktuellen Snapshots. Beim Speichern entsteht eine neue Draft-Version; die gebrochene Vorgängerversion bleibt erhalten.}@else{Mehrere logische Quellen und mehrere physische Repräsentationen können in einer versionierten Zuordnung verbunden werden.}</p>
          @if(error()){<p class="daca-alert is-error" role="alert">{{ error() }}</p>}
          <div class="dialog-grid">
            <label>Logische Felder *<select multiple size="6" formControlName="logicalFieldVersionIds" autofocus>@for(field of facade.logicalFields();track field.id){<option [value]="field.id">{{ field.entityName }}.{{ field.name }} · {{ field.dataType }}</option>}</select><small>Für abgeleitete Ziele können mehrere Felder gewählt werden.</small></label>
            <label>Physische Felder *<select multiple size="6" formControlName="physicalColumnIds">@for(column of facade.physicalColumns();track column.id){<option [value]="column.id">{{ column.qualifiedName }} · {{ column.dataType }}</option>}</select><small>Ein logisches Feld darf mehrere physische Repräsentationen haben.</small></label>
            <label>Mapping-Typ *<select formControlName="mappingType"><option value="Direct">Direct</option><option value="Renamed">Renamed</option><option value="Derived">Derived</option><option value="Lookup">Lookup</option><option value="Transformed">Transformed</option></select></label>
            <label>Klassifizierung *<select formControlName="classification"><option value="unclassified">Nicht klassifiziert</option><option value="internal">Intern</option><option value="confidential">Vertraulich</option><option value="secret">Geheim</option></select></label>
            <label>Verantwortliche Person *<select formControlName="responsibleUserId">@for(user of modelingUsers();track user.id){<option [value]="user.id">{{ user.displayName }}</option>}</select></label>
            <label>Gültig ab *<input type="date" formControlName="validFrom"></label><label>Gültig bis<input type="date" formControlName="validTo"></label>
            <label class="is-wide">Transformations-/Lookup-Regel<textarea rows="3" formControlName="transformationRule" placeholder="Für Derived, Lookup und Transformed die nachvollziehbare Regel angeben"></textarea></label>
            <label class="is-wide">Kommentar<textarea rows="3" formControlName="comment" placeholder="Fachliche Begründung oder Prüfhinsweis"></textarea></label>
          </div>
          <footer><button class="daca-button is-secondary" type="button" (click)="facade.closeEditor()">Abbrechen</button><button class="daca-button" type="submit" [disabled]="form.invalid">Zuordnung übernehmen</button></footer>
        </form>
      }
    </dialog>
  `,
  styles: [`
    .mapping-dialog{width:min(780px,calc(100vw - 2rem));max-height:calc(100dvh - 2rem);margin:auto;border:0;border-top:5px solid var(--daca-red);padding:0;background:#fff;box-shadow:0 28px 80px #0a1c2c47}.mapping-dialog::backdrop{background:#1828368f}.mapping-dialog form{display:grid;gap:1rem;padding:1.4rem}.mapping-dialog header,.mapping-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:1rem}.mapping-dialog h2{margin:0}.mapping-dialog>form>p{margin:0;color:var(--daca-muted);font-size:.78rem}.mapping-dialog header button{width:40px;height:40px;border:1px solid var(--daca-border-strong);background:#fff;font-size:1.3rem;cursor:pointer}.dialog-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.dialog-grid label{display:grid;align-content:start;gap:.4rem;font-size:.72rem;font-weight:750}.dialog-grid input,.dialog-grid select,.dialog-grid textarea{width:100%;min-height:42px;border:1px solid var(--daca-border-strong);border-radius:0;padding:.55rem;background:#fff}.dialog-grid select[multiple]{min-height:154px;padding:.3rem}.dialog-grid option{padding:.4rem}.dialog-grid small{color:var(--daca-muted);font-size:.62rem;font-weight:400}.dialog-grid .is-wide{grid-column:1/-1}.mapping-dialog footer{justify-content:flex-end;border-top:1px solid var(--daca-border);padding-top:1rem}@media(max-width:680px){.dialog-grid{grid-template-columns:1fr}.dialog-grid .is-wide{grid-column:auto}.mapping-dialog footer{align-items:stretch;flex-direction:column-reverse}.mapping-dialog footer .daca-button{width:100%}}
  `],
})
export class MappingEditorDialogComponent {
  readonly facade=inject(MappingDraftFacade);readonly identity=inject(DemoIdentityService);private readonly fb=inject(FormBuilder);private readonly dialog=viewChild<ElementRef<HTMLDialogElement>>('dialog');readonly error=signal<string|null>(null);
  readonly modelingUsers=computed(()=>this.identity.users().filter((user)=>this.identity.modelingRoles(user).length>0));
  readonly form=this.fb.nonNullable.group({logicalFieldVersionIds:this.fb.nonNullable.control<string[]>([],Validators.required),physicalColumnIds:this.fb.nonNullable.control<string[]>([],Validators.required),mappingType:this.fb.nonNullable.control<MappingType>('Direct'),classification:this.fb.nonNullable.control<DataClassification>('unclassified'),responsibleUserId:['',Validators.required],validFrom:[new Date().toISOString().slice(0,10),Validators.required],validTo:'',transformationRule:'',comment:''});
  constructor(){effect(()=>{const state=this.facade.editor();const element=this.dialog()?.nativeElement;if(!element)return;if(state&&!element.open)element.showModal();else if(!state&&element.open)element.close();});effect(()=>{const state=this.facade.editor();if(!state)return;const mapping=state.mappingId?this.facade.mappings().find((item)=>item.id===state.mappingId):null;this.form.reset({logicalFieldVersionIds:[...state.logicalFieldVersionIds],physicalColumnIds:[...state.physicalColumnIds],mappingType:mapping?.mappingType??'Direct',classification:mapping?.classification??'unclassified',responsibleUserId:mapping?.responsibleUserId??this.identity.userId(),validFrom:mapping?.validFrom??new Date().toISOString().slice(0,10),validTo:mapping?.validTo??'',transformationRule:mapping?.transformationRule??'',comment:mapping?.comment??''});this.error.set(null);});}
  cancel(event:Event):void{event.preventDefault();this.facade.closeEditor();}
  save():void{if(this.form.invalid)return;const value=this.form.getRawValue();const model=this.facade.model();const snapshot=this.facade.snapshot();if(!model||!snapshot){this.error.set('Modell und physischer Snapshot müssen geladen sein.');return;}const write:AssetMappingWrite={logicalModelVersionId:model.versionId,logicalFieldVersionIds:value.logicalFieldVersionIds,physicalSnapshotId:snapshot.id,physicalColumnIds:value.physicalColumnIds,mappingType:value.mappingType,classification:value.classification,transformationRule:value.transformationRule.trim()||null,comment:value.comment.trim()||null,responsibleUserId:value.responsibleUserId,validFrom:value.validFrom,validTo:value.validTo||null};this.facade.upsertDraft(write);}
}
