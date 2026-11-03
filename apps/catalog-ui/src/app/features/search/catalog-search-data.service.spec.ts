import { UserPreferencesService } from '../../core/user-preferences.service';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService } from '../data-models/data-models-api.service';
import { FALLBACK_LOGICAL_MODEL, FALLBACK_PHYSICAL_SNAPSHOT } from '../data-models/mapping-fallback';
import { LogicalSearchField, PhysicalSource } from '../data-models/data-models.models';
import { CatalogSearchDataService } from './catalog-search-data.service';
import type { OrganizationNetwork } from '../welcome/organization-canvas.component';
const SEARCH_SOURCE:PhysicalSource={id:FALLBACK_PHYSICAL_SNAPSHOT.sourceId,name:'Gebäudeinventar',revision:1,connectorType:'csv',department:'VBS',office:'armasuisse',systemName:'ImmoGIS',databaseName:'CSV',latestSnapshotId:FALLBACK_PHYSICAL_SNAPSHOT.id,latestSnapshotSequence:1,latestSnapshot:null,catalogPath:'urn:daca:source:test',ownerName:'Data Owner',updatedAt:'2026-10-30'};
const LOGICAL_FIELDS:LogicalSearchField[]=FALLBACK_LOGICAL_MODEL.fields.map(field=>({...field,modelId:FALLBACK_LOGICAL_MODEL.id,modelVersionId:FALLBACK_LOGICAL_MODEL.versionId}));

describe('Catalog search identity-scoped metadata',()=>{
  afterEach(()=>TestBed.resetTestingModule());
  function setup(){
    const actor=signal('first');
    const api={products:signal([]),loadSearchProducts:vi.fn(()=>of([])),loadOrganizationNetwork:vi.fn(()=>of(null as OrganizationNetwork|null)),loadDomains:vi.fn(()=>of([])),loadGlossaryTerms:vi.fn(()=>of([]))};
    const models={listLogicalModels:vi.fn(()=>of([] as readonly import('../data-models/data-models.models').LogicalModelSummary[])),listLogicalFields:vi.fn(()=>of(LOGICAL_FIELDS)),listPhysicalSources:vi.fn(()=>of([SEARCH_SOURCE])),loadPhysicalSnapshot:vi.fn(()=>of(FALLBACK_PHYSICAL_SNAPSHOT))};
    TestBed.configureTestingModule({providers:[CatalogSearchDataService,{provide:UserPreferencesService,useValue:{language:signal('de')}},{provide:CatalogApiService,useValue:api},{provide:DataModelsApiService,useValue:models},{provide:DemoIdentityService,useValue:{userId:actor,users:signal([])}}]});
    const service=TestBed.inject(CatalogSearchDataService);return{actor,api,models,service};
  }
  it('reads only latest snapshots of sources returned by the access-scoped source endpoint',()=>{
    const {models,service}=setup();TestBed.tick();
    expect(models.loadPhysicalSnapshot).toHaveBeenCalledExactlyOnceWith(SEARCH_SOURCE.latestSnapshotId);
    expect(service.assets().some(item=>item.kind==='field')).toBe(true);expect(service.loading()).toBe(false);
  });
  it('indexes logical fields only from accessible models and inherits their organization and domain scopes',()=>{
    const {models,service}=setup();models.listLogicalModels.mockReturnValue(of([FALLBACK_LOGICAL_MODEL]));TestBed.tick();
    expect(models.listLogicalFields).toHaveBeenCalledTimes(1);
    const field=service.assets().find(item=>item.key.startsWith('logical-field:'))!;
    expect(field.parent?.key).toBe('logical:'+FALLBACK_LOGICAL_MODEL.id);
    expect(service.matchesOrganization(field,FALLBACK_LOGICAL_MODEL.office)).toBe(true);
    expect(service.matchesDomain(field,FALLBACK_LOGICAL_MODEL.dataDomain.id)).toBe(true);
    expect(service.partial()).toBe(false);
  });
  it('retains readable models and physical fields when a logical detail cannot be loaded',()=>{
    const {models,service}=setup();models.listLogicalModels.mockReturnValue(of([FALLBACK_LOGICAL_MODEL]));
    models.listLogicalFields.mockReturnValue(throwError(()=>({status:403})));TestBed.tick();
    expect(service.partial()).toBe(true);expect(service.loading()).toBe(false);
    expect(service.assets().some(item=>item.kind==='logical')).toBe(true);
    expect(service.assets().some(item=>item.parent?.kind==='structure')).toBe(true);
    expect(service.assets().some(item=>item.key.startsWith('logical-field:'))).toBe(false);
  });
  it('filters by authoritative IDs across differently named owners and includes organizations assigned to a domain',()=>{
    const {api,service}=setup();
    api.loadOrganizationNetwork.mockReturnValue(of({homeId:'office',ownOrganizationId:'office',satelliteIds:[],relations:[],
      nodes:[{id:'office',parentId:null,code:'BIT',label:'Bundesamt',kind:'office',description:'',registry:true,productCount:0,directProductCount:0,consumedProductCount:0,directConsumedProductCount:0,domainIds:['domain'],objectKeys:['logical:model']}],
      domains:[{id:'domain',label:'ROHS',description:'',organizationIds:['office'],productCount:0,objectKeys:['logical:model','organization:office']}]}));
    TestBed.tick();
    const model={key:'logical:model',organization:'unrelated display name'} as import('./catalog-search.models').CatalogSearchAsset;
    expect(service.matchesOrganization(model,'office')).toBe(true);
    expect(service.matchesOrganization({...model,key:'logical:foreign'},'office')).toBe(false);
    expect(service.matchesDomain(model,'domain')).toBe(true);
    expect(service.matchesDomain({...model,key:'domain:domain'},'domain')).toBe(false);
    const organization=service.assets().find(item=>item.kind==='organization')!;
    expect(organization.route).toEqual(['/']);expect(organization.params).toEqual({organization:'office'});
    expect(service.matchesDomain(organization,'domain')).toBe(true);
    expect(service.organizationLabels().get('office')).toBe('Bundesamt');
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
  it('cancels a former identity bulk field read and excludes unlisted models from the index',()=>{
    const {actor,models,service}=setup();const former=new Subject<LogicalSearchField[]>();
    models.listLogicalFields.mockReturnValueOnce(former);TestBed.tick();expect(former.observed).toBe(true);
    actor.set('second');TestBed.tick();expect(former.observed).toBe(false);
    former.next(LOGICAL_FIELDS);former.complete();
    expect(service.assets().some(item=>item.key.startsWith('logical-field:'))).toBe(false);
    expect(service.loading()).toBe(false);
  });
  it('marks failed metadata as incomplete rather than inventing replacements',()=>{
    const {models,service}=setup();models.loadPhysicalSnapshot.mockReturnValue(throwError(()=>new Error('forbidden')));TestBed.tick();
    expect(service.partial()).toBe(true);expect(service.assets().filter(item=>item.kind==='field')).toEqual([]);
    expect(service.assets().filter(item=>item.kind==='source')).toHaveLength(1);
  });
  it('treats an unauthorized physical-source collection as empty while retaining readable metadata',()=>{
    const {models,service}=setup();models.listPhysicalSources.mockReturnValue(throwError(()=>({status:403})));TestBed.tick();
    expect(service.partial()).toBe(false);expect(service.loading()).toBe(false);
    expect(service.assets()).toEqual([]);expect(models.loadPhysicalSnapshot).not.toHaveBeenCalled();
  });
});
