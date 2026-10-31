import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FALLBACK_LOGICAL_MODEL, FALLBACK_PHYSICAL_SNAPSHOT } from './mapping-fallback';
import { MappingDraftFacade } from './mapping-draft.facade';
import { PhysicalRepresentationActionsComponent } from './physical-representation-actions.component';
import { physicalCategoryLabel, physicalObjectName } from './physical-representation-labels';

describe('Physical object actions and identity',()=>{
  afterEach(()=>TestBed.resetTestingModule());
  function setup(canManage=true){
    TestBed.configureTestingModule({imports:[PhysicalRepresentationActionsComponent],providers:[provideRouter([]),MappingDraftFacade]});
    const table={...FALLBACK_PHYSICAL_SNAPSHOT.tables[0],databaseName:'SAP',schemaName:'CSV',name:'VIBDBU & Gebäude',dataDomains:[]};
    const snapshot={...FALLBACK_PHYSICAL_SNAPSHOT,sourceType:'csv' as const,databaseName:'ImmoGIS',tables:[table]};
    const facade=TestBed.inject(MappingDraftFacade);facade.initialize(FALLBACK_LOGICAL_MODEL,snapshot,[],null);
    const fixture=TestBed.createComponent(PhysicalRepresentationActionsComponent);
    fixture.componentRef.setInput('representation',facade.representations()[0]);
    fixture.componentRef.setInput('logicalDomain',{id:'domain-personal',displayName:'Personal'});
    fixture.componentRef.setInput('canManage',canManage);fixture.detectChanges();
    return{fixture,facade,table,snapshot,component:fixture.componentInstance,root:fixture.nativeElement as HTMLElement};
  }
  it('uses the actual table system in qualified names and field choices across a multi-system inventory',()=>{
    const {facade,snapshot,table}=setup();
    expect(physicalObjectName(snapshot,table)).toBe('SAP.CSV.VIBDBU & Gebäude');
    expect(facade.physicalColumns()[0].qualifiedName).toBe(snapshot.sourceName+' · #'+snapshot.revision+' · SAP.CSV.VIBDBU & Gebäude.'+table.columns[0].name);
    expect(physicalCategoryLabel('csv')).toBe('Physische Deklaration');
    expect(physicalCategoryLabel('postgresql')).toBe('Physische Repräsentation');
    expect(physicalObjectName(snapshot,{...table,kind:'parquet',storageLocation:'s3://bucket/object.parquet'})).toBe('s3://bucket/object.parquet');
  });
  it('groups navigation, domain actions, semantic searches, and drawing removal in the requested order',()=>{
    const {root}=setup();
    expect([...root.querySelectorAll('[role=menuitem]')].map(item=>item.textContent?.replace(/ \((?:neuer Tab|Treffer in neuem Tab)\)/g,'').trim())).toEqual([
      'Datenquelle öffnen','Darstellung dieser Physischen Repräsentation/Deklaration löschen',
      'Domäne des logischen Modells zuordnen','Domäne zuordnen','Term suchen und öffnen','Domäne suchen und öffnen',
      'Logisches Modell suchen und öffnen','Physisches Modell suchen und öffnen',
    ]);
    expect(root.querySelectorAll('hr[role=separator]')).toHaveLength(2);
    expect(root.querySelector('.menu-hint')?.nextElementSibling?.tagName).not.toBe('HR');
    expect(root.querySelector('a')?.getAttribute('href')).toContain('/physical-models/'+FALLBACK_PHYSICAL_SNAPSHOT.sourceId);
    expect(root.querySelector('a')?.getAttribute('href')).toContain('tableId='+FALLBACK_PHYSICAL_SNAPSHOT.tables[0].id);
    expect(root.querySelector('a')?.getAttribute('target')).toBe('_blank');
    expect(root.querySelector('a')?.getAttribute('rel')).toBe('noopener');
    expect(root.querySelector('a img[src$="external-link.svg"]')).not.toBeNull();
  });
  it('opens semantic searches in a new tab with the actual object name and an external-link icon',()=>{
    const {root,table}=setup();
    const links=[...root.querySelectorAll<HTMLAnchorElement>('a[target=_blank][href^="/domains"]')];
    expect(links).toHaveLength(2);
    expect(links.map(link=>new URL(link.href).searchParams.get('q'))).toEqual([table.name,table.name]);
    expect(links.map(link=>new URL(link.href).pathname)).toEqual(['/domains/terminology','/domains']);
    expect(links.every(link=>link.rel==='noopener'&&link.querySelector('img[src$="external-link.svg"]'))).toBe(true);
  });
  it('keeps assignments permission-aware and omits redundant domain actions',()=>{
    const {fixture,component,root,facade,table,snapshot}=setup(false);
    expect(root.textContent).not.toContain('Domäne zuordnen');
    expect(root.textContent).not.toContain('Domäne des logischen Modells');
    facade.initialize(FALLBACK_LOGICAL_MODEL,{...snapshot,tables:[{...table,dataDomains:[{id:'domain-personal',displayName:'Personal',lifecycle:'active'}]}]},[],null);
    fixture.componentRef.setInput('representation',facade.representations()[0]);fixture.componentRef.setInput('canManage',true);fixture.detectChanges();
    expect(component.hasLogicalDomain()).toBe(true);
    expect(root.textContent).not.toContain('Domäne des logischen Modells zuordnen');
    expect(root.querySelector('a[href="/domains/domain-personal"]')).not.toBeNull();
  });
  it('supports keyboard navigation and emits explicit copy and close actions',()=>{
    const {root,component}=setup();const assigned=vi.fn(),closed=vi.fn();component.assign.subscribe(assigned);component.closed.subscribe(closed);
    const items=[...root.querySelectorAll<HTMLElement>('[role=menuitem]')];
    items[0].focus();items[0].dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));expect(document.activeElement).toBe(items.at(-1));
    items.find(item=>item.textContent?.includes('Domäne des logischen Modells zuordnen'))!.click();expect(assigned).toHaveBeenCalledWith(true);
    items[0].dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(closed).toHaveBeenCalledOnce();
  });
  it('removes an explicit domain individually and keeps the option permission- and busy-aware',()=>{
    const {fixture,facade,snapshot,table,component,root}=setup();
    facade.initialize(FALLBACK_LOGICAL_MODEL,{...snapshot,tables:[{...table,domainVersion:'1'.repeat(64),dataDomains:[{id:'one',displayName:'Personal',lifecycle:'active'},{id:'two',displayName:'Finanzen',lifecycle:'active'}]}]},[],null);
    fixture.componentRef.setInput('representation',facade.representations()[0]);fixture.detectChanges();
    const removed=vi.fn();component.removeDomain.subscribe(removed);
    const buttons=[...root.querySelectorAll<HTMLButtonElement>('button')].filter(button=>button.textContent?.includes('Domänenzuordnung entfernen'));
    expect(buttons.map(button=>button.textContent?.trim())).toEqual(['Domänenzuordnung entfernen: Personal','Domänenzuordnung entfernen: Finanzen']);
    buttons[1].click();expect(removed).toHaveBeenCalledExactlyOnceWith('two');
    fixture.componentRef.setInput('busy',true);fixture.detectChanges();expect(buttons.every(button=>button.disabled)).toBe(true);
    fixture.componentRef.setInput('canManage',false);fixture.detectChanges();expect(root.textContent).not.toContain('Domänenzuordnung entfernen');
  });
});
