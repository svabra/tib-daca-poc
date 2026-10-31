import { physicalObjectName } from './physical-representation-labels';
import { compatibleType } from './mapping-types';
import { computed, Injectable, signal } from '@angular/core';
import {
  AssetMapping,
  AssetMappingWrite,
  DriftReport,
  LogicalField,
  LogicalModel,
  LogicalModelWrite,
  MappingStatus,
  MappingCanvasLayout,
  PhysicalColumn,
  PhysicalDomainState,
  PhysicalSnapshot,
  PhysicalTable,
} from './data-models.models';

export type MappingView = 'graph' | 'table' | 'drift';

export interface MappingEditorState {
  mappingId: string | null;
  physicalSnapshotId?: string;
  logicalFieldVersionIds: string[];
  physicalColumnIds: string[];
}

import { CanvasNodePosition } from './data-models.models';
export type { CanvasNodePosition } from './data-models.models';

export interface PhysicalRepresentation {
  snapshot: PhysicalSnapshot;
  table: PhysicalTable;
  persisted: boolean;
  preview?: boolean;
}

export interface PhysicalColumnContext extends PhysicalColumn {
  snapshotId: string;
  tableId: string;
  tableName: string;
  schemaName: string;
  qualifiedName: string;
}

@Injectable()
export class MappingDraftFacade {
  private returnFocus: HTMLElement | null = null;
  private readonly modelState = signal<LogicalModel | null>(null);
  private readonly snapshotState = signal<PhysicalSnapshot | null>(null);
  private readonly mappingsState = signal<readonly AssetMapping[]>([]);
  private readonly driftState = signal<DriftReport | null>(null);
  private readonly dirtyIdsState = signal<ReadonlySet<string>>(new Set());

  readonly representations = signal<readonly PhysicalRepresentation[]>([]);
  readonly canvasNodePositions = signal<ReadonlyMap<string, CanvasNodePosition>>(new Map());
  private readonly savedCanvasLayout = signal<MappingCanvasLayout>({revision:0,positions:{}});
  readonly canvasLayoutState=this.savedCanvasLayout.asReadonly();
  readonly canvasDirty = computed(()=>{
    const saved=this.savedCanvasLayout().positions,positions=this.canvasNodePositions();
    return positions.size!==Object.keys(saved).length||[...positions].some(([key,point])=>saved[key]?.x!==point.x||saved[key]?.y!==point.y);
  });
  readonly hiddenRepresentationIds = signal<ReadonlySet<string>>(new Set());
  readonly visibleRepresentations = computed(() => this.representations().filter((item) => !this.hiddenRepresentationIds().has(item.table.id)));
  readonly pendingRepresentations = computed(() => this.representations().filter((item) => !item.persisted && !item.preview));
  readonly model = this.modelState.asReadonly();
  readonly snapshot = this.snapshotState.asReadonly();
  readonly mappings = this.mappingsState.asReadonly();
  readonly activeMappings = computed(() => this.mappings().filter((mapping) => mapping.status !== 'superseded'));
  readonly drift = this.driftState.asReadonly();
  readonly dirtyIds = this.dirtyIdsState.asReadonly();
  readonly pendingRemovals = signal<readonly AssetMapping[]>([]);
  readonly view = signal<MappingView>('graph');
  readonly selectedLogicalFieldId = signal<string | null>(null);
  readonly selectedMappingId = signal<string | null>(null);
  readonly pendingLogicalFieldId = signal<string | null>(null);
  readonly editor = signal<MappingEditorState | null>(null);
  readonly announcement = signal('');

