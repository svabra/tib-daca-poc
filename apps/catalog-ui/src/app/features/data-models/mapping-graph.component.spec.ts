import { TestBed } from '@angular/core/testing';
import { MappingDraftFacade } from './mapping-draft.facade';
import { MappingGraphComponent } from './mapping-graph.component';
import { FALLBACK_LOGICAL_MODEL, FALLBACK_MAPPINGS, FALLBACK_PHYSICAL_SNAPSHOT } from './mapping-fallback';

describe('MappingGraphComponent field context menu', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('offers scoped field actions by right click and removes only the selected link', () => {
    TestBed.configureTestingModule({ imports: [MappingGraphComponent], providers: [MappingDraftFacade] });
    const facade = TestBed.inject(MappingDraftFacade);
    facade.initialize(FALLBACK_LOGICAL_MODEL, FALLBACK_PHYSICAL_SNAPSHOT, FALLBACK_MAPPINGS, null);
    const fixture = TestBed.createComponent(MappingGraphComponent);
    fixture.componentRef.setInput('canManage', true);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const field = root.querySelector<HTMLButtonElement>('[data-logical-field-id="field-org-id"]')!;
    const disconnect = vi.fn();
    const deleteField = vi.fn();
    fixture.componentInstance.disconnect.subscribe(disconnect);
    fixture.componentInstance.deleteField.subscribe(deleteField);

    field.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 80 }));
    fixture.detectChanges();
    expect(root.querySelector('[role="menu"]')).not.toBeNull();
    expect(root.querySelectorAll('[role="menuitem"]')).toHaveLength(5);
    const link = [...root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((item) => item.textContent?.includes('org_unit_id'));
    expect(link).toBeDefined();
    link!.click();
    expect(disconnect).toHaveBeenCalledWith({ mappingId: 'mapping-org-id', columnId: 'column-org-id' });
    expect(deleteField).not.toHaveBeenCalled();

    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    fixture.detectChanges();
    [...root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((item) => item.textContent?.includes('Logisches Feld entfernen'))!.click();
    expect(deleteField).toHaveBeenCalledWith('field-org-id');
  });

  it('opens line actions by right click and keyboard, explains mapping types, and removes only the selected relation',()=>{
    TestBed.configureTestingModule({imports:[MappingGraphComponent],providers:[MappingDraftFacade]});
    const facade=TestBed.inject(MappingDraftFacade);facade.initialize(FALLBACK_LOGICAL_MODEL,FALLBACK_PHYSICAL_SNAPSHOT,FALLBACK_MAPPINGS,null);
    const fixture=TestBed.createComponent(MappingGraphComponent);fixture.componentRef.setInput('canManage',true);fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement,edge=root.querySelector('[data-edge-mapping-id="mapping-org-id"]')!;
    edge.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:100,clientY:200}));fixture.detectChanges();
    const select=root.querySelector<HTMLSelectElement>('select[aria-label="Mapping-Typ der Beziehung"]')!;
    expect(select.options).toHaveLength(5);
    select.value='Lookup';select.dispatchEvent(new Event('change'));fixture.detectChanges();
    expect(facade.mappings()[0].mappingType).toBe('Lookup');
    expect(root.querySelector('.edge-context-menu')?.textContent).toContain('Referenz oder Werteliste');
    expect(root.querySelector('.canvas-context-menu')).toBeNull();
    expect(root.querySelectorAll('.edge-handles circle')).toHaveLength(2);
    const disconnect=vi.fn();fixture.componentInstance.disconnect.subscribe(disconnect);
    root.querySelector<HTMLButtonElement>('.edge-context-menu button.is-danger')!.click();
    expect(disconnect).toHaveBeenCalledWith({mappingId:'mapping-org-id',columnId:'column-org-id'});
    edge.querySelector('.edge-hit')!.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}));fixture.detectChanges();
    expect(root.querySelector('.edge-context-menu')).not.toBeNull();
    edge.querySelector('.edge-hit')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));fixture.detectChanges();
    expect(root.querySelector('.edge-context-menu')).toBeNull();
  });

  it('keeps line actions read-only for a viewer and cancels endpoint dragging without modifying a mapping',()=>{
    TestBed.configureTestingModule({imports:[MappingGraphComponent],providers:[MappingDraftFacade]});
    const facade=TestBed.inject(MappingDraftFacade);facade.initialize(FALLBACK_LOGICAL_MODEL,FALLBACK_PHYSICAL_SNAPSHOT,FALLBACK_MAPPINGS,null);
    const fixture=TestBed.createComponent(MappingGraphComponent);fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement,edge=root.querySelector('[data-edge-mapping-id="mapping-org-id"]')!;
    edge.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));fixture.detectChanges();
    const type=root.querySelector<HTMLSelectElement>('.edge-context-menu select')!;
    expect(type.disabled).toBe(true);
    fixture.componentInstance.changeEdgeType('Derived');expect(facade.hasDirtyMappings()).toBe(false);
    fixture.componentInstance.closeMenu();fixture.componentRef.setInput('canManage',true);fixture.detectChanges();
    const handle=root.querySelector<SVGCircleElement>('[data-edge-handle="physical"]')!;
    const down=new MouseEvent('pointerdown',{bubbles:true,cancelable:true,button:0});Object.defineProperty(down,'pointerId',{value:3});handle.dispatchEvent(down);
    expect(fixture.componentInstance.endpointDrag()).not.toBeNull();
    handle.dispatchEvent(new FocusEvent('blur',{bubbles:true}));
    expect(fixture.componentInstance.endpointDrag()).not.toBeNull();
    handle.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    expect(fixture.componentInstance.endpointDrag()).toBeNull();expect(facade.hasDirtyMappings()).toBe(false);
  });

  it('routes document pointer moves and releases to the selected line endpoint',()=>{
    TestBed.configureTestingModule({imports:[MappingGraphComponent],providers:[MappingDraftFacade]});
    const facade=TestBed.inject(MappingDraftFacade);facade.initialize(FALLBACK_LOGICAL_MODEL,FALLBACK_PHYSICAL_SNAPSHOT,FALLBACK_MAPPINGS,null);
    const fixture=TestBed.createComponent(MappingGraphComponent);fixture.componentRef.setInput('canManage',true);fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    root.querySelector('[data-edge-mapping-id="mapping-org-id"]')!.dispatchEvent(new MouseEvent('click',{bubbles:true}));fixture.detectChanges();
    const pointer=(type:string)=>{const event=new MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:350,clientY:300});Object.defineProperty(event,'pointerId',{value:8});return event;};
    root.querySelector('[data-edge-handle="physical"]')!.dispatchEvent(pointer('pointerdown'));
    document.dispatchEvent(pointer('pointermove'));
    expect(fixture.componentInstance.endpointDrag()?.point.x).toBe(350);
    root.querySelector('[data-physical-column-id="column-valid"]')!.dispatchEvent(pointer('pointerup'));
    expect(fixture.componentInstance.endpointDrag()).toBeNull();
    expect(facade.mappings()[0].physicalColumnIds).toEqual(['column-valid','column-employee-org-id']);
    expect(facade.mappings()[0].status).toBe('draft');
  });

  it('does not open mutation actions for a viewer', () => {
    TestBed.configureTestingModule({ imports: [MappingGraphComponent], providers: [MappingDraftFacade] });
    TestBed.inject(MappingDraftFacade).initialize(FALLBACK_LOGICAL_MODEL, FALLBACK_PHYSICAL_SNAPSHOT, FALLBACK_MAPPINGS, null);
    const fixture = TestBed.createComponent(MappingGraphComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const field = root.querySelector<HTMLButtonElement>('[data-logical-field-id="field-org-id"]')!;
    field.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(root.querySelector('[role="menu"]')).toBeNull();
    field.click();
    expect(TestBed.inject(MappingDraftFacade).pendingLogicalFieldId()).toBeNull();
  });
  it('opens the canvas action by mouse and keyboard and renders separate source cards', () => {
    TestBed.configureTestingModule({imports:[MappingGraphComponent],providers:[MappingDraftFacade]});
    const facade=TestBed.inject(MappingDraftFacade);
    facade.initialize(FALLBACK_LOGICAL_MODEL,FALLBACK_PHYSICAL_SNAPSHOT,[],null);
    const table={...FALLBACK_PHYSICAL_SNAPSHOT.tables[0],id:'parquet-table',name:'vehicle.parquet',kind:'parquet' as const};
    facade.addRepresentation({...FALLBACK_PHYSICAL_SNAPSHOT,id:'s3-snapshot',sourceType:'s3',sourceName:'S3 demo',catalogPath:'s3://demo/'},table);
    const fixture=TestBed.createComponent(MappingGraphComponent);fixture.componentRef.setInput('canManage',true);fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.physical-representation')).toHaveLength(FALLBACK_PHYSICAL_SNAPSHOT.tables.length+1);
    expect(root.textContent).toContain('S3 demo');
    const add=vi.fn();fixture.componentInstance.addRepresentation.subscribe(add);
    root.querySelector('.graph-canvas')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.canvas-context-menu button')!.click();
    expect(add).toHaveBeenCalledOnce();
    root.querySelector('.logical-node>header')!.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}));fixture.detectChanges();
    expect(root.querySelector('.canvas-context-menu')).not.toBeNull();
    root.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));fixture.detectChanges();
    expect(root.querySelector('.canvas-context-menu')).toBeNull();
  });

  it('moves cards by dragging and keyboard, keeps layout between graph mounts, and hides only their drawing', () => {
    TestBed.configureTestingModule({imports:[MappingGraphComponent],providers:[MappingDraftFacade]});
    const facade=TestBed.inject(MappingDraftFacade);
    facade.initialize(FALLBACK_LOGICAL_MODEL,FALLBACK_PHYSICAL_SNAPSHOT,FALLBACK_MAPPINGS,null);
    const fixture=TestBed.createComponent(MappingGraphComponent);fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.add-representation')).toBeNull();
    const card=root.querySelector<HTMLElement>('.physical-representation')!,id=card.dataset['representationTableId']!;
    const header=card.querySelector<HTMLElement>('header')!;
    const pointer=(type:string,x:number,y:number)=>{const event=new MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});Object.defineProperty(event,'pointerId',{value:1});return event;};
    header.dispatchEvent(pointer('pointerdown',350,30));
    document.dispatchEvent(pointer('pointermove',470,110));
    document.dispatchEvent(pointer('pointerup',470,110));fixture.detectChanges();
    expect(facade.canvasNodePositions().get('physical:'+id)).toEqual({x:455,y:95});
    header.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true,cancelable:true}));fixture.detectChanges();
    expect(card.style.left).toBe('495px');
    const savedMappings=facade.mappings(),savedRepresentations=facade.representations();
    // A drag must not open the representation menu through its follow-up click.
    header.click();fixture.detectChanges();expect(root.querySelector('.representation-context-menu')).toBeNull();
    header.click();fixture.detectChanges();
    expect(root.querySelector('.representation-context-menu')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('.representation-context-menu button.is-danger')!.click();fixture.detectChanges();
    expect(root.querySelector(`[data-representation-table-id="${id}"]`)).toBeNull();
    expect(facade.mappings()).toBe(savedMappings);expect(facade.representations()).toBe(savedRepresentations);
    expect(facade.hasDirtyMappings()).toBe(false);
    facade.showRepresentation(id);fixture.detectChanges();
    expect(root.querySelector<HTMLElement>(`[data-representation-table-id="${id}"]`)!.style.left).toBe('495px');
    fixture.destroy();
    const reopened=TestBed.createComponent(MappingGraphComponent);reopened.detectChanges();
    expect(reopened.nativeElement.querySelector(`[data-representation-table-id="${id}"]`).style.left).toBe('495px');
  });

  it('does not open drawing actions while connecting a physical column and cancels an interrupted drag',()=>{
    TestBed.configureTestingModule({imports:[MappingGraphComponent],providers:[MappingDraftFacade]});
    const facade=TestBed.inject(MappingDraftFacade);facade.initialize(FALLBACK_LOGICAL_MODEL,FALLBACK_PHYSICAL_SNAPSHOT,FALLBACK_MAPPINGS,null);
    const fixture=TestBed.createComponent(MappingGraphComponent);fixture.componentRef.setInput('canManage',true);fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement,card=root.querySelector<HTMLElement>('.physical-representation')!,id=card.dataset['representationTableId']!;
    root.querySelector<HTMLButtonElement>('.column-endpoint')!.click();fixture.detectChanges();
    expect(root.querySelector('.representation-context-menu')).toBeNull();
    const header=card.querySelector<HTMLElement>('header')!;
    const down=new MouseEvent('pointerdown',{bubbles:true,cancelable:true,clientX:350,clientY:30});Object.defineProperty(down,'pointerId',{value:2});header.dispatchEvent(down);
    const move=new MouseEvent('pointermove',{bubbles:true,clientX:550,clientY:100});Object.defineProperty(move,'pointerId',{value:2});document.dispatchEvent(move);
    const cancel=new Event('pointercancel',{bubbles:true});Object.defineProperty(cancel,'pointerId',{value:2});document.dispatchEvent(cancel);fixture.detectChanges();
    expect(facade.canvasNodePositions().get('physical:'+id)).toEqual({x:335,y:15});
  });

  it('uses facing ports for simultaneous left and right representations and switches back after movement',()=>{
    TestBed.configureTestingModule({imports:[MappingGraphComponent],providers:[MappingDraftFacade]});
    const facade=TestBed.inject(MappingDraftFacade);facade.initialize(FALLBACK_LOGICAL_MODEL,FALLBACK_PHYSICAL_SNAPSHOT,FALLBACK_MAPPINGS,null);
    const fixture=TestBed.createComponent(MappingGraphComponent);fixture.detectChanges();
    facade.moveCanvasNode('logical',{x:450,y:15});
    facade.moveCanvasNode('physical:table-org-unit',{x:15,y:15});
    facade.moveCanvasNode('physical:table-employee',{x:800,y:15});fixture.detectChanges();
    const graph=fixture.componentInstance,root=fixture.nativeElement as HTMLElement;
    const field=root.querySelector<HTMLElement>('[data-logical-field-id="field-org-id"]')!;
    expect(field.classList.contains('has-left-port')).toBe(true);
    expect(field.classList.contains('has-right-port')).toBe(true);
    expect(root.querySelector('[data-representation-table-id="table-org-unit"]')?.classList.contains('is-left-of-logical')).toBe(true);
    const coordinates=(column:string)=>graph.edgePath('field-org-id',column).match(/-?[0-9]+(?:[.][0-9]+)?/g)!.map(Number);
    expect(coordinates('column-org-id')[0]).toBe(449);
    expect(coordinates('column-org-id')[2]).toBe(414);
    expect(coordinates('column-org-id').at(-2)).toBe(236);
    expect(coordinates('column-employee-org-id')[0]).toBe(671);
    expect(coordinates('column-employee-org-id').at(-2)).toBe(799);
    facade.moveCanvasNode('physical:table-org-unit',{x:800,y:400});fixture.detectChanges();
    expect(field.classList.contains('has-left-port')).toBe(false);
    expect(field.classList.contains('has-right-port')).toBe(true);
    expect(coordinates('column-org-id')[0]).toBe(671);
    expect(coordinates('column-org-id').at(-2)).toBe(799);
    expect(facade.hasDirtyMappings()).toBe(false);
  });

  it('offers fullscreen as a canvas plus and keeps the title specific to the logical model',()=>{
    TestBed.configureTestingModule({imports:[MappingGraphComponent],providers:[MappingDraftFacade]});
    TestBed.inject(MappingDraftFacade).initialize(FALLBACK_LOGICAL_MODEL,FALLBACK_PHYSICAL_SNAPSHOT,[],null);
    const fixture=TestBed.createComponent(MappingGraphComponent);fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement,toggle=vi.fn();fixture.componentInstance.toggleFullscreen.subscribe(toggle);
    const button=root.querySelector<HTMLButtonElement>('.canvas-tools .fullscreen-toggle')!;
    expect(button.textContent?.trim()).toBe('+');button.click();expect(toggle).toHaveBeenCalledWith(button);
    expect(root.querySelector('h2')?.textContent).toContain('Organisationseinheiten');
    expect(root.querySelector('.canvas-tools .canvas-print')).not.toBeNull();
    fixture.componentRef.setInput('fullscreen',true);fixture.detectChanges();
    expect(button.textContent?.trim()).toBe('−');expect(button.getAttribute('aria-label')).toBe('Vollbild verlassen');
  });

  it('offers assignment only without a domain and opens assigned domains from both model headers',()=>{
    TestBed.configureTestingModule({imports:[MappingGraphComponent],providers:[MappingDraftFacade]});
    const facade=TestBed.inject(MappingDraftFacade),unassigned={...FALLBACK_LOGICAL_MODEL,dataDomain:{id:'',displayName:'Keine Domäne zugeordnet'}};
    facade.initialize(unassigned,FALLBACK_PHYSICAL_SNAPSHOT,[],null);
    const fixture=TestBed.createComponent(MappingGraphComponent);fixture.componentRef.setInput('canManage',true);fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement,assign=vi.fn();fixture.componentInstance.assignDomain.subscribe(assign);
    root.querySelector('.logical-node>header')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));fixture.detectChanges();
    [...root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((item)=>item.textContent==='Domäne zuordnen')!.click();
    expect(assign).toHaveBeenCalledWith(expect.objectContaining({tableId:null}));
    const card=root.querySelector<HTMLElement>('.physical-representation')!;
    card.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));fixture.detectChanges();
    [...root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((item)=>item.textContent==='Domäne zuordnen')!.click();
    expect(assign).toHaveBeenLastCalledWith(expect.objectContaining({tableId:card.dataset['representationTableId']}));
    const snapshot={...FALLBACK_PHYSICAL_SNAPSHOT,tables:FALLBACK_PHYSICAL_SNAPSHOT.tables.map((table)=>({...table,dataDomains:[{id:'domain-personal',displayName:'Personal',lifecycle:'active' as const}]}))};
    facade.initialize(FALLBACK_LOGICAL_MODEL,snapshot,[],null);fixture.componentRef.setInput('canManage',false);fixture.detectChanges();
    root.querySelector('.logical-node>header')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));fixture.detectChanges();
    expect(root.querySelector<HTMLAnchorElement>('.canvas-context-menu a')?.getAttribute('href')).toBe('/domains/domain-personal');
    expect(root.querySelector('.canvas-context-menu')?.textContent).not.toContain('Domäne zuordnen');
    root.querySelector('.physical-representation')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));fixture.detectChanges();
    expect(root.querySelector<HTMLAnchorElement>('.representation-context-menu a')?.getAttribute('target')).toBe('_blank');
    expect(root.querySelector('.physical-representation .model-domain')?.textContent).toContain('Personal');
    expect(root.querySelector('.logical-node .model-domain')?.textContent).toContain('Personal');
  });

});


