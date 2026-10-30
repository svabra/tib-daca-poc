import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject, NEVER, of, Subject, throwError } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DataModelsApiService, ModelingApiError } from './data-models-api.service';
import { MappingGraphComponent } from './mapping-graph.component';
import { ApiResult, AssetMapping, DriftReport, LogicalModel, LogicalModelSummary, LogicalModelWrite, PhysicalSnapshot } from './data-models.models';
import { FALLBACK_LOGICAL_MODEL, FALLBACK_MAPPINGS, FALLBACK_PHYSICAL_SNAPSHOT } from './mapping-fallback';
import { ModelingAssistanceService } from './modeling-assistance.service';
import { exactMappingSuggestions, MappingWorkspaceComponent } from './mapping-workspace.component';

vi.mock('@bit-daca/design-system',async()=>{
  const {Component}=await import('@angular/core');
  class StatusBadgeStub{}
  Component({selector:'daca-status-badge',standalone:true,template:'<ng-content />',inputs:['tone']})(StatusBadgeStub);
  class GlossaryTermStub {term='';explanation='';}
  Component({selector:'daca-glossary-term',standalone:true,inputs:['term','explanation'],template:'<span [title]="explanation">{{term}}</span>'})(GlossaryTermStub);
  return{StatusBadgeComponent:StatusBadgeStub,DacaGlossaryTermComponent:GlossaryTermStub};
});