  readonly logicalDraft = signal<LogicalModelWrite|null>(null);
  readonly logicalFields = computed<readonly LogicalField[]>(() => {
    const names=new Map(this.logicalDraft()?.fields.map((field)=>[field.id,field.name])??[]);
    return (this.model()?.fields??[]).map((field)=>names.has(field.rootId)?{...field,name:names.get(field.rootId)!}:field);
  });
  readonly hasWorkspaceChanges = computed(()=>this.hasDirtyMappings()||this.logicalDraft()!==null||this.canvasDirty());
  previewLogicalDraft(modelId:string,versionId:string,value:LogicalModelWrite):void {
    if(this.model()?.id===modelId&&this.model()?.versionId===versionId)this.logicalDraft.set(value);
  }
  readonly physicalColumns = computed<readonly PhysicalColumnContext[]>(() =>
    this.representations().flatMap(({ snapshot, table }) => table.columns.map((column) => ({
      snapshotId: snapshot.id,
      ...column,
      tableId: table.id,
      tableName: table.name,
      schemaName: table.schemaName,
      qualifiedName: `${snapshot.sourceName} · #${snapshot.revision} · ` + (table.kind === 'parquet' && table.storageLocation
        ? `${table.storageLocation}#${column.name}`
        : `${physicalObjectName(snapshot,table)}.${column.name}`),
    }))),
  );
  readonly selectedField = computed(() => this.logicalFields().find((field) => field.id === this.selectedLogicalFieldId()) ?? null);
  readonly selectedMapping = computed(() => this.mappings().find((mapping) => mapping.id === this.selectedMappingId()) ?? null);
  readonly selectedFieldMappings = computed(() => {
    const fieldId = this.selectedLogicalFieldId();
    return fieldId ? this.activeMappings().filter((mapping) => mapping.logicalFieldVersionIds.includes(fieldId)) : [];
  });
  readonly statusCounts = computed(() => {
    const result: Record<'validated' | 'review_pending' | 'broken' | 'draft', number> = { validated: 0, review_pending: 0, broken: 0, draft: 0 };
    for (const mapping of this.mappings()) {
      if (mapping.status === 'superseded') continue;
      result[mapping.status] += 1;
    }
    return result;
  });
  readonly mappedFieldIds = computed(() => new Set(this.activeMappings().flatMap((mapping) => mapping.logicalFieldVersionIds)));
  readonly hasDirtyMappings = computed(() => this.dirtyIds().size > 0 || this.pendingRepresentations().length > 0 || this.pendingRemovals().length > 0);

  clear(): void {
    this.pendingRemovals.set([]);
    this.logicalDraft.set(null);
    this.modelState.set(null);this.snapshotState.set(null);this.representations.set([]);
    this.restoreCanvasLayout({revision:0,positions:{}});this.hiddenRepresentationIds.set(new Set());
    this.mappingsState.set([]);this.dirtyIdsState.set(new Set());this.driftState.set(null);
    this.selectedMappingId.set(null);this.selectedLogicalFieldId.set(null);this.pendingLogicalFieldId.set(null);this.editor.set(null);
  }

  openPhysicalSelection(snapshot:PhysicalSnapshot,table:PhysicalTable):void{
    this.clear();
    const scoped={...snapshot,tables:[table]};
    this.snapshotState.set(scoped);
    // This is an existing physical object for inspection, not a saved logical membership.
    this.representations.set([{snapshot:scoped,table,persisted:true}]);
  }

  initialize(model: LogicalModel, snapshot: PhysicalSnapshot | null, mappings: readonly AssetMapping[], drift: DriftReport | null, representations?: readonly PhysicalRepresentation[], canvasLayout:MappingCanvasLayout={revision:0,positions:{}}): void {
    this.restoreCanvasLayout(canvasLayout);
    this.pendingRemovals.set([]);
    this.logicalDraft.set(null);
    this.representations.set(representations ?? (snapshot?.tables ?? []).map((table) => ({ snapshot, table, persisted: true } as PhysicalRepresentation)));
    this.modelState.set(model);
    this.snapshotState.set(snapshot);
    this.mappingsState.set(mappings);
    this.driftState.set(drift);
    this.dirtyIdsState.set(new Set());
    const firstFieldId = model.fields[0]?.id ?? null;
    const firstFieldMapping = firstFieldId ? mappings.find((mapping) => mapping.logicalFieldVersionIds.includes(firstFieldId)) : undefined;
    this.selectedLogicalFieldId.set(firstFieldId ?? firstFieldMapping?.logicalFieldVersionIds[0] ?? null);
    this.selectedMappingId.set(firstFieldMapping?.id ?? null);
    this.pendingLogicalFieldId.set(null);
  }

  updatePhysicalDomains(sourceId:string,tableKey:string,state:PhysicalDomainState):void{
    const update=(snapshot:PhysicalSnapshot)=>snapshot.sourceId===sourceId?{...snapshot,tables:snapshot.tables.map((table)=>table.stableKey===tableKey?{...table,...state}:table)}:snapshot;
    this.representations.update((items)=>items.map((item)=>({...item,snapshot:update(item.snapshot),table:item.snapshot.sourceId===sourceId&&item.table.stableKey===tableKey?{...item.table,...state}:item.table})));
    this.snapshotState.update((snapshot)=>snapshot?update(snapshot):null);
  }

