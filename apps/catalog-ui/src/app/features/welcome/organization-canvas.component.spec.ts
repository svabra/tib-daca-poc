import { provideHttpClient, HttpHeaders } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { OrganizationCanvasComponent, OrganizationNetwork, OrganizationNode } from './organization-canvas.component';
import { OrganizationView } from './organization-view';
import { ORGANIZATION_CARD, clearsOrganizationBoundary } from './organization-layout';

const node = (id: string, parentId: string | null, code: string, kind = 'office'): OrganizationNode => ({ id, parentId, code, label: code, kind, description: `${code} Details`, registry: true, productCount: 2, directProductCount: 0, consumedProductCount: 1, directConsumedProductCount: 1, domainIds: ['tax'] });
const graph: OrganizationNetwork = {
  homeId: 'efd', ownOrganizationId: 'estv',
  nodes: [node('efd', null, 'EFD', 'department'), node('estv', 'efd', 'ESTV'), node('bi', 'estv', 'Business Intelligence'), node('vbs', null, 'VBS', 'department'), node('ne', null, 'Neuchâtel', 'cantonal')],
  satelliteIds: ['vbs', 'ne'], domains: [{ id: 'tax', label: 'Steuern', description: 'Steuerdaten', organizationIds: ['efd', 'estv'], productCount: 2 }],
  relations: [{ sourceId: 'estv', targetId: 'ne', count: 1, inferred: false, evidence: ['catalog'] }],
};

