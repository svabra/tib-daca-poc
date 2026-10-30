import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService } from '../data-models/data-models-api.service';
import { FALLBACK_PHYSICAL_SNAPSHOT } from '../data-models/mapping-fallback';
import { PhysicalSource } from '../data-models/data-models.models';
import { CatalogSearchDataService } from './catalog-search-data.service';
const SEARCH_SOURCE:PhysicalSource={id:FALLBACK_PHYSICAL_SNAPSHOT.sourceId,name:'Gebäudeinventar',revision:1,connectorType:'csv',department:'VBS',office:'armasuisse',systemName:'ImmoGIS',databaseName:'CSV',latestSnapshotId:FALLBACK_PHYSICAL_SNAPSHOT.id,latestSnapshotSequence:1,latestSnapshot:null,catalogPath:'urn:daca:source:test',ownerName:'Owner',updatedAt:'2026-10-30'};

describe('Catalog search identity-scoped metadata',()=>{
  afterEach(()=>TestBed.resetTestingModule());
  function setup(){
    const actor=signal('first');
    const api={products:signal([]),loadDomains:vi.fn(()=>of([])),loadGlossaryTerms:vi.fn(()=>of([]))};
    const models={listLogicalModels:vi.fn(()=>of([])),listPhysicalSources:vi.fn(()=>of([SEARCH_SOURCE])),loadPhysicalSnapshot:vi.fn(()=>of(FALLBACK_PHYSICAL_SNAPSHOT))};
    TestBed.configureTestingModule({providers:[CatalogSearchDataService,{provide:CatalogApiService,useValue:api},{provide:DataModelsApiService,useValue:models},{provide:DemoIdentityService,useValue:{userId:actor,users:signal([])}}]});
    const service=TestBed.inject(CatalogSearchDataService);return{actor,api,models,service};
  }
  it('reads only latest snapshots of sources returned by the access-scoped source endpoint',()=>{
    const {models,service}=setup();TestBed.tick();
    expect(models.loadPhysicalSnapshot).toHaveBeenCalledExactlyOnceWith(SEARCH_SOURCE.latestSnapshotId);
    expect(service.assets().some(item=>item.kind==='field')).toBe(true);expect(service.loading()).toBe(false);
  });
  it('does not reload when a signal read incidentally by an API loader changes',()=>{
    const {api,models,service}=setup();const domainCache=signal(0);
    api.loadDomains.mockImplementation(()=>{domainCache();return of([]);});TestBed.tick();
    domainCache.set(1);TestBed.tick();
    expect(api.loadDomains).toHaveBeenCalledTimes(1);expect(models.listPhysicalSources).toHaveBeenCalledTimes(1);
    expect(service.loading()).toBe(false);
  });
  it('cancels former-identity reads and clears their metadata before new results arrive',()=>{
    const {actor,models,service}=setup();const former=new Subject<PhysicalSource[]>(),current=new Subject<PhysicalSource[]>();
    models.listPhysicalSources.mockReturnValueOnce(former);TestBed.tick();
    models.listPhysicalSources.mockReturnValueOnce(current);actor.set('second');TestBed.tick();
    expect(former.observed).toBe(false);expect(service.assets()).toEqual([]);
    former.next([SEARCH_SOURCE]);former.complete();expect(models.loadPhysicalSnapshot).not.toHaveBeenCalled();
    current.next([]);current.complete();expect(service.loading()).toBe(false);expect(service.assets()).toEqual([]);
  });
  it('marks failed metadata as incomplete rather than inventing replacements',()=>{
    const {models,service}=setup();models.loadPhysicalSnapshot.mockReturnValue(throwError(()=>new Error('forbidden')));TestBed.tick();
    expect(service.partial()).toBe(true);expect(service.assets().filter(item=>item.kind==='field')).toEqual([]);
    expect(service.assets().filter(item=>item.kind==='source')).toHaveLength(1);
  });
});
