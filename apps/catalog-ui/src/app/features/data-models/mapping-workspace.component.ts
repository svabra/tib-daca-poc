import { TooltipDirective } from '../../shared/tooltip.directive';
import { MAPPING_STATUS_HELP } from './data-models.models';
import { ModelDomainDialogComponent, DomainAssignmentChoice } from './model-domain-dialog.component';
import { compatibleType } from './mapping-types';
import { RepresentationPickerComponent } from './representation-picker.component';
import { PhysicalRepresentationActionsComponent } from './physical-representation-actions.component';
import { physicalCategoryLabel, physicalObjectName } from './physical-representation-labels';
import { CatalogObjectBrowserComponent, CatalogObjectKind } from '../domains/catalog-object-browser.component';
import { physicalConnectionStatus } from './physical-connection-status';
import { afterNextRender, Injector, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, HostListener, inject, signal, untracked, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, concatMap, EMPTY, finalize, forkJoin, map, of, Subject, switchMap, tap, throwError, timer } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DataModelWorkspaceNavComponent } from './data-model-workspace-nav.component';
import { DataModelsApiService, ModelingApiError } from './data-models-api.service';
import { ApiResult, AssetMapping, AssetMappingWrite, DriftReport, LogicalField, LogicalModel, LogicalModelSummary, MappingCanvasLayout, PhysicalColumn, PhysicalSnapshot, PhysicalTable } from './data-models.models';
import { DatasetSummaryComponent } from './dataset-summary.component';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator.component';
import { LogicalModelEditorComponent } from './logical-model-editor.component';
import { MappingDraftFacade, MappingView, PhysicalRepresentation } from './mapping-draft.facade';
import { MappingDriftComponent } from './mapping-drift.component';
import { MappingEditorDialogComponent } from './mapping-editor-dialog.component';
import { MappingGraphComponent } from './mapping-graph.component';
import { MappingInspectorComponent } from './mapping-inspector.component';
import { MappingInconsistenciesComponent } from './mapping-inconsistencies.component';
import { MappingMatrixComponent } from './mapping-matrix.component';
import { ModelingAssistanceService, ModelingScope } from './modeling-assistance.service';
import { FALLBACK_LOGICAL_MODEL, FALLBACK_MAPPINGS, FALLBACK_PHYSICAL_SNAPSHOT } from './mapping-fallback';

interface WorkspaceSelection {
  model:ApiResult<LogicalModel>;
  mappings:readonly AssetMapping[];
  bindings:readonly {physicalSnapshotId:string;physicalTableId:string}[];
  canvasLayout:MappingCanvasLayout;
  options:readonly PhysicalSnapshot[];
}

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

export function preferredTableForWorkspace(
  snapshot: PhysicalSnapshot,
  allSnapshots: readonly PhysicalSnapshot[],
  mappings: readonly AssetMapping[],
  requestedTableId: string,
): PhysicalTable | undefined {
  const requested = snapshot.tables.find((table) => table.id === requestedTableId);
  if (requested) return requested;
  const mappedColumnIds = new Set(mappings.filter((mapping) => mapping.physicalSnapshotId === snapshot.id).flatMap((mapping) => mapping.physicalColumnIds));
  const currentMatch = snapshot.tables.find((table) => table.columns.some((column) => mappedColumnIds.has(column.id)));
  if (currentMatch) return currentMatch;
  const predecessorKeys = new Set(allSnapshots.filter((item) => item.id !== snapshot.id).flatMap((item) =>
    item.tables.filter((table) => mappings.some((mapping) => mapping.physicalSnapshotId === item.id
      && mapping.physicalColumnIds.some((columnId) => table.columns.some((column) => column.id === columnId))))
      .map((table) => table.stableKey)));
  return snapshot.tables.find((table) => predecessorKeys.has(table.stableKey)) ?? snapshot.tables[0];
}

export function linkedSnapshotDetailIds(
  currentId: string,
  summaries: readonly PhysicalSnapshot[],
  mappings: readonly AssetMapping[],
): string[] {
  const mappedIds = new Set(mappings.map((mapping) => mapping.physicalSnapshotId));
  const latestBySource = new Map<string, PhysicalSnapshot>();
  for (const snapshot of summaries) {
    if (snapshot.id === currentId || !mappedIds.has(snapshot.id)) continue;
    const previous = latestBySource.get(snapshot.sourceId);
    if (!previous || snapshot.revision > previous.revision) latestBySource.set(snapshot.sourceId, snapshot);
  }
  return [...latestBySource.values()].map((snapshot) => snapshot.id);
}

interface PhysicalRepresentationItem {
  representation: PhysicalRepresentation;
  label: string;
  category: string;
  snapshotId: string;
  tableId: string;
  sourceName: string;
  databaseName: string;
  tableName: string;
  kind: PhysicalTable['kind'];
  revision: number;
  linkedMappingCount: number;
  persisted: boolean;
  preview?: boolean;
  connection:ReturnType<typeof physicalConnectionStatus>;
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
    }
    suggestions.push({ logicalField: field, physicalColumn: column });
  }
  return { suggestions, typeConflicts, ambiguous, unmatched };
}

