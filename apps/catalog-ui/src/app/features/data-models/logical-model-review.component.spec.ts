import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Subject } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService } from './data-models-api.service';
import { LogicalModel, LogicalModelReview } from './data-models.models';
import { LogicalModelReviewComponent } from './logical-model-review.component';

vi.mock('@bit-daca/design-system', async () => {
  const { Component } = await import('@angular/core');
  class StatusBadgeStub {}
  Component({ selector: 'daca-status-badge', standalone: true, template: '<ng-content />', inputs: ['tone'] })(StatusBadgeStub);
  return { StatusBadgeComponent: StatusBadgeStub };
});

describe('LogicalModelReviewComponent authorization', () => {
  const userId = signal('historical-reviewer');
  let reads: Subject<{ body: LogicalModelReview; etag: string }>[];
  let decision: Subject<{ body: LogicalModel; etag: string }>;
  const review = (values: Partial<LogicalModelReview> = {}): LogicalModelReview => ({
    id: 'review', status: 'pending', reviewerUserId: 'historical-reviewer',
    submitterUserId: 'submitter', ...values,
  } as LogicalModelReview);

  beforeEach(() => {
    userId.set('historical-reviewer');
    reads = [];
    decision = new Subject();
    TestBed.configureTestingModule({
      providers: [
        { provide: DemoIdentityService, useValue: { userId, users: signal([]) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'review' }) } } },
        { provide: CatalogApiService, useValue: { refreshWorkflowTasks: vi.fn() } },
        { provide: DataModelsApiService, useValue: { loadLogicalModelReview: () => {
          const read = new Subject<{ body: LogicalModelReview; etag: string }>();
          reads.push(read);
          return read.asObservable();
        }, decideLogicalModelReview: () => decision.asObservable() } },
      ],
    });
  });

  it('requires an explicit server capability rather than the historical reviewer ID', () => {
    const component = TestBed.runInInjectionContext(() => new LogicalModelReviewComponent());
    component.review.set(review());
    expect(component.canDecide()).toBe(false);
    component.review.set(review({ canDecide: false }));
    expect(component.canDecide()).toBe(false);
    component.review.set(review({ canDecide: true, reviewerUserId: 'previous-owner' }));
    expect(component.canDecide()).toBe(true);
  });

  it('excludes the submitter even if a capability is stale', () => {
    const component = TestBed.runInInjectionContext(() => new LogicalModelReviewComponent());
    component.review.set(review({ canDecide: true, submitterUserId: userId() }));
    expect(component.canDecide()).toBe(false);
  });

  it('clears the prior identity and ignores its pending response', () => {
    const component = TestBed.runInInjectionContext(() => new LogicalModelReviewComponent());
    TestBed.tick();
    reads[0].next({ body: review({ canDecide: true }), etag: 'old' });
    expect(component.canDecide()).toBe(true);
    userId.set('new-person');
    TestBed.tick();
    expect(component.review()).toBeNull();
    expect(component.etag()).toBe('');
    reads[0].next({ body: review({ canDecide: true }), etag: 'stale' });
    expect(component.review()).toBeNull();
    reads[1].next({ body: review({ canDecide: false }), etag: 'current' });
    expect(component.etag()).toBe('current');
    expect(component.canDecide()).toBe(false);
  });

  it('does not apply a pending decision response to the next identity', () => {
    const component = TestBed.runInInjectionContext(() => new LogicalModelReviewComponent());
    TestBed.tick();
    reads[0].next({ body: review({ canDecide: true }), etag: 'old' });
    component.accept();
    expect(component.deciding()).toBe(true);
    userId.set('new-person');
    TestBed.tick();
    reads[1].next({ body: review({ canDecide: false }), etag: 'new' });
    decision.next({ body: { versionId: 'old-decision' } as LogicalModel, etag: 'old' });
    expect(component.review()?.status).toBe('pending');
    expect(component.decidedModel()).toBeNull();
    expect(component.notice()).toBeNull();
    expect(component.deciding()).toBe(false);
  });
});
