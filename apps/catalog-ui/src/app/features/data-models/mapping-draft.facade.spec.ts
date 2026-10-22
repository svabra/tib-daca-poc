import { FALLBACK_LOGICAL_MODEL, FALLBACK_MAPPINGS, FALLBACK_PHYSICAL_SNAPSHOT } from './mapping-fallback';
import { MappingDraftFacade } from './mapping-draft.facade';

describe('MappingDraftFacade', () => {
  let facade: MappingDraftFacade;
  beforeEach(() => { facade = new MappingDraftFacade(); facade.initialize(FALLBACK_LOGICAL_MODEL, FALLBACK_PHYSICAL_SNAPSHOT, FALLBACK_MAPPINGS, null); });

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
