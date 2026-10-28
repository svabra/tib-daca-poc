import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { defer, of, Subject, throwError } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { DomainSummary, GlossaryTermSummary, SemanticGraphState } from '../../core/catalog.models';
import { OrganizationTermNetworkComponent } from './organization-term-network.component';

describe('organization term network',()=>{
  const actor=signal('spider'),user=signal({office:'armasuisse'});
  const domain={id:'d',status:'active',preferredLabel:'Immobilien',definition:'Fachgebiet',updatedAt:'2026-10-28',revision:1} as DomainSummary;
  const term={id:'t',status:'active',preferredLabel:'Gebäude',definition:'Bauwerk',domains:[domain],labels:[],relations:[],updatedAt:'2026-10-28'} as unknown as GlossaryTermSummary;
  let delayed:Subject<SemanticGraphState>|null;
  const api={loadAdministrativeOrganizations:vi.fn(()=>of([{id:'armasuisse',label:'armasuisse'},{id:'verteidigung',label:'Verteidigung'}])),loadGlossaryTermProposals:()=>of([]),loadSemanticGraph:vi.fn((kind:string,id?:string)=>kind==='organizations'&&id==='delayed'?delayed!:of({revision:0,positions:{},relations:[],canEditLayout:true,canEditRelations:false,organizationName:id,scopeDomainIds:id==='armasuisse'?['d']:[],scopeTermIds:id==='armasuisse'?['t']:[]})),saveSemanticGraph:vi.fn()};
  beforeEach(()=>{actor.set('spider');user.set({office:'armasuisse'});delayed=null;vi.clearAllMocks();TestBed.configureTestingModule({imports:[OrganizationTermNetworkComponent],providers:[provideRouter([]),{provide:CatalogApiService,useValue:api},{provide:DemoIdentityService,useValue:{userId:actor,user}},{provide:UserPreferencesService,useValue:{language:signal('de')}}]});});
  afterEach(()=>TestBed.resetTestingModule());
  function render(){const fixture=TestBed.createComponent(OrganizationTermNetworkComponent);fixture.componentRef.setInput('domains',[domain,{...domain,id:'outside'}]);fixture.componentRef.setInput('terms',[term,{...term,id:'outside'}]);fixture.detectChanges();return fixture;}
  it('selects the current organization when directory options arrive after the graph',async()=>{
    const directory=new Subject<{id:string;label:string}[]>();api.loadAdministrativeOrganizations.mockReturnValueOnce(directory);
    const fixture=render();directory.next([{id:'armasuisse',label:'armasuisse'}]);fixture.detectChanges();await fixture.whenStable();
    expect((fixture.nativeElement.querySelector('select') as HTMLSelectElement).value).toBe('armasuisse');
    expect(fixture.componentInstance.context()?.id).toBe('armasuisse');
  });
  it('defaults to the current modeling organization and renders only server-scoped objects',()=>{
    const fixture=render(),component=fixture.componentInstance;
    expect(component.organizationId()).toBe('armasuisse');expect(component.scopedDomains()).toEqual([domain]);expect(component.scopedTerms()).toEqual([term]);
    expect(component.editor()?.nodes().map(item=>item.id)).toEqual(['domain:d','term:t']);
    expect(api.saveSemanticGraph).not.toHaveBeenCalled();
    actor.set('sibilla');user.set({office:'verteidigung'});fixture.detectChanges();
    expect(component.organizationId()).toBe('verteidigung');expect(component.editor()?.nodes()).toEqual([]);
  });
  it('follows a resolved organization for the same person while preserving a manual choice',()=>{
    const fixture=render(),component=fixture.componentInstance;
    user.set({office:'verteidigung'});fixture.detectChanges();expect(component.organizationId()).toBe('verteidigung');
    const select=fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value='armasuisse';select.dispatchEvent(new Event('change'));fixture.detectChanges();
    user.set({office:'updated'});fixture.detectChanges();expect(component.organizationId()).toBe('armasuisse');
    actor.set('sibilla');user.set({office:'verteidigung'});fixture.detectChanges();expect(component.organizationId()).toBe('verteidigung');
  });
  it('recovers a transient read failure without changing the selected organization',()=>{
    vi.useFakeTimers();const fixture=render(),component=fixture.componentInstance;let attempts=0;
    const graph={revision:0,positions:{},relations:[],canEditLayout:true,canEditRelations:false,organizationName:'armasuisse',scopeDomainIds:['d'],scopeTermIds:['t']};
    api.loadSemanticGraph.mockReturnValueOnce(defer(()=>++attempts===1?throwError(()=>({status:503})):of(graph)));
    try{
      component.load('armasuisse');expect(component.loading()).toBe(true);expect(component.error()).toBe('');
      vi.advanceTimersByTime(300);fixture.detectChanges();expect(attempts).toBe(2);expect(component.graph()).toEqual(graph);expect(component.organizationId()).toBe('armasuisse');expect(component.loading()).toBe(false);
      expect(api.saveSemanticGraph).not.toHaveBeenCalled();
    }finally{vi.useRealTimers();}
  });
  it('does not retry an authorization failure or keep old cards visible',()=>{
    const fixture=render(),component=fixture.componentInstance;let attempts=0;
    api.loadSemanticGraph.mockReturnValueOnce(defer(()=>{attempts++;return throwError(()=>({status:403}));}));
    component.load('verteidigung');fixture.detectChanges();expect(attempts).toBe(1);expect(component.context()).toBeNull();expect(component.scopedTerms()).toHaveLength(0);expect(component.error()).not.toBe('');
  });
  it('guards unsaved layout when switching organization and ignores abandoned requests',()=>{
    const fixture=render(),component=fixture.componentInstance;
    component.editor()!.moveNode('term:t',{x:450,y:200});
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(false),select=fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value='verteidigung';select.dispatchEvent(new Event('change'));fixture.detectChanges();
    expect(component.organizationId()).toBe('armasuisse');expect(select.value).toBe('armasuisse');expect(confirm).toHaveBeenCalled();confirm.mockRestore();
    delayed=new Subject();component.load('delayed');component.load('verteidigung');delayed.next({revision:5,positions:{},relations:[],canEditLayout:false,canEditRelations:false,organizationName:'Stale'});fixture.detectChanges();
    expect(component.context()?.label).toBe('verteidigung');expect(component.scopedTerms()).toHaveLength(0);expect(api.saveSemanticGraph).not.toHaveBeenCalled();
  });
});
