import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, input, output, signal, computed, viewChild } from '@angular/core';
import { DataModelsApiService } from './data-models-api.service';
import { LogicalModel, PhysicalSnapshot, PhysicalSource, PhysicalTable } from './data-models.models';
import { PhysicalObjectDetailComponent } from './physical-object-detail.component';

@Component({
  selector: 'daca-representation-picker', standalone: true, imports: [PhysicalObjectDetailComponent], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="representation-dialog" aria-labelledby="representation-picker-title" (cancel)="cancel($event)">
      <header><div><p class="daca-eyebrow">Sichtbare Datenquellen</p><h2 id="representation-picker-title">Neue physische Repräsentation</h2></div><button type="button" aria-label="Dialog schliessen" (click)="closed.emit()">×</button></header>
      <p>Strukturmetadaten auswählen. Datenzeilen werden nicht geladen. Änderungen bleiben bis «Entwurf speichern» lokal.</p>
      @if(error()){<p class="daca-alert is-error" role="alert">{{ error() }} <button type="button" (click)="loadSources()">Erneut laden</button></p>}
      <div class="picker-layout"><nav aria-label="Datenquelle und Objekt auswählen">
        <label>Quelle suchen<input autofocus type="search" [value]="query()" (input)="query.set(value($event))"></label>
        <label>Quellentyp<select [value]="sourceType()" (change)="sourceType.set(value($event))"><option value="">Alle</option><option value="postgresql">PostgreSQL</option><option value="s3">S3 / Parquet</option><option value="csv">CSV-Strukturimport</option></select></label>
        @if(loadingSources()){<p role="status">Datenquellen werden geladen …</p>}
        <div class="source-options">@for(source of filteredSources();track source.id){<button type="button" [class.is-selected]="selectedSource()?.id===source.id" [disabled]="!canAttach(source)" [title]="canAttach(source)?source.catalogPath:disabledReason(source)" (click)="selectSource(source)"><strong>{{ source.name }}</strong><small>{{ source.catalogPath }}</small>@if(!canAttach(source)){<small>{{ disabledReason(source) }}</small>}</button>}@empty{<p>Keine passende Datenquelle.</p>}</div>
        @if(loadingSnapshot()){<p role="status">Struktur wird geladen …</p>}
        @if(snapshot();as snapshot){<label>Objekt suchen<input type="search" [value]="objectQuery()" (input)="objectQuery.set(value($event))"></label><div class="object-tree"><strong>{{ snapshot.databaseName }}</strong>@for(schema of schemas();track schema){<details open><summary>{{ schema }}</summary>@for(table of tablesFor(schema);track table.id){<button type="button" [class.is-selected]="selectedTable()?.id===table.id" (click)="selectedTable.set(table)"><small>{{ table.kind==='parquet'?'Parquet':table.kind==='view'?'View':table.kind==='materialized_view'?'Materialized View':'Tabelle' }}</small><strong>{{ table.name }}</strong></button>}</details>}</div>}
      </nav><section class="picker-inspection" aria-label="Objektinspektion">@if(selectedTable();as table){@if(snapshot();as snapshot){@if(selectedSource();as source){<daca-physical-object-detail [table]="table" [snapshot]="snapshot" [source]="source" />}}}@else{<p>Wählen Sie eine Datenquelle und eine Tabelle, View oder ein Parquet-Objekt.</p>}</section></div>
      <footer><button class="daca-button is-secondary" type="button" (click)="closed.emit()">Abbrechen</button><button class="daca-button" type="button" [disabled]="!selectedTable()||loadingSnapshot()" (click)="attach()">Hinzufügen</button></footer>
    </dialog>
  `,
  styles: [`
    .representation-dialog{width:min(1180px,calc(100vw - 2rem));max-height:calc(100dvh - 2rem);margin:auto;border:0;border-top:5px solid var(--daca-red);padding:1.2rem;background:#fff;box-shadow:0 28px 80px #0a1c2c47}.representation-dialog::backdrop{background:#1828368f}.representation-dialog>header,.representation-dialog>footer{display:flex;align-items:center;justify-content:space-between;gap:1rem}.representation-dialog h2{margin:0;font-size:1.3rem}.representation-dialog>header button{width:40px;height:40px;background:#fff;border:1px solid var(--daca-border);font-size:1.4rem}.representation-dialog>p{font-size:.75rem;color:var(--daca-muted)}.picker-layout{display:grid;grid-template-columns:minmax(240px,30%) minmax(0,1fr);gap:1rem}.picker-layout>nav{min-width:0}.picker-layout label{display:grid;gap:.3rem;margin-bottom:.6rem;font-size:.7rem;font-weight:750}.picker-layout input,.picker-layout select{width:100%;min-height:40px;border:1px solid var(--daca-border-strong);padding:.4rem;background:#fff}.source-options{max-height:210px;overflow:auto;margin-bottom:.8rem}.source-options button,.object-tree button{display:grid;gap:.2rem;width:100%;border:1px solid var(--daca-border);padding:.6rem;background:#fff;text-align:left;cursor:pointer}.source-options small,.object-tree small{color:var(--daca-muted);font-size:.62rem;overflow-wrap:anywhere}.source-options button:disabled{opacity:.65;cursor:not-allowed}.source-options .is-selected,.object-tree .is-selected{background:var(--daca-blue-soft);box-shadow:inset 4px 0 var(--daca-blue)}.object-tree{border:1px solid var(--daca-border);padding:.5rem}.object-tree summary{padding:.5rem;cursor:pointer;font-size:.75rem}.object-tree button{margin-left:.5rem;width:calc(100% - .5rem);font-size:.75rem}.picker-inspection{min-width:0}.representation-dialog>footer{justify-content:flex-end;border-top:1px solid var(--daca-border);padding-top:1rem;margin-top:1rem}@media(max-width:760px){.picker-layout{grid-template-columns:1fr}.representation-dialog>footer{flex-wrap:wrap}}
  `],
})
export class RepresentationPickerComponent {
  readonly model=input.required<LogicalModel>();
  readonly closed=output<void>();
  readonly added=output<{snapshot:PhysicalSnapshot;table:PhysicalTable}>();
  private readonly api=inject(DataModelsApiService);
  private readonly dialog=viewChild<ElementRef<HTMLDialogElement>>('dialog');
  readonly sources=signal<readonly PhysicalSource[]>([]);
  readonly selectedSource=signal<PhysicalSource|null>(null);
  readonly selectedTable=signal<PhysicalTable|null>(null);
  readonly snapshot=signal<PhysicalSnapshot|null>(null);
  readonly query=signal('');readonly objectQuery=signal('');readonly sourceType=signal('');
  readonly error=signal<string|null>(null);readonly loadingSources=signal(true);readonly loadingSnapshot=signal(false);
  private requestToken=0;
  readonly filteredSources=computed(()=>this.sources().filter((source)=>(!this.sourceType()||source.connectorType===this.sourceType()||(this.sourceType()==='postgresql'&&source.connectorType==='fixture'))&&[source.name,source.catalogPath,source.ownerName].join(' ').toLocaleLowerCase('de-CH').includes(this.query().toLocaleLowerCase('de-CH'))));
  readonly schemas=computed(()=>[...new Set(this.filteredTables().map((table)=>table.schemaName))]);
  private readonly filteredTables=computed(()=>(this.snapshot()?.tables??[]).filter((table)=>[table.schemaName,table.name,table.storageLocation??''].join(' ').toLocaleLowerCase('de-CH').includes(this.objectQuery().toLocaleLowerCase('de-CH'))));
  constructor(){effect(()=>{const dialog=this.dialog()?.nativeElement;if(dialog&&!dialog.open)dialog.showModal();});this.loadSources();}
  value(event:Event):string{return(event.target as HTMLInputElement).value;}
  canAttach(source:PhysicalSource):boolean{return source.office===this.model().office&&source.department===this.model().department&&Boolean(source.latestSnapshotId)&&['fixture','postgresql','s3','csv'].includes(source.connectorType);}
  disabledReason(source:PhysicalSource):string{return source.office!==this.model().office||source.department!==this.model().department?'Quelle liegt ausserhalb des Modell-Organisationsbereichs.':!source.latestSnapshotId?'Noch keine Strukturmetadaten importiert.':'Quellentyp wird nicht unterstützt.';}
  loadSources():void{this.loadingSources.set(true);this.error.set(null);this.api.listPhysicalSources().subscribe({next:(sources)=>{this.sources.set(sources);this.loadingSources.set(false);},error:(error:Error)=>{this.error.set(error.message);this.loadingSources.set(false);}});}
  selectSource(source:PhysicalSource):void{if(!this.canAttach(source))return;const token=++this.requestToken;this.selectedSource.set(source);this.selectedTable.set(null);this.snapshot.set(null);this.loadingSnapshot.set(true);this.error.set(null);this.objectQuery.set('');this.api.loadPhysicalSnapshot(source.latestSnapshotId!).subscribe({next:(snapshot)=>{if(token!==this.requestToken)return;this.snapshot.set(snapshot);this.loadingSnapshot.set(false);},error:(error:Error)=>{if(token!==this.requestToken)return;this.error.set(error.message);this.loadingSnapshot.set(false);}});}
  tablesFor(schema:string):readonly PhysicalTable[]{return this.filteredTables().filter((table)=>table.schemaName===schema);}
  attach():void{const snapshot=this.snapshot(),table=this.selectedTable();if(snapshot&&table)this.added.emit({snapshot,table});}
  cancel(event:Event):void{event.preventDefault();this.closed.emit();}
}
