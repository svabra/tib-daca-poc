import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MappingDraftFacade } from './mapping-draft.facade';
import { FALLBACK_LOGICAL_MODEL, FALLBACK_MAPPINGS, FALLBACK_PHYSICAL_SNAPSHOT } from './mapping-fallback';
import { MappingMatrixComponent } from './mapping-matrix.component';

describe('MappingMatrixComponent', () => {
  it('offers the complete table alternative without requiring drag and drop', () => {
    TestBed.configureTestingModule({ imports: [MappingMatrixComponent], providers: [MappingDraftFacade] });
    const facade = TestBed.inject(MappingDraftFacade);
    facade.initialize(FALLBACK_LOGICAL_MODEL, FALLBACK_PHYSICAL_SNAPSHOT, FALLBACK_MAPPINGS, null);
    const fixture = TestBed.createComponent(MappingMatrixComponent);
    fixture.detectChanges();
    const table = fixture.debugElement.query(By.css('table'));
    const add = fixture.debugElement.queryAll(By.css('button')).find((item) => item.nativeElement.textContent.includes('Zuordnung'))!;
    expect(table).toBeTruthy();
    add.triggerEventHandler('click', { currentTarget: add.nativeElement });
    expect(facade.editor()).not.toBeNull();
  });
});
