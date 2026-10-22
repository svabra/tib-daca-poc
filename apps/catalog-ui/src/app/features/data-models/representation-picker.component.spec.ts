import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { RepresentationPickerComponent } from './representation-picker.component';
import { DataModelsApiService } from './data-models-api.service';
import { PhysicalSnapshot, PhysicalSource } from './data-models.models';
import { FALLBACK_LOGICAL_MODEL, FALLBACK_PHYSICAL_SNAPSHOT } from './mapping-fallback';

describe('representation picker',()=>{
  afterEach(()=>TestBed.resetTestingModule());
  it('blocks foreign scopes, ignores stale source responses and adds only on explicit action',()=>{
    const first=new Subject<PhysicalSnapshot>(),second=new Subject<PhysicalSnapshot>();
    const base:PhysicalSource={id:'pg',revision:1,name:'PG demo',connectorType:'postgresql',systemName:'PG',databaseName:'demo',department:FALLBACK_LOGICAL_MODEL.department,office:FALLBACK_LOGICAL_MODEL.office,latestSnapshotId:'pg-snapshot',latestSnapshotSequence:1,latestSnapshot:null,catalogPath:'postgresql://demo/',ownerName:'Owner',updatedAt:''};
    const s3={...base,id:'s3',name:'S3 demo',connectorType:'s3' as const,latestSnapshotId:'s3-snapshot'};
    const foreign={...base,id:'foreign',office:'foreign'};
    TestBed.configureTestingModule({imports:[RepresentationPickerComponent],providers:[{provide:DataModelsApiService,useValue:{listPhysicalSources:()=>of([base,s3,foreign]),loadPhysicalSnapshot:(id:string)=>id==='pg-snapshot'?first:second}}]});
    Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});
    const fixture=TestBed.createComponent(RepresentationPickerComponent);fixture.componentRef.setInput('model',FALLBACK_LOGICAL_MODEL);fixture.detectChanges();
    const component=fixture.componentInstance,add=vi.fn(),close=vi.fn();component.added.subscribe(add);component.closed.subscribe(close);
    expect(component.canAttach(foreign)).toBe(false);
    component.selectSource(base);component.selectSource(s3);
    const snapshot={...FALLBACK_PHYSICAL_SNAPSHOT,id:'s3-snapshot',sourceType:'s3' as const};
    second.next(snapshot);second.complete();first.next(FALLBACK_PHYSICAL_SNAPSHOT);first.complete();
    expect(component.snapshot()?.id).toBe('s3-snapshot');
    component.selectedTable.set(snapshot.tables[0]);fixture.detectChanges();
    expect(add).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.object-detail')).not.toBeNull();
    component.cancel(new Event('cancel',{cancelable:true}));expect(close).toHaveBeenCalledOnce();expect(add).not.toHaveBeenCalled();
    component.attach();expect(add).toHaveBeenCalledWith({snapshot,table:snapshot.tables[0]});
  });
  it('uses model-specific server permissions for inventories across organizations',()=>{
    const inventory:PhysicalSource={id:'csv',revision:1,name:'Gebäude',connectorType:'csv',systemName:'Strukturinventar',databaseName:'SAP',department:'VBS',office:'armasuisse-immobilien',latestSnapshotId:'csv-snapshot',latestSnapshotSequence:1,latestSnapshot:null,catalogPath:'urn:daca:physical-source:csv',ownerName:'Owner',updatedAt:'',representationAttachable:true};
    const denied={...inventory,id:'denied',representationAttachable:false,representationDisabledReason:'Keine Modellierungsberechtigung für die Organisation dieser Quelle.'};
    const api={listPhysicalSources:vi.fn(()=>of([inventory,denied])),loadPhysicalSnapshot:vi.fn(()=>of({...FALLBACK_PHYSICAL_SNAPSHOT,id:'csv-snapshot',sourceType:'csv' as const}))};
    TestBed.configureTestingModule({imports:[RepresentationPickerComponent],providers:[{provide:DataModelsApiService,useValue:api}]});
    Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});
    const fixture=TestBed.createComponent(RepresentationPickerComponent);fixture.componentRef.setInput('model',FALLBACK_LOGICAL_MODEL);fixture.detectChanges();
    const component=fixture.componentInstance;
    expect(api.listPhysicalSources).toHaveBeenCalledWith(false,FALLBACK_LOGICAL_MODEL.id);
    expect(component.canAttach(inventory)).toBe(true);expect(component.canAttach(denied)).toBe(false);
    expect(component.disabledReason(denied)).toContain('Keine Modellierungsberechtigung');
    component.selectSource(denied);expect(api.loadPhysicalSnapshot).not.toHaveBeenCalled();
    component.selectSource(inventory);expect(component.snapshot()?.id).toBe('csv-snapshot');
    component.selectedTable.set(component.snapshot()!.tables[0]);
    const added=vi.fn();component.added.subscribe(added);component.attach();
    expect(added).toHaveBeenCalledWith({snapshot:component.snapshot(),table:component.snapshot()!.tables[0]});
  });
});
