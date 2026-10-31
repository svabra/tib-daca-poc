import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { FALLBACK_PRODUCT } from '../../core/catalog.seed';
import { CatalogExpertSearchComponent } from './catalog-expert-search.component';
import { CatalogSearchDataService } from './catalog-search-data.service';
import { CatalogSearchAsset, productSearchAsset } from './catalog-search.models';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { EMPTY_SEARCH_VIEW, SearchView, SearchViewsApiService } from './search-views-api.service';

describe('Catalog expert search modes and shared preview',()=>{
  afterEach(()=>{TestBed.resetTestingModule();vi.useRealTimers();});
  const table:CatalogSearchAsset={key:'table:table',id:'table',kind:'structure',physicalType:'table',label:'Gebäude',description:'Gebäudestruktur',context:['armasuisse','ImmoGIS','CSV'],organization:'armasuisse',domains:[{id:'domain',label:'Immobilien'}],status:'active',route:['/physical-models','source'],params:{tableId:'table'},connection:{configured:false,label:'Nur Strukturmetadaten',description:'Ohne Quellenzugriff'}};
  const field:CatalogSearchAsset={...table,key:'field:egid',id:'egid',kind:'field',label:'Gebäudeidentifikator (EGID)',description:'Identifikator des Gebäudes.',parent:table,dataType:'Integer',nullable:false};
  async function setup(params:Record<string,string>={q:'Gebäude'},assets:readonly CatalogSearchAsset[]=[table,field]){
    const query=new BehaviorSubject(convertToParamMap(params));
    const data={assets:signal(assets),organizationLabels:signal(new Map<string,string>()),loading:signal(false),partial:signal(false),reload:vi.fn()};
    await TestBed.configureTestingModule({imports:[CatalogExpertSearchComponent],providers:[
      provideRouter([]),{provide:CatalogApiService,useValue:{loading:signal(false),refreshWorkflowTasks:vi.fn()}},
      {provide:DemoIdentityService,useValue:{userId:signal('search-tester'),users:signal([])}},
      {provide:SearchViewsApiService,useValue:{list:()=>of([]),inbox:()=>of([])}},
      {provide:UserPreferencesService,useValue:{language:signal('de')}},
      {provide:ActivatedRoute,useValue:{queryParamMap:query,snapshot:{queryParamMap:query.value}}},
    ]}).overrideComponent(CatalogExpertSearchComponent,{set:{providers:[{provide:CatalogSearchDataService,useValue:data}]}}).compileComponents();
    const fixture=TestBed.createComponent(CatalogExpertSearchComponent);fixture.detectChanges();
    const navigate=vi.spyOn(TestBed.inject(Router),'navigate').mockResolvedValue(true);
    return{fixture,component:fixture.componentInstance,root:fixture.nativeElement as HTMLElement,data,query,navigate};
  }

  it('defaults to context navigation with large mode tiles beside the heading',async()=>{
    const {component,root}=await setup();
    expect(component.mode()).toBe('context');
    expect(root.querySelector('.search-heading [data-search-mode=context]')?.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('.search-sidebar')).not.toBeNull();
    expect(root.querySelector('[data-search-group="table:table"]')).not.toBeNull();
    expect(root.querySelectorAll('[data-search-key="field:egid"]')).toHaveLength(1);
    expect(root.querySelector('.search-preview')).toBeNull();
  });

  it('applies every saved filter and supports a filter-only view without a search phrase',async()=>{
    const {component,navigate,fixture}=await setup({});
    const view:SearchView={id:'view',ownerUserId:'search-tester',name:'Gebäude-Felder',description:'',revision:1,createdAt:'',updatedAt:'',
      configuration:{...EMPTY_SEARCH_VIEW,mode:'focus',kind:'field',organization:'armasuisse',domain:'domain',status:'active',connection:'metadata',sort:'name'}};
    component.applyView(view);fixture.detectChanges();
    expect(component.query()).toBe('');expect(component.searchReady()).toBe(true);expect(component.results()).toEqual([field]);
    expect(component.mode()).toBe('focus');expect(component.sort()).toBe('name');
    expect(navigate).toHaveBeenLastCalledWith([],expect.objectContaining({queryParams:expect.objectContaining({view:'view',q:'',kind:'field',organization:'armasuisse',domain:'domain',status:'active',connection:'metadata',sort:'name'})}));
    component.applyView(null);expect(component.activeViewId()).toBeNull();expect(component.searchReady()).toBe(false);
  });

  it('does not overwrite an explicitly modified search when restoring a selected view',async()=>{
    const {component}=await setup({q:'Gebäude',view:'view',kind:'field'});
    component.restoreView({id:'view',configuration:{...EMPTY_SEARCH_VIEW,query:'andere Suche'}} as SearchView);
    expect(component.query()).toBe('Gebäude');expect(component.selectedKind()).toBe('field');
  });

  it('uses a generic context for tables and S3 objects, with distinct result and preview types',async()=>{
    const object:CatalogSearchAsset={...table,key:'table:object',id:'object',label:'Gebäude Parquet',sourceType:'s3',physicalType:'parquet'};
    const {component,fixture,root}=await setup({q:'Gebäude',kind:'structure'},[table,object]);
    expect(component.counts().structure).toBe(2);
    for(const mode of ['context','focus'] as const){
      component.setMode(mode);fixture.detectChanges();
      expect(root.querySelector('[data-search-kind=structure]')?.textContent).toContain('Data Structures');
      expect(root.querySelector('[data-search-key="table:table"] .search-row-kind')?.textContent).toBe('Tabelle');
      expect(root.querySelector('[data-search-key="table:object"] .search-row-kind')?.textContent).toBe('S3-Objekt (Parquet)');
      expect(root.querySelector('[data-search-key="table:object"] daca-search-icon span')?.getAttribute('style')).toContain('cube.svg');
      component.pinPreview(object,null);fixture.detectChanges();expect(root.querySelector('.search-preview-identity')?.textContent).toContain('S3-Objekt (Parquet)');
      component.closePreview(false);
    }
  });

  it('explains Data Structures in the existing tooltip for mouse and keyboard in both modes',async()=>{
    const {component,fixture,root}=await setup();
    for(const mode of ['context','focus'] as const){
      component.setMode(mode);fixture.detectChanges();
      const control=root.querySelector<HTMLButtonElement>('[data-search-kind=structure]')!;
      for(const event of ['mouseenter','focusin']){
        control.dispatchEvent(new Event(event));
        const tooltip=document.querySelector('[role=tooltip]');expect(tooltip?.textContent).toContain('Tabellen, Views');expect(tooltip?.textContent).toContain('S3-Objekte');
        expect(control.getAttribute('aria-describedby')).toContain(tooltip!.id);
        document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(document.querySelector('[role=tooltip]')).toBeNull();
      }
    }
  });

  it('keeps old table-context links working and writes the generic context to new URLs',async()=>{
    const {component,navigate}=await setup({q:'Gebäude',kind:'table'});
    expect(component.selectedKind()).toBe('structure');expect(component.results()).toEqual([table]);
    component.setMode('focus');expect(navigate).toHaveBeenLastCalledWith([],expect.objectContaining({queryParams:expect.objectContaining({kind:'structure'})}));
  });

  it('preserves the query, filters, object type and pinned preview when switching layouts',async()=>{
    const {component,fixture,root,navigate}=await setup();
    component.setFilter('organization','armasuisse');component.selectKind('field');component.pinPreview(field,null);
    component.setMode('focus');fixture.detectChanges();
    expect(component.query()).toBe('Gebäude');expect(component.selectedOwner()).toBe('armasuisse');
    expect(component.selectedKind()).toBe('field');expect(component.preview()?.key).toBe(field.key);
    expect(root.querySelector('.search-sidebar')).toBeNull();expect(root.querySelector('.search-kind-strip')).not.toBeNull();
    expect(navigate).toHaveBeenLastCalledWith([],expect.objectContaining({replaceUrl:true,queryParams:expect.objectContaining({q:'Gebäude',mode:'focus',organization:'armasuisse',kind:'field'})}));
    component.setMode('context');fixture.detectChanges();expect(component.preview()?.key).toBe(field.key);
  });

  it('restores a shared focus URL and reacts to browser back/forward query changes',async()=>{
    const {component,query,fixture}=await setup({q:'Gebäude',mode:'focus',kind:'field',organization:'armasuisse'});
    expect(component.mode()).toBe('focus');expect(component.results()).toEqual([field]);
    query.next(convertToParamMap({q:'Gebäude'}));fixture.detectChanges();
    expect(component.mode()).toBe('context');expect(component.selectedKind()).toBe('all');
  });

  it('offers the same preview by hover/focus in both layouts and can pin it for reading',async()=>{
    vi.useFakeTimers();const {component,fixture,root}=await setup();
    for(const mode of ['context','focus'] as const){
      component.setMode(mode);fixture.detectChanges();
      const row=root.querySelector<HTMLElement>('[data-search-key="field:egid"]')!;
      row.dispatchEvent(new Event('pointerenter'));vi.advanceTimersByTime(179);expect(component.preview()).toBeNull();
      vi.advanceTimersByTime(1);fixture.detectChanges();expect(root.querySelector('.search-preview')?.textContent).toContain(field.label);
      component.pinPreview(field,row);component.closePreviewSoon();vi.advanceTimersByTime(1000);
      expect(component.preview()?.key).toBe(field.key);
      component.closePreview(false);fixture.detectChanges();
      row.querySelector('a')!.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));vi.advanceTimersByTime(180);
      expect(component.preview()?.key).toBe(field.key);component.closePreview(false);
    }
  });

  it('closes the preview with Escape and restores focus to its trigger',async()=>{
    vi.useFakeTimers();const {component,fixture,root}=await setup();
    const trigger=root.querySelector<HTMLButtonElement>('[data-search-key="field:egid"] .search-preview-button')!;
    trigger.click();fixture.detectChanges();vi.advanceTimersByTime(0);
    expect(document.activeElement?.id).toBe('search-preview-title');
    root.querySelector('.search-preview')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));fixture.detectChanges();
    expect(component.preview()).toBeNull();expect(document.activeElement).toBe(trigger);
    vi.advanceTimersByTime(500);expect(component.preview()).toBeNull();
  });

  it('removes stale pinned details when a query, filter or identity-scoped dataset removes the result',async()=>{
    const {component,data,fixture}=await setup();component.pinPreview(field,null);fixture.detectChanges();
    data.assets.set([]);fixture.detectChanges();expect(component.preview()).toBeNull();expect(component.pinnedKey()).toBeNull();
  });

  it('counts and groups matching fields without counting the contextual parent twice',async()=>{
    const {component,root}=await setup({q:'EGID'});
    expect(component.results()).toEqual([field]);expect(component.groups()[0].parentMatches).toBe(false);
    expect(root.querySelector('#expert-search-results-title')?.textContent).toContain('1 Treffer');
    expect(root.querySelectorAll('[data-search-group]')).toHaveLength(1);
    component.toggleGroup(table.key);expect(component.collapsedGroups().has(table.key)).toBe(true);
  });

  it('filters the same assets in both modes and resets filters without clearing the phrase',async()=>{
    const {component}=await setup();
    component.setFilter('connection','connected');expect(component.results()).toEqual([]);
    component.setMode('focus');expect(component.results()).toEqual([]);
    component.resetFilters();expect(component.query()).toBe('Gebäude');expect(component.results()).toHaveLength(2);
    component.setFilter('domain','other');expect(component.results()).toEqual([]);
  });

  it('preserves product quality and protocol metadata in the on-demand preview',async()=>{
    const product={...FALLBACK_PRODUCT,qualityMedal:'gold' as const,qualityScore:5,additionalMetadata:{...FALLBACK_PRODUCT.additionalMetadata,deliveryProtocols:['REST']}};
    const asset=productSearchAsset(product);const {component,fixture,root}=await setup({q:'Steuerstatistik'},[asset]);
    component.pinPreview(asset,null);fixture.detectChanges();
    expect(root.querySelector('daca-quality-medal')?.textContent?.trim()).toBe('Gold · 5/6');
    expect(component.protocolLabel(asset)).toBe('REST');
    expect(root.querySelector('.search-preview dl')?.textContent).toContain('REST');
  });

  it('offers a prefilled term proposal when nothing matches',async()=>{
    const {root}=await setup({q:'GepFz Einsatz'},[]);
    expect(root.querySelector<HTMLAnchorElement>('.expert-search-term-link')?.getAttribute('href')).toBe('/glossary/proposals/new?q=GepFz%20Einsatz');
  });

  it('clears the search and URL with one labelled control',async()=>{
    const {component,root,navigate,fixture}=await setup();
    expect(root.querySelectorAll('.expert-search-control button')).toHaveLength(1);
    root.querySelector<HTMLButtonElement>('.expert-search-control button')!.click();fixture.detectChanges();
    expect(component.query()).toBe('');expect(root.querySelectorAll('.expert-search-control button')).toHaveLength(0);
    expect(navigate).toHaveBeenLastCalledWith([],expect.objectContaining({queryParams:expect.objectContaining({q:null})}));
  });

  it('reports partial loading failures and offers retry without inventing results',async()=>{
    const {data,fixture,root}=await setup({},[]);data.partial.set(true);fixture.detectChanges();
    expect(root.querySelector('.search-load-notice')?.textContent).toContain('unvollständig');
    root.querySelector<HTMLButtonElement>('.search-load-notice button')!.click();expect(data.reload).toHaveBeenCalledOnce();
  });
});
