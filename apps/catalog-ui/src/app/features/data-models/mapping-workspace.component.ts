import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { concatMap, finalize, forkJoin, from, map, of, switchMap } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelWorkspaceNavComponent } from './data-model-workspace-nav.component';
import { DataModelsApiService } from './data-models-api.service';
import { AssetMapping, AssetMappingWrite, DriftReport, LogicalField, LogicalModel, LogicalModelSummary, PhysicalColumn, PhysicalSnapshot, PhysicalTable } from './data-models.models';
import { DatasetSummaryComponent } from './dataset-summary.component';
import { LogicalModelEditorComponent } from './logical-model-editor.component';
import { MappingDraftFacade, MappingView } from './mapping-draft.facade';
import { MappingDriftComponent } from './mapping-drift.component';
import { MappingEditorDialogComponent } from './mapping-editor-dialog.component';
import { MappingGraphComponent } from './mapping-graph.component';
import { MappingInspectorComponent } from './mapping-inspector.component';
import { MappingMatrixComponent } from './mapping-matrix.component';
import { FALLBACK_LOGICAL_MODEL, FALLBACK_MAPPINGS, FALLBACK_PHYSICAL_SNAPSHOT } from './mapping-fallback';
import { WorkContextComponent } from './work-context.component';

export function mappingsForSnapshotWorkspace(
  mappings: readonly AssetMapping[],
  snapshot: PhysicalSnapshot,
  drift: DriftReport | null,
  tableId?: string,
): readonly AssetMapping[] {
  const impactedMappingIds = new Set(drift?.changes.flatMap((change) => change.impactedMappingIds) ?? []);
  const table = tableId ? snapshot.tables.find((item) => item.id === tableId) : undefined;
  const columnIds = table ? new Set(table.columns.map((column) => column.id)) : null;
  const tableImpactedMappingIds = table
    ? new Set(drift?.changes.filter((change) => change.tableName === table.name
      || change.tableName === `${table.schemaName}.${table.name}`
      || change.tableName.endsWith(`.${table.name}`)).flatMap((change) => change.impactedMappingIds) ?? [])
    : impactedMappingIds;
  return mappings.filter((mapping) => {
    if (mapping.physicalSnapshotId === snapshot.id) {
      return !columnIds || mapping.physicalColumnIds.some((id) => columnIds.has(id));
    }
    return mapping.status === 'broken'
      && (mapping.physicalSnapshotId === snapshot.previousSnapshotId || impactedMappingIds.has(mapping.id))
      && (!table || tableImpactedMappingIds.has(mapping.id));
  });
}

interface PhysicalRepresentationItem {
  snapshotId: string;
  tableId: string;
  sourceName: string;
  databaseName: string;
  tableName: string;
  kind: PhysicalTable['kind'];
  revision: number;
  linkedMappingCount: number;
}

interface ExactMappingSuggestion {
  logicalField: LogicalField;
  physicalColumn: PhysicalColumn;
}

interface MappingSuggestionReview {
  suggestions: readonly ExactMappingSuggestion[];
  typeConflicts: readonly string[];
  ambiguous: readonly string[];
  unmatched: readonly string[];
}

function compatibleType(value: string): string {
  const normalized = value.trim().toLocaleLowerCase('en').replace(/^xsd:/, '');
  if (['varchar', 'character varying', 'char', 'character', 'text', 'citext', 'string'].includes(normalized)) return 'string';
  if (['smallint', 'integer', 'bigint', 'int8', 'int16', 'int32', 'int64'].includes(normalized)) return 'integer';
  if (['numeric', 'decimal', 'real', 'double precision', 'float', 'double'].includes(normalized) || normalized.startsWith('decimal')) return 'decimal';
  if (['bool', 'boolean'].includes(normalized)) return 'boolean';
  if (normalized.includes('timestamp') || normalized === 'datetime' || normalized === 'date-time') return 'datetime';
  if (normalized.startsWith('time')) return 'time';
  if (normalized.endsWith('[]') || normalized.startsWith('array') || normalized.startsWith('list<')) return 'array';
  return normalized.replaceAll(' ', '_');
}

