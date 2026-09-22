import { AssetMapping, DriftReport } from './data-models.models';
import { FALLBACK_MAPPINGS, FALLBACK_PHYSICAL_SNAPSHOT } from './mapping-fallback';
import { mappingsForSnapshotWorkspace } from './mapping-workspace.component';

vi.mock('@bit-daca/design-system',async()=>{
  const {Component}=await import('@angular/core');
  class StatusBadgeStub{}
  Component({selector:'daca-status-badge',standalone:true,template:'<ng-content />',inputs:['tone']})(StatusBadgeStub);
  return{StatusBadgeComponent:StatusBadgeStub};
});

describe('mapping workspace snapshot contract', () => {
  it('keeps a drift-broken predecessor visible beside mappings already targeting the current snapshot', () => {
    const current = FALLBACK_MAPPINGS[0];
    const broken: AssetMapping = {
      ...FALLBACK_MAPPINGS[3], id: 'broken-from-previous', versionId: 'broken-v2', status: 'broken',
      physicalSnapshotId: FALLBACK_PHYSICAL_SNAPSHOT.previousSnapshotId!, physicalColumnIds: ['removed-column'],
    };
    const unrelated: AssetMapping = {
      ...FALLBACK_MAPPINGS[1], id: 'validated-elsewhere', versionId: 'elsewhere-v1', status: 'validated',
      physicalSnapshotId: 'unrelated-snapshot',
    };
    const drift: DriftReport = {
      id: 'drift-2', sourceId: FALLBACK_PHYSICAL_SNAPSHOT.sourceId,
      previousSnapshotId: FALLBACK_PHYSICAL_SNAPSHOT.previousSnapshotId!, currentSnapshotId: FALLBACK_PHYSICAL_SNAPSHOT.id,
      createdAt: FALLBACK_PHYSICAL_SNAPSHOT.importedAt,
      changes: [{ id: 'change-1', kind: 'column_removed', severity: 'breaking', tableName: 'public.org_unit', columnName: 'old_name', previousValue: 'varchar', currentValue: null, confidence: null, impactedMappingIds: [broken.id], impactedLogicalFieldIds: broken.logicalFieldVersionIds, resolved: false }],
    };

    expect(mappingsForSnapshotWorkspace([current, broken, unrelated], FALLBACK_PHYSICAL_SNAPSHOT, drift).map((mapping) => mapping.id)).toEqual([
      current.id, broken.id,
    ]);
    expect(mappingsForSnapshotWorkspace(
      [current, broken, unrelated], FALLBACK_PHYSICAL_SNAPSHOT, drift, FALLBACK_PHYSICAL_SNAPSHOT.tables[0].id,
    ).map((mapping) => mapping.id)).toEqual([current.id, broken.id]);
  });
});