  refreshSelection(model:LogicalModel,snapshot:PhysicalSnapshot|null,mappings:readonly AssetMapping[],representations:readonly PhysicalRepresentation[],canvasLayout:MappingCanvasLayout):void{
    if(this.hasWorkspaceChanges()||this.editor()||this.pendingLogicalFieldId())return;
    const selectedRoot=this.selectedField()?.rootId,selectedMappingId=this.selectedMappingId();
    this.modelState.set(model);this.snapshotState.set(snapshot);this.mappingsState.set(mappings);
    this.representations.set(representations);this.restoreCanvasLayout(canvasLayout);
    const tables=new Set(representations.map((item)=>item.table.id));
    this.hiddenRepresentationIds.update((ids)=>new Set([...ids].filter((id)=>tables.has(id))));
    this.selectedLogicalFieldId.set(model.fields.find((field)=>field.rootId===selectedRoot)?.id??model.fields[0]?.id??null);
    this.selectedMappingId.set(mappings.some((mapping)=>mapping.id===selectedMappingId&&mapping.status!=='superseded')?selectedMappingId:null);
    this.driftState.set(null);
  }

  moveCanvasNode(key: string, position: CanvasNodePosition): void {
    this.canvasNodePositions.update((positions) => new Map(positions).set(key, {x: Math.min(100_000,Math.max(15, position.x)), y: Math.min(100_000,Math.max(15, position.y))}));
  }

  restoreCanvasLayout(layout:MappingCanvasLayout):void{
    this.savedCanvasLayout.set(layout);
    this.canvasNodePositions.set(new Map(Object.entries(layout.positions)));
  }
  canvasLayoutDraft():MappingCanvasLayout|null{
    if(!this.canvasDirty())return null;
    const allowed=new Set(['logical',...this.representations().filter((item)=>!item.preview).map((item)=>'physical:'+item.table.id)]);
    return{revision:this.savedCanvasLayout().revision,positions:Object.fromEntries([...this.canvasNodePositions()].filter(([key])=>allowed.has(key)))};
  }

  hideRepresentation(tableId: string): void {
    this.hiddenRepresentationIds.update((ids) => new Set(ids).add(tableId));
    this.announcement.set('Darstellung aus Graph und physischen Bindungen ausgeblendet. Über «Ausgeblendete einblenden» wieder anzeigen. Gespeicherte Bindungen und Mappings bleiben erhalten.');
  }

  showRepresentation(tableId: string): void {
    this.hiddenRepresentationIds.update((ids) => {const next=new Set(ids);next.delete(tableId);return next;});
  }

  addRepresentation(snapshot: PhysicalSnapshot, table: PhysicalTable): boolean {
    this.showRepresentation(table.id);
    const exists = this.representations().some((item) => item.table.id === table.id && !item.preview);
    this.representations.update((items) => items.filter((item) => item.table.id !== table.id || !item.preview));
    if (!exists) this.representations.update((items) => [...items, {snapshot, table, persisted: false}]);
    this.activateSnapshot(snapshot);
    return !exists;
  }

  activateSnapshot(snapshot: PhysicalSnapshot, drift: DriftReport | null = null): void {
    this.snapshotState.set(snapshot);
    this.driftState.set(drift);
  }