export function exactMappingSuggestions(
  fields: readonly LogicalField[],
  table: PhysicalTable,
): MappingSuggestionReview {
  const suggestions: ExactMappingSuggestion[] = [];
  const typeConflicts: string[] = [];
  const ambiguous: string[] = [];
  const unmatched: string[] = [];
  const fieldsByName = new Map<string, LogicalField[]>();
  const columnsByName = new Map<string, PhysicalColumn[]>();
  for (const field of fields) {
    const key = field.name.toLocaleLowerCase('de-CH');
    fieldsByName.set(key, [...(fieldsByName.get(key) ?? []), field]);
  }
  for (const column of table.columns) columnsByName.set(column.name.toLocaleLowerCase('de-CH'), [...(columnsByName.get(column.name.toLocaleLowerCase('de-CH')) ?? []), column]);
  for (const [name, namedFields] of fieldsByName) {
    const namedColumns = columnsByName.get(name) ?? [];
    if (!namedColumns.length) { unmatched.push(...namedFields.map((field) => field.name)); continue; }
    if (namedFields.length !== 1 || namedColumns.length !== 1) { ambiguous.push(name); continue; }
    const field = namedFields[0];
    const column = namedColumns[0];
    if (compatibleType(field.dataType) !== compatibleType(column.dataType)) {
      typeConflicts.push(`${field.name}: ${field.dataType} ↔ ${column.dataType}`);
      continue;
    }
    suggestions.push({ logicalField: field, physicalColumn: column });
  }
  return { suggestions, typeConflicts, ambiguous, unmatched };
}

