import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService } from './data-models-api.service';
import { LogicalModelSummary, PhysicalSnapshot, RecentMappingWorkspace } from './data-models.models';
import { FALLBACK_LOGICAL_MODEL, FALLBACK_PHYSICAL_SNAPSHOT } from './mapping-fallback';
import { MappingStartComponent } from './mapping-start.component';

describe('Mapping workspace immediate entry',()=>{
  beforeEach(()=>Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}}));
  afterEach(()=>TestBed.resetTestingModule());
  function setup(params:Record<string,string>={},options:{historyFails?:boolean;physicalRoute?:boolean;models?:Subject<readonly LogicalModelSummary[]>;history?:Subject<readonly RecentMappingWorkspace[]>;snapshot?:Subject<PhysicalSnapshot>}={}){
    const actor=signal('christian.man'),canEdit=signal(true);
    const path=new BehaviorSubject(convertToParamMap(options.physicalRoute?{snapshotId:FALLBACK_PHYSICAL_SNAPSHOT.id,tableId:FALLBACK_PHYSICAL_SNAPSHOT.tables[0].id}:{}));
    const recent:RecentMappingWorkspace[]=Array.from({length:7},(_,index)=>({logicalModelId:'model-'+index,title:{de:'Arbeit '+index},physicalSnapshotId:'snapshot-'+index,physicalTableId:'table-'+index,physicalLabel:'Quelle '+index,view:'table',visitedAt:'2026-10-30T13:00:00Z'}));
    const api={
      listLogicalModels:vi.fn(()=>options.models??of([FALLBACK_LOGICAL_MODEL])),
      recentMappingWorkspaces:vi.fn(()=>options.history??(options.historyFails?throwError(()=>new Error('offline')):of(recent))),
      listPhysicalSources:vi.fn(()=>of([{id:FALLBACK_PHYSICAL_SNAPSHOT.sourceId,representationAttachable:true}])),
      loadPhysicalSnapshot:vi.fn(()=>options.snapshot??of(FALLBACK_PHYSICAL_SNAPSHOT)),
    };
    TestBed.configureTestingModule({imports:[MappingStartComponent],providers:[provideRouter([]),
      {provide:DataModelsApiService,useValue:api},{provide:DemoIdentityService,useValue:{userId:actor,canEditModels:canEdit}},
      {provide:CatalogI18nService,useValue:{language:signal('de'),t:(key:string)=>key}},
      {provide:ActivatedRoute,useValue:{paramMap:path,snapshot:{paramMap:path.value,queryParamMap:convertToParamMap(params),queryParams:params}}},
    ]});
    const navigate=vi.spyOn(TestBed.inject(Router),'navigate').mockResolvedValue(true);
    const fixture=TestBed.createComponent(MappingStartComponent);fixture.detectChanges();
    return{fixture,component:fixture.componentInstance,actor,api,navigate,recent,path,canEdit};
  }
  it('offers both entry points and compact recent work without a redundant open button',()=>{
    const {component,fixture,navigate}=setup();
    expect(component.selectedModel()).toBeNull();expect(component.physical()).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.mapping-start-choice')).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('.mapping-start-recent li')).toHaveLength(5);
    expect(fixture.nativeElement.querySelector('.mapping-start-action button')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();component.showAllRecent.set(true);fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.mapping-start-recent li')).toHaveLength(7);
  });
  it('shows the small spinner until logical models arrive, independently of history',()=>{
    const models=new Subject<readonly LogicalModelSummary[]>(),history=new Subject<readonly RecentMappingWorkspace[]>();
    const {component,fixture}=setup({}, {models,history});
    expect(fixture.nativeElement.querySelector('.mapping-start-action .small-spinner')?.getAttribute('aria-hidden')).toBe('true');
    expect(fixture.nativeElement.querySelector('.mapping-start-choice:first-child button').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.mapping-start-choice:nth-child(2) button').disabled).toBe(false);
    models.next([FALLBACK_LOGICAL_MODEL]);models.complete();fixture.detectChanges();
    expect(component.loading()).toBe(false);expect(component.historyLoading()).toBe(true);
    expect(fixture.nativeElement.querySelector('.mapping-start-action .small-spinner')).toBeNull();
    expect(fixture.nativeElement.querySelector('.mapping-start-choice:first-child button').disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('.mapping-start-recent .small-spinner')).not.toBeNull();
  });
  it('opens a logical model immediately on selection and ignores duplicate activation',()=>{
    const {component,navigate}=setup();component.chooseModel(FALLBACK_LOGICAL_MODEL);component.chooseModel(FALLBACK_LOGICAL_MODEL);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/models',FALLBACK_LOGICAL_MODEL.id,'mappings'],{queryParams:{}});
  });
  it('removes a physical-only domain after API confirmation and ignores a result from the previous identity',()=>{
    const snapshots=new Subject<PhysicalSnapshot>();
    const {component,fixture,api,actor}=setup({}, {physicalRoute:true,snapshot:snapshots});
    const table={...FALLBACK_PHYSICAL_SNAPSHOT.tables[0],domainVersion:'1'.repeat(64),dataDomains:[{id:'domain',displayName:'Personal',lifecycle:'active' as const}]};
    snapshots.next({...FALLBACK_PHYSICAL_SNAPSHOT,tables:[table]});fixture.detectChanges();
    const pending=new Subject<import('./data-models.models').PhysicalDomainState>();
    const remove=vi.fn(()=>pending.asObservable());Object.assign(api,{removePhysicalDomain:remove});
    component.removePhysicalDomain(table.id,'domain');
    expect(component.physical()?.table.dataDomains).toHaveLength(1);
    pending.next({dataDomains:[],domainVersion:'2'.repeat(64)});
    expect(component.physical()?.table.dataDomains).toEqual([]);
    expect(component.facade.representations()[0].table.dataDomains).toEqual([]);
    snapshots.next({...FALLBACK_PHYSICAL_SNAPSHOT,tables:[table]});fixture.detectChanges();
    component.removePhysicalDomain(table.id,'domain');
    actor.set('other');fixture.detectChanges();
    pending.next({dataDomains:[],domainVersion:'3'.repeat(64)});
    expect(component.physical()).toBeNull();
  });
  it('opens the physical workspace immediately without selecting or creating a logical model',()=>{
    const {component,navigate}=setup(),snapshot=FALLBACK_PHYSICAL_SNAPSHOT,table=snapshot.tables[0];
    component.choosePhysical({snapshot,table});
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/mappings/physical',snapshot.id,table.id]);
    expect(component.selectedModel()).toBeNull();
  });
  it('shows the physical canvas first and opens a selected logical counterpart automatically',()=>{
    const {component,fixture,navigate,api}=setup({}, {physicalRoute:true}),snapshot=FALLBACK_PHYSICAL_SNAPSHOT,table=snapshot.tables[0];
    expect(component.facade.model()).toBeNull();expect(component.facade.mappings()).toEqual([]);
    expect(component.facade.visibleRepresentations().map(item=>item.table.id)).toEqual([table.id]);
    expect(fixture.nativeElement.querySelector('.physical-representation')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.logical-placeholder')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.canvas-save-hint')).toBeNull();
    component.chooseModel(FALLBACK_LOGICAL_MODEL);
    expect(api.listPhysicalSources).toHaveBeenCalledWith(false,FALLBACK_LOGICAL_MODEL.id);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/models',FALLBACK_LOGICAL_MODEL.id,'mappings'],{queryParams:{physicalSnapshotId:snapshot.id,physicalTableId:table.id,addRepresentation:'1'}});
  });

  it('opens the complete new-model editor with the exact physical origin without creating data',()=>{
    const {component,fixture,navigate}=setup({}, {physicalRoute:true});
    const derive=fixture.nativeElement.querySelector('.derive-logical') as HTMLButtonElement;
    expect(derive).not.toBeNull();derive.click();fixture.detectChanges();component.deriveLogical();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/models/new'],{queryParams:{physicalSnapshotId:FALLBACK_PHYSICAL_SNAPSHOT.id,physicalTableId:FALLBACK_PHYSICAL_SNAPSHOT.tables[0].id}});
    expect(component.facade.model()).toBeNull();expect(component.facade.mappings()).toEqual([]);
  });
  it('keeps counterpart selection in the physical workspace and exposes derivation in both context menus',()=>{
    const {fixture,component,navigate}=setup({}, {physicalRoute:true});const root=fixture.nativeElement as HTMLElement;
    root.querySelector('.graph-canvas')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));fixture.detectChanges();
    let menu=root.querySelector('.canvas-context-menu')!;
    expect(menu.textContent).toContain('mappingDeriveLogical');expect(menu.textContent).not.toContain('Term suchen');expect(menu.textContent).not.toContain('Dom\u00e4ne suchen');
    [...menu.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='mappingStartChooseLogical')!.click();fixture.detectChanges();
    expect(component.logicalOpen()).toBe(true);expect(navigate).not.toHaveBeenCalled();component.closeLogical();
    root.querySelector('.physical-representation')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));fixture.detectChanges();
    menu=root.querySelector('.representation-context-menu')!;
    [...menu.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='mappingDeriveLogical')!.click();
    expect(navigate).toHaveBeenCalledWith(['/models/new'],expect.objectContaining({queryParams:{physicalSnapshotId:FALLBACK_PHYSICAL_SNAPSHOT.id,physicalTableId:FALLBACK_PHYSICAL_SNAPSHOT.tables[0].id}}));
  });
  it('hides derivation for readers and rejects an obsolete physical selection',()=>{
    const {component,fixture,canEdit,navigate}=setup({}, {physicalRoute:true});
    component.deriveLogical('another-table');expect(navigate).not.toHaveBeenCalled();
    canEdit.set(false);fixture.detectChanges();component.deriveLogical();expect(navigate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.derive-logical')).toBeNull();
  });
  it('shows a spinner while physical details load and never substitutes another object',()=>{
    const snapshot=new Subject<PhysicalSnapshot>();const {fixture,component}=setup({}, {physicalRoute:true,snapshot});
    expect(component.physicalLoading()).toBe(true);expect(fixture.nativeElement.querySelector('.mapping-start-action .small-spinner')).not.toBeNull();
    snapshot.next({...FALLBACK_PHYSICAL_SNAPSHOT,tables:[]});snapshot.complete();fixture.detectChanges();
    expect(component.physicalLoading()).toBe(false);expect(component.error()).toBe('mappingStartPhysicalMissing');
    expect(fixture.nativeElement.querySelector('.physical-representation')).toBeNull();
  });
  it('restores recent context and preserves legacy logical and physical deep links',()=>{
    const first=setup();expect(first.component.recentParams(first.recent[0])).toEqual({physicalSnapshotId:'snapshot-0',physicalTableId:'table-0',view:'table',addRepresentation:'1'});
    TestBed.resetTestingModule();const second=setup({logicalModelId:'model',physicalSnapshotId:'snapshot',view:'drift'});
    expect(second.navigate).toHaveBeenCalledWith(['/models','model','mappings'],{queryParams:{logicalModelId:null,physicalSnapshotId:'snapshot',view:'drift'},replaceUrl:true});
    expect(second.api.listLogicalModels).not.toHaveBeenCalled();
    TestBed.resetTestingModule();const third=setup({physicalSnapshotId:'snapshot',physicalTableId:'table'});
    expect(third.navigate).toHaveBeenCalledWith(['/mappings/physical','snapshot','table'],{replaceUrl:true});
  });
  it('blocks an incompatible counterpart and ignores a previous identity permission check',()=>{
    const {component,api,navigate,actor,fixture}=setup({}, {physicalRoute:true});
    const pending=new Subject<{id:string;representationAttachable:boolean}[]>();
    api.listPhysicalSources.mockReturnValueOnce(pending);component.chooseModel(FALLBACK_LOGICAL_MODEL);
    expect(component.checking()).toBe(true);actor.set('cinthya.thor');fixture.detectChanges();pending.next([]);pending.complete();
    expect(navigate).not.toHaveBeenCalled();
    api.listPhysicalSources.mockReturnValueOnce(of([]));component.chooseModel(FALLBACK_LOGICAL_MODEL);
    expect(component.selectionNotice()).toBe('mappingStartIncompatible');expect(navigate).not.toHaveBeenCalled();
  });
  it('keeps model opening available when personal history fails',()=>{
    const {component,navigate}=setup({}, {historyFails:true});expect(component.historyError()).toBe(true);
    component.chooseModel(FALLBACK_LOGICAL_MODEL);expect(navigate).toHaveBeenCalledTimes(1);
  });
  it('offers explicit objects for snapshot-only links',()=>{
    const {component}=setup({physicalSnapshotId:FALLBACK_PHYSICAL_SNAPSHOT.id});
    expect(component.initialPhysicalSnapshot()?.id).toBe(FALLBACK_PHYSICAL_SNAPSHOT.id);
    expect(component.physicalOpen()).toBe(true);expect(component.selectedModel()).toBeNull();
  });
});
