import { computed, Injectable, signal } from '@angular/core';
import {
  AssetMapping,
  AssetMappingWrite,
  DriftReport,
  LogicalField,
  LogicalModel,
  MappingStatus,
  PhysicalColumn,
  PhysicalSnapshot,
} from './data-models.models';

export type MappingView = 'graph' | 'table' | 'drift';

export interface MappingEditorState {
  mappingId: string | null;
  logicalFieldVersionIds: string[];
  physicalColumnIds: string[];
}

export interface PhysicalColumnContext extends PhysicalColumn {
  tableId: string;
  tableName: string;
  schemaName: string;
  qualifiedName: string;
}

@Injectable()
export class MappingDraftFacade {
  private localSequence = 0;
  private returnFocus: HTMLElement | null = null;
  private readonly modelState = signal<LogicalModel | null>(null);
  private readonly snapshotState = signal<PhysicalSnapshot | null>(null);
  private readonly mappingsState = signal<readonly AssetMapping[]>([]);
  private readonly driftState = signal<DriftReport | null>(null);
  private readonly dirtyIdsState = signal<ReadonlySet<string>>(new Set());

  readonly model = this.modelState.asReadonly();
  readonly snapshot = this.snapshotState.asReadonly();
  readonly mappings = this.mappingsState.asReadonly();
  readonly activeMappings = computed(() => this.mappings().filter((mapping) => mapping.status !== 'superseded'));
  readonly drift = this.driftState.asReadonly();
  readonly dirtyIds = this.dirtyIdsState.asReadonly();
  readonly view = signal<MappingView>('graph');
  readonly selectedLogicalFieldId = signal<string | null>(null);
  readonly selectedMappingId = signal<string | null>(null);
  readonly pendingLogicalFieldId = signal<string | null>(null);
  readonly editor = signal<MappingEditorState | null>(null);
  readonly announcement = signal('');

  readonly logicalFields = computed<readonly LogicalField[]>(() => this.model()?.fields ?? []);
  readonly physicalColumns = computed<readonly PhysicalColumnContext[]>(() =>
    (this.snapshot()?.tables ?? []).flatMap((table) => table.columns.map((column) => ({
      ...column,
      tableId: table.id,
      tableName: table.name,
      schemaName: table.schemaName,
      qualifiedName: table.kind === 'parquet' && table.storageLocation
        ? `${table.storageLocation}#${column.name}`
        : `${table.schemaName}.${table.name}.${column.name}`,
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
  readonly hasDirtyMappings = computed(() => this.dirtyIds().size > 0);

  initialize(model: LogicalModel, snapshot: PhysicalSnapshot, mappings: readonly AssetMapping[], drift: DriftReport | null): void {
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
    this.announcement.set('Zuordnung abgebrochen.');
    this.restoreFocus();
  }

  completeConnection(columnId: string, trigger?: EventTarget | null): void {
    const logicalFieldId = this.pendingLogicalFieldId() ?? this.selectedLogicalFieldId();
    if (!logicalFieldId) return;
    if (trigger instanceof HTMLElement && !this.returnFocus) this.returnFocus = trigger;
    this.editor.set({ mappingId: null, logicalFieldVersionIds: [logicalFieldId], physicalColumnIds: [columnId] });
    this.pendingLogicalFieldId.set(null);
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
    const currentColumnIds = new Set(this.physicalColumns().map((column) => column.id));
    this.editor.set({
      mappingId,
      logicalFieldVersionIds: mapping.logicalFieldVersionIds.filter((id) => currentFieldIds.has(id)),
      physicalColumnIds: mapping.physicalColumnIds.filter((id) => currentColumnIds.has(id)),
    });
    this.announcement.set(`Gebrochene Zuordnung ausgewählt. Wählen Sie gültige Spalten aus Snapshot ${this.snapshot()?.revision ?? 'aktuell'} und speichern Sie eine neue Entwurfsversion.`);
  }

  closeEditor(restoreFocus = true): void {
    this.editor.set(null);
    if (restoreFocus) this.restoreFocus();
  }

  upsertDraft(value: AssetMappingWrite): AssetMapping {
    const editingId = this.editor()?.mappingId;
    const previous = editingId ? this.mappings().find((item) => item.id === editingId) : undefined;
    const now = new Date().toISOString();
    const id = previous?.id ?? `draft-mapping-${++this.localSequence}`;
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
      validationResult: null,
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
    this.announcement.set(`${fieldNames} wurde ${targets} zugeordnet. Die Zuordnung ist noch als Entwurf zu speichern.`);
    this.closeEditor();
    return next;
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
    this.announcement.set('Lokaler Zuordnungsentwurf entfernt.');
  }

  removeLocalColumn(mappingId: string, columnId: string): void {
    const mapping = this.mappings().find((item) => item.id === mappingId);
    if (!mapping?.id.startsWith('draft-mapping-') || !mapping.physicalColumnIds.includes(columnId)) return;
    const remaining = mapping.physicalColumnIds.filter((id) => id !== columnId);
    if (!remaining.length) { this.discardLocalMapping(mappingId); return; }
    this.mappingsState.update((items) => items.map((item) => item.id === mappingId ? { ...item, physicalColumnIds: remaining } : item));
    this.announcement.set('Verbindung aus lokalem Zuordnungsentwurf entfernt.');
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