describe('MappingGraphComponent hold-to-connect', () => {
  afterEach(() => { vi.useRealTimers(); TestBed.resetTestingModule(); });
  function setup() {
    TestBed.configureTestingModule({imports: [MappingGraphComponent], providers: [MappingDraftFacade]});
    const facade=TestBed.inject(MappingDraftFacade);
    facade.initialize(FALLBACK_LOGICAL_MODEL,FALLBACK_PHYSICAL_SNAPSHOT,[],null);
    const fixture=TestBed.createComponent(MappingGraphComponent);
    fixture.componentRef.setInput('canManage',true);
    fixture.componentRef.setInput('responsibleUserId','cinthya.thor');
    fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    const logical=root.querySelector<HTMLElement>('[data-logical-field-id="field-valid"]')!;
    const physical=root.querySelector<HTMLElement>('[data-physical-column-id="column-valid"]')!;
    return {facade,fixture,root,logical,physical};
  }
  function pointer(element:EventTarget,type:string,x=100,y=100) {
    const event=new MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});
    Object.defineProperty(event,'pointerId',{value:12});element.dispatchEvent(event);
  }
  for(const reverse of [false,true]) it(`draws a red preview and creates one draft ${reverse?'physical to logical':'logical to physical'}`,()=>{
    vi.useFakeTimers();const {facade,fixture,root,logical,physical}=setup();
    const source=reverse?physical:logical,target=reverse?logical:physical;
    pointer(source,'pointerdown');vi.advanceTimersByTime(349);fixture.detectChanges();
    expect(root.querySelector('.connection-preview')).toBeNull();
    vi.advanceTimersByTime(1);fixture.detectChanges();
    expect(root.querySelectorAll('.connection-preview circle')).toHaveLength(2);
    pointer(document,'pointermove',300,240);fixture.detectChanges();
    expect(root.querySelector('.connection-preview path')?.getAttribute('d')).toContain('300 240');
    pointer(target,'pointerup',300,240);source.click();fixture.detectChanges();
    expect(root.querySelector('.connection-preview')).toBeNull();
    expect(facade.mappings()).toHaveLength(1);expect(facade.mappings()[0].status).toBe('draft');
    expect(facade.mappings()[0].logicalFieldVersionIds).toEqual(['field-valid']);
    expect(facade.mappings()[0].physicalColumnIds).toEqual(['column-valid']);
    expect(facade.editor()).toBeNull();expect(facade.pendingLogicalFieldId()).toBeNull();
  });
  it('cancels early movement, escape, pointer cancellation and drops on the same side',()=>{
    vi.useFakeTimers();const {facade,fixture,root,logical}=setup();
    pointer(logical,'pointerdown');pointer(document,'pointermove',115,100);vi.advanceTimersByTime(400);
    expect(fixture.componentInstance.connectionDrag()).toBeNull();
    for(const cancel of ['escape','pointercancel','same-side']) {
      pointer(logical,'pointerdown');vi.advanceTimersByTime(350);fixture.detectChanges();
      if(cancel==='escape')logical.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      else pointer(cancel==='same-side'?logical:document,cancel==='same-side'?'pointerup':'pointercancel');
      fixture.detectChanges();expect(root.querySelector('.connection-preview')).toBeNull();
    }
    expect(facade.mappings()).toHaveLength(0);
  });
  it('preserves short-click interaction and prevents a viewer or lost permission from drawing a link',()=>{
    vi.useFakeTimers();const {facade,fixture,logical,physical}=setup();
    pointer(logical,'pointerdown');pointer(logical,'pointerup');logical.click();physical.click();
    expect(facade.editor()?.logicalFieldVersionIds).toEqual(['field-valid']);
    facade.closeEditor(false);
    fixture.componentRef.setInput('canManage',false);fixture.detectChanges();
    pointer(logical,'pointerdown');vi.advanceTimersByTime(400);
    expect(fixture.componentInstance.connectionDrag()).toBeNull();
    fixture.componentRef.setInput('canManage',true);fixture.detectChanges();
    pointer(logical,'pointerdown');vi.advanceTimersByTime(350);
    fixture.componentRef.setInput('canManage',false);fixture.detectChanges();pointer(physical,'pointerup');
    expect(facade.mappings()).toHaveLength(0);
  });
});