describe('Mapping workspace live refresh',()=>{
  beforeEach(()=>vi.useFakeTimers());
  afterEach(()=>{TestBed.resetTestingModule();vi.useRealTimers();});
  function setup(params:Record<string,string>={}){
    const actor=signal('christian.man');
    const secondTable={...FALLBACK_PHYSICAL_SNAPSHOT.tables[0],id:'second-table',name:'Second',columns:[]};
    const state={model:FALLBACK_LOGICAL_MODEL,snapshot:{...FALLBACK_PHYSICAL_SNAPSHOT,sourceConnectionConfigured:true,tables:[...FALLBACK_PHYSICAL_SNAPSHOT.tables,secondTable]},mappings:[...FALLBACK_MAPPINGS],layout:{revision:0,positions:{}}};
    const api={
      listLogicalModels:vi.fn(()=>of([state.model])),listPhysicalSnapshots:vi.fn(()=>of([state.snapshot])),
      loadLogicalModel:vi.fn(()=>of({body:state.model,etag:'"1"'})),
      listMappings:vi.fn(()=>of(state.mappings)),
      listRepresentations:vi.fn(()=>of(state.snapshot.tables.map((table)=>({physicalSnapshotId:state.snapshot.id,physicalTableId:table.id})))),
      loadPhysicalSnapshot:vi.fn(()=>of(state.snapshot)),loadCanvasLayout:vi.fn(()=>of(state.layout)),loadDrift:vi.fn(()=>of(null)),
      saveWorkspaceDraft:vi.fn(),
      rememberMappingWorkspace:vi.fn(()=>of(undefined)),
    };
    TestBed.configureTestingModule({imports:[MappingWorkspaceComponent],providers:[
      {provide:DataModelsApiService,useValue:api},{provide:DemoIdentityService,useValue:{userId:actor}},
      {provide:CatalogApiService,useValue:{refreshWorkflowTasks:vi.fn()}},
      {provide:ModelingAssistanceService,useValue:{myScopes:()=>of([])}},
      {provide:ActivatedRoute,useValue:{queryParamMap:of(convertToParamMap(params)),snapshot:{paramMap:convertToParamMap({id:state.model.id}),data:{}}}},
      {provide:Router,useValue:{navigate:vi.fn().mockResolvedValue(true)}},
    ]}).overrideComponent(MappingWorkspaceComponent,{set:{imports:[MappingGraphComponent],template:`
      <section class="representation-list">@for(item of linkedRepresentations();track item.tableId){<button [attr.data-representation-id]="item.tableId">{{item.connection.label}}</button>}</section>
      <daca-mapping-graph />
    `}});
    const fixture=TestBed.createComponent(MappingWorkspaceComponent);fixture.detectChanges();
    return{fixture,component:fixture.componentInstance,state,api,actor,secondTable};
  }
  function visibleIds(root:HTMLElement,attribute:string):string[]{return[...root.querySelectorAll(`[${attribute}]`)].map((element)=>element.getAttribute(attribute)!).sort();}

  it('remembers opened context once without treating automatic refresh as new work',()=>{
    const {component,api}=setup();
    expect(api.rememberMappingWorkspace).toHaveBeenCalledExactlyOnceWith(FALLBACK_LOGICAL_MODEL.id,{physicalSnapshotId:component.selectedSnapshotId(),physicalTableId:component.selectedPhysicalTableId(),view:component.facade.view()});
    vi.advanceTimersByTime(10000);expect(api.rememberMappingWorkspace).toHaveBeenCalledTimes(1);
    component.setView('table');expect(api.rememberMappingWorkspace).toHaveBeenCalledTimes(2);
  });

  it('opens an explicitly selected new representation as a local editable choice without inventing mappings',()=>{
    const {component,api}=setup({physicalSnapshotId:FALLBACK_PHYSICAL_SNAPSHOT.id,physicalTableId:'second-table',addRepresentation:'1'});
    api.listRepresentations.mockReturnValue(of([]));component.load();
    expect(component.facade.pendingRepresentations().some(item=>item.table.id==='second-table')).toBe(true);
    expect(component.facade.representations().find(item=>item.table.id==='second-table')?.preview).toBe(false);
    expect(component.facade.dirtyIds().size).toBe(0);
  });

  it('queues rapid context changes so an older history write cannot replace a newer view',()=>{
    const {component,api}=setup(),pending=new Subject<undefined>();
    api.rememberMappingWorkspace.mockReturnValueOnce(pending);
    component.setView('table');component.setView('drift');
    expect(api.rememberMappingWorkspace).toHaveBeenCalledTimes(2);
    pending.next(undefined);pending.complete();
    expect(api.rememberMappingWorkspace).toHaveBeenCalledTimes(3);
    expect(api.rememberMappingWorkspace).toHaveBeenLastCalledWith(FALLBACK_LOGICAL_MODEL.id,expect.objectContaining({view:'drift'}));
  });

  it('updates recency after saving fields and preserves local work when history cannot be saved',()=>{
    const {component,api,state}=setup();
    component.modelCharacteristicsSaved(state.model);expect(api.rememberMappingWorkspace).toHaveBeenCalledTimes(2);
    component.facade.stageMappingRemoval(FALLBACK_MAPPINGS[0].id);
    api.rememberMappingWorkspace.mockReturnValueOnce(throwError(()=>new Error('offline')));component.setView('table');
    expect(component.historyNotice()).toContain('Letzte Mapping-Arbeiten');
    expect(component.facade.pendingRemovals()).toHaveLength(1);expect(component.facade.model()?.id).toBe(state.model.id);
  });

  it('finishes pending history writes after leaving the workspace instead of cancelling the last context',()=>{
    const {component,fixture,api}=setup(),pending=new Subject<undefined>();
    api.rememberMappingWorkspace.mockReturnValueOnce(pending);
    component.setView('table');component.setView('drift');fixture.destroy();
    expect(pending.observed).toBe(true);pending.next(undefined);pending.complete();
    expect(api.rememberMappingWorkspace).toHaveBeenLastCalledWith(FALLBACK_LOGICAL_MODEL.id,expect.objectContaining({view:'drift'}));
  });

  it('keeps the binding list identical to the graph when hiding, refreshing and restoring a representation',()=>{
    const {fixture,component,secondTable}=setup();
    const root=fixture.nativeElement as HTMLElement;
    const compare=()=>expect(visibleIds(root,'data-representation-id')).toEqual(visibleIds(root,'data-representation-table-id'));
    compare();expect(root.querySelector('.representation-list')?.textContent).toContain('Mit Quellenanbindung');
    component.facade.hideRepresentation(secondTable.id);fixture.detectChanges();compare();
    expect(visibleIds(root,'data-representation-id')).not.toContain(secondTable.id);
    vi.advanceTimersByTime(5000);fixture.detectChanges();compare();
    expect(component.facade.hiddenRepresentationIds().has(secondTable.id)).toBe(true);
    component.showHiddenRepresentations();fixture.detectChanges();compare();
    expect(visibleIds(root,'data-representation-id')).toContain(secondTable.id);
  });

  it('updates removed tables, mapping counts and saved canvas positions within five seconds without resetting the field selection',()=>{
    const {fixture,component,state}=setup();
    const initialCount=component.linkedRepresentations().length;
    const selected=state.model.fields.at(-1)!;component.facade.selectField(selected.id);
    state.snapshot={...state.snapshot,tables:[state.snapshot.tables[0]],sourceConnectionConfigured:false};
    state.mappings=[];state.layout={revision:2,positions:{logical:{x:240,y:110}}};
    vi.advanceTimersByTime(4999);expect(component.linkedRepresentations()).toHaveLength(initialCount);
    vi.advanceTimersByTime(1);fixture.detectChanges();
    expect(component.linkedRepresentations()).toHaveLength(1);
    expect(component.linkedRepresentations()[0].linkedMappingCount).toBe(0);
    expect(component.linkedRepresentations()[0].connection.label).toBe('Nur Strukturmetadaten');
    expect(component.facade.selectedLogicalFieldId()).toBe(selected.id);
    expect(component.facade.canvasNodePositions().get('logical')).toEqual({x:240,y:110});
    expect(component.facade.hasWorkspaceChanges()).toBe(false);
  });

  it('refreshes on window focus, skips hidden documents and stops polling after destruction',()=>{
    const {fixture,api}=setup();const calls=api.loadLogicalModel.mock.calls.length;
    const visibility=vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');
    vi.advanceTimersByTime(5000);expect(api.loadLogicalModel).toHaveBeenCalledTimes(calls);
    visibility.mockReturnValue('visible');window.dispatchEvent(new Event('focus'));
    expect(api.loadLogicalModel).toHaveBeenCalledTimes(calls+1);
    fixture.destroy();vi.advanceTimersByTime(10000);
    expect(api.loadLogicalModel).toHaveBeenCalledTimes(calls+1);visibility.mockRestore();
  });

  it('preserves local removals and positions while automatic refresh is paused',()=>{
    const {component,api}=setup();
    component.facade.stageMappingRemoval(FALLBACK_MAPPINGS[0].id);
    component.facade.moveCanvasNode('logical',{x:180,y:120});
    const calls=api.loadLogicalModel.mock.calls.length;
    vi.advanceTimersByTime(10000);
    expect(api.loadLogicalModel).toHaveBeenCalledTimes(calls);
    expect(component.facade.pendingRemovals()).toEqual([FALLBACK_MAPPINGS[0]]);
    expect(component.facade.canvasNodePositions().get('logical')).toEqual({x:180,y:120});
    expect(component.refreshNotice()).toContain('pausiert');
  });

  it('ignores an in-flight refresh after the user starts editing and never overlaps requests',()=>{
    const {component,api}=setup();const request=new Subject<ApiResult<LogicalModel>>();
    api.loadLogicalModel.mockReturnValueOnce(request);
    component.refreshWorkspace();component.refreshWorkspace();
    expect(api.loadLogicalModel).toHaveBeenCalledTimes(2);
    component.facade.stageMappingRemoval(FALLBACK_MAPPINGS[0].id);
    finish(request,{body:{...FALLBACK_LOGICAL_MODEL,title:{...FALLBACK_LOGICAL_MODEL.title,de:'Remote title'}},etag:'"2"'});
    expect(component.facade.model()?.title.de).not.toBe('Remote title');
    expect(component.facade.pendingRemovals()).toHaveLength(1);
  });

  it('does not apply a late response from a former identity',()=>{
    const {component,api,actor}=setup();const request=new Subject<ApiResult<LogicalModel>>();
    api.loadLogicalModel.mockReturnValueOnce(request);component.refreshWorkspace();
    actor.set('christian.spider');TestBed.tick();
    finish(request,{body:{...FALLBACK_LOGICAL_MODEL,title:{...FALLBACK_LOGICAL_MODEL.title,de:'Former identity'}},etag:'"1"'});
    expect(component.facade.model()?.title.de).not.toBe('Former identity');
  });

  it('retries temporary failures without falling back to demo data or removing the last confirmed catalog state',()=>{
    const {component,api}=setup();
    api.loadLogicalModel.mockReturnValueOnce(throwError(()=>new Error('temporarily unavailable')));
    component.refreshWorkspace();expect(component.refreshNotice()).toContain('erneut');
    expect(component.fallbackActive()).toBe(false);expect(component.facade.model()).not.toBeNull();
    vi.advanceTimersByTime(5000);expect(component.refreshNotice()).toBeNull();
  });

  it('clears inaccessible model content after access is revoked',()=>{
    const {component,api}=setup();
    api.loadLogicalModel.mockReturnValueOnce(throwError(()=>new ModelingApiError('permission',403,'forbidden')));
    component.refreshWorkspace();
    expect(component.facade.model()).toBeNull();expect(component.linkedRepresentations()).toEqual([]);
    expect(component.refreshNotice()).toContain('Berechtigungen');
  });

  it('omits a missing snapshot and restores it on a later successful refresh without losing the logical model',()=>{
    const {component,api}=setup();
    const count=component.linkedRepresentations().length;
    api.loadPhysicalSnapshot.mockReturnValueOnce(throwError(()=>new ModelingApiError('not_found',404,'missing')));
    component.refreshWorkspace();
    expect(component.facade.model()?.id).toBe(FALLBACK_LOGICAL_MODEL.id);
    expect(component.linkedRepresentations()).toEqual([]);
    component.refreshWorkspace();expect(component.linkedRepresentations()).toHaveLength(count);
  });

  it('drops an automatic drift preview when its broken mappings disappear',()=>{
    const {component,api,state,secondTable}=setup();
    api.listRepresentations.mockReturnValue(of([{physicalSnapshotId:state.snapshot.id,physicalTableId:state.snapshot.tables[0].id}]));
    state.mappings=state.mappings.map((mapping)=>({...mapping,status:'broken' as const}));
    component.facade.representations.update((items)=>items.map((item)=>item.table.id===secondTable.id?{...item,persisted:false,preview:true}:item));
    component.refreshWorkspace();
    expect(component.facade.representations().some((item)=>item.table.id===secondTable.id&&item.preview)).toBe(true);
    state.mappings=[];component.refreshWorkspace();
    expect(component.facade.representations().some((item)=>item.table.id===secondTable.id)).toBe(false);
  });

  it('ignores a save completed for the previous identity and clears its busy state on identity change',()=>{
    const {component,api,actor}=setup();
    const save=new Subject<{items:{physicalTableId:string}[];mappings:[];removedMappingIds:string[]}>();
    api.saveWorkspaceDraft.mockReturnValue(save);
    component.manageScopes.set([{role:'data_steward',organizationId:FALLBACK_LOGICAL_MODEL.office,descendantOrganizationIds:[FALLBACK_LOGICAL_MODEL.office],breadcrumb:[],delegatedOwnerUserId:null}]);
    component.facade.stageMappingRemoval(FALLBACK_MAPPINGS[0].id);component.saveMappings();
    expect(component.saving()).toBe(true);
    actor.set('christian.spider');TestBed.tick();
    expect(component.saving()).toBe(false);
    finish(save,{items:[],mappings:[],removedMappingIds:[FALLBACK_MAPPINGS[0].id]});
    expect(component.facade.mappings().some((mapping)=>mapping.id===FALLBACK_MAPPINGS[0].id)).toBe(true);
  });
});

