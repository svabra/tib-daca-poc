import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { I14yConceptsApiService } from './i14y-concepts-api.service';
import { I14yConceptsComponent } from './i14y-concepts.component';
import { I14yConcept, I14ySyncStatus } from './i14y-concepts.models';

vi.mock('@bit-daca/design-system', async () => {
  const { Component } = await import('@angular/core');
  class StatusBadgeStub {}
  Component({ selector: 'daca-status-badge', standalone: true, template: '<ng-content />', inputs: ['tone'] })(StatusBadgeStub);
  return { StatusBadgeComponent: StatusBadgeStub };
});

const SUMMARY: I14yConcept = {
  id: '89bc55cc-3858-4c13-a5c8-7dc935dff29b', identifiers: ['legalForm'],
  name: { de: 'Rechtsform', fr: '', it: '', en: '' }, description: { de: '', fr: '', it: '', en: '' },
  conceptType: 'CodeList', publisher: null, version: '1.2.0', publicationLevel: null, registrationStatus: 'registered',
  themes: ['Unternehmen'], validFrom: null, validTo: null, conformsTo: [], constraints: {},
  codeList: { entryCount: 0, entriesLoaded: false }, sourceUrl: 'https://example.test/concepts/legal-form', detailLoaded: false,
  systemCreatedAt: null, systemModifiedAt: null, fetchedAt: '2026-09-07T12:00:00Z',
};
const DETAIL: I14yConcept = { ...SUMMARY, detailLoaded: true, description: { ...SUMMARY.description, de: 'Rechtsform einer Organisation' } };
const SYNC: I14ySyncStatus = { sourceUrl: 'https://example.test/Release.json', status: 'success', lastSuccessfulAt: '2026-09-07T12:00:00Z', conceptCount: 1, lastRun: null };

describe('I14yConceptsComponent detail loading', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('refreshes an incomplete summary exactly once and reuses the refreshed detail afterwards', async () => {
    const detailResponse = new Subject<I14yConcept>();
    const api = {
      search: vi.fn(() => of({ items: [SUMMARY], total: 1 })),
      syncStatus: vi.fn(() => of(SYNC)),
      refreshDetail: vi.fn(() => detailResponse.asObservable()),
      remoteSearch: vi.fn(), refresh: vi.fn(),
    };
    const userId = signal('cinthya.thor');
    const identity = {
      userId,
      user: signal({ id: userId(), displayName: 'Cinthya Thor', organization: 'Verteidigung', department: 'VBS', office: 'vbs-verteidigung', primaryModelingRole: 'data_steward', roles: ['data_steward'] }),
    };
    await TestBed.configureTestingModule({
      imports: [I14yConceptsComponent],
      providers: [
        provideRouter([]),
        { provide: I14yConceptsApiService, useValue: api },
        { provide: DemoIdentityService, useValue: identity },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(I14yConceptsComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.selectConcept(SUMMARY);
    fixture.componentInstance.selectConcept(SUMMARY);
    expect(api.refreshDetail).toHaveBeenCalledOnce();
    expect(api.refreshDetail).toHaveBeenCalledWith(SUMMARY.id);
    detailResponse.next(DETAIL);
    detailResponse.complete();
    expect(fixture.componentInstance.selected()).toEqual(DETAIL);
    expect(fixture.componentInstance.concepts()[0]).toEqual(DETAIL);

    fixture.componentInstance.selectConcept(fixture.componentInstance.concepts()[0]);
    expect(api.refreshDetail).toHaveBeenCalledOnce();
  });

  it('offers an explicit targeted CodeList-entry sync and updates the cached count', async () => {
    const entries=[{id:'entry-1'},{id:'entry-2'}];
    const api={
      search:vi.fn(()=>of({items:[SUMMARY],total:1})),syncStatus:vi.fn(()=>of(SYNC)),
      syncCodeListEntries:vi.fn(()=>of(entries)),refreshDetail:vi.fn(),remoteSearch:vi.fn(),refresh:vi.fn(),
    };
    const userId=signal('cinthya.thor');const identity={userId,user:signal({id:userId(),displayName:'Cinthya Thor',organization:'Verteidigung',department:'VBS',office:'vbs-verteidigung',primaryModelingRole:'data_steward',roles:['data_steward']})};
    await TestBed.configureTestingModule({imports:[I14yConceptsComponent],providers:[provideRouter([]),{provide:I14yConceptsApiService,useValue:api},{provide:DemoIdentityService,useValue:identity}]}).compileComponents();
    const fixture=TestBed.createComponent(I14yConceptsComponent);fixture.detectChanges();await fixture.whenStable();
    const root=fixture.nativeElement as HTMLElement;
    const syncButton=[...root.querySelectorAll<HTMLButtonElement>('.concept-detail button')].find((button)=>button.textContent?.includes('CodeList-Einträge'))!;

    syncButton.click();fixture.detectChanges();

    expect(api.syncCodeListEntries).toHaveBeenCalledOnce();
    expect(api.syncCodeListEntries).toHaveBeenCalledWith(SUMMARY.id);
    expect(fixture.componentInstance.selected()?.codeList).toEqual({entryCount:2,entriesLoaded:true});
    expect(fixture.componentInstance.notice()).toContain('2 CodeList-Einträge');
  });
});
