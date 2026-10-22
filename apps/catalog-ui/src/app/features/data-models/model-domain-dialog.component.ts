import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DomainSummary } from '../../core/catalog.models';
import { PhysicalDomainTarget } from './data-models.models';
import { PhysicalRepresentation } from './mapping-draft.facade';

export interface DomainAssignmentChoice { domainId:string; physicalDomainTargets:PhysicalDomainTarget[]; }

@Component({
  selector:'daca-model-domain-dialog',standalone:true,changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    <dialog #dialog class="model-domain-dialog" aria-labelledby="model-domain-title" (cancel)="cancel($event)">
      <header><div><p class="daca-eyebrow">Datendomäne</p><h2 id="model-domain-title">Domäne zuordnen</h2><p>{{ targetName() }}</p></div></header>
      @if(loading()){<p role="status">Domänen werden geladen …</p>}
      @if(error()||loadError()){<p role="alert" class="domain-error">{{ error()||loadError() }}</p>}
      <label class="domain-select">Datendomäne<select [disabled]="busy()||fixedDomain()" [value]="domainId()" (change)="domainId.set(value($event))"><option value="">Bitte wählen</option>@for(domain of domains();track domain.id){<option [value]="domain.id">{{ domain.preferredLabel }}</option>}</select></label>
      @if(logical()){
        <fieldset [disabled]="busy()"><legend>Welche physischen Modelle sollen ebenfalls dieser Domäne zugeordnet werden?</legend>
          <p>Alle physischen Repräsentationen sind vorausgewählt. Bestehende Domänen bleiben erhalten; die gewählte Domäne wird ergänzt.</p>
          @for(item of physicalOptions();track item.table.id){<label class="physical-domain-choice"><input type="checkbox" [checked]="selectedIds().has(item.table.id)" [disabled]="!item.table.domainVersion||item.table.domainAssignable===false" (change)="toggle(item.table.id,$event)"><span><strong>{{ item.table.kind==='parquet'?item.table.name:item.table.schemaName+'.'+item.table.name }}</strong><small>{{ item.snapshot.sourceName }} · Snapshot {{ item.snapshot.revision }}</small><small>{{ existingDomains(item) }}</small>@if(item.table.domainAssignable===false){<small>Quelle ist stillgelegt; keine neue Domänenzuordnung möglich.</small>}@else if(!item.table.domainVersion){<small>Domänenstatus nicht verfügbar. Bitte den Arbeitsplatz neu laden.</small>}</span></label>}
          @empty{<p>Dieses Modell hat noch keine physische Repräsentation.</p>}
        </fieldset>
      }
      <footer><button type="button" class="daca-button is-secondary" [disabled]="busy()" (click)="closed.emit()">Abbrechen</button><button type="button" class="daca-button" [disabled]="busy()||loading()||!validDomain()" (click)="confirm()">{{ busy()?'Wird gespeichert …':'Zuordnen' }}</button></footer>
    </dialog>`,
  styles:[`
    .model-domain-dialog{width:min(700px,calc(100vw - 2rem));max-height:calc(100dvh - 2rem);margin:auto;border:0;border-top:5px solid var(--daca-red);padding:1.3rem;background:#fff;box-shadow:0 24px 80px #14202b55}.model-domain-dialog::backdrop{background:#1828368f}.model-domain-dialog h2{margin:0;font-size:1.3rem}.model-domain-dialog header p:last-child{font-size:.8rem;color:var(--daca-muted)}.domain-select{display:grid;gap:.4rem;margin:1rem 0;font-size:.8rem;font-weight:750}.domain-select select{min-height:42px;padding:.5rem;border:1px solid var(--daca-border-strong);background:#fff;color:var(--daca-ink)}fieldset{margin:1rem 0;border:1px solid var(--daca-border);padding:.8rem}legend{font-size:.8rem;font-weight:750}fieldset>p{font-size:.72rem;color:var(--daca-muted)}.physical-domain-choice{display:flex;gap:.7rem;align-items:start;border-top:1px solid var(--daca-border);padding:.75rem .4rem;cursor:pointer}.physical-domain-choice:hover{background:var(--daca-red-soft,#fff0f1)}.physical-domain-choice input{width:18px;height:18px;accent-color:var(--daca-red)}.physical-domain-choice span{display:grid;gap:.2rem;min-width:0}.physical-domain-choice strong{font-size:.8rem;overflow-wrap:anywhere}.physical-domain-choice small{font-size:.68rem;color:var(--daca-muted)}footer{display:flex;justify-content:flex-end;gap:.6rem;border-top:1px solid var(--daca-border);padding-top:1rem}.domain-error{padding:.8rem;background:var(--daca-red-soft);color:var(--daca-red-dark);font-size:.8rem}
  `],
})
export class ModelDomainDialogComponent {
  readonly targetName=input.required<string>();readonly logical=input(true);
  readonly initialDomainId=input('');readonly fixedDomain=input(false);
  readonly physicalOptions=input<readonly PhysicalRepresentation[]>([]);
  readonly busy=input(false);readonly error=input<string|null>(null);
  readonly confirmed=output<DomainAssignmentChoice>();readonly closed=output<void>();
  private readonly catalog=inject(CatalogApiService);private readonly dialog=viewChild<ElementRef<HTMLDialogElement>>('dialog');
  readonly domains=signal<readonly DomainSummary[]>([]);readonly domainId=signal('');
  readonly selectedIds=signal<ReadonlySet<string>>(new Set());readonly loading=signal(true);readonly loadError=signal<string|null>(null);
  readonly validDomain=computed(()=>this.domains().some((item)=>item.id===this.domainId()&&item.status==='active'));
  constructor(){
    effect(()=>{const dialog=this.dialog()?.nativeElement;if(dialog&&!dialog.open)dialog.showModal();});
    effect(()=>this.domainId.set(this.initialDomainId()));
    effect(()=>this.selectedIds.set(new Set(this.physicalOptions().filter((item)=>Boolean(item.table.domainVersion)&&item.table.domainAssignable!==false).map((item)=>item.table.id))));
    this.catalog.loadDomains().subscribe({next:(items)=>{this.domains.set(items.filter((item)=>item.status==='active'));this.loading.set(false);},error:(error:Error)=>{this.loadError.set(error.message);this.loading.set(false);}});
  }
  value(event:Event):string{return(event.target as HTMLSelectElement).value;}
  toggle(id:string,event:Event):void{const checked=(event.target as HTMLInputElement).checked;this.selectedIds.update((ids)=>{const next=new Set(ids);if(checked)next.add(id);else next.delete(id);return next;});}
  existingDomains(item:PhysicalRepresentation):string{return item.table.dataDomains?.length?'Bereits zugeordnet: '+item.table.dataDomains.map((domain)=>domain.displayName).join(', '):'Noch keine Domäne zugeordnet';}
  confirm():void{if(this.busy()||!this.validDomain())return;this.confirmed.emit({domainId:this.domainId(),physicalDomainTargets:this.physicalOptions().filter((item)=>this.selectedIds().has(item.table.id)).map((item)=>({physicalTableId:item.table.id,physicalSnapshotId:item.snapshot.id,expectedDomainVersion:item.table.domainVersion!}))});}
  cancel(event:Event):void{event.preventDefault();if(!this.busy())this.closed.emit();}
}
