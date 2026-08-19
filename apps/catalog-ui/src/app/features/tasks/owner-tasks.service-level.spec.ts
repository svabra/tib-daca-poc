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

describe('OwnerTasksComponent service-level workflow task', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('links an SLA approval task directly to its assigned revision review', async () => {
    const emptyQuery = convertToParamMap({});
    const api = {
      ownerAccessRequests: signal([]),
      ownerAccessRequestLoading: signal(false),
      workflowTasks: signal([]),
      products: signal([]),
    };
    await TestBed.configureTestingModule({
      imports: [OwnerTasksComponent],
      providers: [
        provideRouter([]),
        { provide: CatalogApiService, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: emptyQuery }, queryParamMap: of(emptyQuery) } },
      ],
    }).compileComponents();
    const component = TestBed.createComponent(OwnerTasksComponent).componentInstance;
    const task = {
      taskType: 'service_level_approval',
      dataProductId: 'product-1',
      serviceLevelRevisionId: 'revision-2',
    } as Pick<WorkflowTaskWire, 'taskType' | 'dataProductId' | 'serviceLevelRevisionId'>;

    expect(component.taskLabel(task.taskType)).toBe('SLA-Kontrolle');
    expect(component.taskRoute(task)).toEqual(['/products', 'product-1', 'sla']);
    expect(component.taskQueryParams(task)).toEqual({ review: 'revision-2' });
  });
});
