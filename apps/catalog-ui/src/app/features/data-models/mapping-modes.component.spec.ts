import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MappingDraftFacade } from './mapping-draft.facade';
import { FALLBACK_LOGICAL_MODEL, FALLBACK_MAPPINGS, FALLBACK_PHYSICAL_SNAPSHOT } from './mapping-fallback';
import { MappingGraphComponent } from './mapping-graph.component';

describe('mapping interaction modes', () => {
  let facade: MappingDraftFacade;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MappingGraphComponent], providers: [MappingDraftFacade] });
    facade = TestBed.inject(MappingDraftFacade);
    facade.initialize(FALLBACK_LOGICAL_MODEL, FALLBACK_PHYSICAL_SNAPSHOT, FALLBACK_MAPPINGS, null);
  });
  afterEach(() => TestBed.resetTestingModule());

  it('opens the same mapping editor through graph click-to-connect', () => {
    const fixture = TestBed.createComponent(MappingGraphComponent);
    fixture.detectChanges();
    const source = fixture.debugElement.queryAll(By.css('.field-endpoint')).at(-1)!;
    source.triggerEventHandler('click', { currentTarget: source.nativeElement });
    const target = fixture.debugElement.queryAll(By.css('.column-endpoint')).find((item) => item.nativeElement.textContent.includes('valid_from'))!;
    target.triggerEventHandler('click', { currentTarget: target.nativeElement });
    expect(facade.editor()?.logicalFieldVersionIds).toEqual(['field-valid']);
    expect(facade.editor()?.physicalColumnIds).toEqual(['column-valid']);
  });

  it('draws edges in the fixed canvas coordinate system from source to target', () => {
    const fixture = TestBed.createComponent(MappingGraphComponent);
    const mapping = FALLBACK_MAPPINGS[0];

    const path = fixture.componentInstance.edgePath(
      mapping.logicalFieldVersionIds[0],
      mapping.physicalColumnIds[0],
      0,
    );

    expect(path).toMatch(/^M 372 \d+ C 480 \d+, 540 \d+, 648 \d+$/);
  });

  it('uses measured node centres when the physical snapshot card changes height', () => {
    const fixture = TestBed.createComponent(MappingGraphComponent);
    const component = fixture.componentInstance;
    const mapping = FALLBACK_MAPPINGS[0];
    (component as unknown as { endpointPositions: { set(value: unknown): void } }).endpointPositions.set({
      logical: new Map([[mapping.logicalFieldVersionIds[0], { x: 372, y: 148 }]]),
      physical: new Map([[mapping.physicalColumnIds[0], { x: 648, y: 247 }]]),
    });

    expect(component.edgePath(mapping.logicalFieldVersionIds[0], mapping.physicalColumnIds[0], 0))
      .toBe('M 372 148 C 480 148, 540 247, 648 247');
  });

  it('shows the physical data owner and canonical catalog path in the snapshot card', () => {
    const fixture = TestBed.createComponent(MappingGraphComponent);
    fixture.detectChanges();

    const snapshotCard = fixture.nativeElement.querySelector('.physical-nodes > header') as HTMLElement;
    expect(snapshotCard.textContent).toContain('Data Ownerin: Christian Spider');
    expect(snapshotCard.textContent).toContain('postgresql://hr_core/');
    const providerIcon = snapshotCard.querySelector('img') as HTMLImageElement;
    expect(providerIcon.alt).toBe('PostgreSQL');
    expect(providerIcon.src).toContain('/assets/providers/postgresql.svg');
  });
});
