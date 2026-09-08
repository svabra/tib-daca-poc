import { TestBed } from '@angular/core/testing';
import { DriftReport } from './data-models.models';
import { FALLBACK_LOGICAL_MODEL, FALLBACK_MAPPINGS, FALLBACK_PHYSICAL_SNAPSHOT } from './mapping-fallback';
import { MappingDraftFacade } from './mapping-draft.facade';
import { MappingDriftComponent } from './mapping-drift.component';

vi.mock('@bit-daca/design-system', async () => {
  const { Component } = await import('@angular/core');
  class StatusBadgeStub {}
  Component({ selector: 'daca-status-badge', standalone: true, template: '<ng-content />', inputs: ['tone'] })(StatusBadgeStub);
  return { StatusBadgeComponent: StatusBadgeStub };
});

describe('MappingDriftComponent repair action', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('opens the impacted broken mapping against the current snapshot only while drift is unresolved', () => {
    TestBed.configureTestingModule({ imports: [MappingDriftComponent], providers: [MappingDraftFacade] });
    const facade = TestBed.inject(MappingDraftFacade);
    const broken = { ...FALLBACK_MAPPINGS[3], physicalSnapshotId: FALLBACK_PHYSICAL_SNAPSHOT.previousSnapshotId!, physicalColumnIds: ['removed-column'] };
    const drift: DriftReport = {
      id: 'drift', sourceId: FALLBACK_PHYSICAL_SNAPSHOT.sourceId, previousSnapshotId: FALLBACK_PHYSICAL_SNAPSHOT.previousSnapshotId!,
      currentSnapshotId: FALLBACK_PHYSICAL_SNAPSHOT.id, createdAt: FALLBACK_PHYSICAL_SNAPSHOT.importedAt,
      changes: [{ id: 'change', kind: 'column_removed', severity: 'breaking', tableName: 'public.org_unit', columnName: 'old_column', previousValue: 'varchar', currentValue: null, confidence: null, impactedMappingIds: [broken.id], impactedLogicalFieldIds: broken.logicalFieldVersionIds, resolved: false }],
    };
    facade.initialize(FALLBACK_LOGICAL_MODEL, FALLBACK_PHYSICAL_SNAPSHOT, [broken], drift);
    const fixture = TestBed.createComponent(MappingDriftComponent);
    fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;

    const repair = root.querySelector<HTMLButtonElement>('.drift-actions button');
    expect(repair?.textContent).toContain('Zuordnung auflösen');
    repair!.click();
    expect(facade.editor()).toEqual({ mappingId: broken.id, logicalFieldVersionIds: broken.logicalFieldVersionIds, physicalColumnIds: [] });

    facade.initialize(FALLBACK_LOGICAL_MODEL, FALLBACK_PHYSICAL_SNAPSHOT, [broken], { ...drift, changes: [{ ...drift.changes[0], resolved: true }] });
    fixture.detectChanges();
    expect(root.querySelector('.drift-actions button')).toBeNull();
  });
});