describe('OrganizationCanvasComponent', () => {
  const userId = signal('kassandra.valdata');
  const language = signal<'de'|'fr'|'it'|'en'|'rm'>('de');
  beforeEach(() => {
    userId.set('kassandra.valdata');
    language.set('de');
    TestBed.configureTestingModule({ imports: [OrganizationCanvasComponent], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: DemoIdentityService, useValue: { userId, headers: computed(() => new HttpHeaders({ 'X-DaCa-User': userId() })) } },
      { provide: UserPreferencesService, useValue: { language } },
    ] });
  });
  afterEach(() => { try { TestBed.inject(HttpTestingController).verify(); } finally { TestBed.resetTestingModule(); } });
  function render(network = graph, view: OrganizationView = {revision:0,configuration:{schemaVersion:1,scopes:{}}}, enableDomains = true, hideUnrelated = false) {
    const fixture = TestBed.createComponent(OrganizationCanvasComponent); fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController); http.expectOne('/api/v1/organization-network').flush(network); http.expectOne('/api/v1/organization-network/view').flush(view); fixture.detectChanges();
    // Existing layout cases explicitly opt into the optional domain layer.
    if (enableDomains) { fixture.componentInstance.showDomains.set(true); fixture.detectChanges(); }
    // Empty-card/layout cases opt out; default-filter cases leave the initial state intact.
    if (!hideUnrelated) { fixture.componentInstance.setHideUnrelatedOrganizations(false); fixture.detectChanges(); }
    return { fixture, root: fixture.nativeElement as HTMLElement, http };
  }
  it('keeps external organizations outside while dragging and using arrow keys, also in fullscreen',()=>{
    const {fixture,root,http}=render(graph,undefined,false),component=fixture.componentInstance;
    vi.spyOn(root.querySelector('.org-stage')!,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:960,height:650,right:960,bottom:650,x:0,y:0,toJSON:()=>({})});
    for(const fullscreen of [false,true]){
      if(fullscreen){root.querySelector<HTMLButtonElement>('.org-fullscreen')!.click();fixture.detectChanges();}
      const before=component.satellites().find(item=>item.node.id==='ne')!,card=root.querySelector('[data-organization-id="ne"]')!;
      card.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:8,clientX:before.x,clientY:before.y,bubbles:true}));
      document.dispatchEvent(new PointerEvent('pointermove',{pointerId:8,clientX:480,clientY:330,bubbles:true,cancelable:true}));fixture.detectChanges();
      document.dispatchEvent(new PointerEvent('pointerup',{pointerId:8,bubbles:true}));
      expect(clearsOrganizationBoundary({...component.satellites().find(item=>item.node.id==='ne')!,...ORGANIZATION_CARD})).toBe(true);
      for(let index=0;index<30;index++){
        card.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));fixture.detectChanges();
        expect(clearsOrganizationBoundary({...component.satellites().find(item=>item.node.id==='ne')!,...ORGANIZATION_CARD})).toBe(true);
      }
    }
    expect(component.focusId()).toBe('efd');
    http.expectNone(request=>request.method==='PUT');
  });
  it('rejects group moves across the boundary and corrects legacy external anchors for display only',()=>{
    const view:OrganizationView={revision:1,configuration:{schemaVersion:1,scopes:{efd:{offices:{},satellites:{ne:{x:480,y:330},vbs:{x:80,y:320}}},overview:{offices:{efd:{x:300,y:400}},satellites:{}}}}};
    const {fixture,http}=render(graph,view,false),component=fixture.componentInstance;
    expect(clearsOrganizationBoundary({...component.satellites().find(item=>item.node.id==='ne')!,...ORGANIZATION_CARD})).toBe(true);
    expect(component.draft()).toEqual(view.configuration);expect(component.dirty()).toBe(false);
    const items=component.selection.items().filter(item=>item.id==='vbs'||item.id==='ne');
    expect(component.selection.accepts!(items)).toBe(true);
    expect(component.selection.accepts!(items.map(item=>({...item,x:480,y:330})))).toBe(false);
    expect(component.selection.accepts!([{id:'vbs',x:150,y:320}])).toBe(false);
    const before=component.draft(),snapshot=component.selection.begin();
    const moved=items.map(item=>({...item,x:item.x+5}));
    expect(component.selection.accepts!(moved)).toBe(true);component.selection.move(moved);component.selection.finish();
    component.saveLayout();const request=http.expectOne('/api/v1/organization-network/view');
    expect(request.request.body.configuration.scopes['overview']).toEqual(view.configuration.scopes['overview']);
    for(const point of Object.values(request.request.body.configuration.scopes['efd'].satellites) as {x:number;y:number}[])expect(clearsOrganizationBoundary({...point,...ORGANIZATION_CARD})).toBe(true);
    request.flush({revision:2,configuration:component.draft()});fixture.detectChanges();
    component.selection.cancel(snapshot);expect(component.draft()).toEqual(before);
  });
  it('filters only organizations with neither supply nor consumption, inside and outside the current area',()=>{
    const network=structuredClone(graph);
    network.nodes.push(node('empty','efd','EMPTY'),node('consumer','efd','CONSUMER'),node('outside-empty',null,'OUTSIDE'));
    for(const item of network.nodes){
      item.productCount=['efd','estv','ne'].includes(item.id)?2:0;
      item.consumedProductCount=['efd','consumer','vbs'].includes(item.id)?1:0;
    }
    network.satelliteIds.push('outside-empty');
    const {fixture,root,http}=render(network,undefined,false,true),component=fixture.componentInstance;
    expect(component.hideUnrelatedOrganizations()).toBe(true);
    expect(root.querySelector('.org-heading [role="switch"]')).toBeNull();
    const switches=root.querySelectorAll('.org-layout-toolbar [role="switch"]');
    expect(switches[0].hasAttribute('data-hide-unrelated-switch')).toBe(true);
    expect(switches[1].closest('.org-layer')).not.toBeNull();
    expect(switches[0].getAttribute('aria-label')).toBe('Orgs ohne DP-Beziehungen ausblenden');
    expect(root.querySelector('.org-navigation-row [role="switch"],daca-canvas-selection-hint')).toBeNull();
    expect(component.children().map(item=>item.id)).toEqual(['estv','consumer']);
    expect(component.satellites().map(item=>item.node.id)).toEqual(['vbs','ne']);
    expect(root.querySelector('[data-organization-id="empty"]')).toBeNull();
    (switches[0] as HTMLButtonElement).click();fixture.detectChanges();
    expect(root.querySelector('[data-organization-id="empty"]')).not.toBeNull();
    (switches[0] as HTMLButtonElement).click();fixture.detectChanges();
    expect(component.focusId()).toBe('efd');
    component.overview();fixture.detectChanges();
    expect(component.overviewNodes().map(item=>item.id)).toEqual(['efd','vbs','ne']);
    component.enter(network.nodes.find(item=>item.id==='empty')!);fixture.detectChanges();
    expect(root.querySelector('.org-focus-title')?.textContent).toContain('EMPTY');
    expect(root.querySelector('.org-no-children')?.textContent).toContain('Keine weiteren Organisationen mit Datenproduktbeziehung');
    expect(component.breadcrumbs().map(item=>item.id)).toEqual(['efd','empty']);
    http.expectNone(request=>request.method==='PUT');
  });
  it('retains hidden organization anchors and independent domain bubbles without dirtying the view',()=>{
    const network=structuredClone(graph);
    network.nodes.push({...node('empty','efd','EMPTY'),productCount:0,consumedProductCount:0});
    network.domains.push({id:'empty-domain',label:'Domain only',description:'',organizationIds:['efd','empty'],productCount:0});
    const view:OrganizationView={revision:1,configuration:{schemaVersion:1,scopes:{efd:{offices:{empty:{x:50,y:180},estv:{x:210,y:180},'domain:empty-domain':{x:380,y:230}},satellites:{ne:{x:100,y:300}}}}}};
    const {fixture,root,http}=render(network,view),component=fixture.componentInstance;
    const original=structuredClone(component.draft()),position=component.offices().find(item=>item.id==='estv');
    component.setHideUnrelatedOrganizations(true);fixture.detectChanges();
    expect(component.domainBubbles().some(item=>item.domain.id==='empty-domain')).toBe(true);
    expect(component.draft()).toEqual(original);expect(component.dirty()).toBe(false);
    expect(component.offices().find(item=>item.id==='estv')?.x).toBe(position?.x);
    component.overview();fixture.detectChanges();
    expect(component.domainBubbles().some(item=>item.domain.id==='empty-domain')).toBe(true);
    component.enter(network.nodes[0]);component.setHideUnrelatedOrganizations(false);fixture.detectChanges();
    expect(root.querySelector('[data-organization-id="empty"]')).not.toBeNull();
    expect(component.draft()).toEqual(original);expect(component.dirty()).toBe(false);
    http.expectNone(request=>request.method==='PUT');
  });
  it('offers the same keyboard-accessible checked filter in organization and domain context menus',()=>{
    const {fixture,root}=render(),component=fixture.componentInstance;
    root.querySelector('.org-focus')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));fixture.detectChanges();
    const menu=root.querySelector('[role="menu"]')!,option=menu.querySelector<HTMLButtonElement>('[data-hide-unrelated-option]')!;
    expect(option.getAttribute('aria-checked')).toBe('false');
    menu.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));
    expect(document.activeElement).toBe(option);
    option.click();fixture.detectChanges();
    expect(component.hideUnrelatedOrganizations()).toBe(true);expect(component.menu()).toBeNull();
    root.querySelector('.org-domain-bubble')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));fixture.detectChanges();
    const domainOption=root.querySelector<HTMLButtonElement>('[data-hide-unrelated-option]')!;
    expect(domainOption.getAttribute('aria-checked')).toBe('true');
    domainOption.click();fixture.detectChanges();expect(component.hideUnrelatedOrganizations()).toBe(false);
  });
  it('explains the organization filter with the shared tooltip in all five UI languages',()=>{
    const {fixture,root}=render(graph,undefined,false),component=fixture.componentInstance;
    for(const locale of ['de','fr','it','rm','en'] as const){
      language.set(locale);fixture.detectChanges();
      const label=root.querySelector<HTMLElement>('.org-relationship-filter')!;
      label.dispatchEvent(new MouseEvent('mouseenter'));fixture.detectChanges();
      expect(document.querySelector('.daca-glossary-tooltip.is-visible')?.textContent).toBe(component.hideUnrelatedHint());
      expect(root.querySelector('[data-hide-unrelated-switch]')?.getAttribute('aria-label')).toBe(component.hideUnrelatedLabel());
      if(locale!=='de')expect(component.hideUnrelatedLabel()).not.toContain('ausblenden');
      label.dispatchEvent(new MouseEvent('mouseleave'));fixture.detectChanges();
    }
  });
  it('releases the area below the measured heading for single/group moves and protects longer headings',()=>{
    const {fixture,root}=render(),component=fixture.componentInstance;
    const rect=(x:number,y:number,width:number,height:number)=>({left:x,top:y,width,height,right:x+width,bottom:y+height,x,y,toJSON:()=>({})});
    vi.spyOn(root.querySelector('.org-stage')!,'getBoundingClientRect').mockReturnValue(rect(0,0,960,650));
    const heading=vi.spyOn(root.querySelector('.org-focus')!,'getBoundingClientRect').mockReturnValue(rect(346,120,268,70));
    component.measureChildren();fixture.detectChanges();
    const target={id:'estv',x:278,y:130};
    expect(component.selection.accepts!([target])).toBe(true);
    const card=component.offices().find(item=>item.id==='estv')!;
    component.cardKey(new KeyboardEvent('keydown',{key:'ArrowUp',cancelable:true}),'estv','offices',{x:278,y:140},card.width,card.height);fixture.detectChanges();
    expect(component.draft().scopes['efd'].offices['estv']).toEqual({x:278,y:10});
    const savedDraft=structuredClone(component.draft());
    heading.mockReturnValue(rect(346,120,268,130));component.measureChildren();fixture.detectChanges();
    expect(component.selection.accepts!([target])).toBe(false);
    expect(component.selection.accepts!([{...target,y:200}])).toBe(true);
    expect(component.draft()).toEqual(savedDraft);
    language.set('fr');
    expect(component.headingArea().height).toBe(96);fixture.detectChanges();
    component.measureChildren();fixture.detectChanges();expect(component.headingArea().height).toBe(130);
  });
  it('moves office and domain groups in personal anchors, cancels cleanly and preserves them on save',()=>{
    const {fixture,http}=render(),component=fixture.componentInstance;
    const items=component.selection.items(),before=component.draft(),snapshot=component.selection.begin();
    const group=items.filter(item=>item.id==='estv'||item.id==='domain:tax');
    expect(group).toHaveLength(2);component.selection.move(group.map(item=>({...item,x:item.x+5,y:item.y+5})));component.selection.finish();
    const moved=component.draft();expect(component.dirty()).toBe(true);
    component.selection.cancel(snapshot);expect(component.draft()).toEqual(before);expect(component.dirty()).toBe(false);
    component.draft.set(moved);component.saveLayout();
    const request=http.expectOne('/api/v1/organization-network/view');expect(request.request.method).toBe('PUT');
    expect(request.request.body.configuration).toEqual(moved);
    request.flush({revision:1,configuration:moved});fixture.detectChanges();expect(component.dirty()).toBe(false);
  });
  it('continues flows inside measured content-fit cards after their height changes',()=>{
    const {fixture,root}=render(),component=fixture.componentInstance;component.overview();fixture.detectChanges();
    const rect=(x:number,y:number,width:number,height:number)=>({left:x,top:y,width,height,right:x+width,bottom:y+height,x,y,toJSON:()=>({})});
    vi.spyOn(root.querySelector('.org-stage')!,'getBoundingClientRect').mockReturnValue(rect(0,0,960,650));
    vi.spyOn(root.querySelector('.org-office-field')!,'getBoundingClientRect').mockReturnValue(rect(0,0,960,650));
    const source=vi.spyOn(root.querySelector('[data-organization-id="efd"]')!,'getBoundingClientRect').mockReturnValue(rect(100,200,120,40));
    vi.spyOn(root.querySelector('[data-organization-id="ne"]')!,'getBoundingClientRect').mockReturnValue(rect(100,400,120,60));
    component.measureChildren();fixture.detectChanges();
    expect(component.threads()[0].from).toEqual({x:160,y:221});expect(component.threads()[0].to).toEqual({x:160,y:429});
    expect(component.threads()[0].ribbonPath.startsWith('M 160 220 C ')).toBe(true);
    expect(component.threads()[0].ribbonPath.endsWith('160 430')).toBe(true);
    source.mockReturnValue(rect(100,180,120,80));component.measureChildren();fixture.detectChanges();
    expect(component.threads()[0].from).toEqual({x:160,y:224});
  });
  it('keeps ribbons out of focused title text while extending them underneath actual cards',()=>{
    const {fixture}=render(),component=fixture.componentInstance;
    component.enter(graph.nodes.find(item=>item.id==='estv')!);fixture.detectChanges();
    const thread=component.threads()[0];
    expect(thread.ribbonPath.startsWith(`M ${Math.round(thread.from.x*100)/100} ${Math.round(thread.from.y*100)/100} C `)).toBe(true);
    expect(component.dirty()).toBe(false);
  });
  it('omits repeated organization names in every UI language while preserving additional descriptions',()=>{
    const {fixture}=render(graph,undefined,false),component=fixture.componentInstance;
    for(const locale of ['de','fr','it','rm','en'] as const){
      language.set(locale);fixture.detectChanges();
      const organization={...graph.nodes[1],label:'Amt Beispiel',description:'  Amt   Beispiel  '};
      const text=component.organizationTooltip(organization);
      expect(text.split('Amt Beispiel')).toHaveLength(2);
      expect(text).not.toContain('Amt   Beispiel');
      expect(component.organizationTooltip({...organization,description:'Zusätzliche Angaben zur Organisation.'})).toContain('Zusätzliche Angaben zur Organisation.');
    }
    expect(component.organizationTooltip(null)).toBe('');
  });
  it('starts with domains disabled and enables them only on request without changing saved anchors',()=>{
    const {fixture,root,http}=render(graph,undefined,false),component=fixture.componentInstance;
    expect(root.querySelector('.org-layer [role="switch"]')?.getAttribute('aria-checked')).toBe('false');
    expect(root.querySelector('.org-domain-bubble')).toBeNull();expect(component.domainThreads()).toEqual([]);
    const saved=structuredClone(component.draft());
    (root.querySelector('.org-layer [role="switch"]') as HTMLButtonElement).click();fixture.detectChanges();
    expect(root.querySelector('.org-domain-bubble')).not.toBeNull();
    component.enter(graph.nodes.find(node=>node.id==='estv')!);fixture.detectChanges();expect(component.showDomains()).toBe(true);
    expect(component.draft()).toEqual(saved);expect(component.dirty()).toBe(false);http.expectNone(request=>request.method==='PUT');
  });
  it('opens all organization products with exact expert-search filters and no text/status restriction',()=>{
    const network=structuredClone(graph);
    network.nodes.find(node=>node.id==='estv')!.objectKeys=['product:draft','product:consumed'];
    network.nodes.find(node=>node.id==='vbs')!.objectKeys=['domain:example'];
    const {fixture,root}=render(network,undefined,false);
    root.querySelector('[data-organization-id="estv"]')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));fixture.detectChanges();
    const link=root.querySelector<HTMLAnchorElement>('a[data-organization-product-search]')!;
    expect(link.textContent).toContain('Alle Datenprodukte der Organisation anzeigen');
    expect(link.getAttribute('href')).toBe('/search?organization=estv&kind=product');expect(link.target).toBe('');
    language.set('rm');fixture.detectChanges();
    // Language changes dismiss an open context menu; reopen for localized copy.
    root.querySelector('[data-organization-id="estv"]')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));fixture.detectChanges();
    expect(root.querySelector('[data-organization-product-search]')?.textContent).toContain('Mussar tut ils products da datas');
    fixture.componentInstance.closeMenu();fixture.detectChanges();
    root.querySelector('[data-organization-id="vbs"]')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));fixture.detectChanges();
    expect(root.querySelector<HTMLButtonElement>('[data-organization-product-search]')!.disabled).toBe(true);
  });
  it('renders one point per product in reciprocal lanes without arrows and explains this in all languages', () => {
    const network = structuredClone(graph);
    network.relations.push({sourceId:'ne',targetId:'estv',count:2,inferred:false,evidence:['catalog']});
    const {fixture,root} = render(network), component = fixture.componentInstance;
    const [outgoing,incoming] = component.threads();
    expect(incoming.from).toEqual(outgoing.to); expect(incoming.to).toEqual(outgoing.from);
    expect(incoming.offset.x).toBeCloseTo(-outgoing.offset.x); expect(incoming.offset.y).toBeCloseTo(-outgoing.offset.y);
    expect(root.querySelector('[data-source-id="ne"][data-target-id="estv"]')!.querySelectorAll('.org-packet')).toHaveLength(2);
    expect(root.querySelector('[data-source-id="estv"][data-target-id="ne"]')!.querySelectorAll('.org-packet')).toHaveLength(1);
    expect(root.querySelector('.org-flow-direction')).toBeNull();
    expect(root.querySelectorAll('.org-domain-thread .org-packet')).toHaveLength(0);
    const hit = root.querySelector<SVGElement>('.org-thread-hit')!;
    expect(hit.getAttribute('tabindex')).toBe('0'); expect(hit.querySelector('title')).toBeNull();
    for(const [locale,text] of [['de','Ein Punkt steht für ein konsumiertes Datenprodukt'],['fr','Un point représente un produit de données consommé'],['it','Un punto rappresenta un prodotto di dati consumato'],['rm','In punct represchenta in product da datas consumà'],['en','One point represents one consumed data product']] as const){
      language.set(locale); fixture.detectChanges();
      hit.dispatchEvent(new Event('mouseenter'));
      expect(document.querySelector('[role="tooltip"]')?.textContent).toContain(text);
      expect(hit.getAttribute('aria-label')).toContain(text);
      hit.dispatchEvent(new Event('mouseleave'));
    }
    expect(component.threads()[0].label).toContain('not live requests');
  });
  it('preserves legacy anchors and saves new positions beside the title without rebasing other scopes', () => {
    const view:OrganizationView={revision:2,configuration:{schemaVersion:1,scopes:{
      efd:{offices:{estv:{x:70,y:90}},satellites:{}},
      overview:{offices:{efd:{x:300,y:400}},satellites:{}},
    }}};
    const {fixture,http}=render(graph,view),component=fixture.componentInstance;
    expect(component.offices().find(item=>item.id==='estv')!.y+component.officeField().y).toBe(330);
    for(let i=0;i<24;i++){
      const card=component.offices().find(item=>item.id==='estv')!;
      component.cardKey(new KeyboardEvent('keydown',{key:'ArrowUp',cancelable:true}),'estv','offices',card,card.width,card.height);
    }
    expect(component.draft().scopes['efd'].offices['estv'].y).toBeLessThan(0);
    expect(component.draft().scopes['overview']).toEqual(view.configuration.scopes['overview']);
    component.saveLayout();
    const request=http.expectOne('/api/v1/organization-network/view');
    const saved={revision:3,configuration:request.request.body.configuration};request.flush(saved);fixture.detectChanges();
    const position=component.offices().find(item=>item.id==='estv')!.y;
    fixture.destroy();
    expect(render(graph,saved).fixture.componentInstance.offices().find(item=>item.id==='estv')!.y).toBe(position);
  });
  it('distinguishes offering and consumption on cards, focus, tooltips and the accessible list', () => {
    const network = structuredClone(graph);
    network.nodes.find(node => node.id === 'ne')!.productCount = 0;
    network.nodes.find(node => node.id === 'ne')!.consumedProductCount = 3;
    const {fixture,root} = render(network), component = fixture.componentInstance;
    const card = root.querySelector('[data-organization-id="ne"]')!;
    expect(card.querySelector('.org-offered-count dt')?.textContent).toBe('angebotene DP');
    expect(card.querySelector('.org-offered-count dd')?.textContent).toBe('0');
    expect(card.querySelector('.org-consumed-count dt')?.textContent).toBe('konsumierende DP');
    expect(card.querySelector('.org-consumed-count dd')?.textContent).toBe('3');
    expect(card.getAttribute('aria-label')).toContain('0 angebotene Datenprodukte · 3 konsumierte Datenprodukte');
    expect(root.querySelector('.org-focus-counts')?.textContent).toContain('2 angebotene Datenprodukte · 1 konsumiertes Datenprodukt');
    expect(root.querySelector('.org-accessible-list')?.textContent).toContain('0 angebotene Datenprodukte · 3 konsumierte Datenprodukte');
    expect(component.organizationTooltip(network.nodes.find(node => node.id === 'ne')!)).toContain('keine Abrufstatistik');
    expect(root.querySelector('.org-count-legend')?.textContent).toContain('Konsumation (Datenprodukte)');
    language.set('fr'); fixture.detectChanges();
    expect(card.getAttribute('aria-label')).toContain('0 produit de données proposé · 3 produits de données consommés');
    component.enter(component.byId().get('ne')!); fixture.detectChanges();
    expect(root.querySelector('.org-focus-counts')?.textContent).toContain('3 produits de données consommés');
  });
  it('shares singular and plural counts across Romansh cards, focus, domain tooltips and connections', () => {
    const network=structuredClone(graph);
    network.nodes.find(item=>item.id==='estv')!.productCount=1;
    network.domains[0].productCount=1;
    language.set('rm');
    const {fixture,root,http}=render(network),component=fixture.componentInstance;
    expect(root.textContent).toContain('Spazi da datas');
    const card=root.querySelector('[data-organization-id="estv"]')!;
    expect(card.getAttribute('aria-label')).toContain('1 product da datas purschì · 1 product da datas consumà');
    expect(component.threads()[0].label).toContain('1 product da datas consumà');
    expect(component.domainTooltip(network.domains[0])).toContain('1 product da datas purschì');
    expect(root.querySelector('.org-domain-assignment')?.getAttribute('aria-label')).toContain('1 product da datas purschì');
    component.enter(component.byId().get('estv')!); fixture.detectChanges();
    expect(root.querySelector('.org-focus-counts')?.textContent).toContain('1 product da datas purschì');
    language.set('de'); fixture.detectChanges();
    expect(root.querySelector('.org-focus-counts')?.textContent).toContain('1 angebotenes Datenprodukt');
    expect(component.domainTooltip({...network.domains[0],productCount:2})).toContain('2 angebotene Datenprodukte');
    http.expectNone(request=>request.method==='PUT');
    http.expectNone('/api/v1/organization-network');
  });
  it('moves domain bubbles without native link dragging and explicitly saves/restores their private anchors', () => {
    const view:OrganizationView={revision:2,configuration:{schemaVersion:1,scopes:{
      efd:{offices:{estv:{x:70,y:90}},satellites:{}},
      overview:{offices:{efd:{x:300,y:400}},satellites:{}},
    }}};
    const {fixture,root,http}=render(graph,view),component=fixture.componentInstance;
    const bubble=root.querySelector<HTMLAnchorElement>('.org-domain-bubble')!,before=component.domainBubbles()[0];
    vi.spyOn(root.querySelector('.org-stage')!,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:960,height:650,right:960,bottom:650,x:0,y:0,toJSON:()=>({})});
    expect(bubble.draggable).toBe(false);expect(bubble.getAttribute('href')).toBe('/domains/tax');
    const nativeDrag=new Event('dragstart',{cancelable:true,bubbles:true});bubble.dispatchEvent(nativeDrag);expect(nativeDrag.defaultPrevented).toBe(true);
    bubble.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:5,clientX:100,clientY:100,bubbles:true}));
    document.dispatchEvent(new PointerEvent('pointermove',{pointerId:5,clientX:120,clientY:120,bubbles:true,cancelable:true}));fixture.detectChanges();
    expect(component.draggingId()).toBe('domain:tax');expect(bubble.classList.contains('is-dragging')).toBe(true);
    expect(component.domainBubbles()[0].x===before.x&&component.domainBubbles()[0].y===before.y).toBe(false);
    document.dispatchEvent(new PointerEvent('pointerup',{pointerId:5,bubbles:true}));
    const dragClick=new MouseEvent('click',{detail:1,bubbles:true,cancelable:true});bubble.dispatchEvent(dragClick);expect(dragClick.defaultPrevented).toBe(true);
    expect(component.focusId()).toBe('efd');expect(component.draft().scopes['efd'].offices['estv']).toEqual(view.configuration.scopes['efd'].offices['estv']);
    const position={x:component.domainBubbles()[0].x,y:component.domainBubbles()[0].y};
    component.showDomains.set(false);fixture.detectChanges();component.showDomains.set(true);fixture.detectChanges();
    expect(component.domainBubbles()[0]).toMatchObject(position);
    expect(component.dirty()).toBe(true);http.expectNone(request=>request.method==='PUT');
    component.saveLayout();const save=http.expectOne('/api/v1/organization-network/view');
    expect(save.request.body.configuration.scopes['efd'].offices['domain:tax']).toEqual({x:position.x,y:position.y-120});
    const saved={revision:3,configuration:save.request.body.configuration};save.flush(saved);fixture.detectChanges();
    fixture.destroy();const restored=render(graph,saved);
    expect(restored.fixture.componentInstance.domainBubbles()[0]).toMatchObject(position);
    restored.fixture.componentInstance.autoLayout();restored.fixture.detectChanges();
    expect(restored.fixture.componentInstance.draft().scopes['efd']).toBeUndefined();
    expect(restored.fixture.componentInstance.draft().scopes['overview']).toEqual(view.configuration.scopes['overview']);
    restored.fixture.componentInstance.discardLayout();restored.fixture.detectChanges();
    expect(restored.fixture.componentInstance.domainBubbles()[0]).toMatchObject(position);
  });
  it('supports keyboard movement and Escape cancellation of domain drags, including fullscreen', () => {
    const {fixture,root}=render(),component=fixture.componentInstance;
    root.querySelector<HTMLButtonElement>('.org-fullscreen')!.click();fixture.detectChanges();
    const bubble=root.querySelector<HTMLElement>('.org-domain-bubble')!,before=component.domainBubbles()[0];
    bubble.dispatchEvent(new KeyboardEvent('keydown',{key:before.y>300?'ArrowUp':'ArrowDown',bubbles:true,cancelable:true}));fixture.detectChanges();
    const moved=component.domainBubbles()[0];
    expect(moved.y).not.toBe(before.y);expect(component.draft().scopes['efd'].offices['domain:tax']).toBeDefined();
    const draft=structuredClone(component.draft());
    vi.spyOn(root.querySelector('.org-stage')!,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:960,height:650,right:960,bottom:650,x:0,y:0,toJSON:()=>({})});
    bubble.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:6,clientX:100,clientY:100,bubbles:true}));
    document.dispatchEvent(new PointerEvent('pointermove',{pointerId:6,clientX:140,clientY:140,bubbles:true,cancelable:true}));fixture.detectChanges();
    component.escape();fixture.detectChanges();
    expect(component.draft()).toEqual(draft);expect(component.fullscreen()).toBe(true);expect(component.draggingId()).toBeNull();
    component.escape();expect(component.fullscreen()).toBe(false);
  });
  it('stages keyboard anchors per level, explicitly saves and restores them, and resets only the current level', () => {
    const {fixture,root,http}=render(),component=fixture.componentInstance;
    const office=component.offices()[0],delta=office.x<250?10:-10;
    root.querySelector('.org-office')!.dispatchEvent(new KeyboardEvent('keydown',{key:delta>0?'ArrowRight':'ArrowLeft',bubbles:true,cancelable:true}));fixture.detectChanges();
    expect(component.offices()[0].x).toBeCloseTo(office.x+delta);expect(component.dirty()).toBe(true);
    http.expectNone(request=>request.method==='PUT');
    component.overview();fixture.detectChanges();
    root.querySelector('[data-organization-id="efd"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));fixture.detectChanges();
    expect(Object.keys(component.draft().scopes).sort()).toEqual(['efd','overview']);
    component.saveLayout();const request=http.expectOne('/api/v1/organization-network/view');
    expect(request.request.method).toBe('PUT');expect(request.request.headers.get('X-DaCa-User')).toBe('kassandra.valdata');
    const saved:OrganizationView={...request.request.body,revision:1};request.flush(saved);fixture.detectChanges();expect(component.dirty()).toBe(false);
    fixture.destroy();const restored=render(graph,saved);const again=restored.fixture.componentInstance;
    expect(again.offices()[0].x).toBeCloseTo(office.x+delta);
    again.autoLayout();restored.fixture.detectChanges();expect(again.draft().scopes['efd']).toBeUndefined();expect(again.draft().scopes['overview']).toEqual(saved.configuration.scopes['overview']);expect(again.dirty()).toBe(true);
    again.discardLayout();expect(again.dirty()).toBe(false);expect(again.offices()[0].x).toBeCloseTo(office.x+delta);
  });
  it('moves a captured pointer without drilling down, cancels a later move, and restores fullscreen body scrolling', () => {
    const {fixture,root}=render(),component=fixture.componentInstance,stage=root.querySelector('.org-stage') as HTMLElement;
    vi.spyOn(stage,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:960,height:650,right:960,bottom:650,x:0,y:0,toJSON:()=>({})});
    (root.querySelector('.org-fullscreen') as HTMLButtonElement).click();fixture.detectChanges();expect(component.fullscreen()).toBe(true);expect(document.body.style.overflow).toBe('hidden');
    const card=root.querySelector('.org-office')!,before=component.offices()[0],dx=before.x>300?-20:20;
    card.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:1,clientX:100,clientY:100,bubbles:true}));
    document.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:100+dx,clientY:120,bubbles:true,cancelable:true}));fixture.detectChanges();
    expect(component.offices()[0].x).toBeCloseTo(before.x+dx);expect(card.classList.contains('is-dragging')).toBe(true);
    document.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,bubbles:true}));card.dispatchEvent(new MouseEvent('click',{detail:1,bubbles:true,cancelable:true}));fixture.detectChanges();
    expect(component.focusId()).toBe('efd');expect(card.classList.contains('is-dragging')).toBe(false);
    const committed=structuredClone(component.draft());
    card.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:2,clientX:100,clientY:100,bubbles:true}));
    document.dispatchEvent(new PointerEvent('pointermove',{pointerId:2,clientX:160,clientY:100,bubbles:true,cancelable:true}));component.escape();fixture.detectChanges();
    expect(component.draft()).toEqual(committed);expect(component.fullscreen()).toBe(true);
    component.escape();fixture.detectChanges();expect(component.fullscreen()).toBe(false);expect(document.body.style.overflow).not.toBe('hidden');
  });
  it('retains a conflicting draft and cancels an in-flight save when the identity changes', () => {
    const {fixture,root,http}=render(),component=fixture.componentInstance;
    root.querySelector('.org-office')!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));fixture.detectChanges();
    component.saveLayout();http.expectOne('/api/v1/organization-network/view').flush('conflict',{status:409,statusText:'Conflict'});fixture.detectChanges();
    expect(component.dirty()).toBe(true);expect(component.layoutError()).toContain('anderen Fenster');
    component.saveLayout();const pending=http.expectOne('/api/v1/organization-network/view');
    userId.set('fausto.marzo');fixture.detectChanges();expect(pending.cancelled).toBe(true);expect(component.dirty()).toBe(false);
    http.expectOne('/api/v1/organization-network').flush(graph);http.expectOne('/api/v1/organization-network/view').flush({revision:0,configuration:{schemaVersion:1,scopes:{}}});fixture.detectChanges();
    expect(component.draft().scopes).toEqual({});expect(component.layoutError()).toBe('');
  });
  // Focus containment and closed-list visibility are checked in the real-browser organization-layout flow.
  it('localizes organization titles, navigation and tooltips in place while retaining canonical searches and drafts', () => {
    const department={...node('uvek',null,'UVEK','department'),localizations:{fr:{code:'DETEC',label:'Département fédéral',description:'Département fédéral'}}};
    const office={...node('uvek-astra','uvek','ASTRA'),label:'Bundesamt für Strassen',localizations:{fr:{code:'OFROU',label:'Office fédéral des routes',description:'Office fédéral des routes'},it:{code:'USTRA',label:'Ufficio federale delle strade',description:'Ufficio federale delle strade'},en:{code:'FEDRO',label:'Federal Roads Office',description:'Federal Roads Office'}}};
    const {fixture,root,http}=render({...graph,homeId:office.id,nodes:[...graph.nodes,department,office]}),component=fixture.componentInstance;
    component.overview();fixture.detectChanges();
    root.querySelector('[data-organization-id="uvek"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));fixture.detectChanges();
    component.enter(office);fixture.detectChanges();const draft=structuredClone(component.draft());
    language.set('fr');fixture.detectChanges();
    expect(root.querySelector('.org-focus')?.textContent).toContain('Office fédéral des routes');
    expect(root.querySelector('.org-focus-title')?.textContent).toBe('OFROU');
    expect(root.querySelector('.org-breadcrumb')?.textContent).toContain('DETEC');
    expect(component.organizationTooltip(component.focus())).not.toContain('Bundesamt');
    expect(component.search(component.focus()!)['organization']).toBe('uvek-astra');
    expect(component.focusId()).toBe(office.id);expect(component.draft()).toEqual(draft);expect(component.dirty()).toBe(true);
    language.set('it');fixture.detectChanges();expect(root.querySelector('.org-focus-title')?.textContent).toBe('USTRA');
    language.set('en');fixture.detectChanges();expect(root.querySelector('.org-focus-title')?.textContent).toBe('FEDRO');
    language.set('de');fixture.detectChanges();expect(root.querySelector('.org-focus')?.textContent).toContain('Bundesamt für Strassen');
    http.expectNone(request=>request.method==='PUT'||request.url==='/api/v1/organization-network');
  });
  it('projects subunit domain assignments to their visible office and exposes their full trusted path', () => {
    const network={...graph,nodes:[...graph.nodes,node('bit','efd','BIT'),{...node('ps','bit','PS'),code:'BIT-PS'},{...node('cps','ps','CPS'),code:'BIT-PS-CPS'}],domains:[graph.domains[0],{id:'rohs',label:'ROHS',description:'Telemetry',organizationIds:['efd','bit','ps','cps'],productCount:0}]};
    const {fixture,root}=render(network),component=fixture.componentInstance;
    expect(component.domainOrganizations().get('rohs')?.map(node=>node.id)).toEqual(['bit']);
    expect(component.domainOrganizations().get('tax')?.map(node=>node.id)).toEqual(['estv']);
    expect(root.querySelector('[data-domain-id="rohs"].org-domain-bubble .org-domain-assignment')?.textContent).toContain('BIT');
    expect(component.domainTooltip(network.domains[1])).toContain('EFD › BIT › BIT-PS › BIT-PS-CPS');
    component.enter(network.nodes.find(node=>node.id==='bit')!);fixture.detectChanges();
    expect(component.domainOrganizations().get('rohs')?.map(node=>node.id)).toEqual(['ps']);
    expect(component.domains().map(domain=>domain.id)).toEqual(['rohs']);
    expect(root.querySelector('.org-office .org-card-title strong')?.textContent).toBe('PS');
    component.enter(network.nodes.find(node=>node.id==='ps')!);fixture.detectChanges();
    expect(component.domainOrganizations().get('rohs')?.map(node=>node.id)).toEqual(['cps']);
    expect(root.querySelector('.org-focus-title')?.textContent).toBe('PS');
    expect([...root.querySelectorAll('.org-breadcrumb button')].slice(1,4).map(button=>button.textContent?.trim())).toEqual(['EFD','BIT','PS']);
    expect(root.querySelector('.org-office .org-card-title strong')?.textContent).toBe('CPS');
    expect(component.search(component.focus()!)['organization']).toBe('ps');
    expect(network.nodes.find(node=>node.id==='ps')?.code).toBe('BIT-PS');
    component.overview();fixture.detectChanges();
    expect(component.domainOrganizations().get('rohs')?.map(node=>node.id)).toEqual(['efd']);
  });
  it('attaches incoming, outgoing and domain lines to the measured title perimeter and follows title resizing', () => {
    const network={...graph,relations:[graph.relations[0],{...graph.relations[0],sourceId:'ne',targetId:'estv'}]};
    const {fixture,root}=render(network),component=fixture.componentInstance;
    component.enter(graph.nodes.find(item=>item.id==='estv')!);component.showDomains.set(true);fixture.detectChanges();
    const rect=(x:number,y:number,width:number,height:number)=>({left:x,top:y,width,height,right:x+width,bottom:y+height,x,y,toJSON:()=>({})});
    vi.spyOn(root.querySelector('.org-stage')!,'getBoundingClientRect').mockReturnValue(rect(0,0,960,650));
    vi.spyOn(root.querySelector('.org-office-field')!,'getBoundingClientRect').mockReturnValue(rect(0,200,960,450));
    const title=vi.spyOn(root.querySelector('.org-focus-title')!,'getBoundingClientRect').mockReturnValue(rect(435,120,90,30));
    vi.spyOn(root.querySelector('.org-domain-bubble')!,'getBoundingClientRect').mockReturnValue(rect(500,400,84,84));
    component.measureChildren();fixture.detectChanges();
    const onPerimeter=(point:{x:number;y:number},centerY:number)=>expect(Math.max(Math.abs(point.x-480)/51,Math.abs(point.y-centerY)/21)).toBeCloseTo(1);
    onPerimeter(component.threads()[0].from,135);onPerimeter(component.threads()[1].to,135);
    onPerimeter(component.domainThreads()[0].from,135);
    const before=component.threads()[0].from;
    title.mockReturnValue(rect(435,90,90,30));component.measureChildren();fixture.detectChanges();
    onPerimeter(component.threads()[0].from,105);expect(component.threads()[0].from).not.toEqual(before);
  });
  it('connects domains only to the most specific visible organizations and removes their lines with the layer', () => {
    const {fixture,root}=render(),component=fixture.componentInstance;
    expect(root.querySelector('.org-layer .identifier-mode-switch[aria-checked="true"] .identifier-mode-switch-thumb')).not.toBeNull();
    expect(component.domainThreads().map(line=>[line.sourceId,line.domainId])).toEqual([['estv','tax']]);
    expect(root.querySelectorAll('.org-domain-thread')).toHaveLength(1);
    expect(root.querySelectorAll('.org-thread:not(.is-inferred)')).toHaveLength(1);
    component.overview();fixture.detectChanges();
    const rect=(x:number,y:number,width:number,height:number)=>({left:x,top:y,width,height,right:x+width,bottom:y+height,x,y,toJSON:()=>({})});
    vi.spyOn(root.querySelector('.org-stage')!,'getBoundingClientRect').mockReturnValue(rect(0,0,960,650));
    vi.spyOn(root.querySelector('.org-office-field')!,'getBoundingClientRect').mockReturnValue(rect(0,0,960,650));
    vi.spyOn(root.querySelector('[data-organization-id="efd"]')!,'getBoundingClientRect').mockReturnValue(rect(100,150,100,50));
    const bubble=vi.spyOn(root.querySelector('.org-domain-bubble')!,'getBoundingClientRect').mockReturnValue(rect(400,300,80,80));
    component.measureChildren();fixture.detectChanges();
    expect(component.domainThreads().map(line=>line.sourceId)).toEqual(['efd']);
    expect(component.domainThreads()[0].from).toEqual({x:150,y:175});
    expect(component.domainThreads()[0].to).toEqual({x:440,y:340});
    bubble.mockReturnValue(rect(420,330,80,80));component.measureChildren();fixture.detectChanges();
    expect(component.domainThreads()[0].to).toEqual({x:460,y:370});
    component.enter(graph.nodes.find(item=>item.id==='estv')!);fixture.detectChanges();
    expect(component.domainThreads().map(line=>line.sourceId)).toEqual(['estv']);
    component.showDomains.set(false);fixture.detectChanges();
    expect(component.domainThreads()).toEqual([]);expect(root.querySelector('.org-domain-thread')).toBeNull();
    expect(root.querySelectorAll('.org-thread:not(.is-inferred)')).toHaveLength(1);
  });
  it('connects a shared domain to each visible assigned organization without inferring other assignments', () => {
    const network={...graph,domains:[{...graph.domains[0],organizationIds:['efd','estv','ne']}]};
    const {fixture}=render(network),component=fixture.componentInstance;
    component.showDomains.set(true);fixture.detectChanges();
    expect(component.domainThreads().map(line=>line.sourceId).sort()).toEqual(['estv','ne']);
  });
  it('highlights only satellites connected across the current boundary, in either direction and through descendants', () => {
    for (const reverse of [false, true]) {
      const network = { ...graph, nodes: [...graph.nodes, node('cantons', null, 'Kantone', 'group')].map(item => item.id === 'ne' ? { ...item, parentId: 'cantons' } : item),
        satelliteIds: ['vbs', 'cantons'], relations: [{ ...graph.relations[0], sourceId: reverse ? 'ne' : 'estv', targetId: reverse ? 'estv' : 'ne' }] };
      const { fixture, root } = render(network);
      expect(root.querySelector('[data-organization-id="ne"]')?.classList.contains('is-connected')).toBe(true);
      expect(root.querySelector('[data-organization-id="cantons"]')?.classList.contains('is-connected')).toBe(true);
      expect(root.querySelector('[data-organization-id="vbs"]')?.classList.contains('is-connected')).toBe(false);
      fixture.componentInstance.enter(network.nodes.find(item => item.id === 'ne')!); fixture.detectChanges();
      const thread = fixture.componentInstance.threads()[0];
      expect(reverse ? thread.from : thread.to).toEqual({ x: 480, y: 130 });
      fixture.componentInstance.enter(network.nodes.find(item => item.id === 'bi')!); fixture.detectChanges();
      expect(root.querySelector('.org-satellite.is-connected')).toBeNull();
      fixture.destroy();
    }
  });
  it('places a small canton prefix before the name in satellites, children and the focused canton', () => {
    const { fixture, root } = render();
    expect(root.querySelector('[data-organization-id="ne"] .org-card-title')?.textContent).toContain('Kanton');
    expect(root.querySelector('[data-organization-id="vbs"] .org-canton-prefix')).toBeNull();
    fixture.componentInstance.overview(); fixture.detectChanges();
    expect(root.querySelector('[data-organization-id="ne"] .org-canton-prefix')?.textContent).toBe('Kanton');
    fixture.componentInstance.enter(graph.nodes.find(item => item.id === 'ne')!); fixture.detectChanges();
    expect(root.querySelector('.org-focus .org-canton-prefix')?.textContent).toBe('Kanton');
  });
  it('drills through the trusted hierarchy, restores home and switches domain overlays without writes', () => {
    const { fixture, root } = render();
    expect(root.querySelector('.org-focus')?.textContent).toContain('EFD');
    expect(root.querySelectorAll('.org-thread')).toHaveLength(1);
    (root.querySelector('.org-office') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(root.querySelector('.org-focus')?.textContent).toContain('ESTV');
    expect(root.querySelector('.org-office')?.textContent).toContain('Business Intelligence');
    const layer = root.querySelector('.org-layer [role=switch]') as HTMLButtonElement;
    expect(layer.getAttribute('aria-checked')).toBe('true');
    expect(root.querySelector('.org-domains a')?.getAttribute('href')).toBe('/domains/tax');
    layer.click(); fixture.detectChanges(); expect(root.querySelector('.org-domains')).toBeNull();
    expect(layer.getAttribute('aria-checked')).toBe('false');
    layer.click(); fixture.detectChanges();expect(root.querySelector('.org-domains a')).not.toBeNull();
    (root.querySelector('.org-own-home') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(root.querySelector('.org-focus')?.textContent).toContain('EFD');
  });
  it('shows the top-level landscape without a central organization and drills into departments and context groups', () => {
    const network: OrganizationNetwork = { ...graph, nodes: [
      ...graph.nodes.map(item => item.id === 'ne' ? { ...item, parentId: 'cantons' } : item),
      node('cantons', null, 'Kantone', 'group'), node('banks', null, 'Kantonalbanken', 'group'),
      node('public', null, 'Weitere', 'group'), node('sbb', 'public', 'SBB', 'federal_related'),
      node('post', 'public', 'Post', 'federal_related'),
    ] };
    const { fixture, root } = render(network);
    (root.querySelector('.org-home') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(root.querySelector('.org-stage')?.classList.contains('is-overview')).toBe(true);
    expect(root.querySelector('.org-core,.org-bubble,.org-bubble-halo,.org-satellite')).toBeNull();
    expect([...root.querySelectorAll<HTMLElement>('.org-overview-card')].map(card => card.dataset['organizationId'])).toEqual(['efd','vbs','cantons','banks','public','sbb','post']);
    const layer = root.querySelector('.org-layer [role=switch]') as HTMLButtonElement;
    expect(layer.getAttribute('aria-checked')).toBe('true');
    expect(root.querySelector('.org-domain-bubble')?.textContent).toContain('Steuern');
    layer.click(); fixture.detectChanges();
    (root.querySelector('[data-organization-id="cantons"]') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(root.querySelector('.org-focus')?.textContent).toContain('Kantone');
    expect(root.querySelector('.org-office')?.textContent).toContain('Neuchâtel');
    (root.querySelector('.org-home') as HTMLButtonElement).click(); fixture.detectChanges();
    (root.querySelector('[data-organization-id="efd"]') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(root.querySelector('.org-focus')?.textContent).toContain('EFD');
    expect(root.querySelector('.org-office')?.textContent).toContain('ESTV');
    (root.querySelector('.org-home') as HTMLButtonElement).click(); fixture.detectChanges();
    (root.querySelector('.org-own-home') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(root.querySelector('.org-focus')?.textContent).toContain('EFD');
  });
  it('passes exact scopes to expert search and disables organization/domain actions without readable objects', () => {
    const network=structuredClone(graph);
    network.nodes.find(node=>node.id==='estv')!.objectKeys=['logical:model'];
    network.nodes.find(node=>node.id==='vbs')!.objectKeys=[];
    network.domains[0].objectKeys=['organization:estv','term:term'];
    const {fixture,root}=render(network);
    root.querySelector('[data-organization-id="estv"]')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));fixture.detectChanges();
    const organizationLink=root.querySelector<HTMLAnchorElement>('[data-organization-object-search]')!;
    expect(organizationLink.getAttribute('href')).toBe('/search?organization=estv');
    expect(organizationLink.textContent).toContain('Objekte dieser Organisation anzeigen');
    fixture.componentInstance.closeMenu();fixture.detectChanges();
    root.querySelector('[data-organization-id="vbs"]')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));fixture.detectChanges();
    expect(root.querySelector<HTMLButtonElement>('[data-organization-object-search]')!.disabled).toBe(true);
    fixture.componentInstance.closeMenu();fixture.detectChanges();
    const bubble=root.querySelector('.org-domain-bubble')!;
    bubble.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));fixture.detectChanges();
    expect(root.querySelector('[data-domain-object-search]')?.getAttribute('href')).toBe('/search?domain=tax');
    expect(root.querySelector('[role="menu"]')?.textContent).not.toContain('Hier eintauchen');
    fixture.componentInstance.closeMenu();fixture.detectChanges();
    fixture.componentInstance.data.update(data=>({...data!,domains:data!.domains.map(domain=>({...domain,objectKeys:[]}))}));fixture.detectChanges();
    bubble.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}));fixture.detectChanges();
    expect(root.querySelector<HTMLButtonElement>('[data-domain-object-search]')!.disabled).toBe(true);
    fixture.componentInstance.escape();fixture.detectChanges();expect(root.querySelector('[role="menu"]')).toBeNull();
  });
  it('offers keyboard-accessible context actions and real new-tab links', () => {
    const { fixture, root } = render();
    root.querySelector('.org-office')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 })); fixture.detectChanges();
    const menu = root.querySelector('[role="menu"]')!;
    expect(menu.classList.contains('daca-canvas-context-menu')).toBe(true);
    expect([...menu.querySelectorAll('[role="menuitem"]')].every(item=>item.querySelector('daca-search-icon'))).toBe(true);
    expect(menu.textContent).toContain('Zugeordnete Domänen');
    expect(menu.querySelectorAll('a[target="_blank"]')).toHaveLength(0);
    expect(menu.querySelector('a[href^="/search"]')?.getAttribute('href')).toContain('kind=product');
    const dive=[...menu.querySelectorAll<HTMLAnchorElement>('a')].find(button=>button.textContent?.includes('Hier eintauchen'))!;
    dive.click();fixture.detectChanges();
    expect(root.querySelector('.org-focus')?.textContent).toContain('ESTV');
    expect(root.querySelector('.org-office')?.textContent).toContain('Business Intelligence');
    expect(root.querySelector('[role="menu"]')).toBeNull();
    root.querySelector('.org-focus')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:200,clientY:200}));fixture.detectChanges();
    expect(root.querySelector('[role="menu"]')).not.toBeNull();
    expect(root.querySelector('[role="menu"]')?.textContent).not.toContain('Hier eintauchen');
    expect(root.querySelector('[role="menu"]')?.textContent).toContain('Ansicht öffnen');
    fixture.componentInstance.escape(); fixture.detectChanges(); expect(root.querySelector('[role="menu"]')).toBeNull();
  });
  it('clears the previous user graph during an identity change and reports failed reads', () => {
    const { fixture, root, http } = render();
    userId.set('fausto.marzo'); fixture.detectChanges();
    expect(root.querySelector('.org-stage')).toBeNull();
    const request = http.expectOne('/api/v1/organization-network'); expect(request.request.headers.get('X-DaCa-User')).toBe('fausto.marzo');
    request.flush('unavailable', { status: 503, statusText: 'Unavailable' }); http.expectOne('/api/v1/organization-network/view').flush({revision:0,configuration:{schemaVersion:1,scopes:{}}}); fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('nicht verfügbar');
  });
});
