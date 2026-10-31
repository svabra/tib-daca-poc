import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService } from '../data-models/data-models-api.service';
import { CatalogObjectBrowserComponent } from './catalog-object-browser.component';
import { FALLBACK_PHYSICAL_SNAPSHOT } from '../data-models/mapping-fallback';

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
  it('renders model search hits as native new-tab links while preserving explicit selection mode',()=>{
    const fixture=TestBed.createComponent(CatalogObjectBrowserComponent);
    fixture.componentRef.setInput('initialKind','logical');fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement,closed=vi.fn();fixture.componentInstance.closed.subscribe(closed);
    const link=root.querySelector<HTMLAnchorElement>('a.object-result')!;
    expect(link.getAttribute('href')).toBe('/models/logical');expect(link.target).toBe('_blank');expect(link.rel).toBe('noopener');
    expect(link.querySelector('img[src$="external-link.svg"]')).not.toBeNull();
    const navigate=vi.spyOn(TestBed.inject(Router),'navigate');
    link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));expect(navigate).not.toHaveBeenCalled();expect(closed).toHaveBeenCalledOnce();
    fixture.componentRef.setInput('selectionMode',true);fixture.detectChanges();
    expect(root.querySelector('a.object-result')).toBeNull();expect(root.querySelector('button.object-result')).not.toBeNull();
  });
  it('distinguishes equally named physical objects by system, source and declaration type',async()=>{
    vi.spyOn(models,'listPhysicalSnapshots').mockReturnValueOnce(of([{id:'csv',sourceId:'inventory',revision:1},{id:'pg',sourceId:'database',revision:1}]));
    const table={...FALLBACK_PHYSICAL_SNAPSHOT.tables[0],id:'csv-table',databaseName:'SAP',schemaName:'CSV',name:'VIBDBU'};
    const csv={...FALLBACK_PHYSICAL_SNAPSHOT,id:'csv',sourceId:'inventory',sourceName:'Gebäude',databaseName:'ImmoGIS',sourceType:'csv' as const,catalogPath:'urn:daca:physical-source:inventory',dataOwnerName:'Daniel Wenger',tables:[table]};
    const pg={...FALLBACK_PHYSICAL_SNAPSHOT,id:'pg',sourceId:'database',sourceName:'SAP Gebäudebestand',databaseName:'daca_sample',sourceType:'postgresql' as const,tables:[{...table,id:'pg-table',databaseName:'daca_sample',schemaName:'public'}]};
    models.loadPhysicalSnapshot.mockReturnValueOnce(of(csv)).mockReturnValueOnce(of(pg));
    const fixture=TestBed.createComponent(CatalogObjectBrowserComponent);fixture.componentRef.setInput('initialKind','physical');fixture.detectChanges();const component=fixture.componentInstance;
    component.query.set('VIBDBU');fixture.detectChanges();
    expect(component.results().map(item=>[item.label,item.description])).toEqual([
      ['SAP.CSV.VIBDBU','Quelle: Gebäude · Physische Deklaration (CSV)'],
      ['daca_sample.public.VIBDBU','Quelle: SAP Gebäudebestand · Physische Repräsentation (PostgreSQL)'],
    ]);
    const root=fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.object-result')?.textContent).not.toContain('urn:daca:');
    const info=root.querySelector<HTMLButtonElement>('.provenance-info')!;info.focus();
    expect(document.querySelector('[role=tooltip]')?.textContent).toContain('Quellen-ID: inventory');
    expect(document.querySelector('[role=tooltip]')?.textContent).toContain('Data Owner: Daniel Wenger');
    info.blur();expect(document.querySelector('[role=tooltip]')).toBeNull();
    component.query.set('urn:daca:physical-source:inventory');expect(component.results().map(item=>item.id)).toEqual(['csv-table']);
    fixture.detectChanges();const originLink=root.querySelector<HTMLAnchorElement>('a.object-result')!;
    expect(originLink.target).toBe('_blank');expect(originLink.getAttribute('href')).toBe('/physical-models/inventory?snapshotId=csv&tableId=csv-table');
  });
});