@Component({
  selector: 'daca-mapping-workspace', standalone: true,
  imports: [RouterLink, DataModelWorkspaceNavComponent, DatasetSummaryComponent, LogicalModelEditorComponent, MappingGraphComponent, MappingMatrixComponent, MappingDriftComponent, MappingEditorDialogComponent, MappingInspectorComponent, WorkContextComponent],
  providers: [MappingDraftFacade], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (modelScoped && facade.model(); as model) {<daca-data-model-workspace-nav [modelId]="model.id" [modelTitle]="model.title.de" [activeSection]="facade.view()==='drift'?'drift':'mappings'" />}
    <section class="daca-page-heading mapping-heading"><div><p class="daca-eyebrow">Mapping-Arbeitsplatz</p><h1>{{ facade.model()?.title?.de || 'Logisch und physisch verbinden' }}</h1><p>Versionierte DaCa-Zuordnungen verbinden SHACL-Felder mit Feldern physischer Modelle aus PostgreSQL oder S3/Parquet. Sie sind keine I14Y MappingTables.</p></div><daca-work-context [user]="identity.user()" /></section>

    <section class="workspace-context" aria-label="Arbeitsauswahl"><label>Logisches Modell<select [value]="selectedModelId()" (change)="selectModel(selectValue($event))">@for(model of modelOptions();track model.id){<option [value]="model.id" [selected]="model.id===selectedModelId()">{{ model.title.de||model.identifiers[0] }}</option>}</select></label><label>Physische Repräsentation<select [value]="selectedSnapshotId()" (change)="selectSnapshot(selectValue($event))">@for(snapshot of snapshotOptions();track snapshot.id){<option [value]="snapshot.id" [selected]="snapshot.id===selectedSnapshotId()">{{ snapshot.sourceName||snapshot.systemName }} · {{ snapshot.databaseName }} · #{{ snapshot.revision }}</option>}</select></label><a class="daca-button is-secondary" routerLink="/physical-models">Bestehende Datenquellen</a></section>

    @if(fallbackActive()){<p class="daca-alert is-warning" role="status">Die API ist momentan nicht erreichbar. Der Arbeitsplatz zeigt ein lokales, nicht persistierbares Beispielszenario; nach „Erneut laden“ wird wieder ausschliesslich der Katalogstand verwendet. <button type="button" (click)="load()">Erneut laden</button></p>}
    @if(error()&&!fallbackActive()){<p class="daca-alert is-error" role="alert">{{ error() }} <button class="daca-button is-secondary" type="button" (click)="load()">Erneut laden</button></p>}
    @if(loading()){<div class="daca-card mapping-state" aria-live="polite">Modelle, physische Snapshots und Zuordnungen werden geladen …</div>}
    @if(!loading()&&facade.model();as model){
      <daca-dataset-summary [model]="model" [compact]="true" />
      <section class="representation-panel daca-card" aria-labelledby="representation-title">
        <header><div><p class="daca-eyebrow">Physische Bindungen</p><h2 id="representation-title">Repräsentationen dieses Modells</h2></div><div class="representation-actions"><a class="daca-button is-secondary" [routerLink]="['/models',model.id]">Model Merkmale bearbeiten</a><a class="daca-button is-secondary" routerLink="/physical-models" [queryParams]="{ logicalModelId: model.id }">Bestehende Datenquelle hinzufügen</a></div></header>
        <div class="representation-list">
          @for (item of linkedRepresentations(); track item.snapshotId + ':' + item.tableId) {
            <button type="button" [class.is-active]="item.snapshotId === selectedSnapshotId() && item.tableId === selectedPhysicalTableId()" (click)="selectRepresentation(item)"><span>{{ representationTypeLabel(item.kind) }}</span><strong>{{ item.databaseName }}.{{ item.tableName }}</strong><small>{{ item.sourceName }} · Snapshot {{ item.revision }} · {{ item.linkedMappingCount }} Mapping{{ item.linkedMappingCount === 1 ? '' : 's' }}</small></button>
          } @empty { <p>Noch keine persistierte physische Repräsentation. Wählen Sie eine Quelle, um Zuordnungen vorzuschlagen.</p> }
        </div>
      </section>
      @if(suggestionReview();as review){<section class="suggestion-review daca-card" aria-labelledby="suggestion-title"><header><div><p class="daca-eyebrow">1:1-Vorschläge prüfen</p><h2 id="suggestion-title">Exakte Feldpaare</h2><p>Nur namensgleiche und typkompatible Paare werden vorgeschlagen. Es wurden keine Fuzzy-Matches erzeugt.</p></div><button type="button" aria-label="Vorschläge schliessen" (click)="dismissSuggestions()">×</button></header>@if(review.suggestions.length){<div class="daca-table-wrap"><table class="daca-table"><thead><tr><th>Logisches Feld</th><th>Physische Spalte</th><th>Typ</th></tr></thead><tbody>@for(item of review.suggestions;track item.logicalField.id){<tr><td>{{ item.logicalField.entityName }}.{{ item.logicalField.name }}</td><td>{{ item.physicalColumn.name }}</td><td>{{ item.logicalField.dataType }} ↔ {{ item.physicalColumn.dataType }}</td></tr>}</tbody></table></div>}<div class="suggestion-issues">@if(review.typeConflicts.length){<p><strong>Typkonflikte:</strong> {{ review.typeConflicts.join(', ') }}</p>}@if(review.ambiguous.length){<p><strong>Mehrdeutig:</strong> {{ review.ambiguous.join(', ') }}</p>}@if(review.unmatched.length){<p><strong>Manuell zuzuordnen:</strong> {{ review.unmatched.join(', ') }}</p>}</div><footer><button class="daca-button is-secondary" type="button" (click)="dismissSuggestions()">Später manuell zuordnen</button><button class="daca-button" type="button" [disabled]="!review.suggestions.length" (click)="acceptSuggestions(review.suggestions)">{{ review.suggestions.length }} Vorschlag{{ review.suggestions.length === 1 ? '' : 'e' }} als Entwurf übernehmen</button></footer></section>}
      @if(facade.drift()?.changes?.length){<div class="drift-banner" role="status"><div><strong>Schemaänderung erkannt</strong><span>{{ facade.drift()!.changes.length }} technische Änderung(en) können bestehende Zuordnungen betreffen.</span></div><button type="button" (click)="setView('drift')">Drift prüfen</button></div>}
      <section class="mapping-shell daca-card">
        <header class="mapping-toolbar"><nav aria-label="Darstellung des Mapping-Arbeitsplatzes"><button type="button" [class.is-active]="facade.view()==='graph'" [attr.aria-pressed]="facade.view()==='graph'" (click)="setView('graph')">Graph</button><button type="button" [class.is-active]="facade.view()==='table'" [attr.aria-pressed]="facade.view()==='table'" (click)="setView('table')">Tabelle</button><button type="button" [class.is-active]="facade.view()==='drift'" [attr.aria-pressed]="facade.view()==='drift'" (click)="setView('drift')">Drift</button></nav><div class="mapping-counts" aria-label="Zuordnungsstatus"><span class="is-valid">{{ facade.statusCounts().validated }} gültig</span><span class="is-review">{{ facade.statusCounts().review_pending+facade.statusCounts().draft }} prüfen</span><span class="is-broken">{{ facade.statusCounts().broken }} gebrochen</span></div><div class="toolbar-actions"><button class="daca-button is-secondary" type="button" (click)="facade.openCreate($event.currentTarget)">Zuordnung hinzufügen</button><button class="daca-button" type="button" [disabled]="!facade.hasDirtyMappings()||saving()||fallbackActive()" (click)="saveMappings()">{{ saving()?'Wird gespeichert …':'Entwurf speichern' }}</button></div></header>
        <div class="mapping-body" [class.is-drift]="facade.view()==='drift'">
          <main>@switch(facade.view()){@case('graph'){<daca-mapping-graph/>}@case('table'){<daca-mapping-matrix/>}@case('drift'){<daca-mapping-drift/>}}</main>
          @if(facade.view()!=='drift'){<aside class="mapping-side" aria-label="Merkmale und Zuordnung">@if(facade.selectedField();as field){<daca-logical-model-editor [id]="model.id" [embedded]="true" [fieldPanelOnly]="true" [selectedFieldId]="field.id" (modelSaved)="modelCharacteristicsSaved()" />}<daca-mapping-inspector [showFieldSummary]="false" (validate)="validateMapping($event)" (submit)="submitMapping($event)" (supersede)="supersedeMapping($event)" /></aside>}
        </div>
      </section>
      <p class="mapping-permission">@if(identity.canPublishModels()){Als Data Owner können Sie validierte Modellversionen final publizieren.}@else{Als Data Steward können Sie Mappings bearbeiten und validieren sowie eine Freigabe vorschlagen; die finale Publikation bleibt dem Data Owner vorbehalten.}</p>
    } @else if(!loading()&&!error()) {<div class="daca-card mapping-state"><h2>Arbeitsplatz noch leer</h2><p>Für eine Zuordnung werden ein logisches Modell und ein physischer Snapshot benötigt.</p><div><a class="daca-button" routerLink="/models/new">Modell erstellen</a><a class="daca-button is-secondary" routerLink="/physical-models">Bestehende Datenquellen</a></div></div>}
    <p class="visually-hidden" aria-live="polite">{{ facade.announcement() }}</p><daca-mapping-editor-dialog />
  `,
  styles: [`
    .mapping-heading{align-items:center;margin-bottom:.7rem}.mapping-heading h1{font-size:clamp(1.45rem,2.2vw,2rem)}.mapping-heading p:not(.daca-eyebrow){margin-top:.3rem;font-size:.72rem}.workspace-context{display:grid;grid-template-columns:minmax(220px,1fr) minmax(220px,1fr) auto;align-items:end;gap:.65rem;margin-bottom:.7rem;border:1px solid var(--daca-border);padding:.65rem .8rem;background:#fff}.workspace-context label{display:grid;gap:.25rem;color:var(--daca-muted);font-size:.62rem;font-weight:800}.workspace-context select{min-height:38px;border:1px solid var(--daca-border-strong);border-radius:0;padding:.4rem .5rem;background:#fff}.workspace-context .daca-button{min-height:38px}.mapping-state{display:grid;justify-items:start;gap:.5rem;padding:2rem;box-shadow:none}.mapping-state h2,.mapping-state p{margin:0}.mapping-state>div{display:flex;gap:.5rem}.drift-banner{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:.7rem;border:1px solid #ead4a4;border-left:5px solid var(--daca-orange);padding:.55rem .8rem;background:var(--daca-orange-soft)}.drift-banner>div{display:grid}.drift-banner span{color:#665d4c;font-size:.7rem}.drift-banner button{min-height:36px;border:0;background:transparent;color:var(--daca-blue);font-weight:800;text-decoration:underline;cursor:pointer}.mapping-shell{overflow:hidden;box-shadow:none}.mapping-toolbar{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:.8rem;border-bottom:1px solid var(--daca-border);padding:.55rem .8rem;background:#fff}.mapping-toolbar nav{display:flex;align-self:stretch}.mapping-toolbar nav button{min-height:40px;border:0;border-bottom:3px solid transparent;padding:.4rem .7rem;background:#fff;font-weight:750;cursor:pointer}.mapping-toolbar nav button.is-active{border-color:var(--daca-red);color:var(--daca-red-dark)}.mapping-counts{display:flex;justify-content:center;flex-wrap:wrap;gap:.7rem;font-size:.64rem;font-weight:750}.mapping-counts span::before{display:inline-block;width:8px;height:8px;margin-right:.3rem;border-radius:50%;background:currentColor;content:''}.mapping-counts .is-valid{color:var(--daca-green)}.mapping-counts .is-review{color:var(--daca-orange)}.mapping-counts .is-broken{color:var(--daca-red-dark)}.toolbar-actions{display:flex;gap:.5rem}.mapping-body{display:grid;grid-template-columns:minmax(0,1fr) 420px;align-items:start;gap:.8rem;padding:.7rem;background:#f6f8f9}.mapping-body.is-drift{grid-template-columns:1fr}.mapping-body main{min-width:0}.mapping-side{display:grid;align-content:start;gap:.8rem;min-width:0}.mapping-permission{margin:.5rem 0;color:var(--daca-muted);font-size:.68rem;text-align:right}.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}@media(max-width:1199px){.mapping-toolbar{grid-template-columns:1fr auto}.mapping-counts{grid-column:1/-1;grid-row:2;justify-content:flex-start}.mapping-body{grid-template-columns:1fr}}@media(max-width:820px){.mapping-heading{align-items:flex-start;flex-direction:column}.workspace-context{grid-template-columns:1fr;padding:.8rem}.workspace-context select{min-height:42px}.mapping-toolbar{display:flex;align-items:stretch;flex-direction:column}.mapping-toolbar nav button{flex:1;min-height:44px}.toolbar-actions{display:grid;grid-template-columns:1fr 1fr}.mapping-counts{order:3}.drift-banner{align-items:flex-start;flex-direction:column}.mapping-permission{text-align:left}}@media(max-width:520px){.toolbar-actions{grid-template-columns:1fr}.mapping-state>div,.mapping-state .daca-button{width:100%}}
  `, `
    .representation-panel{margin:.7rem 0;box-shadow:none}.representation-panel>header,.suggestion-review>header{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.8rem 1rem;border-bottom:1px solid var(--daca-border)}.representation-panel h2,.suggestion-review h2{margin:.1rem 0;font-size:1rem}.representation-list{display:flex;gap:.6rem;overflow:auto;padding:.75rem}.representation-list>button{display:grid;min-width:230px;gap:.2rem;border:1px solid var(--daca-border-strong);padding:.65rem .75rem;background:#fff;text-align:left;cursor:pointer}.representation-list>button.is-active{border:2px solid var(--daca-blue);background:var(--daca-blue-soft)}.representation-list span{color:var(--daca-red-dark);font-size:.58rem;font-weight:800;text-transform:uppercase}.representation-list small{color:var(--daca-muted);font-size:.62rem}.representation-list>p{margin:.2rem;color:var(--daca-muted);font-size:.72rem}.suggestion-review{margin:.7rem 0;border-left:5px solid var(--daca-blue);box-shadow:none}.suggestion-review>header p:last-child{margin:.2rem 0;color:var(--daca-muted);font-size:.7rem}.suggestion-review>header>button{border:0;background:transparent;font-size:1.5rem;cursor:pointer}.suggestion-review table{min-width:650px}.suggestion-review th,.suggestion-review td{font-size:.68rem}.suggestion-issues{display:grid;gap:.3rem;padding:.75rem 1rem;background:#f7f9fa}.suggestion-issues p{margin:0;color:var(--daca-muted);font-size:.67rem}.suggestion-review footer{display:flex;justify-content:flex-end;gap:.5rem;padding:.75rem 1rem}@media(max-width:820px){.representation-panel>header,.suggestion-review>header{align-items:flex-start;flex-direction:column}.representation-panel>header .daca-button,.suggestion-review footer,.suggestion-review footer .daca-button{width:100%}.suggestion-review footer{flex-direction:column}}
  `, `
    .mapping-side{position:sticky;top:.75rem;max-height:calc(100vh - 1.5rem);overflow:auto}.representation-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.5rem}@media(max-width:1199px){.mapping-side{position:static;max-height:none;overflow:visible}}@media(max-width:820px){.representation-actions{width:100%;flex-direction:column}.representation-actions .daca-button{width:100%}}
  `],
})
export class MappingWorkspaceComponent {
  readonly identity=inject(DemoIdentityService);readonly facade=inject(MappingDraftFacade);private readonly api=inject(DataModelsApiService);private readonly route=inject(ActivatedRoute);private readonly router=inject(Router);
  private catalogRequestToken=0;
  private selectionRequestToken=0;
  private requestedModelId='';
  private requestedSnapshotId='';
  private requestedPhysicalTableId='';
  private suggestRequested=false;
  readonly modelScoped=Boolean(this.route.snapshot.paramMap.get('id'));
  readonly modelOptions=signal<readonly LogicalModelSummary[]>([]);readonly snapshotOptions=signal<readonly PhysicalSnapshot[]>([]);readonly selectedModelId=signal('');readonly selectedSnapshotId=signal('');readonly selectedPhysicalTableId=signal('');readonly linkedRepresentations=signal<readonly PhysicalRepresentationItem[]>([]);readonly suggestionReview=signal<MappingSuggestionReview|null>(null);readonly loading=signal(true);readonly saving=signal(false);readonly error=signal<string|null>(null);readonly fallbackActive=signal(false);
  constructor(){this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params)=>{const requestedView=params.get('view')??this.route.snapshot.data['view'];if(requestedView==='graph'||requestedView==='table'||requestedView==='drift')this.facade.view.set(requestedView);else this.facade.view.set(window.matchMedia?.('(max-width: 820px)').matches?'table':'graph');const modelId=params.get('logicalModelId')??this.route.snapshot.paramMap.get('id')??'';const snapshotId=params.get('physicalSnapshotId')??'';const tableId=params.get('physicalTableId')??'';this.suggestRequested=params.get('suggest')==='1';if(modelId){this.requestedModelId=modelId;this.selectedModelId.set(modelId);}if(snapshotId){this.requestedSnapshotId=snapshotId;this.selectedSnapshotId.set(snapshotId);}if(tableId){this.requestedPhysicalTableId=tableId;this.selectedPhysicalTableId.set(tableId);}});effect(()=>{this.identity.userId();this.load();});}
  load():void {
    const requestToken=++this.catalogRequestToken;
    // A new identity-scoped catalog load also invalidates any detail response
    // that was started for the previous identity.
    ++this.selectionRequestToken;
    this.loading.set(true);
    this.error.set(null);
    this.fallbackActive.set(false);
    forkJoin({models:this.api.listLogicalModels(),snapshots:this.api.listPhysicalSnapshots()}).subscribe({
      next:({models,snapshots})=>{
        if(requestToken!==this.catalogRequestToken)return;
        this.modelOptions.set(models);
        this.snapshotOptions.set(snapshots);
        const requestedModelId=this.requestedModelId||this.selectedModelId();
        const requestedSnapshotId=this.requestedSnapshotId||this.selectedSnapshotId();
        const modelId=models.some((model)=>model.id===requestedModelId)?requestedModelId:models[0]?.id;
        const snapshotId=snapshots.some((snapshot)=>snapshot.id===requestedSnapshotId)?requestedSnapshotId:snapshots[0]?.id;
        if(!modelId||!snapshotId){this.loading.set(false);return;}
        this.selectedModelId.set(modelId);
        this.selectedSnapshotId.set(snapshotId);
        this.loadSelection(modelId,snapshotId);
      },
      error:(error:Error)=>{if(requestToken===this.catalogRequestToken)this.useFallback(error.message);},
    });
  }
  private loadSelection(modelId:string,snapshotId:string):void {
    const requestToken=++this.selectionRequestToken;
    this.loading.set(true);
    this.error.set(null);
    forkJoin({model:this.api.loadLogicalModel(modelId),snapshot:this.api.loadPhysicalSnapshot(snapshotId),mappings:this.api.listMappings(modelId),drift:this.api.loadDrift(snapshotId)}).pipe(
      switchMap((selection)=>{
        const otherSnapshotIds=[...new Set(selection.mappings.map((mapping)=>mapping.physicalSnapshotId).filter((id)=>id!==snapshotId))];
        return otherSnapshotIds.length
          ? forkJoin(otherSnapshotIds.map((id)=>this.api.loadPhysicalSnapshot(id))).pipe(map((otherSnapshots)=>({...selection,allSnapshots:[selection.snapshot,...otherSnapshots]})))
          : of({...selection,allSnapshots:[selection.snapshot]});
      }),
      finalize(()=>{if(requestToken===this.selectionRequestToken)this.loading.set(false);}),
    ).subscribe({
      next:({model,snapshot,mappings,drift,allSnapshots})=>{
        if(requestToken!==this.selectionRequestToken||modelId!==this.selectedModelId()||snapshotId!==this.selectedSnapshotId())return;
        const requestedTableId=this.requestedPhysicalTableId||this.selectedPhysicalTableId();
        const mappedColumnIds=new Set(mappings.filter((mapping)=>mapping.physicalSnapshotId===snapshot.id).flatMap((mapping)=>mapping.physicalColumnIds));
        const activeTable=snapshot.tables.find((table)=>table.id===requestedTableId)
          ?? snapshot.tables.find((table)=>table.columns.some((column)=>mappedColumnIds.has(column.id)))
          ?? snapshot.tables[0];
        if(!activeTable){this.error.set('Der ausgewählte Snapshot enthält keine physische Repräsentation.');return;}
        this.selectedPhysicalTableId.set(activeTable.id);
        const scopedSnapshot={...snapshot,tables:[activeTable]};
        this.facade.initialize(model.body,scopedSnapshot,mappingsForSnapshotWorkspace(mappings,snapshot,drift,activeTable.id),drift);
        this.linkedRepresentations.set(this.representationItems(allSnapshots,mappings,snapshot,activeTable));
        this.suggestionReview.set(this.suggestRequested?exactMappingSuggestions(model.body.fields,activeTable):null);
      },
      error:(error:Error)=>{if(requestToken===this.selectionRequestToken)this.useFallback(error.message);},
    });
  }
  private useFallback(message:string):void{this.loading.set(false);this.error.set(message);this.fallbackActive.set(true);this.modelOptions.set([FALLBACK_LOGICAL_MODEL]);this.snapshotOptions.set([FALLBACK_PHYSICAL_SNAPSHOT]);this.selectedModelId.set(FALLBACK_LOGICAL_MODEL.id);this.selectedSnapshotId.set(FALLBACK_PHYSICAL_SNAPSHOT.id);const drift:DriftReport={id:'fallback-drift',sourceId:FALLBACK_PHYSICAL_SNAPSHOT.sourceId,previousSnapshotId:FALLBACK_PHYSICAL_SNAPSHOT.previousSnapshotId??'',currentSnapshotId:FALLBACK_PHYSICAL_SNAPSHOT.id,createdAt:FALLBACK_PHYSICAL_SNAPSHOT.importedAt,changes:[{id:'fallback-length-drift',kind:'length_changed',severity:'warning',tableName:'public.employee',columnName:'org_unit_name',previousValue:'varchar(180)',currentValue:'varchar(120)',confidence:null,impactedMappingIds:['mapping-name'],impactedLogicalFieldIds:['field-name'],resolved:false}]};this.facade.initialize(FALLBACK_LOGICAL_MODEL,FALLBACK_PHYSICAL_SNAPSHOT,FALLBACK_MAPPINGS,drift);}
  selectModel(id:string):void{this.requestedModelId=id;this.selectedModelId.set(id);this.navigateSelection();if(!this.fallbackActive())this.loadSelection(id,this.selectedSnapshotId());}
  selectSnapshot(id:string):void{this.requestedSnapshotId=id;this.requestedPhysicalTableId='';this.selectedSnapshotId.set(id);this.selectedPhysicalTableId.set('');this.navigateSelection();if(!this.fallbackActive())this.loadSelection(this.selectedModelId(),id);}
  selectRepresentation(item:PhysicalRepresentationItem):void{this.requestedSnapshotId=item.snapshotId;this.requestedPhysicalTableId=item.tableId;this.selectedSnapshotId.set(item.snapshotId);this.selectedPhysicalTableId.set(item.tableId);this.suggestRequested=false;this.navigateSelection();if(!this.fallbackActive())this.loadSelection(this.selectedModelId(),item.snapshotId);}
  representationTypeLabel(kind:PhysicalTable['kind']):string{return kind==='parquet'?'Parquet':kind==='materialized_view'?'Materialized View':kind==='view'?'View':'Tabelle';}
  dismissSuggestions():void{this.suggestionReview.set(null);this.suggestRequested=false;void this.router.navigate([],{relativeTo:this.route,queryParams:{suggest:null},queryParamsHandling:'merge',replaceUrl:true});}
  acceptSuggestions(suggestions:readonly ExactMappingSuggestion[]):void{
    const model=this.facade.model();const snapshot=this.facade.snapshot();if(!model||!snapshot)return;
    const today=new Date().toISOString().slice(0,10);
    for(const item of suggestions){const value:AssetMappingWrite={logicalModelVersionId:model.versionId,logicalFieldVersionIds:[item.logicalField.id],physicalSnapshotId:snapshot.id,physicalColumnIds:[item.physicalColumn.id],mappingType:'Direct',classification:item.logicalField.classification,transformationRule:null,comment:'Exakte 1:1-Zuordnung aus dem Vorschlagsreview',responsibleUserId:this.identity.userId(),validFrom:today,validTo:null};this.facade.upsertDraft(value);}
    this.facade.announcement.set(`${suggestions.length} exakte 1:1-Zuordnung${suggestions.length===1?'':'en'} wurden als lokale Entwürfe übernommen.`);this.dismissSuggestions();
  }
  selectValue(event:Event):string{return(event.target as HTMLSelectElement).value;}
  setView(view:MappingView):void{this.facade.view.set(view);void this.router.navigate([], {relativeTo:this.route,queryParams:{view},queryParamsHandling:'merge',replaceUrl:true});}
  modelCharacteristicsSaved():void{this.facade.announcement.set('Die Feldmerkmale wurden gespeichert.');this.load();}
  saveMappings():void{const dirty=this.facade.mappings().filter((mapping)=>this.facade.dirtyIds().has(mapping.id));if(!dirty.length||this.fallbackActive())return;this.saving.set(true);this.error.set(null);let savedCount=0;from(dirty).pipe(concatMap((mapping)=>{const value=this.facade.toWrite(mapping);const etag=`"${mapping.lockVersion}"`;const request=mapping.id.startsWith('draft-mapping-')?this.api.createMapping(value):this.api.updateMapping(mapping.id,mapping.versionId,value,etag);return request.pipe(map((result)=>({localId:mapping.id,result})));}),finalize(()=>this.saving.set(false))).subscribe({next:({localId,result})=>{savedCount+=1;this.facade.replaceSaved(localId,result.body);},complete:()=>this.facade.announcement.set('Alle Mapping-Entwürfe wurden versioniert gespeichert.'),error:(error:Error)=>this.error.set(savedCount?`${error.message} ${savedCount} Entwurf/Entwürfe wurden bereits gespeichert; die übrigen bleiben als lokale Entwürfe markiert.`:error.message)});}
  validateMapping(id:string):void{const mapping=this.facade.mappings().find((item)=>item.id===id);if(!mapping||mapping.status!=='review_pending'||mapping.id.startsWith('draft-mapping-'))return;this.saving.set(true);this.api.validateMapping(mapping.id,mapping.versionId,`"${mapping.lockVersion}"`).pipe(finalize(()=>this.saving.set(false))).subscribe({next:({body})=>{this.facade.markValidation(body);this.facade.announcement.set(body.validationResult?.valid?'Zuordnung ist gültig.':'Zuordnung enthält Prüfhinsweise oder Fehler.');},error:(error:Error)=>this.error.set(error.message)});}
  submitMapping(id:string):void{const mapping=this.facade.mappings().find((item)=>item.id===id);if(!mapping||!['draft','broken'].includes(mapping.status)||mapping.id.startsWith('draft-mapping-')||this.facade.dirtyIds().has(id))return;this.saving.set(true);this.error.set(null);this.api.submitMapping(mapping.id,mapping.versionId,`"${mapping.lockVersion}"`).pipe(finalize(()=>this.saving.set(false))).subscribe({next:({body})=>{this.facade.markValidation(body);this.facade.announcement.set('Die Zuordnung wurde als unveränderliche Nachfolgeversion zur Prüfung eingereicht.');},error:(error:Error)=>this.error.set(error.message)});}
  supersedeMapping(id:string):void{const mapping=this.facade.mappings().find((item)=>item.id===id);if(!mapping||!['validated','broken'].includes(mapping.status)||mapping.id.startsWith('draft-mapping-')||this.facade.dirtyIds().has(id))return;this.saving.set(true);this.error.set(null);this.api.supersedeMapping(mapping.id,mapping.versionId,`"${mapping.lockVersion}"`).pipe(finalize(()=>this.saving.set(false))).subscribe({next:({body})=>{this.facade.markValidation(body);this.facade.announcement.set('Die Zuordnung wurde durch eine unveränderliche Nachfolgeversion abgelöst.');},error:(error:Error)=>this.error.set(error.message)});}
  private representationItems(snapshots:readonly PhysicalSnapshot[],mappings:readonly AssetMapping[],currentSnapshot:PhysicalSnapshot,currentTable:PhysicalTable):readonly PhysicalRepresentationItem[]{
    const items=new Map<string,PhysicalRepresentationItem>();
    for(const snapshot of snapshots){for(const table of snapshot.tables){const columnIds=new Set(table.columns.map((column)=>column.id));const linked=mappings.filter((mapping)=>mapping.physicalSnapshotId===snapshot.id&&mapping.physicalColumnIds.some((id)=>columnIds.has(id)));if(!linked.length)continue;items.set(`${snapshot.id}:${table.id}`,{snapshotId:snapshot.id,tableId:table.id,sourceName:snapshot.sourceName,databaseName:snapshot.databaseName,tableName:table.kind==='parquet'?(table.storageLocation||table.name):`${table.schemaName}.${table.name}`,kind:table.kind,revision:snapshot.revision,linkedMappingCount:linked.length});}}
    const activeKey=`${currentSnapshot.id}:${currentTable.id}`;
    if(!items.has(activeKey))items.set(activeKey,{snapshotId:currentSnapshot.id,tableId:currentTable.id,sourceName:currentSnapshot.sourceName,databaseName:currentSnapshot.databaseName,tableName:currentTable.kind==='parquet'?(currentTable.storageLocation||currentTable.name):`${currentTable.schemaName}.${currentTable.name}`,kind:currentTable.kind,revision:currentSnapshot.revision,linkedMappingCount:0});
    return[...items.values()].sort((left,right)=>left.sourceName.localeCompare(right.sourceName,'de-CH')||left.tableName.localeCompare(right.tableName,'de-CH'));
  }
  private navigateSelection():void{void this.router.navigate([], {relativeTo:this.route,queryParams:{logicalModelId:this.selectedModelId(),physicalSnapshotId:this.selectedSnapshotId(),physicalTableId:this.selectedPhysicalTableId()||null},queryParamsHandling:'merge',replaceUrl:true});}
}
