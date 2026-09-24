import { TestBed } from '@angular/core/testing';
import { AssetMapping, MappingStatus } from './data-models.models';
import { FALLBACK_LOGICAL_MODEL, FALLBACK_MAPPINGS, FALLBACK_PHYSICAL_SNAPSHOT } from './mapping-fallback';
import { MappingDraftFacade } from './mapping-draft.facade';
import { MappingInspectorComponent } from './mapping-inspector.component';

vi.mock('@bit-daca/design-system', async () => {
  const { Component } = await import('@angular/core');
  class StatusBadgeStub {}
  Component({ selector: 'daca-status-badge', standalone: true, template: '<ng-content />', inputs: ['tone'] })(StatusBadgeStub);
  return { StatusBadgeComponent: StatusBadgeStub };
});

describe('MappingInspectorComponent workflow actions', () => {
  let facade: MappingDraftFacade;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MappingInspectorComponent], providers: [MappingDraftFacade] });
    facade = TestBed.inject(MappingDraftFacade);
  });
  afterEach(() => TestBed.resetTestingModule());

  function render(status: MappingStatus, overrides: Partial<AssetMapping> = {}) {
    const mapping: AssetMapping = { ...FALLBACK_MAPPINGS[0], id: `mapping-${status}`, versionId: `version-${status}`, status, ...overrides };
    facade.initialize(FALLBACK_LOGICAL_MODEL, FALLBACK_PHYSICAL_SNAPSHOT, [mapping], null);
    const fixture = TestBed.createComponent(MappingInspectorComponent);
    fixture.detectChanges();
    return { fixture, mapping, root: fixture.nativeElement as HTMLElement };
  }

  it('offers only the lifecycle action that matches each active status', () => {
    const draft = render('draft');
    expect(draft.root.querySelector('.inspector-actions')?.textContent).toContain('Zur Prüfung einreichen');
    draft.fixture.destroy();

    const review = render('review_pending');
    expect(review.root.querySelector('.inspector-actions')?.textContent).toContain('Validieren');
    expect(review.root.querySelector('.inspector-actions')?.textContent).toContain('Verbindung entfernen');
    review.fixture.destroy();

    const validated = render('validated');
    expect(validated.root.querySelector('.inspector-actions')?.textContent).toContain('Ablösen');
    expect(validated.root.querySelector('.inspector-actions')?.textContent).toContain('Verbindung entfernen');
    validated.fixture.destroy();

    const superseded = render('superseded');
    expect(superseded.root.querySelector('.inspector-actions button')).toBeNull();
    expect(superseded.root.textContent).toContain('historisch');
  });

  it('opens a broken mapping as a clean repair draft against the current snapshot', () => {
    const { root, mapping } = render('broken', {
      physicalSnapshotId: FALLBACK_PHYSICAL_SNAPSHOT.previousSnapshotId!,
      physicalColumnIds: ['removed-column'],
    });

    expect(root.textContent).toContain('Nicht im aktuellen Snapshot (removed-column)');
    const repair = [...root.querySelectorAll<HTMLButtonElement>('.inspector-actions button')]
      .find((button) => button.textContent?.includes('auflösen'))!;
    repair.click();

    expect(facade.editor()).toEqual({ mappingId: mapping.id, logicalFieldVersionIds: mapping.logicalFieldVersionIds, physicalColumnIds: [] });
    expect(facade.announcement()).toContain('neue Entwurfsversion');
  });

  it('emits submit and supersede with the selected mapping id', () => {
    const draft = render('draft');
    const submit = vi.fn();
    draft.fixture.componentInstance.submit.subscribe(submit);
    [...draft.root.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('einreichen'))!.click();
    expect(submit).toHaveBeenCalledWith(draft.mapping.id);
    draft.fixture.destroy();

    const validated = render('validated');
    const supersede = vi.fn();
    validated.fixture.componentInstance.supersede.subscribe(supersede);
    validated.root.querySelector<HTMLButtonElement>('.inspector-actions button')!.click();
    expect(supersede).toHaveBeenCalledWith(validated.mapping.id);
  });
});