interface SelectionRequests {
  model: Subject<ApiResult<LogicalModel>>;
  snapshot: Subject<PhysicalSnapshot>;
  mappings: Subject<readonly AssetMapping[]>;
  drift: Subject<DriftReport | null>;
}

function selectionRequests():SelectionRequests{return{model:new Subject(),snapshot:new Subject(),mappings:new Subject(),drift:new Subject()};}
function finish<T>(request:Subject<T>,value:T):void{request.next(value);request.complete();}

describe('exact mapping suggestions',()=>{
  it('links exact names despite type conflicts and reports manual cases',()=>{
    const base=FALLBACK_LOGICAL_MODEL.fields[0];
    const fields=[
      {...base,id:'logical-name',versionId:'logical-name',name:'NaMe',dataType:'xsd:string'},
      {...base,id:'logical-id',versionId:'logical-id',name:'org_unit_id',dataType:'xsd:integer'},
      {...base,id:'logical-missing',versionId:'logical-missing',name:'unit_label',dataType:'xsd:string'},
      {...base,id:'logical-ambiguous-a',versionId:'logical-ambiguous-a',name:'unit_type',dataType:'xsd:string'},
      {...base,id:'logical-ambiguous-b',versionId:'logical-ambiguous-b',name:'unit_type',dataType:'xsd:string'},
    ];
    const review=exactMappingSuggestions(fields,FALLBACK_PHYSICAL_SNAPSHOT.tables[0]);

    expect(review.suggestions.map((item)=>[item.logicalField.name,item.physicalColumn.name])).toEqual([['NaMe','name'],['org_unit_id','org_unit_id']]);
    expect(review.typeConflicts).toEqual(['org_unit_id: xsd:integer ↔ uuid']);
    expect(review.unmatched).toEqual(['unit_label']);
    expect(review.ambiguous).toEqual(['unit_type']);
    expect(review.suggestions.some((item)=>item.logicalField.name==='unit_label')).toBe(false);
  });
});

