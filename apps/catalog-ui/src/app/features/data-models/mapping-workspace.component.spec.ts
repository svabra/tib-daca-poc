import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject, NEVER, Subject } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService } from './data-models-api.service';
import { ApiResult, AssetMapping, DriftReport, LogicalModel, LogicalModelSummary, PhysicalSnapshot } from './data-models.models';
import { FALLBACK_LOGICAL_MODEL, FALLBACK_PHYSICAL_SNAPSHOT } from './mapping-fallback';
import { MappingWorkspaceComponent } from './mapping-workspace.component';

vi.mock('@bit-daca/design-system',async()=>{
  const {Component}=await import('@angular/core');
  class StatusBadgeStub{}
  Component({selector:'daca-status-badge',standalone:true,template:'<ng-content />',inputs:['tone']})(StatusBadgeStub);
  return{StatusBadgeComponent:StatusBadgeStub};
});

interface SelectionRequests {
  model: Subject<ApiResult<LogicalModel>>;
  snapshot: Subject<PhysicalSnapshot>;
  mappings: Subject<readonly AssetMapping[]>;
  drift: Subject<DriftReport | null>;
}

function selectionRequests():SelectionRequests{return{model:new Subject(),snapshot:new Subject(),mappings:new Subject(),drift:new Subject()};}
function finish<T>(request:Subject<T>,value:T):void{request.next(value);request.complete();}

describe('MappingWorkspaceComponent request ordering',()=>{
  afterEach(()=>TestBed.resetTestingModule());

  it('keeps the deep-link selects and heading facade on the newest identity response',()=>{
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
      listMappings:vi.fn((id:string)=>modelDetails.get(id)!.mappings.asObservable()),
      loadDrift:vi.fn((id:string)=>snapshotDetails.get(id)!.drift.asObservable()),
    };
    const route={queryParamMap:queryParams.asObservable(),snapshot:{paramMap:convertToParamMap({}),data:{view:'graph'}}};

    TestBed.configureTestingModule({
      imports:[MappingWorkspaceComponent],
      providers:[
        {provide:DataModelsApiService,useValue:api},
        {provide:DemoIdentityService,useValue:{userId:identityId.asReadonly()}},
        {provide:ActivatedRoute,useValue:route},
        {provide:Router,useValue:{navigate:vi.fn().mockResolvedValue(true)}},
      ],
    }).overrideComponent(MappingWorkspaceComponent,{set:{imports:[],template:`
      <h1>{{ facade.model()?.title?.de }}</h1>
      <select aria-label="Logisches Modell" [value]="selectedModelId()">@for (model of modelOptions(); track model.id) {<option [value]="model.id" [selected]="model.id===selectedModelId()">{{ model.id }}</option>}</select>
      <select aria-label="Physischer Snapshot" [value]="selectedSnapshotId()">@for (snapshot of snapshotOptions(); track snapshot.id) {<option [value]="snapshot.id" [selected]="snapshot.id===selectedSnapshotId()">{{ snapshot.id }}</option>}</select>
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
    finish(second.snapshot,snapshotB);
    finish(second.mappings,[]);
    finish(second.drift,null);
    fixture.detectChanges();
    expect(fixture.componentInstance.facade.model()?.id).toBe('model-b');

    // The previous identity returns later and must not overwrite model or selects.
    finish(first.model,{body:modelA,etag:'"1"'});
    finish(first.snapshot,snapshotA);
    finish(first.mappings,[]);
    finish(first.drift,null);
    fixture.detectChanges();

    const selects=(fixture.nativeElement as HTMLElement).querySelectorAll('select');
    expect(selects[0].value).toBe('model-b');
    expect(selects[1].value).toBe('snapshot-b');
    expect(fixture.componentInstance.selectedModelId()).toBe('model-b');
    expect(fixture.componentInstance.selectedSnapshotId()).toBe('snapshot-b');
    expect(fixture.componentInstance.facade.model()?.id).toBe('model-b');
    expect(fixture.componentInstance.facade.snapshot()?.id).toBe('snapshot-b');
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toContain('Fahrzeugbestand');
  });

  it('reconciles each successful mapping write before a later write fails',()=>{
    const identityId=signal('cinthya.thor');
    const firstSave=new Subject<ApiResult<AssetMapping>>();
    const secondSave=new Subject<ApiResult<AssetMapping>>();
    const api={
      listLogicalModels:vi.fn(()=>NEVER),listPhysicalSnapshots:vi.fn(()=>NEVER),
      createMapping:vi.fn().mockReturnValueOnce(firstSave.asObservable()).mockReturnValueOnce(secondSave.asObservable()),
    };
    const route={queryParamMap:new BehaviorSubject(convertToParamMap({})),snapshot:{paramMap:convertToParamMap({}),data:{view:'graph'}}};
    TestBed.configureTestingModule({
      imports:[MappingWorkspaceComponent],
      providers:[
        {provide:DataModelsApiService,useValue:api},
        {provide:DemoIdentityService,useValue:{userId:identityId.asReadonly()}},
        {provide:ActivatedRoute,useValue:route},
        {provide:Router,useValue:{navigate:vi.fn().mockResolvedValue(true)}},
      ],
    }).overrideComponent(MappingWorkspaceComponent,{set:{imports:[],template:''}});
    const fixture=TestBed.createComponent(MappingWorkspaceComponent);fixture.detectChanges();
    const component=fixture.componentInstance;const fieldId=FALLBACK_LOGICAL_MODEL.fields[0].id;const columnId=FALLBACK_PHYSICAL_SNAPSHOT.tables[0].columns[0].id;
    component.facade.initialize(FALLBACK_LOGICAL_MODEL,FALLBACK_PHYSICAL_SNAPSHOT,[],null);
    const baseWrite={logicalModelVersionId:FALLBACK_LOGICAL_MODEL.versionId,logicalFieldVersionIds:[fieldId],physicalSnapshotId:FALLBACK_PHYSICAL_SNAPSHOT.id,physicalColumnIds:[columnId],mappingType:'Direct' as const,classification:'internal' as const,transformationRule:null,comment:null,responsibleUserId:'cinthya.thor',validFrom:'2026-09-08',validTo:null};
    const firstLocal=component.facade.upsertDraft({...baseWrite,comment:'first'});
    const secondLocal=component.facade.upsertDraft({...baseWrite,comment:'second'});

    component.saveMappings();
    expect(api.createMapping).toHaveBeenCalledTimes(1);
    const firstPersisted={...firstLocal,id:'mapping-first',versionId:'mapping-first-v1',lockVersion:1};
    finish(firstSave,{body:firstPersisted,etag:'"1"'});
    expect(api.createMapping).toHaveBeenCalledTimes(2);
    expect(component.facade.mappings().some((mapping)=>mapping.id===firstPersisted.id)).toBe(true);
    expect(component.facade.dirtyIds().has(firstLocal.id)).toBe(false);
    expect(component.facade.dirtyIds().has(secondLocal.id)).toBe(true);

    secondSave.error(new Error('Zweiter Entwurf kollidiert.'));
    expect(component.saving()).toBe(false);
    expect(component.error()).toContain('1 Entwurf/Entwürfe wurden bereits gespeichert');
    expect(component.facade.dirtyIds()).toEqual(new Set([secondLocal.id]));
  });
});
