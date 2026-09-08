import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService, DemoUser } from '../../core/demo-identity.service';
import { I14yConceptsApiService } from '../domains/i14y-concepts-api.service';
import { DataModelsApiService } from './data-models-api.service';
import { LogicalDerivationPreview } from './data-models.models';
import { FALLBACK_LOGICAL_MODEL, FALLBACK_PHYSICAL_SNAPSHOT } from './mapping-fallback';
import { PhysicalAssetsComponent } from './physical-assets.component';

@Component({standalone:true,template:''})
class EmptyRouteComponent {}

describe('PhysicalAssetsComponent derivation dialog',()=>{
  const steward:DemoUser={id:'cinthya.thor',displayName:'Cinthya Thor',organization:'Verteidigung',department:'VBS',office:'vbs-verteidigung',email:'cinthya.thor@vtg.admin.ch',phone:null,avatarUrl:null,roles:['data_consumer'],primaryModelingRole:'data_steward'};
  const owner:DemoUser={...steward,id:'christian.spider',displayName:'Christian Spider',primaryModelingRole:'data_owner'};
  let api:{[key:string]:ReturnType<typeof vi.fn>};

  beforeEach(()=>{
    const preview:LogicalDerivationPreview={tableId:FALLBACK_PHYSICAL_SNAPSHOT.tables[0].id,snapshotId:FALLBACK_PHYSICAL_SNAPSHOT.id,fields:[{physicalColumnId:'column-org-id',name:'org_unit_id',dataType:'uuid',length:null,precision:null,scale:null,nullable:false,minCount:1,maxCount:1,classification:'internal',conceptIds:[],primaryConceptId:null,conceptMatchExplicitlyNone:false,selected:true}]};
    api={listPhysicalSources:vi.fn(()=>of([])),listPhysicalSnapshots:vi.fn(()=>of([])),loadPhysicalSnapshot:vi.fn(),previewLogicalModelDerivation:vi.fn(()=>of(preview)),deriveLogicalModel:vi.fn(()=>of({body:FALLBACK_LOGICAL_MODEL,etag:'"1"'}))};
    TestBed.configureTestingModule({imports:[PhysicalAssetsComponent],providers:[provideRouter([{path:'models/:id',component:EmptyRouteComponent}]),
      {provide:DemoIdentityService,useValue:{user:signal(steward).asReadonly(),userId:signal(steward.id).asReadonly(),users:signal([steward,owner]).asReadonly(),modelingRoles:(user:DemoUser)=>[user.primaryModelingRole].filter(Boolean)}},
      {provide:CatalogApiService,useValue:{domains:signal([{id:'domain-personal',preferredLabel:'Personal'}]).asReadonly(),loadDomains:()=>of([])}},
      {provide:I14yConceptsApiService,useValue:{search:()=>of({items:[],total:0})}},
      {provide:DataModelsApiService,useValue:api},
    ]});
  });
  afterEach(()=>{TestBed.resetTestingModule();document.body.querySelector('#derive-return')?.remove();});

  it('opens as a native modal, closes on Escape and restores focus',async()=>{
    const fixture=TestBed.createComponent(PhysicalAssetsComponent);fixture.detectChanges();
    const component=fixture.componentInstance;const dialog=(fixture.nativeElement as HTMLElement).querySelector('dialog')!;
    const showModal=vi.fn(()=>dialog.setAttribute('open',''));const close=vi.fn(()=>dialog.removeAttribute('open'));
    Object.defineProperty(dialog,'showModal',{configurable:true,value:showModal});Object.defineProperty(dialog,'close',{configurable:true,value:close});
    const returnButton=document.createElement('button');returnButton.id='derive-return';document.body.append(returnButton);const focus=vi.spyOn(returnButton,'focus');
    component.openDerive(FALLBACK_PHYSICAL_SNAPSHOT,FALLBACK_PHYSICAL_SNAPSHOT.tables[0],{currentTarget:returnButton} as unknown as Event);
    await Promise.resolve();fixture.detectChanges();expect(showModal).toHaveBeenCalledOnce();expect(dialog.open).toBe(true);
    dialog.dispatchEvent(new Event('cancel',{cancelable:true}));await Promise.resolve();
    expect(close).toHaveBeenCalledOnce();expect(component.deriveSelection()).toBeNull();expect(focus).toHaveBeenCalledOnce();
  });

  it('requires an explicit concept decision and sends an explicit no-match contract',async()=>{
    const fixture=TestBed.createComponent(PhysicalAssetsComponent);fixture.detectChanges();const component=fixture.componentInstance;
    const dialog=(fixture.nativeElement as HTMLElement).querySelector('dialog')!;Object.defineProperty(dialog,'showModal',{configurable:true,value:vi.fn(()=>dialog.setAttribute('open',''))});Object.defineProperty(dialog,'close',{configurable:true,value:vi.fn(()=>dialog.removeAttribute('open'))});
    const button=document.createElement('button');component.openDerive(FALLBACK_PHYSICAL_SNAPSHOT,FALLBACK_PHYSICAL_SNAPSHOT.tables[0],{currentTarget:button} as unknown as Event);await Promise.resolve();
    component.deriveForm.controls.dataDomainId.setValue('domain-personal');component.previewDerivation();fixture.detectChanges();
    expect(component.previewFields.at(0).controls.conceptMode.value).toBe('unresolved');expect(component.previewFieldsValid()).toBe(false);
    component.setConceptMode(0,'none');expect(component.previewFieldsValid()).toBe(true);component.derive();
    const body=api['deriveLogicalModel'].mock.calls[0][1] as {fields:Array<Record<string,unknown>>};
    expect(body.fields[0]).toEqual(expect.objectContaining({conceptIds:[],primaryConceptId:null,conceptMatchExplicitlyNone:true}));
    expect('conceptMode' in body.fields[0]).toBe(false);
  });

  it('searches PostgreSQL and S3 physical models by model and field names',()=>{
    const fixture=TestBed.createComponent(PhysicalAssetsComponent);fixture.detectChanges();const component=fixture.componentInstance;
    component.snapshots.set([
      FALLBACK_PHYSICAL_SNAPSHOT,
      {...FALLBACK_PHYSICAL_SNAPSHOT,id:'s3-snapshot',sourceId:'s3-source',sourceName:'DAAIF S3 Parquet',sourceType:'s3',systemName:'S3 Object Storage',databaseName:'vat-smoke-test',tables:[{...FALLBACK_PHYSICAL_SNAPSHOT.tables[0],id:'parquet-model',schemaName:'daca/physical-models',name:'vehicle_inventory.parquet',kind:'parquet',storageLocation:'s3://vat-smoke-test/daca/physical-models/vehicle_inventory.parquet'}]},
    ]);
    component.searchQuery.set('vehicle');
    expect(component.visibleModelCount()).toBe(1);
    expect(component.filteredSnapshots()[0].sourceType).toBe('s3');
    component.searchQuery.set('org_unit_id');component.sourceTypeFilter.set('postgresql');
    expect(component.visibleModelCount()).toBe(2);
    expect(component.filteredSnapshots().every((snapshot)=>snapshot.sourceType==='postgresql')).toBe(true);
  });
});
