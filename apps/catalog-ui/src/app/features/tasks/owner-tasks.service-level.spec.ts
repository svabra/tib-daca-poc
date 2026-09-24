import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import type { WorkflowTaskWire } from '../../core/catalog-api.service';
import { OwnerTasksComponent } from './owner-tasks.component';

vi.mock('@bit-daca/design-system', async () => {
  const { Component } = await import('@angular/core');
  class StatusBadgeStub {}
  Component({ selector: 'daca-status-badge', standalone: true, template: '<ng-content />', inputs: ['tone'] })(StatusBadgeStub);
  class GlossaryTermStub {}
  Component({ selector: 'daca-glossary-term', standalone: true, template: '', inputs: ['term'] })(GlossaryTermStub);
  return { StatusBadgeComponent: StatusBadgeStub, DacaGlossaryTermComponent: GlossaryTermStub };
});

function apiStub() {
  return {
    ownerAccessRequests: signal([]),
    ownerAccessRequestLoading: signal(false),
    ownerAccessRequestError: signal<string | null>(null),
    workflowTasks: signal([]),
    workflowTasksLoading: signal(false),
    workflowTasksError: signal<string | null>(null),
    sourceAccessRequests: signal([]),
    sourceAccessRequestsLoading: signal(false),
    sourceAccessRequestsError: signal<string | null>(null),
    products: signal([]),
    refreshOwnerAccessRequestInbox: vi.fn(),
    refreshWorkflowTasks: vi.fn(),
    refreshSourceAccessRequestInbox: vi.fn(),
    decideSourceAccessRequest: vi.fn(),
  };
}

async function render(api = apiStub()) {
  const emptyQuery = convertToParamMap({});
  await TestBed.configureTestingModule({
    imports: [OwnerTasksComponent],
    providers: [
      provideRouter([]),
      { provide: CatalogApiService, useValue: api },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: emptyQuery }, queryParamMap: of(emptyQuery) } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(OwnerTasksComponent);
  fixture.detectChanges();
  return { fixture, api };
}

describe('OwnerTasksComponent service-level workflow task', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('links an SLA approval task directly to its assigned revision review', async () => {
    const { fixture } = await render();
    const component = fixture.componentInstance;
    const task = {
      taskType: 'service_level_approval',
      dataProductId: 'product-1',
      serviceLevelRevisionId: 'revision-2',
    } as Pick<WorkflowTaskWire, 'taskType' | 'dataProductId' | 'serviceLevelRevisionId'>;

    expect(component.taskLabel(task.taskType)).toBe('SLA-Kontrolle');
    expect(component.taskRoute(task)).toEqual(['/products', 'product-1', 'sla']);
    expect(component.taskQueryParams(task)).toEqual({ review: 'revision-2' });
  });

  it('links semantic decision information back to its review context', async () => {
    const { fixture } = await render();
    const component = fixture.componentInstance;

    expect(component.taskRoute({
      taskType: 'glossary_term_decision',
      dataProductId: 'product-1',
      glossaryTermProposalId: 'proposal-1',
    })).toEqual(['/glossary/proposals', 'proposal-1', 'review']);
    expect(component.taskRoute({
      taskType: 'domain_change_decision',
      dataProductId: null,
      domainChangeRequestId: 'request-1',
    })).toEqual(['/domains']);
  });

  it('links a logical-model task to its immutable review snapshot', async () => {
    const { fixture } = await render();
    const component = fixture.componentInstance;
    expect(component.taskLabel('logical_model_review')).toBe('Datenmodell-Prüfung');
    expect(component.taskRoute({taskType:'logical_model_review',dataProductId:null,logicalModelReviewId:'review-7'})).toEqual(['/model-reviews','review-7']);
  });

  it('shows an unknown owner-inbox status with retry instead of claiming that the inbox is empty', async () => {
    const api = apiStub();
    api.ownerAccessRequestError.set('Zugriffsanfragen konnten nicht geladen werden. Der Aufgabenstatus ist unbekannt.');
    const { fixture } = await render(api);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Aufgabenstatus unbekannt');
    expect(root.textContent).toContain('Zugriffsanfragen konnten nicht geladen werden');
    expect(root.textContent).not.toContain('Keine offenen Zugriffsanfragen');
    root.querySelector<HTMLButtonElement>('[data-testid="retry-owner-inbox"]')!.click();
    expect(api.refreshOwnerAccessRequestInbox).toHaveBeenCalledOnce();
  });

  it('shows an unknown approver-task status with retry instead of presenting a zero-task result', async () => {
    const api = apiStub();
    api.workflowTasksError.set('Weitere Aufgaben konnten nicht geladen werden. Der Aufgabenstatus ist unbekannt.');
    const { fixture } = await render(api);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Aufgabenstatus unbekannt');
    expect(root.textContent).toContain('Weitere Aufgaben konnten nicht geladen werden');
    expect(root.textContent).not.toContain('0 offene Aufgaben');
    expect(api.refreshWorkflowTasks).toHaveBeenCalledOnce();
    api.refreshWorkflowTasks.mockClear();
    root.querySelector<HTMLButtonElement>('[data-testid="retry-workflow-tasks"]')!.click();
    expect(api.refreshWorkflowTasks).toHaveBeenCalledOnce();
  });
});
