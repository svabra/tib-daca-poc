import { UserPreferencesService } from '../../core/user-preferences.service';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DomainSummary, SemanticGraphState } from '../../core/catalog.models';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DomainNetworkComponent } from './domain-network.component';

const DOMAINS=['a','b','c'].map(id=>({id,preferredLabel:'Domäne '+id,definition:'Fachlicher Bereich '+id,status:'active',updatedAt:'2026-10-28T00:00:00Z'} as DomainSummary));
describe('DomainNetworkComponent',()=>{
  let graph:SemanticGraphState;
  const api={loadDomainChangeRequests:()=>of([]),loadDomains:()=>of(DOMAINS),loadSemanticGraph:()=>of(structuredClone(graph)),saveSemanticGraph:vi.fn((_kind:string,value:{positions:SemanticGraphState['positions'];relations?:SemanticGraphState['relations'];hiddenNodeIds?:string[]})=>{graph={...graph,revision:graph.revision+1,positions:value.positions,hiddenNodeIds:value.hiddenNodeIds,relations:value.relations??graph.relations};return of(structuredClone(graph));})};
  beforeEach(()=>{graph={revision:0,positions:{},relations:[],canEditLayout:true,canEditRelations:true};vi.clearAllMocks();TestBed.configureTestingModule({imports:[DomainNetworkComponent],providers: [{provide:UserPreferencesService,useValue:{language:signal('de')}},provideRouter([]),{provide:CatalogApiService,useValue:api},{provide:DemoIdentityService,useValue:{userId:signal('editor')}}]});});
  afterEach(()=>TestBed.resetTestingModule());
  function render(){const fixture=TestBed.createComponent(DomainNetworkComponent);fixture.detectChanges();return fixture;}
  it.each([['interfacesWith','hat eine fachliche Schnittstelle zu'],['overlapsWith','hat Überschneidungen mit']] as const)('stages, saves and reloads the %s relationship with its own label',async(type,label)=>{
    const fixture=render(),component=fixture.componentInstance;
    component.openEdit({index:null,sourceId:'a',targetId:'b',relationType:type});fixture.detectChanges();await fixture.whenStable();
    const select=fixture.nativeElement.querySelectorAll('.relation-dialog select')[1] as HTMLSelectElement;
    expect([...select.options].map(option=>option.value)).toEqual(['related','partOf','interfacesWith','overlapsWith']);expect(select.value).toBe(type);
    component.applyLink();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.graph-relationship text').textContent).toBe(label);
    expect(api.saveSemanticGraph).not.toHaveBeenCalled();await component.save();expect(graph.relations[0].relationType).toBe(type);
    fixture.destroy();const reloaded=render();expect(reloaded.nativeElement.querySelector('.graph-relationship text').textContent).toBe(label);
    TestBed.inject(UserPreferencesService).language.set('en');reloaded.detectChanges();
    expect(reloaded.nativeElement.querySelector('.graph-relationship text').textContent).toBe(type==='interfacesWith'?'has a business interface with':'overlaps with');
  });
  it('allows outgoing edits only for the assigned source while other domains remain readable',()=>{
    graph.relationSourceNodeIds=['domain:a'];const fixture=render(),component=fixture.componentInstance;
    component.openEdit({index:null,sourceId:'b',targetId:'c',relationType:'related'});
    expect(component.edit()).toBeNull();expect(component.error()).toContain('Objektverantwortung');
    component.begin('b');expect(component.connecting()).toBeNull();
    component.begin('a');component.finish('b');component.applyLink();
    expect(component.links()).toEqual([{sourceId:'a',targetId:'b',relationType:'related'}]);
    expect(component.nodes()).toHaveLength(3);expect(api.saveSemanticGraph).not.toHaveBeenCalled();
  });
  it('draws a held domain-to-domain drop immediately as an unsaved related link',()=>{
    vi.useFakeTimers();
    const fixture=render(),component=fixture.componentInstance;
    const target=fixture.nativeElement.querySelector('[data-domain-id="b"] p');
    const previous=Object.getOwnPropertyDescriptor(document,'elementsFromPoint');
    Object.defineProperty(document,'elementsFromPoint',{configurable:true,value:()=>[target]});
    const event=new MouseEvent('pointerdown',{button:0,clientX:50,clientY:50}) as PointerEvent;
    Object.defineProperty(event,'pointerId',{value:1});
    Object.defineProperty(event,'target',{value:fixture.nativeElement.querySelector('[data-domain-id="a"] p')});
    try {
      const originalPositions=component.nodes().map(node=>({id:node.id,x:node.x,y:node.y}));
      component.startNode(component.nodes()[0],event);vi.advanceTimersByTime(80);
      component.move({pointerId:1,clientX:55,clientY:53,preventDefault:()=>{}} as PointerEvent);
      expect(component.nodes().map(node=>({id:node.id,x:node.x,y:node.y}))).toEqual(originalPositions);
      vi.advanceTimersByTime(100);
      component.up(event);fixture.detectChanges();
      expect(component.links()).toEqual([{sourceId:'a',targetId:'b',relationType:'related'}]);
      expect(component.edges()).toHaveLength(1);expect(component.edit()).toBeNull();
      expect(component.linksDirty()).toBe(true);expect(api.saveSemanticGraph).not.toHaveBeenCalled();
    } finally { component.hold.cancel();vi.useRealTimers();if(previous)Object.defineProperty(document,'elementsFromPoint',previous);else Reflect.deleteProperty(document,'elementsFromPoint'); }
  });
  it('renders ports only on connected sides, updating after movement, hiding and deletion',()=>{
    const fixture=render(),component=fixture.componentInstance,root=fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.ontology-port')).toHaveLength(0);
    component.openEdit({index:null,sourceId:'a',targetId:'b',relationType:'related'});component.applyLink();fixture.detectChanges();
    expect(root.querySelectorAll('.ontology-port')).toHaveLength(2);
    expect(root.querySelector('[data-domain-id="a"] .is-right')).not.toBeNull();
    expect(root.querySelector('[data-domain-id="b"] .is-left')).not.toBeNull();
    expect(root.querySelector('[data-domain-id="c"] .ontology-port')).toBeNull();
    component.positions.update(positions=>({...positions,'domain:b':{x:15,y:200}}));fixture.detectChanges();
    expect(root.querySelector('[data-domain-id="a"] .is-left')).not.toBeNull();
    expect(root.querySelector('[data-domain-id="b"] .is-right')).not.toBeNull();
    component.hideDomain('b');fixture.detectChanges();expect(root.querySelectorAll('.ontology-port')).toHaveLength(0);
    component.showDomain('b');component.removeLink(0);fixture.detectChanges();expect(root.querySelectorAll('.ontology-port')).toHaveLength(0);
    expect(api.saveSemanticGraph).not.toHaveBeenCalled();
  });
  it('keeps the connection source through a target card pointerdown and click',()=>{
    const fixture=render(),component=fixture.componentInstance;
    component.begin('a');
    const target=fixture.nativeElement.querySelector('[data-domain-id="b"] p') as HTMLElement;
    target.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:2,bubbles:true}));
    expect(component.connecting()).toBe('a');
    target.click();fixture.detectChanges();expect(component.edit()).toMatchObject({sourceId:'a',targetId:'b'});
    expect(api.saveSemanticGraph).not.toHaveBeenCalled();
  });
  it('explains missing source ownership inside the canvas without creating a link',()=>{
    vi.useFakeTimers();graph.relationSourceNodeIds=['domain:a'];
    const fixture=render(),component=fixture.componentInstance;
    const target=fixture.nativeElement.querySelector('[data-domain-id="c"] p');
    const previous=Object.getOwnPropertyDescriptor(document,'elementsFromPoint');
    Object.defineProperty(document,'elementsFromPoint',{configurable:true,value:()=>[target]});
    const source=fixture.nativeElement.querySelector('[data-domain-id="b"] p');
    try{
      source.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:3,bubbles:true}));vi.advanceTimersByTime(180);fixture.detectChanges();
      expect(component.heldPreview()).toBeNull();expect(fixture.nativeElement.querySelector('.canvas-viewport [role="status"]').textContent).toContain('Data Owner');
      component.up({pointerId:3,clientX:200,clientY:200} as PointerEvent);fixture.detectChanges();
      expect(component.links()).toHaveLength(0);expect(component.connectionFeedback()).toContain('Ausgangsdomäne');expect(api.saveSemanticGraph).not.toHaveBeenCalled();
    }finally{component.hold.cancel();vi.useRealTimers();if(previous)Object.defineProperty(document,'elementsFromPoint',previous);else Reflect.deleteProperty(document,'elementsFromPoint');}
  });
  it('stages positions and shares them only after explicit save',async()=>{
    const fixture=render(),component=fixture.componentInstance,node=component.nodes()[0];
    component.nodeKey(node,new KeyboardEvent('keydown',{key:'ArrowRight'}));fixture.detectChanges();
    expect(component.layoutDirty()).toBe(true);expect(api.saveSemanticGraph).not.toHaveBeenCalled();await component.save();
    expect(component.dirty()).toBe(false);expect(graph.positions['domain:a'].x).toBe(node.x+10);
    fixture.destroy();expect(render().componentInstance.positions()).toEqual(graph.positions);
  });
  it('creates and deletes links locally, rejecting inverse duplicates and hierarchy cycles',()=>{
    const component=render().componentInstance;
    component.openEdit({index:null,sourceId:'a',targetId:'b',relationType:'partOf'});component.applyLink();
    expect(component.linksDirty()).toBe(true);expect(graph.relations).toHaveLength(0);
    component.openEdit({index:null,sourceId:'b',targetId:'a',relationType:'related'});component.applyLink();expect(component.error()).toContain('bereits');
    component.openEdit({index:null,sourceId:'b',targetId:'c',relationType:'partOf'});component.applyLink();
    component.openEdit({index:null,sourceId:'c',targetId:'a',relationType:'partOf'});component.applyLink();expect(component.error()).toContain('Kreis');
    component.editLink(0);component.deleteLink();expect(component.links()).toHaveLength(1);expect(api.saveSemanticGraph).not.toHaveBeenCalled();component.discard();expect(component.links()).toHaveLength(0);
  });
  it('keeps conflicting drafts and exposes object searches to readers',async()=>{
    const fixture=render(),component=fixture.componentInstance;component.autoLayout();api.saveSemanticGraph.mockReturnValueOnce(throwError(()=>new Error('409')));await component.save();expect(component.dirty()).toBe(true);
    component.saved.set({...graph,canEditLayout:false,canEditRelations:false});component.openEdit({index:null,sourceId:'a',targetId:'b',relationType:'related'});expect(component.edit()).toBeNull();
    const root=fixture.nativeElement as HTMLElement;root.querySelector('.graph-node')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));fixture.detectChanges();
    expect([...root.querySelectorAll('.concept-context-menu button')].filter(button=>button.textContent?.includes('suchen und öffnen'))).toHaveLength(4);
  });
});
