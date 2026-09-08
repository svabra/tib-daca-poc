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
    expect(facade.editor()).toEqual({ mappingId: broken.id, logicalFieldVersionIds: ['field-type'], physicalColumnIds: [] });
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
});
