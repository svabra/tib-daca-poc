import { TestBed } from '@angular/core/testing';
import { MappingDraftFacade } from './mapping-draft.facade';
import { MappingGraphComponent } from './mapping-graph.component';
import { FALLBACK_LOGICAL_MODEL, FALLBACK_MAPPINGS, FALLBACK_PHYSICAL_SNAPSHOT } from './mapping-fallback';

describe('MappingGraphComponent field context menu', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('offers scoped field actions by right click and removes only the selected link', () => {
    TestBed.configureTestingModule({ imports: [MappingGraphComponent], providers: [MappingDraftFacade] });
    const facade = TestBed.inject(MappingDraftFacade);
    facade.initialize(FALLBACK_LOGICAL_MODEL, FALLBACK_PHYSICAL_SNAPSHOT, FALLBACK_MAPPINGS, null);
    const fixture = TestBed.createComponent(MappingGraphComponent);
    fixture.componentRef.setInput('canManage', true);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const field = root.querySelector<HTMLButtonElement>('[data-logical-field-id="field-org-id"]')!;
    const disconnect = vi.fn();
    const deleteField = vi.fn();
    fixture.componentInstance.disconnect.subscribe(disconnect);
    fixture.componentInstance.deleteField.subscribe(deleteField);

    field.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 80 }));
    fixture.detectChanges();
    expect(root.querySelector('[role="menu"]')).not.toBeNull();
    expect(root.querySelectorAll('[role="menuitem"]')).toHaveLength(5);
    const link = [...root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((item) => item.textContent?.includes('org_unit_id'));
    expect(link).toBeDefined();
    link!.click();
    expect(disconnect).toHaveBeenCalledWith({ mappingId: 'mapping-org-id', columnId: 'column-org-id' });
    expect(deleteField).not.toHaveBeenCalled();

    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    fixture.detectChanges();
    [...root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((item) => item.textContent?.includes('Logisches Feld entfernen'))!.click();
    expect(deleteField).toHaveBeenCalledWith('field-org-id');
  });

  it('does not open mutation actions for a viewer', () => {
    TestBed.configureTestingModule({ imports: [MappingGraphComponent], providers: [MappingDraftFacade] });
    TestBed.inject(MappingDraftFacade).initialize(FALLBACK_LOGICAL_MODEL, FALLBACK_PHYSICAL_SNAPSHOT, FALLBACK_MAPPINGS, null);
    const fixture = TestBed.createComponent(MappingGraphComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const field = root.querySelector<HTMLButtonElement>('[data-logical-field-id="field-org-id"]')!;
    field.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(root.querySelector('[role="menu"]')).toBeNull();
    field.click();
    expect(TestBed.inject(MappingDraftFacade).pendingLogicalFieldId()).toBeNull();
  });
});
