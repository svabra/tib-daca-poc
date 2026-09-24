import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService, MappingInconsistency } from './data-models-api.service';
import { MappingInconsistenciesComponent } from './mapping-inconsistencies.component';

describe('MappingInconsistenciesComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('keeps an accepted inconsistency visible as a quality error and refreshes owner tasks', () => {
    const issue: MappingInconsistency = {
      id: 'issue-1', logicalModelId: 'model-1', logicalFieldId: 'field-1', fieldName: 'bezeichnung',
      ownerUserId: 'owner-1', assignedStewardUserId: null, status: 'open', decisionComment: null,
      createdAt: '2026-09-24T10:00:00Z', updatedAt: '2026-09-24T10:00:00Z', resolvedAt: null,
    };
    const api = {
      listMappingInconsistencies: vi.fn().mockReturnValue(of({ qualityStatus: 'error', items: [issue], total: 1, eligibleStewards: [{ id: 'steward-1', displayName: 'Data Steward' }] })),
      decideMappingInconsistency: vi.fn().mockReturnValue(of({ ...issue, status: 'accepted', decisionComment: 'Fachlich bewusst' })),
    };
    const refreshWorkflowTasks = vi.fn();
    TestBed.configureTestingModule({ imports: [MappingInconsistenciesComponent], providers: [
      { provide: DataModelsApiService, useValue: api },
      { provide: DemoIdentityService, useValue: { userId: () => 'owner-1' } },
      { provide: CatalogApiService, useValue: { refreshWorkflowTasks } },
    ] });
    const fixture = TestBed.createComponent(MappingInconsistenciesComponent);
    fixture.componentRef.setInput('modelId', 'model-1');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Inkonsistenzfehler (1)');
    const edit = root.querySelector<HTMLButtonElement>('[data-testid="mapping-issue-bezeichnung"] > button')!;
    edit.click(); fixture.detectChanges();
    const reason = root.querySelector<HTMLTextAreaElement>('textarea')!;
    reason.value = 'Fachlich bewusst'; reason.dispatchEvent(new Event('input')); fixture.detectChanges();
    const accept = [...root.querySelectorAll<HTMLButtonElement>('.decision-form button')]
      .find((button) => button.textContent?.includes('akzeptieren'))!;
    accept.click(); fixture.detectChanges();
    expect(api.decideMappingInconsistency).toHaveBeenCalledWith('model-1', 'issue-1', 'accept', 'Fachlich bewusst', '');
    expect(root.textContent).toContain('Qualitätsfehler bleibt');
    expect(refreshWorkflowTasks).toHaveBeenCalledOnce();
  });
});
