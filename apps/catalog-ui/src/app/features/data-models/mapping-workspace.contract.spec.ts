import { AssetMapping, DriftReport } from './data-models.models';
import { FALLBACK_MAPPINGS, FALLBACK_PHYSICAL_SNAPSHOT } from './mapping-fallback';
import { linkedSnapshotDetailIds, mappingsForSnapshotWorkspace, preferredTableForWorkspace } from './mapping-workspace.component';

vi.mock('@bit-daca/design-system',async()=>{
  const {Component}=await import('@angular/core');
  class StatusBadgeStub{}
  Component({selector:'daca-status-badge',standalone:true,template:'<ng-content />',inputs:['tone']})(StatusBadgeStub);
  return{StatusBadgeComponent:StatusBadgeStub};
});

describe('mapping workspace snapshot contract', () => {
  it('loads only the latest mapped detail per source from snapshot summaries', () => {
    const old = { ...FALLBACK_PHYSICAL_SNAPSHOT, id: 'source-a-old', sourceId: 'source-a', revision: 1 };
    const latest = { ...old, id: 'source-a-latest', revision: 2 };
    const other = { ...old, id: 'source-b', sourceId: 'source-b', revision: 1 };
    const mappings = [old, latest, other].map((snapshot) => ({
      ...FALLBACK_MAPPINGS[0],
      id: `mapping-${snapshot.id}`,
      physicalSnapshotId: snapshot.id,
    }));

    expect(linkedSnapshotDetailIds('current', [old, latest, other], mappings)).toEqual(['source-a-latest', 'source-b']);
  });

  it('selects the previously mapped table after drift even when the new snapshot lists another table first', () => {
    const previous = { ...FALLBACK_PHYSICAL_SNAPSHOT, id: 'previous', previousSnapshotId: null };
    const current = {
      ...FALLBACK_PHYSICAL_SNAPSHOT,
      id: 'current',
      previousSnapshotId: previous.id,
      tables: [...previous.tables].reverse().map((table) => ({
        ...table,
        id: `new-${table.id}`,
        columns: table.columns.map((column) => ({ ...column, id: `new-${column.id}` })),
      })),
    };
    const predecessorMapping = {
      ...FALLBACK_MAPPINGS[2],
      physicalSnapshotId: previous.id,
      physicalColumnIds: ['column-parent-id'],
      status: 'broken' as const,
    };

    expect(preferredTableForWorkspace(current, [current, previous], [predecessorMapping], '')?.stableKey)
      .toBe('hr_core.public.org_unit');
  });

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