describe('MappingWorkspaceComponent request ordering',()=>{
  afterEach(()=>TestBed.resetTestingModule());

  it('keeps the deep-linked model, snapshot and heading on the newest identity response',()=>{
    const identityId=signal('kassandra.valdata');
    const queryParams=new BehaviorSubject(convertToParamMap({logicalModelId:'model-b',physicalSnapshotId:'snapshot-b'}));
    const firstModels=new Subject<readonly LogicalModelSummary[]>();
    const firstSnapshots=new Subject<readonly PhysicalSnapshot[]>();
    const secondModels=new Subject<readonly LogicalModelSummary[]>();
    const secondSnapshots=new Subject<readonly PhysicalSnapshot[]>();
    const first=selectionRequests();
    const second=selectionRequests();
    const modelA:LogicalModel={...FALLBACK_LOGICAL_MODEL,id:'model-a',versionId:'model-a-v1',title:{...FALLBACK_LOGICAL_MODEL.title,de:'Organisationseinheiten'}};
    const modelB:LogicalModel={...FALLBACK_LOGICAL_MODEL,id:'model-b',versionId:'model-b-v1',title:{...FALLBACK_LOGICAL_MODEL.title,de:'Fahrzeugbestand'}};
    const snapshotA:PhysicalSnapshot={...FALLBACK_PHYSICAL_SNAPSHOT,id:'snapshot-a'};
    const snapshotB:PhysicalSnapshot={...FALLBACK_PHYSICAL_SNAPSHOT,id:'snapshot-b'};
    const modelDetails=new Map<string,SelectionRequests>([['model-a',first],['model-b',second]]);
    const snapshotDetails=new Map<string,SelectionRequests>([['snapshot-a',first],['snapshot-b',second]]);
    const api={
      listLogicalModels:vi.fn().mockReturnValueOnce(firstModels.asObservable()).mockReturnValueOnce(secondModels.asObservable()),
      listPhysicalSnapshots:vi.fn().mockReturnValueOnce(firstSnapshots.asObservable()).mockReturnValueOnce(secondSnapshots.asObservable()),
      loadLogicalModel:vi.fn((id:string)=>modelDetails.get(id)!.model.asObservable()),
      loadPhysicalSnapshot:vi.fn((id:string)=>snapshotDetails.get(id)!.snapshot.asObservable()),
      listRepresentations:vi.fn(()=>of([])),
      loadCanvasLayout:vi.fn(()=>of({revision:0,positions:{}})),
      rememberMappingWorkspace:vi.fn(()=>of(undefined)),
      listMappings:vi.fn((id:string)=>modelDetails.get(id)!.mappings.asObservable()),
      loadDrift:vi.fn((id:string)=>snapshotDetails.get(id)!.drift.asObservable()),
    };
    const route={queryParamMap:queryParams.asObservable(),snapshot:{paramMap:convertToParamMap({}),data:{view:'graph'}}};

    TestBed.configureTestingModule({
      imports:[MappingWorkspaceComponent],
      providers:[
        {provide:DataModelsApiService,useValue:api},
        {provide:DemoIdentityService,useValue:{userId:identityId.asReadonly()}},
        {provide:CatalogApiService,useValue:{refreshWorkflowTasks:vi.fn()}},
        {provide:ModelingAssistanceService,useValue:{myScopes:()=>of([])}},
        {provide:ActivatedRoute,useValue:route},
        {provide:Router,useValue:{navigate:vi.fn().mockResolvedValue(true)}},
      ],
    }).overrideComponent(MappingWorkspaceComponent,{set:{imports:[],template:`
      <h1>{{ facade.model()?.title?.de }}</h1>
    `}});

    const fixture=TestBed.createComponent(MappingWorkspaceComponent);
    fixture.detectChanges();
    TestBed.tick();
    expect(api.listLogicalModels).toHaveBeenCalledTimes(1);

    // The default identity cannot list the deep-linked model, so its detail load
    // starts with the first visible option.
    finish(firstModels,[modelA]);
    finish(firstSnapshots,[snapshotA]);
    expect(api.loadLogicalModel).toHaveBeenCalledWith('model-a');

    identityId.set('christian.man');
    TestBed.tick();
    expect(api.listLogicalModels).toHaveBeenCalledTimes(2);
    finish(secondModels,[modelA,modelB]);
    finish(secondSnapshots,[snapshotA,snapshotB]);
    expect(api.loadLogicalModel).toHaveBeenCalledWith('model-b');

    // The newest identity-scoped selection finishes first.
    finish(second.model,{body:modelB,etag:'"1"'});
    finish(second.mappings,[]);
    finish(second.snapshot,snapshotB);
    finish(second.drift,null);
    fixture.detectChanges();
    expect(fixture.componentInstance.facade.model()?.id).toBe('model-b');

    // The previous identity returns later and must not overwrite the selected model or snapshot.
    finish(first.model,{body:modelA,etag:'"1"'});
    finish(first.mappings,[]);
    finish(first.snapshot,snapshotA);
    finish(first.drift,null);
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedModelId()).toBe('model-b');
    expect(fixture.componentInstance.selectedSnapshotId()).toBe('snapshot-b');
    expect(fixture.componentInstance.facade.model()?.id).toBe('model-b');
    expect(fixture.componentInstance.facade.snapshot()?.id).toBe('snapshot-b');
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toContain('Fahrzeugbestand');
  });

  it('keeps every draft and representation local when the atomic save fails',()=>{
    const save=new Subject<{mappings: {clientId:string;mapping:AssetMapping}[]}>();
    const api={listLogicalModels:()=>NEVER,listPhysicalSnapshots:()=>NEVER,saveWorkspaceDraft:vi.fn(()=>save.asObservable()),rememberMappingWorkspace:vi.fn(()=>of(undefined))};
    TestBed.configureTestingModule({imports:[MappingWorkspaceComponent],providers:[
      {provide:DataModelsApiService,useValue:api},
      {provide:DemoIdentityService,useValue:{userId:signal('cinthya.thor')}},
      {provide:CatalogApiService,useValue:{refreshWorkflowTasks:vi.fn()}},
      {provide:ModelingAssistanceService,useValue:{myScopes:()=>of([])}},
      {provide:ActivatedRoute,useValue:{queryParamMap:of(convertToParamMap({})),snapshot:{paramMap:convertToParamMap({}),data:{}}}},
      {provide:Router,useValue:{navigate:vi.fn().mockResolvedValue(true)}},
    ]}).overrideComponent(MappingWorkspaceComponent,{set:{imports:[],template:''}});
    const fixture=TestBed.createComponent(MappingWorkspaceComponent);fixture.detectChanges();
    const component=fixture.componentInstance;
    component.facade.initialize(FALLBACK_LOGICAL_MODEL,null,FALLBACK_MAPPINGS,null);
    component.manageScopes.set([{role:'data_steward',organizationId:FALLBACK_LOGICAL_MODEL.office,descendantOrganizationIds:[FALLBACK_LOGICAL_MODEL.office],breadcrumb:[],delegatedOwnerUserId:null}]);
    const logicalDraft={fields:[{id:FALLBACK_LOGICAL_MODEL.fields[0].rootId,name:'LiveName'}]} as LogicalModelWrite;
    component.facade.previewLogicalDraft(FALLBACK_LOGICAL_MODEL.id,FALLBACK_LOGICAL_MODEL.versionId,logicalDraft);
    component.removeMapping(FALLBACK_MAPPINGS[0].id);
    const table=FALLBACK_PHYSICAL_SNAPSHOT.tables[0];
    component.addRepresentation(FALLBACK_PHYSICAL_SNAPSHOT,table);
    expect(component.facade.pendingRepresentations()).toHaveLength(1);
    const dirty=new Set(component.facade.dirtyIds());
    component.addRepresentation(FALLBACK_PHYSICAL_SNAPSHOT,table);
    expect(component.facade.pendingRepresentations()).toHaveLength(1);
    expect(component.facade.dirtyIds()).toEqual(dirty);
    component.loading.set(false);
    expect(component.draftSaveDisabledReason()).toBeNull();
    component.facade.moveCanvasNode('logical',{x:180,y:120});
    component.saveMappings();
    expect(component.draftSaveDisabledReason()).toContain('gerade gespeichert');
    expect(api.saveWorkspaceDraft).toHaveBeenCalledOnce();
    expect(api.saveWorkspaceDraft).toHaveBeenCalledWith(FALLBACK_LOGICAL_MODEL,expect.any(Array),expect.any(Array),logicalDraft,[FALLBACK_MAPPINGS[0]],{revision:0,positions:{logical:{x:180,y:120}}});
    save.error(new Error('Versionskonflikt'));
    expect(component.error()).toContain('keine Änderungen');
    expect(component.draftSaveDisabledReason()).toBeNull();
    expect(component.facade.dirtyIds()).toEqual(dirty);
    expect(component.facade.pendingRepresentations()).toHaveLength(1);
    expect(component.facade.pendingRemovals()).toEqual([FALLBACK_MAPPINGS[0]]);
    expect(component.facade.logicalDraft()).toBe(logicalDraft);
    expect(component.facade.logicalFields()[0].name).toBe('LiveName');
    expect(component.facade.canvasNodePositions().get('logical')).toEqual({x:180,y:120});
    expect(component.facade.canvasDirty()).toBe(true);
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
    expect(component.canDeactivate()).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();confirm.mockRestore();
  });
  it('explains the active save blocker and prevents unauthorized draft saves',()=>{
    const api={listLogicalModels:()=>NEVER,listPhysicalSnapshots:()=>NEVER,saveWorkspaceDraft:vi.fn(),rememberMappingWorkspace:vi.fn(()=>of(undefined))};
    TestBed.configureTestingModule({imports:[MappingWorkspaceComponent],providers:[
      {provide:DataModelsApiService,useValue:api},
      {provide:DemoIdentityService,useValue:{userId:signal('cinthya.thor')}},
      {provide:CatalogApiService,useValue:{refreshWorkflowTasks:vi.fn()}},
      {provide:ModelingAssistanceService,useValue:{myScopes:()=>of([])}},
      {provide:ActivatedRoute,useValue:{queryParamMap:of(convertToParamMap({})),snapshot:{paramMap:convertToParamMap({}),data:{}}}},
      {provide:Router,useValue:{navigate:vi.fn().mockResolvedValue(true)}},
    ]}).overrideComponent(MappingWorkspaceComponent,{set:{imports:[],template:''}});
    const fixture=TestBed.createComponent(MappingWorkspaceComponent);fixture.detectChanges();
    const component=fixture.componentInstance;
    component.facade.initialize(FALLBACK_LOGICAL_MODEL,null,[],null);
    component.manageScopes.set([{role:'data_steward',organizationId:FALLBACK_LOGICAL_MODEL.office,descendantOrganizationIds:[FALLBACK_LOGICAL_MODEL.office],breadcrumb:[],delegatedOwnerUserId:null}]);
    expect(component.draftSaveDisabledReason()).toContain('noch geladen');
    component.loading.set(false);
    expect(component.draftSaveDisabledReason()).toContain('Keine ungespeicherten Änderungen');
    component.facade.initialize(FALLBACK_LOGICAL_MODEL,null,FALLBACK_MAPPINGS,null);
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
    component.removeMapping(FALLBACK_MAPPINGS[0].id);
    expect(confirm).not.toHaveBeenCalled();expect(api.saveWorkspaceDraft).not.toHaveBeenCalled();
    expect(component.facade.pendingRemovals()).toEqual([FALLBACK_MAPPINGS[0]]);
    expect(component.draftSaveDisabledReason()).toBeNull();confirm.mockRestore();
    component.addRepresentation(FALLBACK_PHYSICAL_SNAPSHOT,FALLBACK_PHYSICAL_SNAPSHOT.tables[0]);
    expect(component.draftSaveDisabledReason()).toBeNull();
    component.manageScopes.set([]);
    expect(component.draftSaveDisabledReason()).toContain('Data Owner oder Data Steward');
    component.saveMappings();
    expect(api.saveWorkspaceDraft).not.toHaveBeenCalled();
    component.fallbackActive.set(true);
    expect(component.draftSaveDisabledReason()).toContain('API-Verbindung');
    component.fallbackActive.set(false);
    component.facade.initialize({...FALLBACK_LOGICAL_MODEL,status:'review_pending'},null,[],null);
    expect(component.draftSaveDisabledReason()).toContain('Domänenprüfung');
    component.facade.initialize({...FALLBACK_LOGICAL_MODEL,status:'retired'},null,[],null);
    expect(component.draftSaveDisabledReason()).toContain('stillgelegt');
    component.saveReasonOpen.set(true);
    const escape=new KeyboardEvent('keydown',{key:'Escape',cancelable:true});
    component.dismissSaveReason(escape);
    expect(component.saveReasonOpen()).toBe(false);
    expect(escape.defaultPrevented).toBe(true);
  });
  it('opens the editor fullscreen, exits with Escape and restores scrolling on destruction',async()=>{
    TestBed.configureTestingModule({imports:[MappingWorkspaceComponent],providers:[
      {provide:DataModelsApiService,useValue:{listLogicalModels:()=>NEVER,listPhysicalSnapshots:()=>NEVER}},
      {provide:DemoIdentityService,useValue:{userId:signal('cinthya.thor')}},
      {provide:CatalogApiService,useValue:{refreshWorkflowTasks:vi.fn()}},
      {provide:ModelingAssistanceService,useValue:{myScopes:()=>of([])}},
      {provide:ActivatedRoute,useValue:{queryParamMap:of(convertToParamMap({})),snapshot:{paramMap:convertToParamMap({}),data:{}}}},
      {provide:Router,useValue:{navigate:vi.fn().mockResolvedValue(true)}},
    ]}).overrideComponent(MappingWorkspaceComponent,{set:{imports:[],template:'<section class="mapping-shell"><button class="fullscreen-toggle">Vollbild</button></section>'}});
    const fixture=TestBed.createComponent(MappingWorkspaceComponent);fixture.detectChanges();
    const component=fixture.componentInstance;
    const button=(fixture.nativeElement as HTMLElement).querySelector('button')!;
    const originalOverflow=document.body.style.overflow;
    document.body.style.overflow='scroll';
    try{
      await component.toggleFullscreen(button);fixture.detectChanges();
      expect(component.fullscreen()).toBe(true);
      expect(document.body.style.overflow).toBe('hidden');
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
      await Promise.resolve();fixture.detectChanges();
      expect(component.fullscreen()).toBe(false);
      expect(document.body.style.overflow).toBe('scroll');
      await component.toggleFullscreen(button);
      fixture.destroy();
      expect(document.body.style.overflow).toBe('scroll');
    }finally{document.body.style.overflow=originalOverflow;}
  });

});
