import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService } from '../data-models/data-models-api.service';
import { CatalogObjectBrowserComponent } from './catalog-object-browser.component';

describe('CatalogObjectBrowserComponent',()=>{
  const api={loadGlossaryTerms:()=>of([{id:'term',preferredLabel:'Grösse',definition:'Dimension'}]),loadDomains:()=>of([{id:'domain',preferredLabel:'Personal',definition:'Menschen'}])};
  const models={listLogicalModels:()=>of([{id:'logical',title:{de:'Bestand'},description:{de:'Logisches Modell'}}]),listPhysicalSnapshots:()=>of([{id:'old',sourceId:'source',revision:1},{id:'new',sourceId:'source',revision:2}]),loadPhysicalSnapshot:vi.fn(()=>of({id:'new',sourceId:'source',sourceName:'Quelle',catalogPath:'catalog',tables:[{id:'table',schemaName:'public',name:'bestand'}]}))};
  beforeEach(()=>{vi.clearAllMocks();TestBed.configureTestingModule({imports:[CatalogObjectBrowserComponent],providers:[provideRouter([]),{provide:CatalogApiService,useValue:api},{provide:DataModelsApiService,useValue:models},{provide:DemoIdentityService,useValue:{userId:signal('reader')}}]});});
  afterEach(()=>{TestBed.resetTestingModule();vi.restoreAllMocks();});
  it('filters and opens a term without adding a card',async()=>{
    const fixture=TestBed.createComponent(CatalogObjectBrowserComponent);fixture.detectChanges();const component=fixture.componentInstance;
    component.query.set('GRÖSSE');expect(component.results()).toHaveLength(1);
    const navigate=vi.spyOn(TestBed.inject(Router),'navigate').mockResolvedValue(true),closed=vi.fn();component.closed.subscribe(closed);
    await component.open(component.results()[0]);expect(navigate).toHaveBeenCalledWith(['/domains/terminology'],{queryParams:{q:'Grösse',termId:'term'}});expect(closed).toHaveBeenCalledOnce();
  });
  it('loads only current accessible snapshots and clears results on denied reads',()=>{
    const fixture=TestBed.createComponent(CatalogObjectBrowserComponent);fixture.componentRef.setInput('initialKind','physical');fixture.detectChanges();const component=fixture.componentInstance;
    expect(models.loadPhysicalSnapshot).toHaveBeenCalledExactlyOnceWith('new');expect(component.results()[0].label).toBe('public.bestand');
    models.loadPhysicalSnapshot.mockReturnValueOnce(throwError(()=>new Error('403')));component.load();expect(component.results()).toEqual([]);expect(component.error()).toContain('nicht geladen');
  });
  it('does not emit after successful navigation destroys the dialog',async()=>{
    const fixture=TestBed.createComponent(CatalogObjectBrowserComponent);fixture.detectChanges();const component=fixture.componentInstance;
    let finish!:(value:boolean)=>void;
    vi.spyOn(TestBed.inject(Router),'navigate').mockReturnValue(new Promise<boolean>(resolve=>{finish=resolve;}));
    const closed=vi.fn();component.closed.subscribe(closed);const navigation=component.open(component.results()[0]);fixture.destroy();finish(true);await navigation;
    expect(closed).not.toHaveBeenCalled();
  });
  it('selects a card target without navigating in connection search mode',async()=>{
    const fixture=TestBed.createComponent(CatalogObjectBrowserComponent);fixture.componentRef.setInput('selectionMode',true);fixture.detectChanges();const component=fixture.componentInstance;
    const navigate=vi.spyOn(TestBed.inject(Router),'navigate'),selected=vi.fn();component.selected.subscribe(selected);await component.open(component.results()[0]);
    expect(navigate).not.toHaveBeenCalled();expect(selected).toHaveBeenCalledWith(expect.objectContaining({id:'term'}));
  });
});
