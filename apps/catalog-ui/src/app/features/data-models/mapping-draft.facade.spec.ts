import { FALLBACK_LOGICAL_MODEL, FALLBACK_MAPPINGS, FALLBACK_PHYSICAL_SNAPSHOT } from './mapping-fallback';
import { MappingDraftFacade } from './mapping-draft.facade';
import { LogicalModelWrite } from './data-models.models';

describe('MappingDraftFacade', () => {
  let facade: MappingDraftFacade;
  beforeEach(() => { facade = new MappingDraftFacade(); facade.initialize(FALLBACK_LOGICAL_MODEL, FALLBACK_PHYSICAL_SNAPSHOT, FALLBACK_MAPPINGS, null); });

  it('loads shared positions, stages moves with the draft, and retains them after a failed save',()=>{
    const layout={revision:7,positions:{logical:{x:100,y:80}}};
    facade.initialize(FALLBACK_LOGICAL_MODEL,FALLBACK_PHYSICAL_SNAPSHOT,FALLBACK_MAPPINGS,null,undefined,layout);
    expect(facade.canvasNodePositions().get('logical')).toEqual({x:100,y:80});
    expect(facade.hasWorkspaceChanges()).toBe(false);
    facade.moveCanvasNode('logical',{x:180,y:120});
    expect(facade.hasWorkspaceChanges()).toBe(true);expect(facade.hasDirtyMappings()).toBe(false);
    expect(facade.canvasLayoutDraft()).toEqual({revision:7,positions:{logical:{x:180,y:120}}});
    // No response means no baseline change; a conflict keeps the local draft.
    expect(facade.canvasLayoutDraft()?.revision).toBe(7);
    facade.moveCanvasNode('logical',{x:100,y:80});expect(facade.hasWorkspaceChanges()).toBe(false);
    facade.moveCanvasNode('logical',{x:180,y:120});
    facade.restoreCanvasLayout({revision:8,positions:{logical:{x:180,y:120}}});
    expect(facade.hasWorkspaceChanges()).toBe(false);
    facade.clear();expect(facade.canvasNodePositions().size).toBe(0);expect(facade.canvasLayoutDraft()).toBeNull();
  });

  it('stages persisted removals locally, keeps them hidden on refresh, and discards them on reload',()=>{
    const mapping=FALLBACK_MAPPINGS[0];facade.selectMapping(mapping.id);
    facade.stageMappingRemoval(mapping.id);facade.stageMappingRemoval(mapping.id);
    expect(facade.activeMappings().some((item)=>item.id===mapping.id)).toBe(false);
    expect(facade.pendingRemovals()).toEqual([mapping]);expect(facade.selectedMapping()).toBeNull();
    expect(facade.hasDirtyMappings()).toBe(true);expect(mapping.status).toBe('validated');
    facade.refreshPersistedMappings(FALLBACK_MAPPINGS);
    expect(facade.mappings().some((item)=>item.id===mapping.id)).toBe(false);
    const rebased={...mapping,versionId:'new-version',lockVersion:2};
    facade.rebaseAfterModelSave(FALLBACK_LOGICAL_MODEL,[rebased,...FALLBACK_MAPPINGS.slice(1)]);
    expect(facade.pendingRemovals()[0].versionId).toBe('new-version');
    expect(facade.mappings().some((item)=>item.id===mapping.id)).toBe(false);
    facade.initialize(FALLBACK_LOGICAL_MODEL,FALLBACK_PHYSICAL_SNAPSHOT,FALLBACK_MAPPINGS,null);
    expect(facade.pendingRemovals()).toEqual([]);expect(facade.activeMappings()).toContain(mapping);
    facade.stageMappingRemoval(mapping.id);facade.markRemovalsSaved([mapping.id]);expect(facade.hasDirtyMappings()).toBe(false);
  });

  it('removes a new local relationship without scheduling a server deletion',()=>{
    facade.createDirectConnection('field-valid','column-valid','cinthya.thor');
    const id=facade.selectedMappingId()!;facade.stageMappingRemoval(id);
    expect(facade.pendingRemovals()).toEqual([]);expect(facade.dirtyIds().size).toBe(0);
    expect(facade.hasDirtyMappings()).toBe(false);
  });

  it('previews names by stable field root without changing saved identity, mappings or revisions',()=>{
    const original=facade.model()!,field=original.fields[0];
    const write={fields:[{id:field.rootId,name:'NeueGrösse'}]} as LogicalModelWrite;
    facade.previewLogicalDraft(original.id,original.versionId,write);
    expect(facade.logicalFields()[0].name).toBe('NeueGrösse');
    expect(facade.logicalFields()[0].id).toBe(field.id);
    expect(facade.model()).toBe(original);expect(facade.mappings()).toBe(FALLBACK_MAPPINGS);
    expect(facade.hasDirtyMappings()).toBe(false);expect(facade.hasWorkspaceChanges()).toBe(true);
    facade.previewLogicalDraft('other-model',original.versionId,{fields:[]} as unknown as LogicalModelWrite);
    expect(facade.logicalDraft()).toBe(write);
    facade.rebaseAfterModelSave(original,FALLBACK_MAPPINGS);
    expect(facade.logicalDraft()).toBeNull();expect(facade.logicalFields()[0].name).toBe(field.name);
    facade.previewLogicalDraft(original.id,original.versionId,write);facade.clear();expect(facade.logicalDraft()).toBeNull();
  });

  it('creates a direct drag connection as an unsaved draft with the selected column snapshot', () => {
    expect(facade.createDirectConnection('field-valid', 'column-valid', 'cinthya.thor')).toBe(true);
    const mapping = facade.selectedMapping()!;
    expect(mapping.logicalFieldVersionIds).toEqual(['field-valid']);
    expect(mapping.physicalColumnIds).toEqual(['column-valid']);
    expect(mapping.physicalSnapshotId).toBe(FALLBACK_PHYSICAL_SNAPSHOT.id);
    expect(mapping.responsibleUserId).toBe('cinthya.thor');
    expect(mapping.classification).toBe('internal');
    expect(mapping.status).toBe('draft');
    expect(facade.dirtyIds().has(mapping.id)).toBe(true);
    expect(facade.editor()).toBeNull();
    expect(facade.createDirectConnection('field-valid', 'column-valid', 'cinthya.thor')).toBe(false);
    expect(facade.dirtyIds().size).toBe(1);
  });

  it('rejects incompatible, hidden, preview and unknown drag targets without creating mappings', () => {
    const original = facade.mappings();
    expect(facade.createDirectConnection('field-valid', 'column-type', 'cinthya.thor')).toBe(false);
    expect(facade.announcement()).toContain('Datentypen');
    expect(facade.createDirectConnection('foreign-field', 'column-valid', 'cinthya.thor')).toBe(false);
    expect(facade.createDirectConnection('field-valid', 'foreign-column', 'cinthya.thor')).toBe(false);
    expect(facade.createDirectConnection('field-valid', 'column-valid', '')).toBe(false);
    facade.hideRepresentation('table-org-unit');
    expect(facade.createDirectConnection('field-valid', 'column-valid', 'cinthya.thor')).toBe(false);
    facade.showRepresentation('table-org-unit');
    facade.representations.update((items) => items.map((item) => ({...item, preview: true})));
    expect(facade.createDirectConnection('field-valid', 'column-valid', 'cinthya.thor')).toBe(false);
    expect(facade.mappings()).toBe(original);
    expect(facade.hasDirtyMappings()).toBe(false);
  });

  it('keeps graph and matrix interactions in one shared draft state', () => {
    facade.beginConnection('field-valid');
    facade.completeConnection('column-valid');
    expect(facade.editor()).toEqual({ mappingId: null, logicalFieldVersionIds: ['field-valid'], physicalColumnIds: ['column-valid'] });

    const draft = facade.upsertDraft({
      logicalModelVersionId: FALLBACK_LOGICAL_MODEL.versionId,
      logicalFieldVersionIds: ['field-valid'],
      physicalSnapshotId: FALLBACK_PHYSICAL_SNAPSHOT.id,
      physicalColumnIds: ['column-valid'],
      mappingType: 'Direct', classification: 'internal', transformationRule: null, comment: null,
      responsibleUserId: 'cinthya.thor', validFrom: '2026-09-07', validTo: null,
    });

    expect(facade.mappings()).toContain(draft);
    expect(facade.mappingStatusForField('field-valid')).toBe('draft');
    expect(facade.dirtyIds().has(draft.id)).toBe(true);
  });

  it('rewires both ends within the original models and preserves unrelated mappings and snapshot identity',()=>{
    const before=facade.mappings().find((item)=>item.id==='mapping-name')!;
    expect(facade.rewireEndpoint(before.id,'field-name','column-org-name','physical','column-valid')).toBe(true);
    expect(facade.rewireEndpoint(before.id,'field-name','column-valid','logical','field-parent')).toBe(true);
    const changed=facade.mappings().find((item)=>item.id===before.id)!;
    expect(changed.physicalColumnIds).toEqual(['column-valid','column-employee-org-name']);
    expect(changed.logicalFieldVersionIds).toEqual(['field-parent']);
    expect(changed.physicalSnapshotId).toBe(before.physicalSnapshotId);
    expect(changed.versionId).toBe(before.versionId);
    expect(changed.status).toBe('draft');
    expect(facade.dirtyIds().has(before.id)).toBe(true);
    expect(facade.mappings().find((item)=>item.id==='mapping-org-id')).toBe(FALLBACK_MAPPINGS[0]);
  });

  it('rejects foreign objects, duplicate field pairs and removed fields without altering the draft',()=>{
    const column={...FALLBACK_PHYSICAL_SNAPSHOT.tables[0].columns[0],id:'other-object-column'};
    facade.addRepresentation({...FALLBACK_PHYSICAL_SNAPSHOT,id:'other-snapshot'},{...FALLBACK_PHYSICAL_SNAPSHOT.tables[0],id:'other-object',columns:[column]});
    const before=facade.mappings();
    expect(facade.rewireEndpoint('mapping-name','field-name','column-org-name','physical',column.id)).toBe(false);
    expect(facade.rewireEndpoint('mapping-name','field-name','column-org-name','logical','removed-field')).toBe(false);
    expect(facade.rewireEndpoint('mapping-org-id','field-org-id','column-org-id','physical','column-employee-org-id')).toBe(false);
    expect(facade.mappings()).toBe(before);
    expect(facade.dirtyIds().size).toBe(0);
    facade.reviseMapping('mapping-name',{physicalColumnIds:['column-org-id']});
    const draft=facade.mappings();
    expect(facade.rewireEndpoint('mapping-name','field-name','column-org-id','logical','field-org-id')).toBe(false);
    expect(facade.mappings()).toBe(draft);
    expect(facade.announcement()).toContain('bereits vorhanden');
  });

  it('changes a validated relationship into an unvalidated local successor and requires an explicit transformation rule',()=>{
    const source=facade.mappings()[0];
    const draft=facade.reviseMapping(source.id,{mappingType:'Derived'})!;
    expect(source.status).toBe('validated');
    expect(draft.status).toBe('draft');
    expect(draft.mappingType).toBe('Derived');
    expect(draft.lastValidatedAt).toBeNull();
    expect(draft.validationResult?.valid).toBe(false);
    expect(draft.validationResult?.issues.some((item)=>item.code==='missing_transformation_rule')).toBe(true);
    expect(facade.reviseMapping(source.id,{transformationRule:'concat(a, b)'})?.validationResult?.issues.some((item)=>item.code==='missing_transformation_rule')).toBe(false);
    expect(facade.editor()).toBeNull();
  });

  it('supports multiple logical sources and multiple physical targets explicitly', () => {
    facade.openCreate(null, 'field-name');
    const draft = facade.upsertDraft({
      logicalModelVersionId: FALLBACK_LOGICAL_MODEL.versionId,
      logicalFieldVersionIds: ['field-name', 'field-type'],
      physicalSnapshotId: FALLBACK_PHYSICAL_SNAPSHOT.id,
      physicalColumnIds: ['column-org-name', 'column-type'],
      mappingType: 'Derived', classification: 'internal', transformationRule: 'concat(name, unit_type)', comment: 'Abgeleitet',
      responsibleUserId: 'cinthya.thor', validFrom: '2026-09-07', validTo: null,
    });
    expect(draft.logicalFieldVersionIds).toHaveLength(2);
    expect(draft.physicalColumnIds).toHaveLength(2);
    expect(facade.toWrite(draft).transformationRule).toBe('concat(name, unit_type)');
  });

  it('announces and cancels a keyboard/click connection without creating a mapping', () => {
    const count = facade.mappings().length;
    facade.beginConnection('field-valid');
    expect(facade.announcement()).toContain('Wählen Sie jetzt');
    facade.cancelConnection();
    expect(facade.pendingLogicalFieldId()).toBeNull();
    expect(facade.mappings()).toHaveLength(count);
  });

  it('turns an edited broken mapping back into a draft successor', () => {
    const source = facade.mappings().find((mapping) => mapping.status === 'broken')!;
    const broken = { ...source, physicalSnapshotId: 'fallback-hr-snapshot-1', physicalColumnIds: ['removed-column'] };
    facade.initialize(FALLBACK_LOGICAL_MODEL, FALLBACK_PHYSICAL_SNAPSHOT, [broken], null);
    facade.openBrokenResolution(broken.id);
    expect(facade.editor()).toEqual({ mappingId: broken.id, logicalFieldVersionIds: ['field-type'], physicalColumnIds: [], physicalSnapshotId: FALLBACK_PHYSICAL_SNAPSHOT.id });
    const successorDraft = facade.upsertDraft({
      ...facade.toWrite(broken),
      physicalSnapshotId: FALLBACK_PHYSICAL_SNAPSHOT.id,
      physicalColumnIds: ['column-type'],
      transformationRule: null,
      validTo: '2026-01-01',
    });

    expect(successorDraft.status).toBe('draft');
    expect(successorDraft.id).toBe(broken.id);
    expect(successorDraft.versionId).toBe(broken.versionId);
    expect(successorDraft.physicalSnapshotId).toBe(FALLBACK_PHYSICAL_SNAPSHOT.id);
    expect(successorDraft.physicalColumnIds).toEqual(['column-type']);
    expect(successorDraft.transformationRule).toBeNull();
    expect(successorDraft.validTo).toBe('2026-01-01');
    expect(facade.dirtyIds().has(broken.id)).toBe(true);
  });

  it('does not treat a superseded lineage as an active or valid field mapping', () => {
    const superseded = { ...FALLBACK_MAPPINGS[0], status: 'superseded' as const };
    facade.initialize(FALLBACK_LOGICAL_MODEL, FALLBACK_PHYSICAL_SNAPSHOT, [superseded], null);

    expect(facade.activeMappings()).toEqual([]);
    expect(facade.mappedFieldIds().has('field-org-id')).toBe(false);
    expect(facade.mappingStatusForField('field-org-id')).toBe('unmapped');
  });
  it('preserves local representations and links when field characteristics create a model revision',()=>{
    facade.initialize(FALLBACK_LOGICAL_MODEL,null,[],null);
    const table=FALLBACK_PHYSICAL_SNAPSHOT.tables[0];facade.addRepresentation(FALLBACK_PHYSICAL_SNAPSHOT,table);
    const field=FALLBACK_LOGICAL_MODEL.fields[0];
    const local=facade.upsertDraft({logicalModelVersionId:FALLBACK_LOGICAL_MODEL.versionId,logicalFieldVersionIds:[field.id],physicalSnapshotId:FALLBACK_PHYSICAL_SNAPSHOT.id,physicalColumnIds:[table.columns[0].id],mappingType:'Direct',classification:field.classification,transformationRule:null,comment:null,responsibleUserId:'cinthya.thor',validFrom:'2026-10-21',validTo:null});
    const successor={...FALLBACK_LOGICAL_MODEL,versionId:'next-version',revision:2,fields:FALLBACK_LOGICAL_MODEL.fields.map((item)=>({...item,id:`next-${item.id}`,versionId:`next-${item.id}`}))};
    facade.rebaseAfterModelSave(successor,[]);
    expect(facade.pendingRepresentations()).toHaveLength(1);
    expect(facade.mappings()[0].logicalModelVersionId).toBe('next-version');
    expect(facade.mappings()[0].logicalFieldVersionIds).toEqual([`next-${field.id}`]);
    expect(facade.dirtyIds().has(local.id)).toBe(true);
  });

});