  rebaseAfterModelSave(model: LogicalModel, persisted: readonly AssetMapping[]): void {
    const roots=new Map(this.logicalFields().map((field)=>[field.id,field.rootId]));
    const current=new Map(model.fields.map((field)=>[field.rootId,field.id]));
    const selectedRoot=roots.get(this.selectedLogicalFieldId()??'');
    const pendingRoot=roots.get(this.pendingLogicalFieldId()??'');
    const drafts=this.mappings().filter((item)=>this.dirtyIds().has(item.id)).flatMap((item)=>{
      const ids=item.logicalFieldVersionIds.map((id)=>current.get(roots.get(id)??''));
      if(ids.some((id)=>!id))return [];
      const saved=persisted.find((mapping)=>mapping.id===item.id);
      return [{...item,logicalModelVersionId:model.versionId,logicalModelVersion:model.revision,
        logicalFieldVersionIds:ids as string[],versionId:saved?.versionId??item.versionId,lockVersion:saved?.lockVersion??item.lockVersion}];
    });
    this.modelState.set(model);
    this.logicalDraft.set(null);
    this.pendingRemovals.update((items)=>items.flatMap((item)=>{const saved=persisted.find((entry)=>entry.id===item.id);return saved?.status==='superseded'?[]:[saved??item];}));
    const removed=new Set(this.pendingRemovals().map((item)=>item.id));
    const ids=new Set(drafts.map((item)=>item.id));
    this.mappingsState.set([...persisted.filter((item)=>!ids.has(item.id)&&!removed.has(item.id)),...drafts]);
    this.dirtyIdsState.set(ids);
    this.selectedLogicalFieldId.set(current.get(selectedRoot??'')??model.fields[0]?.id??null);
    this.pendingLogicalFieldId.set(current.get(pendingRoot??'')??null);
  }

  refreshPersistedMappings(mappings: readonly AssetMapping[]): void {
    const dirty=this.dirtyIds(),removed=new Set(this.pendingRemovals().map((item)=>item.id));
    this.mappingsState.update((items)=>[...mappings.filter((item)=>!dirty.has(item.id)&&!removed.has(item.id)),...items.filter((item)=>dirty.has(item.id))]);
  }

  markRepresentationsSaved(tableIds?:ReadonlySet<string>): void {
    this.representations.update((items) => items.map((item) => !tableIds||tableIds.has(item.table.id)?({...item, persisted: true, preview: false}):item));
  }

  selectField(fieldId: string): void {
    this.selectedLogicalFieldId.set(fieldId);
    const mapping = this.activeMappings().find((item) => item.logicalFieldVersionIds.includes(fieldId));
    this.selectedMappingId.set(mapping?.id ?? null);
  }

  selectMapping(mappingId: string): void {
    const mapping = this.mappings().find((item) => item.id === mappingId);
    if (!mapping) return;
    this.selectedMappingId.set(mappingId);
    this.selectedLogicalFieldId.set(mapping.logicalFieldVersionIds[0] ?? null);
  }

  beginConnection(fieldId: string, trigger?: EventTarget | null): void {
    this.selectField(fieldId);
    this.pendingLogicalFieldId.set(fieldId);
    if (trigger instanceof HTMLElement) this.returnFocus = trigger;
    const field = this.logicalFields().find((item) => item.id === fieldId);
    this.announcement.set(`${field?.name ?? 'Feld'} ausgewählt. Wählen Sie jetzt eine physische Spalte.`);
  }

  cancelConnection(): void {
    if (!this.pendingLogicalFieldId()) return;
    this.pendingLogicalFieldId.set(null);
    this.announcement.set('Mapping abgebrochen.');
    this.restoreFocus();
  }

  completeConnection(columnId: string, trigger?: EventTarget | null): void {
    const logicalFieldId = this.pendingLogicalFieldId() ?? this.selectedLogicalFieldId();
    if (!logicalFieldId) return;
    if (trigger instanceof HTMLElement && !this.returnFocus) this.returnFocus = trigger;
    this.editor.set({ mappingId: null, logicalFieldVersionIds: [logicalFieldId], physicalColumnIds: [columnId] });
    this.pendingLogicalFieldId.set(null);
  }

  createDirectConnection(fieldId: string, columnId: string, responsibleUserId: string): boolean {
    const model = this.model(), field = this.logicalFields().find((item) => item.id === fieldId);
    const column = this.physicalColumns().find((item) => item.id === columnId);
    if (!model || !field || !column || !responsibleUserId || !this.visibleRepresentations().some((item) => !item.preview && item.table.id === column.tableId)) {
      this.announcement.set('Keine Verbindung erstellt: Wählen Sie ein aktuelles logisches Feld und eine sichtbare physische Spalte.');
      return false;
    }
    if (this.activeMappings().some((item) => item.logicalFieldVersionIds.includes(fieldId) && item.physicalColumnIds.includes(columnId))) {
      this.announcement.set('Keine Verbindung erstellt: Diese Verbindung ist bereits vorhanden.');
      return false;
    }
    if (compatibleType(field.dataType) !== compatibleType(column.dataType)) {
      this.announcement.set('Keine direkte Verbindung erstellt: Die Datentypen passen nicht zusammen. Verwenden Sie «Mapping hinzufügen», um eine Transformation festzulegen.');
      return false;
    }
    this.pendingLogicalFieldId.set(null);
    this.upsertDraft({logicalModelVersionId: model.versionId, logicalFieldVersionIds: [fieldId],
      physicalSnapshotId: column.snapshotId, physicalColumnIds: [columnId], mappingType: 'Direct',
      classification: field.classification, responsibleUserId, validFrom: new Date().toISOString().slice(0, 10),
      validTo: null, transformationRule: null, comment: null}, null, false);
    return true;
  }

