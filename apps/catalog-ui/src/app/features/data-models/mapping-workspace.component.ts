import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { concatMap, finalize, forkJoin, from, map } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelWorkspaceNavComponent } from './data-model-workspace-nav.component';
import { DataModelsApiService } from './data-models-api.service';
import { AssetMapping, DriftReport, LogicalModel, LogicalModelSummary, PhysicalSnapshot } from './data-models.models';
import { DatasetSummaryComponent } from './dataset-summary.component';
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
): readonly AssetMapping[] {
  const impactedMappingIds = new Set(drift?.changes.flatMap((change) => change.impactedMappingIds) ?? []);
  return mappings.filter((mapping) => mapping.physicalSnapshotId === snapshot.id
    || (mapping.status === 'broken'
      && (mapping.physicalSnapshotId === snapshot.previousSnapshotId || impactedMappingIds.has(mapping.id))));
}

@Component({
  selector: 'daca-mapping-workspace', standalone: true,
  imports: [RouterLink, DataModelWorkspaceNavComponent, DatasetSummaryComponent, MappingGraphComponent, MappingMatrixComponent, MappingDriftComponent, MappingEditorDialogComponent, MappingInspectorComponent, WorkContextComponent],
  providers: [MappingDraftFacade], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (modelScoped && facade.model(); as model) {<daca-data-model-workspace-nav [modelId]="model.id" [modelTitle]="model.title.de" [activeSection]="facade.view()==='drift'?'drift':'mappings'" />}
    <section class="daca-page-heading mapping-heading"><div><p class="daca-eyebrow">Mapping-Arbeitsplatz</p><h1>{{ facade.model()?.title?.de || 'Logisch und physisch verbinden' }}</h1><p>Versionierte DaCa-Zuordnungen verbinden SHACL-Felder mit Feldern physischer Modelle aus PostgreSQL oder S3/Parquet. Sie sind keine I14Y MappingTables.</p></div><daca-work-context [user]="identity.user()" /></section>

    <section class="workspace-context" aria-label="Arbeitsauswahl"><label>Logisches Modell<select [value]="selectedModelId()" (change)="selectModel(selectValue($event))">@for(model of modelOptions();track model.id){<option [value]="model.id" [selected]="model.id===selectedModelId()">{{ model.title.de||model.identifiers[0] }}</option>}</select></label><label>Physisches Modell<select [value]="selectedSnapshotId()" (change)="selectSnapshot(selectValue($event))">@for(snapshot of snapshotOptions();track snapshot.id){<option [value]="snapshot.id" [selected]="snapshot.id===selectedSnapshotId()">{{ snapshot.sourceName||snapshot.systemName }} · {{ snapshot.databaseName }} · #{{ snapshot.revision }}</option>}</select></label><a class="daca-button is-secondary" routerLink="/physical-models">Physische Modelle verwalten</a></section>

    @if(fallbackActive()){<p class="daca-alert is-warning" role="status">Die API ist momentan nicht erreichbar. Der Arbeitsplatz zeigt ein lokales, nicht persistierbares Beispielszenario; nach „Erneut laden“ wird wieder ausschliesslich der Katalogstand verwendet. <button type="button" (click)="load()">Erneut laden</button></p>}
    @if(error()&&!fallbackActive()){<p class="daca-alert is-error" role="alert">{{ error() }} <button class="daca-button is-secondary" type="button" (click)="load()">Erneut laden</button></p>}
    @if(loading()){<div class="daca-card mapping-state" aria-live="polite">Modelle, physische Snapshots und Zuordnungen werden geladen …</div>}
    @if(!loading()&&facade.model();as model){
      <daca-dataset-summary [model]="model" [compact]="true" />
      @if(facade.drift()?.changes?.length){<div class="drift-banner" role="status"><div><strong>Schemaänderung erkannt</strong><span>{{ facade.drift()!.changes.length }} technische Änderung(en) können bestehende Zuordnungen betreffen.</span></div><button type="button" (click)="setView('drift')">Drift prüfen</button></div>}
      <section class="mapping-shell daca-card">
        <header class="mapping-toolbar"><nav aria-label="Darstellung des Mapping-Arbeitsplatzes"><button type="button" [class.is-active]="facade.view()==='graph'" [attr.aria-pressed]="facade.view()==='graph'" (click)="setView('graph')">Graph</button><button type="button" [class.is-active]="facade.view()==='table'" [attr.aria-pressed]="facade.view()==='table'" (click)="setView('table')">Tabelle</button><button type="button" [class.is-active]="facade.view()==='drift'" [attr.aria-pressed]="facade.view()==='drift'" (click)="setView('drift')">Drift</button></nav><div class="mapping-counts" aria-label="Zuordnungsstatus"><span class="is-valid">{{ facade.statusCounts().validated }} gültig</span><span class="is-review">{{ facade.statusCounts().review_pending+facade.statusCounts().draft }} prüfen</span><span class="is-broken">{{ facade.statusCounts().broken }} gebrochen</span></div><div class="toolbar-actions"><button class="daca-button is-secondary" type="button" (click)="facade.openCreate($event.currentTarget)">Zuordnung hinzufügen</button><button class="daca-button" type="button" [disabled]="!facade.hasDirtyMappings()||saving()||fallbackActive()" (click)="saveMappings()">{{ saving()?'Wird gespeichert …':'Entwurf speichern' }}</button></div></header>
        <div class="mapping-body" [class.is-drift]="facade.view()==='drift'">
          <main>@switch(facade.view()){@case('graph'){<daca-mapping-graph/>}@case('table'){<daca-mapping-matrix/>}@case('drift'){<daca-mapping-drift/>}}</main>
          @if(facade.view()!=='drift'){<daca-mapping-inspector (validate)="validateMapping($event)" (submit)="submitMapping($event)" (supersede)="supersedeMapping($event)" />}
        </div>
      </section>
      <p class="mapping-permission">@if(identity.canPublishModels()){Als Data Owner können Sie validierte Modellversionen final publizieren.}@else{Als Data Steward können Sie Mappings bearbeiten und validieren sowie eine Freigabe vorschlagen; die finale Publikation bleibt dem Data Owner vorbehalten.}</p>
    } @else if(!loading()&&!error()) {<div class="daca-card mapping-state"><h2>Arbeitsplatz noch leer</h2><p>Für eine Zuordnung werden ein logisches Modell und ein physischer Snapshot benötigt.</p><div><a class="daca-button" routerLink="/models/new">Modell erstellen</a><a class="daca-button is-secondary" routerLink="/physical-models">Physisches Modell importieren</a></div></div>}
    <p class="visually-hidden" aria-live="polite">{{ facade.announcement() }}</p><daca-mapping-editor-dialog />
  `,
  styles: [`
    .mapping-heading{align-items:center;margin-bottom:.7rem}.mapping-heading h1{font-size:clamp(1.45rem,2.2vw,2rem)}.mapping-heading p:not(.daca-eyebrow){margin-top:.3rem;font-size:.72rem}.workspace-context{display:grid;grid-template-columns:minmax(220px,1fr) minmax(220px,1fr) auto;align-items:end;gap:.65rem;margin-bottom:.7rem;border:1px solid var(--daca-border);padding:.65rem .8rem;background:#fff}.workspace-context label{display:grid;gap:.25rem;color:var(--daca-muted);font-size:.62rem;font-weight:800}.workspace-context select{min-height:38px;border:1px solid var(--daca-border-strong);border-radius:0;padding:.4rem .5rem;background:#fff}.workspace-context .daca-button{min-height:38px}.mapping-state{display:grid;justify-items:start;gap:.5rem;padding:2rem;box-shadow:none}.mapping-state h2,.mapping-state p{margin:0}.mapping-state>div{display:flex;gap:.5rem}.drift-banner{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:.7rem;border:1px solid #ead4a4;border-left:5px solid var(--daca-orange);padding:.55rem .8rem;background:var(--daca-orange-soft)}.drift-banner>div{display:grid}.drift-banner span{color:#665d4c;font-size:.7rem}.drift-banner button{min-height:36px;border:0;background:transparent;color:var(--daca-blue);font-weight:800;text-decoration:underline;cursor:pointer}.mapping-shell{overflow:hidden;box-shadow:none}.mapping-toolbar{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:.8rem;border-bottom:1px solid var(--daca-border);padding:.55rem .8rem;background:#fff}.mapping-toolbar nav{display:flex;align-self:stretch}.mapping-toolbar nav button{min-height:40px;border:0;border-bottom:3px solid transparent;padding:.4rem .7rem;background:#fff;font-weight:750;cursor:pointer}.mapping-toolbar nav button.is-active{border-color:var(--daca-red);color:var(--daca-red-dark)}.mapping-counts{display:flex;justify-content:center;flex-wrap:wrap;gap:.7rem;font-size:.64rem;font-weight:750}.mapping-counts span::before{display:inline-block;width:8px;height:8px;margin-right:.3rem;border-radius:50%;background:currentColor;content:''}.mapping-counts .is-valid{color:var(--daca-green)}.mapping-counts .is-review{color:var(--daca-orange)}.mapping-counts .is-broken{color:var(--daca-red-dark)}.toolbar-actions{display:flex;gap:.5rem}.mapping-body{display:grid;grid-template-columns:minmax(0,1fr) 300px;align-items:start;gap:.8rem;padding:.7rem;background:#f6f8f9}.mapping-body.is-drift{grid-template-columns:1fr}.mapping-body main{min-width:0}.mapping-permission{margin:.5rem 0;color:var(--daca-muted);font-size:.68rem;text-align:right}.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}@media(max-width:1199px){.mapping-toolbar{grid-template-columns:1fr auto}.mapping-counts{grid-column:1/-1;grid-row:2;justify-content:flex-start}.mapping-body{grid-template-columns:1fr}}@media(max-width:820px){.mapping-heading{align-items:flex-start;flex-direction:column}.workspace-context{grid-template-columns:1fr;padding:.8rem}.workspace-context select{min-height:42px}.mapping-toolbar{display:flex;align-items:stretch;flex-direction:column}.mapping-toolbar nav button{flex:1;min-height:44px}.toolbar-actions{display:grid;grid-template-columns:1fr 1fr}.mapping-counts{order:3}.drift-banner{align-items:flex-start;flex-direction:column}.mapping-permission{text-align:left}}@media(max-width:520px){.toolbar-actions{grid-template-columns:1fr}.mapping-state>div,.mapping-state .daca-button{width:100%}}
  `],
})
export class MappingWorkspaceComponent {
  readonly identity=inject(DemoIdentityService);readonly facade=inject(MappingDraftFacade);private readonly api=inject(DataModelsApiService);private readonly route=inject(ActivatedRoute);private readonly router=inject(Router);
  private catalogRequestToken=0;
  private selectionRequestToken=0;
  private requestedModelId='';
  private requestedSnapshotId='';
  readonly modelScoped=Boolean(this.route.snapshot.paramMap.get('id'));
  readonly modelOptions=signal<readonly LogicalModelSummary[]>([]);readonly snapshotOptions=signal<readonly PhysicalSnapshot[]>([]);readonly selectedModelId=signal('');readonly selectedSnapshotId=signal('');readonly loading=signal(true);readonly saving=signal(false);readonly error=signal<string|null>(null);readonly fallbackActive=signal(false);
  constructor(){this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params)=>{const requestedView=params.get('view')??this.route.snapshot.data['view'];if(requestedView==='graph'||requestedView==='table'||requestedView==='drift')this.facade.view.set(requestedView);else this.facade.view.set(window.matchMedia?.('(max-width: 820px)').matches?'table':'graph');const modelId=params.get('logicalModelId')??this.route.snapshot.paramMap.get('id')??'';const snapshotId=params.get('physicalSnapshotId')??'';if(modelId){this.requestedModelId=modelId;this.selectedModelId.set(modelId);}if(snapshotId){this.requestedSnapshotId=snapshotId;this.selectedSnapshotId.set(snapshotId);}});effect(()=>{this.identity.userId();this.load();});}
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
      finalize(()=>{if(requestToken===this.selectionRequestToken)this.loading.set(false);}),
    ).subscribe({
      next:({model,snapshot,mappings,drift})=>{
        if(requestToken!==this.selectionRequestToken||modelId!==this.selectedModelId()||snapshotId!==this.selectedSnapshotId())return;
        this.facade.initialize(model.body,snapshot,mappingsForSnapshotWorkspace(mappings,snapshot,drift),drift);
      },
      error:(error:Error)=>{if(requestToken===this.selectionRequestToken)this.useFallback(error.message);},
    });
  }
  private useFallback(message:string):void{this.loading.set(false);this.error.set(message);this.fallbackActive.set(true);this.modelOptions.set([FALLBACK_LOGICAL_MODEL]);this.snapshotOptions.set([FALLBACK_PHYSICAL_SNAPSHOT]);this.selectedModelId.set(FALLBACK_LOGICAL_MODEL.id);this.selectedSnapshotId.set(FALLBACK_PHYSICAL_SNAPSHOT.id);const drift:DriftReport={id:'fallback-drift',sourceId:FALLBACK_PHYSICAL_SNAPSHOT.sourceId,previousSnapshotId:FALLBACK_PHYSICAL_SNAPSHOT.previousSnapshotId??'',currentSnapshotId:FALLBACK_PHYSICAL_SNAPSHOT.id,createdAt:FALLBACK_PHYSICAL_SNAPSHOT.importedAt,changes:[{id:'fallback-length-drift',kind:'length_changed',severity:'warning',tableName:'public.employee',columnName:'org_unit_name',previousValue:'varchar(180)',currentValue:'varchar(120)',confidence:null,impactedMappingIds:['mapping-name'],impactedLogicalFieldIds:['field-name'],resolved:false}]};this.facade.initialize(FALLBACK_LOGICAL_MODEL,FALLBACK_PHYSICAL_SNAPSHOT,FALLBACK_MAPPINGS,drift);}
  selectModel(id:string):void{this.requestedModelId=id;this.selectedModelId.set(id);this.navigateSelection();if(!this.fallbackActive())this.loadSelection(id,this.selectedSnapshotId());}
  selectSnapshot(id:string):void{this.requestedSnapshotId=id;this.selectedSnapshotId.set(id);this.navigateSelection();if(!this.fallbackActive())this.loadSelection(this.selectedModelId(),id);}
  selectValue(event:Event):string{return(event.target as HTMLSelectElement).value;}
  setView(view:MappingView):void{this.facade.view.set(view);void this.router.navigate([], {relativeTo:this.route,queryParams:{view},queryParamsHandling:'merge',replaceUrl:true});}
  saveMappings():void{const dirty=this.facade.mappings().filter((mapping)=>this.facade.dirtyIds().has(mapping.id));if(!dirty.length||this.fallbackActive())return;this.saving.set(true);this.error.set(null);let savedCount=0;from(dirty).pipe(concatMap((mapping)=>{const value=this.facade.toWrite(mapping);const etag=`"${mapping.lockVersion}"`;const request=mapping.id.startsWith('draft-mapping-')?this.api.createMapping(value):this.api.updateMapping(mapping.id,mapping.versionId,value,etag);return request.pipe(map((result)=>({localId:mapping.id,result})));}),finalize(()=>this.saving.set(false))).subscribe({next:({localId,result})=>{savedCount+=1;this.facade.replaceSaved(localId,result.body);},complete:()=>this.facade.announcement.set('Alle Mapping-Entwürfe wurden versioniert gespeichert.'),error:(error:Error)=>this.error.set(savedCount?`${error.message} ${savedCount} Entwurf/Entwürfe wurden bereits gespeichert; die übrigen bleiben als lokale Entwürfe markiert.`:error.message)});}
  validateMapping(id:string):void{const mapping=this.facade.mappings().find((item)=>item.id===id);if(!mapping||mapping.status!=='review_pending'||mapping.id.startsWith('draft-mapping-'))return;this.saving.set(true);this.api.validateMapping(mapping.id,mapping.versionId,`"${mapping.lockVersion}"`).pipe(finalize(()=>this.saving.set(false))).subscribe({next:({body})=>{this.facade.markValidation(body);this.facade.announcement.set(body.validationResult?.valid?'Zuordnung ist gültig.':'Zuordnung enthält Prüfhinsweise oder Fehler.');},error:(error:Error)=>this.error.set(error.message)});}
  submitMapping(id:string):void{const mapping=this.facade.mappings().find((item)=>item.id===id);if(!mapping||!['draft','broken'].includes(mapping.status)||mapping.id.startsWith('draft-mapping-')||this.facade.dirtyIds().has(id))return;this.saving.set(true);this.error.set(null);this.api.submitMapping(mapping.id,mapping.versionId,`"${mapping.lockVersion}"`).pipe(finalize(()=>this.saving.set(false))).subscribe({next:({body})=>{this.facade.markValidation(body);this.facade.announcement.set('Die Zuordnung wurde als unveränderliche Nachfolgeversion zur Prüfung eingereicht.');},error:(error:Error)=>this.error.set(error.message)});}
  supersedeMapping(id:string):void{const mapping=this.facade.mappings().find((item)=>item.id===id);if(!mapping||!['validated','broken'].includes(mapping.status)||mapping.id.startsWith('draft-mapping-')||this.facade.dirtyIds().has(id))return;this.saving.set(true);this.error.set(null);this.api.supersedeMapping(mapping.id,mapping.versionId,`"${mapping.lockVersion}"`).pipe(finalize(()=>this.saving.set(false))).subscribe({next:({body})=>{this.facade.markValidation(body);this.facade.announcement.set('Die Zuordnung wurde durch eine unveränderliche Nachfolgeversion abgelöst.');},error:(error:Error)=>this.error.set(error.message)});}
  private navigateSelection():void{void this.router.navigate([], {relativeTo:this.route,queryParams:{logicalModelId:this.selectedModelId(),physicalSnapshotId:this.selectedSnapshotId()},queryParamsHandling:'merge',replaceUrl:true});}
}
