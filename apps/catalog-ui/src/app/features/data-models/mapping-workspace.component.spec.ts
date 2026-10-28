import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject, NEVER, of, Subject } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DataModelsApiService } from './data-models-api.service';
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
    const api={listLogicalModels:()=>NEVER,listPhysicalSnapshots:()=>NEVER,saveWorkspaceDraft:vi.fn(()=>save.asObservable())};
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
    const api={listLogicalModels:()=>NEVER,listPhysicalSnapshots:()=>NEVER,saveWorkspaceDraft:vi.fn()};
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