  openCreate(trigger?: EventTarget | null, logicalFieldId?: string): void {
    if (trigger instanceof HTMLElement) this.returnFocus = trigger;
    const fieldId = logicalFieldId ?? this.selectedLogicalFieldId() ?? this.logicalFields()[0]?.id;
    this.editor.set({ mappingId: null, logicalFieldVersionIds: fieldId ? [fieldId] : [], physicalColumnIds: [] });
  }

  openEdit(mappingId: string, trigger?: EventTarget | null): void {
    const mapping = this.mappings().find((item) => item.id === mappingId);
    // Persisted workflow states are immutable. A broken mapping has its own
    // repair path, which deliberately starts a successor draft.
    if (!mapping || mapping.status !== 'draft') return;
    if (trigger instanceof HTMLElement) this.returnFocus = trigger;
    this.selectMapping(mappingId);
    this.editor.set({
      mappingId,
      logicalFieldVersionIds: [...mapping.logicalFieldVersionIds],
      physicalColumnIds: [...mapping.physicalColumnIds],
    });
  }

  openBrokenResolution(mappingId: string, trigger?: EventTarget | null): void {
    const mapping = this.mappings().find((item) => item.id === mappingId);
    if (!mapping || mapping.status !== 'broken') return;
    if (trigger instanceof HTMLElement) this.returnFocus = trigger;
    this.selectMapping(mappingId);
    const currentFieldIds = new Set(this.logicalFields().map((field) => field.id));
    const original=this.representations().find((item)=>item.snapshot.id===mapping.physicalSnapshotId)?.snapshot;
    const candidates=[...this.representations().map((item)=>item.snapshot),...(this.snapshot()?[this.snapshot()!]:[])].filter((item)=>!original||item.sourceId===original.sourceId);
    const latest=candidates.sort((left,right)=>right.revision-left.revision)[0];
    const currentColumnIds = new Set(this.physicalColumns().filter((column)=>column.snapshotId===latest?.id).map((column) => column.id));
    this.editor.set({
      mappingId,
      physicalSnapshotId: latest?.id,
      logicalFieldVersionIds: mapping.logicalFieldVersionIds.filter((id) => currentFieldIds.has(id)),
      physicalColumnIds: mapping.physicalColumnIds.filter((id) => currentColumnIds.has(id)),
    });
    this.announcement.set(`Gebrochenes Mapping ausgewählt. Wählen Sie gültige Felder der physischen Repräsentation/Deklaration (Revision ${latest?.revision ?? 'aktuell'}) und speichern Sie eine neue Entwurfsversion.`);
  }

  closeEditor(restoreFocus = true): void {
    this.editor.set(null);
    if (restoreFocus) this.restoreFocus();
  }