@Component({
  selector: 'daca-mapping-workspace', standalone: true,
  imports: [TooltipDirective,PhysicalRepresentationActionsComponent,CatalogObjectBrowserComponent,LoadingIndicatorComponent,ModelDomainDialogComponent,RepresentationPickerComponent, RouterLink, DataModelWorkspaceNavComponent, DatasetSummaryComponent, LogicalModelEditorComponent, MappingGraphComponent, MappingMatrixComponent, MappingDriftComponent, MappingEditorDialogComponent, MappingInspectorComponent, MappingInconsistenciesComponent],
  providers: [MappingDraftFacade], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (modelScoped && facade.model(); as model) {<daca-data-model-workspace-nav [modelId]="model.id" [modelTitle]="model.title.de" [activeSection]="facade.view()==='drift'?'drift':'mappings'" />}
    <section class="daca-page-heading mapping-heading"><div><p class="daca-eyebrow">Mapping-Arbeitsplatz</p><h1>{{ facade.model()?.title?.de || 'Logisch und physisch verbinden' }}</h1><p>Ordnen Sie logische Felder den Feldern einer physischen Repräsentation zu.</p></div><a class="daca-button is-secondary" routerLink="/mappings">Andere Modelle auswählen</a></section>


    @if(fallbackActive()){<p class="daca-alert is-warning" role="status">Die API ist momentan nicht erreichbar. Der Arbeitsplatz zeigt ein lokales, nicht persistierbares Beispielszenario; nach „Erneut laden“ wird wieder ausschliesslich der Katalogstand verwendet. <button type="button" (click)="load()">Erneut laden</button></p>}
    @if(error()&&!fallbackActive()){<p class="daca-alert is-error" role="alert">{{ error() }} <button class="daca-button is-secondary" type="button" (click)="load()">Erneut laden</button></p>}
    @if(refreshNotice()){<p class="daca-alert is-warning" role="status">{{ refreshNotice() }} <button type="button" (click)="load()">Aktuellen Stand laden</button></p>}
    @if(historyNotice()){<p role="status">{{historyNotice()}}</p>}
    @if(loading()){<div class="daca-card mapping-state"><daca-loading-indicator label="Logische Modelle, physische Repräsentationen/Deklarationen und Mappings werden geladen …"/></div>}
    @if(!loading()&&facade.model();as model){
      <daca-dataset-summary [model]="model" [compact]="true" />
      @if(!fallbackActive()){<daca-mapping-inconsistencies [modelId]="model.id" [refreshKey]="issueRefreshKey()" />}
      <section class="representation-panel daca-card" aria-labelledby="representation-title">
        <header><div><p class="daca-eyebrow">Physische Bindungen</p><h2 id="representation-title">Repräsentationen dieses Modells</h2></div><div class="representation-actions">@if(!facade.representations().length&&canManageSelectedModel()){<button class="daca-button" type="button" (click)="openRepresentationPicker($event.currentTarget)">Physische Repräsentation auswählen</button>}@if(facade.hiddenRepresentationIds().size){<button class="daca-button is-secondary" type="button" (click)="showHiddenRepresentations()">Ausgeblendete einblenden ({{ facade.hiddenRepresentationIds().size }})</button>}<a class="daca-button is-secondary" [routerLink]="['/models',model.id]">Model Merkmale bearbeiten</a></div></header>
        <div class="representation-list">
          @for (item of linkedRepresentations(); track item.snapshotId + ':' + item.tableId) {
            <article class="representation-card" tabindex="-1" [class.is-active]="item.snapshotId === selectedSnapshotId() && item.tableId === selectedPhysicalTableId()" (contextmenu)="openBindingMenu(item,$event)">
            <button class="representation-select" type="button" [attr.data-representation-id]="item.tableId" title="Repräsentation im Canvas auswählen" [class.is-active]="item.snapshotId === selectedSnapshotId() && item.tableId === selectedPhysicalTableId()" (click)="selectRepresentation(item)"><span>{{item.category}} · {{ representationTypeLabel(item.kind) }}</span><strong>{{ item.label }}</strong><span class="daca-source-connection" [class.is-connected]="item.connection.configured===true" [title]="item.connection.description">{{ item.connection.label }}</span><small>{{ item.sourceName }} · Revision {{ item.revision }} · {{ item.preview ? 'Drift-Vorschau' : item.persisted ? 'gespeichert' : 'ungespeichert' }} · {{ item.linkedMappingCount }} Mapping{{ item.linkedMappingCount === 1 ? '' : 's' }}</small></button>
              <button class="representation-menu-trigger" type="button" aria-haspopup="menu" [attr.aria-expanded]="bindingMenu()?.item?.tableId===item.tableId" [attr.aria-label]="'Aktionen für '+item.label" (click)="openBindingMenu(item,$event)" (keydown.arrowdown)="openBindingMenu(item,$event)"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg></button>
            </article>
          } @empty { <p>Keine sichtbare physische Repräsentation. Blenden Sie vorhandene Darstellungen ein oder fügen Sie über das Kontextmenü im Canvas eine Repräsentation hinzu.</p> }
        </div>
      </section>
      @if(bindingMenu();as opened){<div class="binding-context-menu representation-context-menu" role="menu" [attr.aria-label]="'Aktionen für '+opened.item.label" [style.left.px]="opened.x" [style.top.px]="opened.y"><daca-physical-representation-actions [representation]="opened.item.representation" [logicalDomain]="model.dataDomain" [canManage]="canManageSelectedModel()" [busy]="domainBusy()" (removeDomain)="removePhysicalDomain(opened.item.tableId,$event)" (browse)="openBindingBrowser($event)" (assign)="assignBindingDomain(opened.item,$event)" (hide)="hideBindingRepresentation(opened.item)" (closed)="closeBindingMenu()"/></div>}
      @if(bindingBrowser();as kind){<daca-catalog-object-browser [initialKind]="kind" [openInNewTab]="true" (closed)="closeBindingBrowser()"/>}
      @if(suggestionReview();as review){<section class="suggestion-review daca-card" aria-labelledby="suggestion-title"><header><div><p class="daca-eyebrow">Automatisches Namens-Mapping</p><h2 id="suggestion-title">{{ review.suggestions.length }} eindeutige Namenspaare</h2><p>Namensgleiche Felder wurden als lokale Entwürfe verbunden. Datentypen werden bei der Validierung geprüft.</p></div><button type="button" aria-label="Hinweise schliessen" (click)="dismissSuggestions()">×</button></header><div class="suggestion-issues">@if(review.typeConflicts.length){<p><strong>Typkonflikte – Prüfung erforderlich:</strong> {{ review.typeConflicts.join(', ') }}</p>}@if(review.ambiguous.length){<p><strong>Mehrdeutig – manuell zuordnen:</strong> {{ review.ambiguous.join(', ') }}</p>}@if(review.unmatched.length){<p><strong>Kein namensgleiches Gegenstück:</strong> {{ review.unmatched.join(', ') }}</p>}</div></section>}
      @if(facade.drift()?.changes?.length){<div class="drift-banner" role="status"><div><strong>Schemaänderung erkannt</strong><span>{{ facade.drift()!.changes.length }} technische Änderung(en) können bestehende Mappings betreffen.</span></div><button type="button" (click)="setView('drift')">Drift prüfen</button></div>}
      <section class="mapping-shell daca-card" [class.is-fullscreen]="fullscreen()" [attr.role]="fullscreen()?'dialog':null" [attr.aria-modal]="fullscreen()?'true':null" aria-label="Mapping-Editor">
        <header class="mapping-toolbar"><nav aria-label="Darstellung des Mapping-Arbeitsplatzes"><button type="button" [class.is-active]="facade.view()==='graph'" [attr.aria-pressed]="facade.view()==='graph'" (click)="setView('graph')">Graph</button><button type="button" [class.is-active]="facade.view()==='table'" [attr.aria-pressed]="facade.view()==='table'" (click)="setView('table')">Tabelle</button><button type="button" [class.is-active]="facade.view()==='drift'" [attr.aria-pressed]="facade.view()==='drift'" (click)="setView('drift')">Drift</button></nav><div class="mapping-counts" aria-label="Mapping-Status"><span class="is-valid" tabindex="0" [dacaTooltip]="statusHelp.valid">{{ facade.statusCounts().validated }} gültig</span><span class="is-review" tabindex="0" [dacaTooltip]="statusHelp.review">{{ facade.statusCounts().review_pending+facade.statusCounts().draft }} prüfen</span><span class="is-broken" tabindex="0" [dacaTooltip]="statusHelp.broken">{{ facade.statusCounts().broken }} gebrochen</span></div><div class="toolbar-actions"><button class="daca-button is-secondary" type="button" (click)="facade.openCreate($event.currentTarget)">Mapping hinzufügen</button><span class="draft-save-action" role="group" aria-label="Entwurf speichern" [attr.tabindex]="draftSaveDisabledReason()?0:null" [attr.aria-disabled]="draftSaveDisabledReason()?'true':null" [attr.aria-describedby]="draftSaveDisabledReason()?'mapping-save-disabled-reason':null" (mouseenter)="saveReasonOpen.set(true)" (mouseleave)="closeSaveReason($event.currentTarget)" (focusin)="saveReasonOpen.set(true)" (focusout)="saveReasonOpen.set(false)" (keydown.escape)="dismissSaveReason($event)">
            <button class="daca-button" type="button" [disabled]="draftSaveDisabledReason()!==null" [attr.aria-describedby]="draftSaveDisabledReason()?'mapping-save-disabled-reason':null" (click)="saveMappings()">{{ saving()?'Wird gespeichert …':'Entwurf speichern' }}</button>
            @if(draftSaveDisabledReason();as reason){<span id="mapping-save-disabled-reason" class="draft-save-reason" role="tooltip" [hidden]="!saveReasonOpen()">{{ reason }}</span>}
          </span></div></header>
        <div class="mapping-body" [class.is-drift]="facade.view()==='drift'">
          <main>@switch(facade.view()){@case('graph'){<daca-mapping-graph [responsibleUserId]="identity.userId()" [fullscreen]="fullscreen()" (toggleFullscreen)="toggleFullscreen($event)" [canManage]="canManageSelectedModel()" (fieldActivated)="focusSelectedFieldInput()" (disconnect)="disconnectFieldLink($event.mappingId,$event.columnId)" (removeRelationship)="removeMapping($event)" (deleteField)="deleteLogicalField($event)" (addRepresentation)="openRepresentationPicker($event)" (assignDomain)="openDomainDialog($event)" [domainBusy]="domainBusy()" (removePhysicalDomain)="removePhysicalDomain($event.tableId,$event.domainId)"/>}@case('table'){<daca-mapping-matrix/>}@case('drift'){<daca-mapping-drift/>}}</main>
          <aside [style.display]="facade.view()==='drift'?'none':null" class="mapping-side" aria-label="Merkmale und Mapping">@if(facade.selectedField();as field){@for(versionId of [model.versionId];track versionId){<daca-logical-model-editor [workspaceSaving]="saving()" [mappingDraftsPending]="facade.hasDirtyMappings()" [id]="model.id" [embedded]="true" [fieldPanelOnly]="true" [selectedFieldId]="field.id" (draftChanged)="facade.previewLogicalDraft($event.modelId,$event.versionId,$event.value)" (modelSaved)="modelCharacteristicsSaved($event)" />}}<daca-mapping-inspector [showFieldSummary]="false" [canRemove]="canManageSelectedModel()" (validate)="validateMapping($event)" (submit)="submitMapping($event)" (supersede)="supersedeMapping($event)" (remove)="removeMapping($event)" /></aside>
        </div>
        @if(pickerOpen()){<daca-representation-picker [model]="model" (closed)="closeRepresentationPicker()" (added)="addRepresentation($event.snapshot,$event.table)" />}
        @if(domainDialog();as target){<daca-model-domain-dialog [targetName]="domainTargetName()" [logical]="target.tableId===null" [physicalOptions]="domainOptions()" [initialDomainId]="target.useLogicalDomain ? model.dataDomain.id : ''" [fixedDomain]="!!target.useLogicalDomain" [busy]="domainBusy()" [error]="domainError()" (closed)="closeDomainDialog()" (confirmed)="assignDomain($event)"/>}
        <daca-mapping-editor-dialog />
      </section>
      <p class="mapping-permission">@if(identity.canPublishModels()){Als Data Owner können Sie validierte Modellversionen final publizieren.}@else{Als Data Steward können Sie Mappings bearbeiten und validieren sowie eine Freigabe vorschlagen; die finale Publikation bleibt dem Data Owner vorbehalten.}</p>
    } @else if(!loading()&&!error()) {<div class="daca-card mapping-state"><h2>Arbeitsplatz noch leer</h2><p>Für ein Mapping werden ein logisches Modell und eine physische Repräsentation oder Deklaration benötigt.</p><div><a class="daca-button" routerLink="/models/new">Modell erstellen</a><a class="daca-button is-secondary" routerLink="/physical-models">Sichtbare Datenquellen</a></div></div>}

    <p class="visually-hidden" aria-live="polite">{{ facade.announcement() }}</p>
  `,
  styles: [`
    .mapping-counts>span{cursor:help;text-decoration:underline wavy #8198ab66;text-underline-offset:4px;text-decoration-thickness:1px}
    .draft-save-action{position:relative;display:flex;min-width:0;z-index:20}.draft-save-action>.daca-button{width:100%}.draft-save-action>.daca-button:disabled{pointer-events:none}.draft-save-action:focus-visible{outline:3px solid var(--daca-blue);outline-offset:3px}.draft-save-reason{position:absolute;top:100%;right:0;box-sizing:border-box;width:min(24rem,calc(100vw - 4rem));border:1px solid #fff;padding:.65rem .8rem;background:#263746;color:#fff;box-shadow:0 4px 12px #0003;font-size:.72rem;font-weight:400;line-height:1.5;text-align:left;white-space:normal}.draft-save-reason[hidden]{display:none}

    .mapping-heading{align-items:center;margin-bottom:.7rem}.mapping-heading h1{font-size:clamp(1.45rem,2.2vw,2rem)}.mapping-heading p:not(.daca-eyebrow){margin-top:.3rem;font-size:.72rem}.mapping-state{display:grid;justify-items:start;gap:.5rem;padding:2rem;box-shadow:none}.mapping-state h2,.mapping-state p{margin:0}.mapping-state>div{display:flex;gap:.5rem}.drift-banner{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:.7rem;border:1px solid #ead4a4;border-left:5px solid var(--daca-orange);padding:.55rem .8rem;background:var(--daca-orange-soft)}.drift-banner>div{display:grid}.drift-banner span{color:#665d4c;font-size:.7rem}.drift-banner button{min-height:36px;border:0;background:transparent;color:var(--daca-blue);font-weight:800;text-decoration:underline;cursor:pointer}.mapping-shell{overflow:hidden;box-shadow:none}.mapping-toolbar{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:.8rem;border-bottom:1px solid var(--daca-border);padding:.55rem .8rem;background:#fff}.mapping-toolbar nav{display:flex;align-self:stretch}.mapping-toolbar nav button{min-height:40px;border:0;border-bottom:3px solid transparent;padding:.4rem .7rem;background:#fff;font-weight:750;cursor:pointer}.mapping-toolbar nav button.is-active{border-color:var(--daca-red);color:var(--daca-red-dark)}.mapping-counts{display:flex;justify-content:center;flex-wrap:wrap;gap:.7rem;font-size:.64rem;font-weight:750}.mapping-counts span::before{display:inline-block;width:8px;height:8px;margin-right:.3rem;border-radius:50%;background:currentColor;content:''}.mapping-counts .is-valid{color:var(--daca-green)}.mapping-counts .is-review{color:var(--daca-orange)}.mapping-counts .is-broken{color:var(--daca-red-dark)}.toolbar-actions{display:flex;gap:.5rem}.mapping-body{display:grid;grid-template-columns:minmax(0,1fr) 420px;align-items:start;gap:.8rem;padding:.7rem;background:#f6f8f9}.mapping-body.is-drift{grid-template-columns:1fr}.mapping-body main{min-width:0}.mapping-side{display:grid;align-content:start;gap:.8rem;min-width:0}.mapping-permission{margin:.5rem 0;color:var(--daca-muted);font-size:.68rem;text-align:right}.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}@media(max-width:1199px){.mapping-toolbar{grid-template-columns:1fr auto}.mapping-counts{grid-column:1/-1;grid-row:2;justify-content:flex-start}.mapping-body{grid-template-columns:1fr}}@media(max-width:820px){.mapping-heading{align-items:flex-start;flex-direction:column}.mapping-toolbar{display:flex;align-items:stretch;flex-direction:column}.mapping-toolbar nav button{flex:1;min-height:44px}.toolbar-actions{display:grid;grid-template-columns:1fr 1fr}.mapping-counts{order:3}.drift-banner{align-items:flex-start;flex-direction:column}.mapping-permission{text-align:left}}@media(max-width:520px){.toolbar-actions{grid-template-columns:1fr}.mapping-state>div,.mapping-state .daca-button{width:100%}}
  `, `
    .representation-panel{margin:.7rem 0;box-shadow:none}.representation-panel>header,.suggestion-review>header{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.8rem 1rem;border-bottom:1px solid var(--daca-border)}.representation-panel h2,.suggestion-review h2{margin:.1rem 0;font-size:1rem}.representation-list{display:flex;gap:.6rem;overflow:auto;padding:.75rem}.representation-card{position:relative;flex:0 1 360px;min-width:min(290px,100%);border:1px solid var(--daca-border-strong);background:var(--daca-surface,#fff)}.representation-select{display:grid;gap:.35rem;width:100%;height:100%;border:0;padding:.65rem 3rem .65rem .75rem;background:transparent;color:inherit;text-align:left;cursor:pointer}.representation-select>strong{min-width:0;overflow-wrap:anywhere}.representation-card.is-active{border:2px solid var(--daca-blue);background:var(--daca-blue-soft)}.representation-menu-trigger{position:absolute;right:.3rem;top:.3rem;display:grid;place-items:center;width:40px;height:40px;padding:0;border:1px solid var(--daca-border-strong);background:var(--daca-surface,#fff);color:var(--daca-blue);cursor:pointer}.representation-menu-trigger svg{width:22px;height:22px;fill:currentColor}.binding-context-menu{position:fixed;z-index:1100;width:min(290px,calc(100vw - 16px));max-height:min(420px,calc(100dvh - 16px));overflow:auto;border:1px solid var(--daca-border-strong);border-top:4px solid var(--daca-blue);background:var(--daca-surface,#fff);box-shadow:0 12px 30px #14202b33}.representation-list span:not(.daca-source-connection){color:var(--daca-red-dark);font-size:.58rem;font-weight:800;text-transform:uppercase}.representation-list small{color:var(--daca-muted);font-size:.62rem}.representation-list>p{margin:.2rem;color:var(--daca-muted);font-size:.72rem}.suggestion-review{margin:.7rem 0;border-left:5px solid var(--daca-blue);box-shadow:none}.suggestion-review>header p:last-child{margin:.2rem 0;color:var(--daca-muted);font-size:.7rem}.suggestion-review>header>button{border:0;background:transparent;font-size:1.5rem;cursor:pointer}.suggestion-review table{min-width:650px}.suggestion-review th,.suggestion-review td{font-size:.68rem}.suggestion-issues{display:grid;gap:.3rem;padding:.75rem 1rem;background:#f7f9fa}.suggestion-issues p{margin:0;color:var(--daca-muted);font-size:.67rem}.suggestion-review footer{display:flex;justify-content:flex-end;gap:.5rem;padding:.75rem 1rem}@media(max-width:820px){.representation-panel>header,.suggestion-review>header{align-items:flex-start;flex-direction:column}.representation-panel>header .daca-button,.suggestion-review footer,.suggestion-review footer .daca-button{width:100%}.suggestion-review footer{flex-direction:column}}
  `, `
    .mapping-side{position:sticky;top:.75rem;max-height:calc(100vh - 1.5rem);overflow:auto}.representation-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.5rem}@media(max-width:1199px){.mapping-side{position:static;max-height:none;overflow:visible}}@media(max-width:820px){.representation-actions{width:100%;flex-direction:column}.representation-actions .daca-button{width:100%}}
  `, `
    .mapping-body{grid-template-columns:minmax(570px,1fr) minmax(340px,380px)}
    @media(max-width:999px){.mapping-body{grid-template-columns:1fr}.mapping-side{position:static;max-height:none;overflow:visible}}
    .representation-list>button.is-hidden{border-style:dashed}.mapping-shell.is-fullscreen{position:fixed;inset:0;z-index:1200;display:flex;flex-direction:column;box-sizing:border-box;width:100%;height:100dvh;margin:0;border:0;border-radius:0;background:#f6f8f9}.mapping-shell.is-fullscreen .mapping-toolbar{flex:none}.mapping-shell.is-fullscreen .mapping-body{flex:1;min-height:0;overflow:auto;align-items:stretch;grid-template-columns:minmax(0,1fr) minmax(300px,360px)}.mapping-shell.is-fullscreen main{height:100%;min-height:0}.mapping-shell.is-fullscreen .mapping-side{position:static;max-height:none;overflow:auto}.mapping-shell.is-fullscreen daca-mapping-graph{display:block;height:100%}.mapping-shell.is-fullscreen .mapping-body.is-drift{grid-template-columns:1fr}@media(max-width:999px){.mapping-shell.is-fullscreen .mapping-body{display:block}.mapping-shell.is-fullscreen .mapping-side{display:none}}
  `],
})
export class MappingWorkspaceComponent {
  readonly statusHelp=MAPPING_STATUS_HELP;
  @ViewChild(LogicalModelEditorComponent) private fieldEditor?:LogicalModelEditorComponent;
  readonly identity=inject(DemoIdentityService);readonly facade=inject(MappingDraftFacade);private readonly api=inject(DataModelsApiService);private readonly catalogApi=inject(CatalogApiService);private readonly assistance=inject(ModelingAssistanceService);private readonly route=inject(ActivatedRoute);private readonly router=inject(Router);private readonly host=inject<ElementRef<HTMLElement>>(ElementRef);
  readonly manageScopes=signal<readonly ModelingScope[]>([]);
  readonly canManageSelectedModel=computed(()=>{const model=this.facade.model();return Boolean(model&&!this.saving()&&!this.fallbackActive()&&model.status!=='retired'&&model.status!=='review_pending'&&this.manageScopes().some((scope)=>((scope.role === 'data_owner' || scope.role === 'deputy_data_owner')||(scope.role === 'data_steward' || scope.role === 'deputy_data_steward'))&&scope.descendantOrganizationIds.includes(model.office)));});
  readonly draftSaveDisabledReason=computed<string|null>(()=>{
    if(this.saving())return 'Der Entwurf wird gerade gespeichert. Bitte warten.';
    if(this.loading())return 'Der Arbeitsplatz wird noch geladen. Bitte warten.';
    if(this.fallbackActive())return 'Im lokalen Beispielszenario ist Speichern nicht verfügbar. Stellen Sie die API-Verbindung wieder her und laden Sie den Arbeitsplatz erneut.';
    const model=this.facade.model();
    if(!model)return 'Wählen Sie zuerst ein logisches Modell aus.';
    if(model.status==='retired')return 'Das logische Modell ist stillgelegt und kann nicht mehr geändert werden.';
    if(model.status==='review_pending')return 'Das logische Modell befindet sich in der Domänenprüfung. Während der Prüfung können keine Änderungen gespeichert werden.';
    if(!this.canManageSelectedModel())return 'Zum Speichern benötigen Sie die Rolle Data Owner oder Data Steward im Organisationsbereich dieses Modells.';
    if(!this.facade.hasWorkspaceChanges())return 'Keine ungespeicherten Änderungen an Kartenpositionen, Feldmerkmalen, Repräsentationen odes Mappingsen. Bestehende Entwürfe sind bereits gespeichert.';
    return null;
  });
  readonly saveReasonOpen=signal(false);
  closeSaveReason(trigger:EventTarget|null):void{if(!(trigger instanceof HTMLElement)||!trigger.contains(document.activeElement))this.saveReasonOpen.set(false);}
  dismissSaveReason(event:Event):void{if(this.draftSaveDisabledReason()&&this.saveReasonOpen()){event.preventDefault();event.stopPropagation();this.saveReasonOpen.set(false);}}
  readonly issueRefreshKey=signal(0);
  readonly pickerOpen=signal(false);
  @ViewChild(MappingGraphComponent) private graphView?:MappingGraphComponent;
  readonly bindingMenu=signal<{item:PhysicalRepresentationItem;x:number;y:number}|null>(null);
  readonly bindingBrowser=signal<CatalogObjectKind|null>(null);
  private bindingTrigger:HTMLElement|null=null;
  private readonly bindingInjector=inject(Injector);
  openBindingMenu(item:PhysicalRepresentationItem,event:Event):void{
    event.preventDefault();event.stopPropagation();this.graphView?.closeMenu();
    this.bindingTrigger=event.currentTarget as HTMLElement;const rect=this.bindingTrigger.getBoundingClientRect();
    const x=event instanceof MouseEvent&&event.clientX?event.clientX:rect.left,y=event instanceof MouseEvent&&event.clientY?event.clientY:rect.bottom;
    this.bindingMenu.set({item,x:Math.max(8,Math.min(x,innerWidth-298)),y:Math.max(8,Math.min(y,innerHeight-420))});
    afterNextRender(()=>this.host.nativeElement.querySelector<HTMLElement>('.binding-context-menu [role=menuitem]')?.focus(),{injector:this.bindingInjector});
  }
  closeBindingMenu():void{if(!this.bindingMenu())return;this.bindingMenu.set(null);this.bindingTrigger?.focus({preventScroll:true});}
  @HostListener('document:pointerdown',['$event']) bindingOutside(event:PointerEvent):void{if(!(event.target as HTMLElement).closest('.binding-context-menu,.representation-menu-trigger'))this.closeBindingMenu();}
  @HostListener('document:keydown.escape') bindingEscape():void{this.closeBindingMenu();}
  @HostListener('window:resize') bindingResize():void{this.closeBindingMenu();}
  closeBindingBrowser():void{this.bindingBrowser.set(null);this.bindingTrigger?.focus({preventScroll:true});}
  openBindingBrowser(kind:CatalogObjectKind):void{this.closeBindingMenu();this.bindingBrowser.set(kind);}
  assignBindingDomain(item:PhysicalRepresentationItem,useLogicalDomain:boolean):void{const trigger=this.bindingTrigger;this.closeBindingMenu();this.openDomainDialog({tableId:item.tableId,trigger,useLogicalDomain});}
  hideBindingRepresentation(item:PhysicalRepresentationItem):void{this.closeBindingMenu();this.facade.hideRepresentation(item.tableId);queueMicrotask(()=>this.host.nativeElement.querySelector<HTMLElement>('.representation-actions button')?.focus());}
  readonly domainDialog=signal<{tableId:string|null;trigger:HTMLElement|null;useLogicalDomain?:boolean}|null>(null);
  readonly domainBusy=signal(false);readonly domainError=signal<string|null>(null);
  removePhysicalDomain(tableId:string,domainId:string):void{
    if(!this.canManageSelectedModel()||this.domainBusy())return;
    const item=this.facade.representations().find(entry=>entry.table.id===tableId);
    if(!item?.table.domainVersion||item.table.domainAssignable===false||!item.table.dataDomains?.some(domain=>domain.id===domainId))return;
    this.closeBindingMenu();const token=this.selectionRequestToken;this.domainBusy.set(true);this.error.set(null);
    this.api.removePhysicalDomain(tableId,domainId,{physicalTableId:tableId,physicalSnapshotId:item.snapshot.id,expectedDomainVersion:item.table.domainVersion}).subscribe({
      next:state=>{if(token!==this.selectionRequestToken)return;this.facade.updatePhysicalDomains(item.snapshot.sourceId,item.table.stableKey,state);this.domainBusy.set(false);this.facade.announcement.set('Domänenzuordnung entfernt. Weitere Domänen und Mappings bleiben erhalten.');},
      error:(error:Error)=>{if(token!==this.selectionRequestToken)return;this.domainBusy.set(false);this.error.set(error.message+' Die Domänenzuordnung wurde nicht entfernt.');},
    });
  }
  readonly domainOptions=computed(()=>this.facade.representations().filter((item)=>!item.preview&&(this.domainDialog()?.tableId===null||item.table.id===this.domainDialog()?.tableId)));
  readonly domainTargetName=computed(()=>{const target=this.domainDialog();return target?.tableId?this.domainOptions()[0]?.table.name??'Physisches Modell':this.facade.model()?.title.de??'Logisches Modell';});
  openDomainDialog(target:{tableId:string|null;trigger:EventTarget|null;useLogicalDomain?:boolean}):void{
    if(!this.canManageSelectedModel()||this.domainBusy())return;
    this.domainError.set(null);this.domainDialog.set({tableId:target.tableId,useLogicalDomain:target.useLogicalDomain,trigger:target.trigger instanceof HTMLElement?target.trigger:null});
    const options=this.domainOptions(),token=this.selectionRequestToken;if(!options.length)return;
    this.domainBusy.set(true);forkJoin(options.map((item)=>this.api.loadPhysicalDomains(item.table.id).pipe(map((state)=>({item,state}))))).subscribe({next:(rows)=>{if(token!==this.selectionRequestToken)return;for(const {item,state} of rows)this.facade.updatePhysicalDomains(item.snapshot.sourceId,item.table.stableKey,state);this.domainBusy.set(false);},error:(error:Error)=>{if(token!==this.selectionRequestToken)return;this.domainBusy.set(false);this.domainError.set(error.message+' Bitte den Dialog erneut öffnen.');}});
  }
  closeDomainDialog():void{if(this.domainBusy())return;const trigger=this.domainDialog()?.trigger;this.domainDialog.set(null);queueMicrotask(()=>trigger?.focus({preventScroll:true}));}
  assignDomain(choice:DomainAssignmentChoice):void{
    const model=this.facade.model(),target=this.domainDialog();if(!model||!target||this.domainBusy()||!this.canManageSelectedModel())return;
    const token=this.selectionRequestToken;this.domainBusy.set(true);this.domainError.set(null);
    const done=()=>{if(token===this.selectionRequestToken){this.domainBusy.set(false);this.closeDomainDialog();this.facade.announcement.set('Domänenzuordnung gespeichert.');}};
    const fail=(error:Error)=>{if(token===this.selectionRequestToken){this.domainBusy.set(false);this.domainError.set(error.message+' Es wurden keine Zuordnungen dieses Vorgangs übernommen.');}};
    if(target.tableId){
      const item=this.domainOptions()[0],value=choice.physicalDomainTargets.find((entry)=>entry.physicalTableId===target.tableId);if(!item||!value){fail(new Error('Physische Repräsentation ist nicht verfügbar.'));return;}
      this.api.assignPhysicalDomain(target.tableId,choice.domainId,value).subscribe({next:(state)=>{if(token!==this.selectionRequestToken)return;this.facade.updatePhysicalDomains(item.snapshot.sourceId,item.table.stableKey,state);done();},error:fail});
    }else{
      this.api.assignLogicalDomain(model,choice.domainId,choice.physicalDomainTargets).subscribe({next:(result)=>{if(token!==this.selectionRequestToken)return;this.facade.rebaseAfterModelSave(result.body,result.mappings);for(const state of result.physicalDomainAssignments){const item=this.facade.representations().find((entry)=>entry.table.id===state.physicalTableId);if(item)this.facade.updatePhysicalDomains(item.snapshot.sourceId,item.table.stableKey,state);}this.issueRefreshKey.update((key)=>key+1);done();},error:fail});
    }
  }
  readonly fullscreen=signal(false);
  private fullscreenTrigger:HTMLElement|null=null;
  private previousBodyOverflow:string|null=null;
  private nativeFullscreen=false;
  async toggleFullscreen(trigger:EventTarget|null=null):Promise<void>{
    if(this.fullscreen()){await this.exitFullscreen();return;}
    const shell=this.host.nativeElement.querySelector<HTMLElement>('.mapping-shell');if(!shell)return;
    this.fullscreenTrigger=trigger instanceof HTMLElement?trigger:null;this.previousBodyOverflow=document.body.style.overflow;document.body.style.overflow='hidden';this.fullscreen.set(true);
    try{if(shell.requestFullscreen&&document.fullscreenEnabled!==false)await shell.requestFullscreen();}catch{/* Keep the editor viewport-filling when browser fullscreen is unavailable. */}
    queueMicrotask(()=>this.fullscreenTrigger?.focus({preventScroll:true}));
  }
  async exitFullscreen():Promise<void>{
    const shell=this.host.nativeElement.querySelector('.mapping-shell');
    this.restoreFullscreenView();
    if(shell&&document.fullscreenElement===shell&&document.exitFullscreen){try{await document.exitFullscreen();}catch{}}
    this.fullscreenTrigger?.focus({preventScroll:true});
  }
  private restoreFullscreenView():void{this.fullscreen.set(false);this.nativeFullscreen=false;if(this.previousBodyOverflow!==null){document.body.style.overflow=this.previousBodyOverflow;this.previousBodyOverflow=null;}}
  @HostListener('document:fullscreenchange') fullscreenChanged():void{const shell=this.host.nativeElement.querySelector('.mapping-shell');if(shell&&document.fullscreenElement===shell){this.nativeFullscreen=true;}else if(this.nativeFullscreen){this.restoreFullscreenView();this.fullscreenTrigger?.focus({preventScroll:true});}}
  @HostListener('document:keydown',['$event']) fullscreenKeydown(event:KeyboardEvent):void{
    if(!this.fullscreen()||event.defaultPrevented||(event.target instanceof Element&&event.target.closest('dialog[open]')))return;
    const shell=this.host.nativeElement.querySelector<HTMLElement>('.mapping-shell');if(!shell)return;
    if(event.key==='Escape'){if(shell.querySelector('.field-context-menu'))return;event.preventDefault();void this.exitFullscreen();}
    if(event.key==='Tab'){
      const controls=[...shell.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter((element)=>element.getClientRects().length>0);
      const first=controls[0],last=controls.at(-1);if(!first||!last)return;
      if(event.shiftKey&&(document.activeElement===first||!shell.contains(document.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||!shell.contains(document.activeElement))){event.preventDefault();first.focus();}
    }
  }
  ngOnDestroy():void{const shell=this.host.nativeElement.querySelector('.mapping-shell');this.restoreFullscreenView();if(shell&&document.fullscreenElement===shell)void document.exitFullscreen?.().catch(()=>{});}

  private pickerTrigger:HTMLElement|null=null;
  canDeactivate():boolean{return !this.facade.hasWorkspaceChanges()||window.confirm('Ungespeicherte Kartenpositionen, Feldmerkmale, Repräsentationen und Mappings verwerfen und den Arbeitsplatz verlassen?');}
  @HostListener('window:beforeunload',['$event']) beforeUnload(event:BeforeUnloadEvent):void{if(this.facade.hasWorkspaceChanges()){event.preventDefault();event.returnValue='';}}
  openRepresentationPicker(trigger:EventTarget|null=null):void{if(!this.canManageSelectedModel())return;this.pickerTrigger=trigger instanceof HTMLElement?trigger:null;this.pickerOpen.set(true);}
  closeRepresentationPicker():void{this.pickerOpen.set(false);queueMicrotask(()=>this.pickerTrigger?.focus());}
  showHiddenRepresentations():void{for(const id of this.facade.hiddenRepresentationIds())this.facade.showRepresentation(id);}
  addRepresentation(snapshot:PhysicalSnapshot,table:PhysicalTable):void{
    if(!this.canManageSelectedModel())return;
    const added=this.facade.addRepresentation({...snapshot,tables:[table]},table);
    this.selectedSnapshotId.set(snapshot.id);this.selectedPhysicalTableId.set(table.id);
    if(added){const review=exactMappingSuggestions(this.facade.logicalFields(),table);this.acceptSuggestions(review.suggestions);this.suggestionReview.set(review);}
    this.closeRepresentationPicker();this.focusRepresentation(table.id);this.rememberWorkspace();
  }
  private focusRepresentation(tableId:string):void{setTimeout(()=>{const card=[...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-representation-table-id]')].find((element)=>element.dataset['representationTableId']===tableId);card?.focus({preventScroll:true});card?.scrollIntoView?.({block:'nearest',inline:'nearest'});},0);}

  private catalogRequestToken=0;
  private readonly destroyRef=inject(DestroyRef);
  private refreshInFlight=false;
  private refreshGeneration=0;
  readonly refreshNotice=signal<string|null>(null);
  private scopeRequestToken=0;
  private selectionRequestToken=0;
  private driftRequestToken=0;
  private requestedModelId='';
  private requestedSnapshotId='';
  private requestedPhysicalTableId='';
  private suggestRequested=false;
  private representationRequested=false;
  private rememberedSelection='';
  private readonly historyWrites=new Subject<{modelId:string;actor:string;key:string;selection:{physicalSnapshotId:string|null;physicalTableId:string|null;view:MappingView}}>();
  readonly historyNotice=signal('');
  readonly modelScoped=Boolean(this.route.snapshot.paramMap.get('id'));
  readonly modelOptions=signal<readonly LogicalModelSummary[]>([]);readonly snapshotOptions=signal<readonly PhysicalSnapshot[]>([]);readonly selectedModelId=signal('');readonly selectedSnapshotId=signal('');readonly selectedPhysicalTableId=signal('');readonly linkedRepresentations=computed<readonly PhysicalRepresentationItem[]>(()=>this.facade.visibleRepresentations().map((representation)=>{const {snapshot,table,persisted,preview}=representation;return {representation,label:physicalObjectName(snapshot,table),category:physicalCategoryLabel(snapshot.sourceType),connection:physicalConnectionStatus(snapshot),snapshotId:snapshot.id,tableId:table.id,sourceName:snapshot.sourceName,databaseName:table.databaseName||snapshot.databaseName,tableName:table.kind==='parquet'?(table.storageLocation||table.name):`${table.schemaName}.${table.name}`,kind:table.kind,revision:snapshot.revision,persisted,preview,linkedMappingCount:this.facade.activeMappings().filter((mapping)=>mapping.physicalSnapshotId===snapshot.id&&mapping.physicalColumnIds.some((id)=>table.columns.some((column)=>column.id===id))).length};}));readonly suggestionReview=signal<MappingSuggestionReview|null>(null);readonly loading=signal(true);readonly saving=signal(false);readonly error=signal<string|null>(null);readonly fallbackActive=signal(false);
  constructor(){
    this.historyWrites.pipe(concatMap(request=>{
      if(request.actor!==this.identity.userId())return EMPTY;
      return this.api.rememberMappingWorkspace(request.modelId,request.selection).pipe(tap(()=>{if(request.actor===this.identity.userId())this.historyNotice.set('');}),catchError(()=>{
        if(request.actor===this.identity.userId()){if(this.rememberedSelection===request.key)this.rememberedSelection='';this.historyNotice.set('Der Arbeitsplatz bleibt geöffnet. Der Eintrag unter «Letzte Mapping-Arbeiten» konnte noch nicht gespeichert werden.');}return EMPTY;
      }));
    })).subscribe();
    // Finish finite, already authorized history writes when navigating back to the entry page.
    // Completing the source drains the queue; API requests retain their normal timeout.
    this.destroyRef.onDestroy(()=>this.historyWrites.complete());
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params)=>{const requestedView=params.get('view')??this.route.snapshot.data['view'];if(requestedView==='graph'||requestedView==='table'||requestedView==='drift')this.facade.view.set(requestedView);else this.facade.view.set(window.matchMedia?.('(max-width: 820px)').matches?'table':'graph');const modelId=params.get('logicalModelId')??this.route.snapshot.paramMap.get('id')??'';const snapshotId=params.get('physicalSnapshotId')??'';const tableId=params.get('physicalTableId')??'';this.suggestRequested=params.get('suggest')==='1';this.representationRequested=params.get('addRepresentation')==='1';if(modelId){this.requestedModelId=modelId;this.selectedModelId.set(modelId);}if(snapshotId){this.requestedSnapshotId=snapshotId;this.selectedSnapshotId.set(snapshotId);}if(tableId){this.requestedPhysicalTableId=tableId;this.selectedPhysicalTableId.set(tableId);}});effect(()=>{this.identity.userId();untracked(()=>{this.bindingMenu.set(null);this.bindingBrowser.set(null);this.rememberedSelection='';this.historyNotice.set('');this.load(true);this.loadManageScopes();});});
    timer(5000,5000).pipe(takeUntilDestroyed()).subscribe(()=>this.refreshWorkspace());
  }
  @HostListener('window:focus') refreshOnFocus():void{this.refreshWorkspace();}
  @HostListener('document:visibilitychange') refreshOnVisibility():void{if(document.visibilityState==='visible')this.refreshWorkspace();}

  refreshWorkspace():void{
    const modelId=this.facade.model()?.id;
    if(this.bindingMenu()||this.bindingBrowser()||this.graphView?.representationMenu())return;
    if(!modelId||this.loading()||this.saving()||this.domainBusy()||this.fallbackActive()||this.refreshInFlight||document.visibilityState==='hidden')return;
    if(this.facade.hasWorkspaceChanges()||this.facade.editor()||this.facade.pendingLogicalFieldId()||this.pickerOpen()||this.domainDialog()){
      this.refreshNotice.set('Die automatische Aktualisierung ist während Ihrer lokalen Bearbeitung pausiert. Ihre ungespeicherten Änderungen bleiben erhalten.');
      return;
    }
    const selectionToken=this.selectionRequestToken,generation=this.refreshGeneration,actor=this.identity.userId();
    this.refreshInFlight=true;
    forkJoin({model:this.api.loadLogicalModel(modelId),mappings:this.api.listMappings(modelId),bindings:this.api.listRepresentations(modelId),canvasLayout:this.api.loadCanvasLayout(modelId),options:this.api.listPhysicalSnapshots()}).pipe(
      switchMap((selection)=>this.hydrateSelection(selection,this.facade.representations().find((item)=>item.preview)?.snapshot.id??'')),
      takeUntilDestroyed(this.destroyRef),finalize(()=>{this.refreshInFlight=false;}),
    ).subscribe({next:(selection)=>{
      if(selectionToken!==this.selectionRequestToken||generation!==this.refreshGeneration||actor!==this.identity.userId()||this.saving())return;
      if(this.bindingMenu()||this.bindingBrowser()||this.graphView?.representationMenu())return;
      this.snapshotOptions.set(selection.options);
      if(this.facade.hasWorkspaceChanges()||this.facade.editor()||this.facade.pendingLogicalFieldId()||this.pickerOpen()||this.domainDialog()){
        this.refreshNotice.set('Die automatische Aktualisierung ist während Ihrer lokalen Bearbeitung pausiert. Ihre ungespeicherten Änderungen bleiben erhalten.');
        return;
      }
      this.refreshNotice.set(null);
      this.applySelection(this.selectedSnapshotId(),selection,true);
    },error:(error:Error)=>{
      if(selectionToken!==this.selectionRequestToken||generation!==this.refreshGeneration||actor!==this.identity.userId())return;
      if(error instanceof ModelingApiError&&[401,403,404].includes(error.status)){
        this.bindingMenu.set(null);this.bindingBrowser.set(null);this.graphView?.closeMenu();
        this.facade.clear();this.selectedSnapshotId.set('');this.selectedPhysicalTableId.set('');
        this.refreshNotice.set('Das Modell ist nicht mehr verfügbar oder liegt ausserhalb Ihrer aktuellen Berechtigungen. Laden Sie den Arbeitsplatz erneut.');
        return;
      }
      this.refreshNotice.set('Der aktuelle Katalogstand konnte nicht geladen werden. Die automatische Aktualisierung versucht es erneut.');
    }});
  }
  private loadManageScopes():void{const token=++this.scopeRequestToken;this.manageScopes.set([]);this.assistance.myScopes().subscribe({next:(scopes)=>{if(token===this.scopeRequestToken)this.manageScopes.set(scopes);},error:()=>{if(token===this.scopeRequestToken)this.manageScopes.set([]);}});}
  load(force=false):void {
    if(!force&&!this.canDeactivate())return;
    this.domainDialog.set(null);this.domainBusy.set(false);
    if(this.fullscreen())void this.exitFullscreen();
    this.facade.clear();this.pickerOpen.set(false);
    ++this.refreshGeneration;this.refreshNotice.set(null);
    this.saving.set(false);
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
        const modelId=models.some((model)=>model.id===requestedModelId)?requestedModelId:!this.modelScoped?models[0]?.id:undefined;
        const snapshotId=snapshots.some((snapshot)=>snapshot.id===requestedSnapshotId)?requestedSnapshotId:'';
        if(!modelId){this.loading.set(false);if(this.modelScoped)this.error.set('Das ausgewählte Modell ist nicht mehr verfügbar oder liegt ausserhalb Ihrer Berechtigungen. Wählen Sie über «Andere Modelle auswählen» ein verfügbares Modell.');return;}
        this.selectedModelId.set(modelId);
        this.selectedSnapshotId.set(snapshotId);
        this.loadSelection(modelId,snapshotId);
      },
      error:(error:Error)=>{if(requestToken===this.catalogRequestToken)this.useFallback(error.message);},
    });
  }
  private loadSelection(modelId:string,snapshotId:string):void {
    const token=++this.selectionRequestToken;this.facade.clear();this.loading.set(true);this.error.set(null);
    forkJoin({model:this.api.loadLogicalModel(modelId),mappings:this.api.listMappings(modelId),bindings:this.api.listRepresentations(modelId),canvasLayout:this.api.loadCanvasLayout(modelId)}).pipe(
      switchMap((selection)=>this.hydrateSelection({...selection,options:this.snapshotOptions()},snapshotId)),
      takeUntilDestroyed(this.destroyRef),finalize(()=>{if(token===this.selectionRequestToken)this.loading.set(false);}),
    ).subscribe({next:(selection)=>{
      if(token!==this.selectionRequestToken||modelId!==this.selectedModelId())return;
      this.applySelection(snapshotId,selection);
    },error:(error:Error)=>{if(token===this.selectionRequestToken){this.error.set(error.message);this.loading.set(false);}}});
  }
  private hydrateSelection(selection:WorkspaceSelection,snapshotId:string){
    const brokenSources=new Set(selection.mappings.filter((item)=>item.status==='broken').map((item)=>selection.options.find((snapshot)=>snapshot.id===item.physicalSnapshotId)?.sourceId));
    const newestBroken=[...brokenSources].flatMap((sourceId)=>{const latest=selection.options.filter((snapshot)=>snapshot.sourceId===sourceId).sort((left,right)=>right.revision-left.revision)[0];return latest?[latest.id]:[];});
    const ids=[...new Set([...newestBroken,...selection.bindings.map((item)=>item.physicalSnapshotId),...selection.mappings.filter((item)=>item.status!=='superseded').map((item)=>item.physicalSnapshotId),...(snapshotId?[snapshotId]:[])])];
    return (ids.length?forkJoin(ids.map((id)=>this.api.loadPhysicalSnapshot(id).pipe(catchError((error:Error)=>{
      if(error instanceof ModelingApiError&&(error.status===403||error.status===404))return of(null);
      return throwError(()=>error);
    })))):of([])).pipe(map((loaded)=>({...selection,snapshots:loaded.filter((snapshot):snapshot is PhysicalSnapshot=>snapshot!==null)})));
  }
  private applySelection(snapshotId:string,{model,mappings,bindings,snapshots,canvasLayout}:WorkspaceSelection&{snapshots:readonly PhysicalSnapshot[]},refresh=false):void{
      const representations:PhysicalRepresentation[]=[];
      for(const snapshot of snapshots){for(const table of snapshot.tables){const pinned=bindings.some((item)=>item.physicalSnapshotId===snapshot.id&&item.physicalTableId===table.id);const linked=mappings.some((mapping)=>mapping.status!=='superseded'&&mapping.physicalSnapshotId===snapshot.id&&mapping.physicalColumnIds.some((id)=>table.columns.some((column)=>column.id===id)));if(pinned||linked)representations.push({snapshot:{...snapshot,tables:[table]},table,persisted:true});}}
      if(refresh)for(const previous of this.facade.representations().filter((item)=>item.preview)){
        if(this.requestedSnapshotId!==previous.snapshot.id&&!mappings.some((mapping)=>mapping.status==='broken'&&snapshots.find((snapshot)=>snapshot.id===mapping.physicalSnapshotId)?.sourceId===previous.snapshot.sourceId))continue;
        const snapshot=snapshots.find((item)=>item.id===previous.snapshot.id),table=snapshot?.tables.find((item)=>item.id===previous.table.id);
        if(snapshot&&table&&!representations.some((item)=>item.table.id===table.id))representations.push({snapshot:{...snapshot,tables:[table]},table,persisted:false,preview:true});
      }
      const brokenSourceIds=new Set(mappings.filter((mapping)=>mapping.status==='broken').map((mapping)=>snapshots.find((snapshot)=>snapshot.id===mapping.physicalSnapshotId)?.sourceId));
      const latestBroken=snapshots.filter((snapshot)=>brokenSourceIds.has(snapshot.sourceId)).sort((left,right)=>right.revision-left.revision)[0];
      const active=snapshots.find((item)=>item.id===snapshotId&&( !refresh||representations.some((representation)=>representation.snapshot.id===item.id)))??latestBroken??representations[0]?.snapshot??null;
      const table=active?preferredTableForWorkspace(active,snapshots,mappings,this.requestedPhysicalTableId||this.selectedPhysicalTableId()):undefined;
      // An explicitly requested newer snapshot is a drift workspace selection,
      // not an implicit write or automatic replacement of historical evidence.
      if(active&&table&&!representations.some((item)=>item.table.id===table.id)&&(!refresh||latestBroken?.id===active.id))representations.push({snapshot:{...active,tables:[table]},table,persisted:false,preview:!this.suggestRequested&&!this.representationRequested});
      if(refresh){
        const unchanged=JSON.stringify([this.facade.model(),this.facade.mappings(),this.facade.representations(),this.facade.canvasLayoutState()])===JSON.stringify([model.body,mappings,representations,canvasLayout]);
        if(unchanged){if(active)this.loadActiveDrift(active.id);return;}
        this.facade.refreshSelection(model.body,active&&table?{...active,tables:[table]}:null,mappings,representations,canvasLayout);
        this.issueRefreshKey.update((key)=>key+1);
      }else this.facade.initialize(model.body,active&&table?{...active,tables:[table]}:null,mappings,null,representations,canvasLayout);
      this.selectedSnapshotId.set(active?.id??'');this.selectedPhysicalTableId.set(table?.id??'');
      if(!refresh)this.rememberWorkspace();
      if(active)this.loadActiveDrift(active.id);
      if(!refresh&&this.suggestRequested&&active&&table){const review=exactMappingSuggestions(model.body.fields,table);this.acceptSuggestions(review.suggestions);this.suggestionReview.set(review);}
  }
  private loadActiveDrift(snapshotId:string):void{
    const token=this.selectionRequestToken,request=++this.driftRequestToken,generation=this.refreshGeneration;
    const current=()=>token===this.selectionRequestToken&&request===this.driftRequestToken&&generation===this.refreshGeneration&&this.facade.snapshot()?.id===snapshotId;
    this.api.loadDrift(snapshotId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next:(drift)=>{
      if(current()){const snapshot=this.facade.snapshot();if(snapshot)this.facade.activateSnapshot(snapshot,drift);}
    },error:(error:Error)=>{if(current())this.refreshNotice.set('Die Drift-Prüfung konnte nicht aktualisiert werden: '+error.message);}});
  }
  private useFallback(message:string):void{this.loading.set(false);this.error.set(message);this.fallbackActive.set(true);this.modelOptions.set([FALLBACK_LOGICAL_MODEL]);this.snapshotOptions.set([FALLBACK_PHYSICAL_SNAPSHOT]);this.selectedModelId.set(FALLBACK_LOGICAL_MODEL.id);this.selectedSnapshotId.set(FALLBACK_PHYSICAL_SNAPSHOT.id);const drift:DriftReport={id:'fallback-drift',sourceId:FALLBACK_PHYSICAL_SNAPSHOT.sourceId,previousSnapshotId:FALLBACK_PHYSICAL_SNAPSHOT.previousSnapshotId??'',currentSnapshotId:FALLBACK_PHYSICAL_SNAPSHOT.id,createdAt:FALLBACK_PHYSICAL_SNAPSHOT.importedAt,changes:[{id:'fallback-length-drift',kind:'length_changed',severity:'warning',tableName:'public.employee',columnName:'org_unit_name',previousValue:'varchar(180)',currentValue:'varchar(120)',confidence:null,impactedMappingIds:['mapping-name'],impactedLogicalFieldIds:['field-name'],resolved:false}]};this.facade.initialize(FALLBACK_LOGICAL_MODEL,FALLBACK_PHYSICAL_SNAPSHOT,FALLBACK_MAPPINGS,drift);}
  selectRepresentation(item:PhysicalRepresentationItem):void{const representation=this.facade.representations().find((entry)=>entry.table.id===item.tableId);if(!representation)return;this.facade.showRepresentation(item.tableId);this.selectedSnapshotId.set(item.snapshotId);this.selectedPhysicalTableId.set(item.tableId);this.facade.activateSnapshot(representation.snapshot);this.loadActiveDrift(item.snapshotId);this.focusRepresentation(item.tableId);this.rememberWorkspace();}
  private rememberWorkspace(force=false):void{
    const model=this.facade.model();if(!model||this.fallbackActive())return;
    const actor=this.identity.userId(),selection={physicalSnapshotId:this.selectedSnapshotId()||null,physicalTableId:this.selectedPhysicalTableId()||null,view:this.facade.view()};
    const key=JSON.stringify([actor,model.id,selection]);if(!force&&key===this.rememberedSelection)return;this.rememberedSelection=key;
    this.historyWrites.next({modelId:model.id,actor,key,selection});
  }
  representationTypeLabel(kind:PhysicalTable['kind']):string{return kind==='parquet'?'Parquet':kind==='materialized_view'?'Materialized View':kind==='view'?'View':'Tabelle';}
  dismissSuggestions():void{this.suggestionReview.set(null);this.suggestRequested=false;void this.router.navigate([],{relativeTo:this.route,queryParams:{suggest:null},queryParamsHandling:'merge',replaceUrl:true});}
  acceptSuggestions(suggestions:readonly ExactMappingSuggestion[]):void{
    const model=this.facade.model();const snapshot=this.facade.snapshot();if(!model||!snapshot)return;
    const today=new Date().toISOString().slice(0,10);
    for(const item of suggestions){if(this.facade.activeMappings().some((mapping)=>mapping.logicalFieldVersionIds.includes(item.logicalField.id)&&mapping.physicalColumnIds.includes(item.physicalColumn.id)))continue;const value:AssetMappingWrite={logicalModelVersionId:model.versionId,logicalFieldVersionIds:[item.logicalField.id],physicalSnapshotId:snapshot.id,physicalColumnIds:[item.physicalColumn.id],mappingType:'Direct',classification:item.logicalField.classification,transformationRule:null,comment:'Automatisches namensgleiches Mapping; fachlich und technisch zu prüfen',responsibleUserId:this.identity.userId(),validFrom:today,validTo:null};this.facade.upsertDraft(value);}
    this.facade.announcement.set(`${suggestions.length} ${suggestions.length===1?'exaktes':'exakte'} 1:1-Mapping${suggestions.length===1?'':'s'} wurden als lokale Entwürfe übernommen.`);this.suggestionReview.set(null);this.suggestRequested=false;
  }
  setView(view:MappingView):void{this.facade.view.set(view);void this.router.navigate([], {relativeTo:this.route,queryParams:{view},queryParamsHandling:'merge',replaceUrl:true});this.rememberWorkspace();}
  modelCharacteristicsSaved(model?:LogicalModel):void{
    ++this.refreshGeneration;
    this.rememberWorkspace(true);this.facade.announcement.set('Die Feldmerkmale wurden gespeichert.');this.issueRefreshKey.update((value)=>value+1);this.catalogApi.refreshWorkflowTasks();
    if(!model){this.load();return;}
    const token=this.selectionRequestToken;
    this.api.listMappings(model.id).subscribe({next:(mappings)=>{if(token===this.selectionRequestToken&&this.facade.model()?.id===model.id)this.facade.rebaseAfterModelSave(model,mappings);},error:(error:Error)=>this.error.set(error.message)});
  }

  focusSelectedFieldInput():void{setTimeout(()=>this.host.nativeElement.querySelector<HTMLInputElement>('.mapping-side .field-panel-form input[formcontrolname="entityName"]')?.focus(),0);}
  deleteLogicalField(fieldId:string):void{if(!this.canManageSelectedModel()||this.saving()||this.fallbackActive())return;if(this.facade.hasDirtyMappings()){this.error.set('Speichern oder verwerfen Sie zuerst die lokalen Mapping-Entwürfe.');return;}if(!this.fieldEditor?.removeFieldFromGraph(fieldId))this.error.set('Das Feld konnte nicht entfernt werden. Prüfen Sie die Feldmerkmale und versuchen Sie es erneut.');}
  disconnectFieldLink(mappingId:string,columnId:string):void{
    if(!this.canManageSelectedModel())return;
    const mapping=this.facade.activeMappings().find((item)=>item.id===mappingId);
    if(!mapping||mapping.logicalFieldVersionIds.length!==1||!mapping.physicalColumnIds.includes(columnId))return;
    if(mapping.physicalColumnIds.length===1){this.removeMapping(mappingId);return;}
    this.facade.reviseMapping(mappingId,{physicalColumnIds:mapping.physicalColumnIds.filter((id)=>id!==columnId)});
  }
  saveMappings():void{
    const model=this.facade.model();if(!model||this.draftSaveDisabledReason())return;
    const dirty=this.facade.mappings().filter((mapping)=>this.facade.dirtyIds().has(mapping.id));
    const representations=this.facade.pendingRepresentations().map((item)=>({physicalSnapshotId:item.snapshot.id,physicalTableId:item.table.id}));
    ++this.refreshGeneration;this.saving.set(true);this.error.set(null);
    const token=this.selectionRequestToken,actor=this.identity.userId();
    const current=()=>token===this.selectionRequestToken&&actor===this.identity.userId()&&this.facade.model()?.id===model.id;
    this.api.saveWorkspaceDraft(model,representations,dirty,this.facade.logicalDraft(),this.facade.pendingRemovals(),this.facade.canvasLayoutDraft()).pipe(takeUntilDestroyed(this.destroyRef),finalize(()=>{if(current())this.saving.set(false);})).subscribe({
      next:(result)=>{if(!current())return;this.facade.markRemovalsSaved(result.removedMappingIds??[]);for(const item of result.mappings)this.facade.replaceSaved(item.clientId,item.mapping);if(result.logicalModel)this.facade.rebaseAfterModelSave(result.logicalModel,result.currentMappings??[]);this.facade.markRepresentationsSaved(new Set(result.items.map((item)=>item.physicalTableId)));if(result.canvasLayout)this.facade.restoreCanvasLayout(result.canvasLayout);this.refreshNotice.set(null);this.rememberWorkspace(true);this.facade.announcement.set('Alle Mapping-Entwürfe wurden versioniert gespeichert.');this.issueRefreshKey.update((value)=>value+1);this.catalogApi.refreshWorkflowTasks();},
      error:(error:Error)=>{if(current())this.error.set(`${error.message} Es wurden keine Änderungen dieses Speichervorgangs übernommen; die lokalen Entwürfe bleiben erhalten.`);},
    });
  }
  removeMapping(id:string):void{if(this.canManageSelectedModel())this.facade.stageMappingRemoval(id);}
  validateMapping(id:string):void{const mapping=this.facade.mappings().find((item)=>item.id===id);if(!mapping||mapping.status!=='review_pending'||mapping.id.startsWith('draft-mapping-'))return;++this.refreshGeneration;this.saving.set(true);this.api.validateMapping(mapping.id,mapping.versionId,`"${mapping.lockVersion}"`).pipe(finalize(()=>this.saving.set(false))).subscribe({next:({body})=>{this.facade.markValidation(body);this.facade.announcement.set(body.validationResult?.valid?'Mapping ist gültig.':'Mapping enthält Prüfhinsweise oder Fehler.');},error:(error:Error)=>this.error.set(error.message)});}
  submitMapping(id:string):void{const mapping=this.facade.mappings().find((item)=>item.id===id);if(!mapping||!['draft','broken'].includes(mapping.status)||mapping.id.startsWith('draft-mapping-')||this.facade.dirtyIds().has(id))return;++this.refreshGeneration;this.saving.set(true);this.error.set(null);this.api.submitMapping(mapping.id,mapping.versionId,`"${mapping.lockVersion}"`).pipe(finalize(()=>this.saving.set(false))).subscribe({next:({body})=>{this.facade.markValidation(body);this.facade.announcement.set('Das Mapping wurde als unveränderliche Nachfolgeversion zur Prüfung eingereicht.');},error:(error:Error)=>this.error.set(error.message)});}
  supersedeMapping(id:string):void{const mapping=this.facade.mappings().find((item)=>item.id===id);if(!mapping||!['validated','broken'].includes(mapping.status)||mapping.id.startsWith('draft-mapping-')||this.facade.dirtyIds().has(id))return;++this.refreshGeneration;this.saving.set(true);this.error.set(null);this.api.supersedeMapping(mapping.id,mapping.versionId,`"${mapping.lockVersion}"`).pipe(finalize(()=>this.saving.set(false))).subscribe({next:({body})=>{this.facade.markValidation(body);this.facade.announcement.set('Das Mapping wurde durch eine unveränderliche Nachfolgeversion abgelöst.');},error:(error:Error)=>this.error.set(error.message)});}
}