  upsertDraft(value: AssetMappingWrite, editingId = this.editor()?.mappingId, restoreFocus = true): AssetMapping {
    const previous = editingId ? this.mappings().find((item) => item.id === editingId) : undefined;
    const now = new Date().toISOString();
    const id = previous?.id ?? `draft-mapping-${crypto.randomUUID()}`;
    const responsibleName = previous?.responsibleName
      ?? (value.responsibleUserId || 'Nicht zugewiesen');
    const next: AssetMapping = {
      ...value,
      id,
      versionId: previous?.versionId ?? id,
      lockVersion: previous?.lockVersion ?? 0,
      logicalModelId: previous?.logicalModelId ?? this.model()?.id ?? '',
      logicalModelVersion: previous?.logicalModelVersion ?? this.model()?.revision ?? 0,
      // Every edit is an unvalidated immutable successor, including a repair of a broken version.
      status: 'draft',
      version: previous?.version ?? 0,
      predecessorId: previous?.predecessorId ?? null,
      validationResult: {valid: false, issues: [...(['Derived','Lookup','Transformed'].includes(value.mappingType)&&!value.transformationRule?.trim()?[{code:'missing_transformation_rule',severity:'error' as const,message:'Für diesen Mapping-Typ ist eine Transformations- oder Lookup-Regel erforderlich.'}]:[]),...value.logicalFieldVersionIds.flatMap((fieldId) => {
        const field = this.logicalFields().find((item) => item.id === fieldId);
        return value.physicalColumnIds.flatMap((columnId) => {
          const column = this.physicalColumns().find((item) => item.id === columnId);
          return field && column && compatibleType(field.dataType) !== compatibleType(column.dataType)
            ? [{code: 'type_mismatch', severity: (['Direct','Renamed'].includes(value.mappingType)?'error':'warning') as 'error'|'warning', message: `Typkonflikt: ${field.dataType} ↔ ${column.dataType}; Prüfung erforderlich.`, logicalFieldVersionId: fieldId, physicalColumnId: columnId}] : [];
        });
      })]},
      lastValidatedAt: null,
      lastDriftCheckAt: previous?.lastDriftCheckAt ?? null,
      responsibleName,
      createdBy: previous?.createdBy ?? { id: value.responsibleUserId, displayName: responsibleName },
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    this.mappingsState.update((items) => previous
      ? items.map((item) => item.id === id ? next : item)
      : [...items, next]);
    this.dirtyIdsState.update((ids) => new Set(ids).add(id));
    this.selectMapping(id);
    const fieldNames = this.logicalFields().filter((field) => value.logicalFieldVersionIds.includes(field.id)).map((field) => field.name).join(', ');
    const targets = this.physicalColumns().filter((column) => value.physicalColumnIds.includes(column.id)).map((column) => column.qualifiedName).join(', ');
    this.announcement.set(`${fieldNames} wurde ${targets} zugeordnet. Das Mapping ist noch als Entwurf zu speichern.`);
    this.closeEditor(restoreFocus);
    return next;
  }

  reviseMapping(mappingId:string, patch:Partial<Pick<AssetMappingWrite,'mappingType'|'transformationRule'|'logicalFieldVersionIds'|'physicalColumnIds'>>):AssetMapping|null {
    const mapping=this.activeMappings().find((item)=>item.id===mappingId);
    return mapping?this.upsertDraft({...this.toWrite(mapping),...patch},mappingId,false):null;
  }

  rewireEndpoint(mappingId:string,fieldId:string,columnId:string,side:'logical'|'physical',replacementId:string):boolean {
    const mapping=this.activeMappings().find((item)=>item.id===mappingId);
    if(!mapping?.logicalFieldVersionIds.includes(fieldId)||!mapping.physicalColumnIds.includes(columnId))return false;
    const originalId=side==='logical'?fieldId:columnId;
    if(originalId===replacementId)return true;
    const originalColumn=this.physicalColumns().find((item)=>item.id===columnId);
    const replacementColumn=this.physicalColumns().find((item)=>item.id===replacementId);
    if(side==='logical'&&!this.logicalFields().some((item)=>item.id===replacementId)||side==='physical'&&(!originalColumn||!replacementColumn||originalColumn.tableId!==replacementColumn.tableId||mapping.physicalSnapshotId!==replacementColumn.snapshotId)){
      this.announcement.set('Linienende unverändert: Wählen Sie ein Feld im gleichen Modell und in derselben Revision der physischen Repräsentation/Deklaration.');return false;
    }
    const logicalFieldVersionIds=side==='logical'?mapping.logicalFieldVersionIds.map((id)=>id===fieldId?replacementId:id):[...mapping.logicalFieldVersionIds];
    const physicalColumnIds=side==='physical'?mapping.physicalColumnIds.map((id)=>id===columnId?replacementId:id):[...mapping.physicalColumnIds];
    if(new Set(logicalFieldVersionIds).size!==logicalFieldVersionIds.length||new Set(physicalColumnIds).size!==physicalColumnIds.length||this.activeMappings().some((item)=>item.id!==mappingId&&item.physicalSnapshotId===mapping.physicalSnapshotId&&item.logicalFieldVersionIds.some((id)=>logicalFieldVersionIds.includes(id))&&item.physicalColumnIds.some((id)=>physicalColumnIds.includes(id)))){
      this.announcement.set('Linienende unverändert: Diese Verbindung ist bereits vorhanden.');return false;
    }
    this.reviseMapping(mappingId,{logicalFieldVersionIds,physicalColumnIds});
    this.announcement.set('Linienende neu zugeordnet. Die Änderung ist noch als Entwurf zu speichern.');return true;
  }

  forgetRemovedMapping(id:string):void {
    this.mappingsState.update((items)=>items.filter((item)=>item.id!==id));
    this.dirtyIdsState.update((ids)=>{const next=new Set(ids);next.delete(id);return next;});
    if(this.selectedMappingId()===id)this.selectedMappingId.set(null);
  }

  stageMappingRemoval(id:string):void {
    const mapping=this.activeMappings().find((item)=>item.id===id);if(!mapping)return;
    if(!id.startsWith('draft-mapping-'))this.pendingRemovals.update((items)=>[...items,mapping]);
    this.forgetRemovedMapping(id);
    if(this.editor()?.mappingId===id)this.closeEditor(false);
    this.announcement.set('Verbindung im lokalen Entwurf entfernt. Erst «Entwurf speichern» übernimmt die Entfernung dauerhaft.');
  }

  markRemovalsSaved(ids:readonly string[]):void {
    const saved=new Set(ids);this.pendingRemovals.update((items)=>items.filter((item)=>!saved.has(item.id)));
  }

  replaceSaved(localId: string, saved: AssetMapping): void {
    this.mappingsState.update((items) => items.map((item) => item.id === localId ? saved : item));
    this.dirtyIdsState.update((ids) => {
      const next = new Set(ids);
      next.delete(localId);
      return next;
    });
    if (this.selectedMappingId() === localId) this.selectedMappingId.set(saved.id);
  }

  discardLocalMapping(id: string): void {
    if (!id.startsWith('draft-mapping-')) return;
    this.mappingsState.update((items) => items.filter((item) => item.id !== id));
    this.dirtyIdsState.update((ids) => { const next = new Set(ids); next.delete(id); return next; });
    this.selectedMappingId.set(null);
    this.announcement.set('Lokaler Mapping-Entwurf entfernt.');
  }

  removeLocalColumn(mappingId: string, columnId: string): void {
    const mapping = this.mappings().find((item) => item.id === mappingId);
    if (!mapping?.id.startsWith('draft-mapping-') || !mapping.physicalColumnIds.includes(columnId)) return;
    const remaining = mapping.physicalColumnIds.filter((id) => id !== columnId);
    if (!remaining.length) { this.discardLocalMapping(mappingId); return; }
    this.mappingsState.update((items) => items.map((item) => item.id === mappingId ? { ...item, physicalColumnIds: remaining } : item));
    this.announcement.set('Verbindung aus lokalem Mapping-Entwurf entfernt.');
  }

  markValidation(mapping: AssetMapping): void {
    this.mappingsState.update((items) => items.map((item) => item.id === mapping.id ? mapping : item));
    this.selectedMappingId.set(mapping.id);
  }

  toWrite(mapping: AssetMapping): AssetMappingWrite {
    return {
      ...(mapping.id.startsWith('draft-mapping-') ? {} : { id: mapping.id }),
      logicalModelVersionId: mapping.logicalModelVersionId,
      logicalFieldVersionIds: [...mapping.logicalFieldVersionIds],
      physicalSnapshotId: mapping.physicalSnapshotId,
      physicalColumnIds: [...mapping.physicalColumnIds],
      mappingType: mapping.mappingType,
      classification: mapping.classification,
      transformationRule: mapping.transformationRule,
      comment: mapping.comment,
      responsibleUserId: mapping.responsibleUserId,
      validFrom: mapping.validFrom,
      validTo: mapping.validTo,
    };
  }

  mappingStatusForField(fieldId: string): MappingStatus | 'unmapped' {
    const statuses = this.activeMappings().filter((mapping) => mapping.logicalFieldVersionIds.includes(fieldId)).map((mapping) => mapping.status);
    if (!statuses.length) return 'unmapped';
    if (statuses.includes('broken')) return 'broken';
    if (statuses.includes('review_pending')) return 'review_pending';
    if (statuses.includes('draft')) return 'draft';
    return 'validated';
  }

  private restoreFocus(): void {
    const target = this.returnFocus;
    this.returnFocus = null;
    queueMicrotask(() => target?.focus());
  }
}
