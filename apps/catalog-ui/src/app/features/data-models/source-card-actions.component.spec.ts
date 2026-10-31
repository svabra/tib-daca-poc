import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService } from './data-models-api.service';
import { SourceCardActionsComponent } from './source-card-actions.component';

describe('Source card actions menu', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup(importAllowed=true,csv=false,manageable=true) {
    const identity={userId:signal('steward')};
    const api={relinquishSourceAccess:vi.fn(()=>of(null)),manageStructureInventory:vi.fn(()=>of(null))};
    TestBed.configureTestingModule({imports:[SourceCardActionsComponent],providers:[provideRouter([]),
      {provide:DemoIdentityService,useValue:identity},{provide:DataModelsApiService,useValue:api},
      {provide:CatalogI18nService,useValue:{t:(key:string,values?:Record<string,string>)=>({
        sourceActions:`Quellenaktionen für ${values?.['name']}`,openSource:'Quelle öffnen',reimport:'Neu importieren & Drift prüfen',
        openInventory:'Inventar öffnen',archiveInventory:'Archivieren',restoreInventory:'Wiederherstellen',deleteInventory:'Löschen',returnSourceAccess:'Berechtigungen zurückgeben',cancelSourceAccess:'Abbrechen',
      } as Record<string,string>)[key]??key}},
    ]});
    const fixture=TestBed.createComponent(SourceCardActionsComponent);
    fixture.componentRef.setInput('source',{id:'source',name:'VIBDBU',latestSnapshotId:'snapshot',canRelinquishAccess:true,connectorType:csv?'csv':'postgresql',inventoryManageable:manageable,revision:3});
    fixture.componentRef.setInput('importAllowed',importAllowed);fixture.componentRef.setInput('logicalModelId','model');
    fixture.detectChanges();TestBed.tick();
    const root=fixture.nativeElement as HTMLElement;const trigger=root.querySelector<HTMLButtonElement>('.source-actions-trigger')!;
    const dialog=root.querySelector('dialog')!;
    Object.defineProperty(dialog,'showModal',{value:()=>dialog.setAttribute('open','')});
    Object.defineProperty(dialog,'close',{value:()=>{dialog.removeAttribute('open');dialog.dispatchEvent(new Event('close'));}});
    const open=()=>{trigger.click();fixture.detectChanges();TestBed.tick();fixture.detectChanges();};
    const key=(element:HTMLElement,value:string)=>{element.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true}));fixture.detectChanges();TestBed.tick();};
    return {fixture,root,trigger,dialog,open,key,identity,api,component:fixture.componentInstance};
  }
  it('replaces the three card buttons with one labelled three-dot trigger and compact menu',()=>{
    const c=setup();expect(c.trigger.getAttribute('aria-label')).toBe('Quellenaktionen für VIBDBU');
    expect(c.trigger.querySelectorAll('svg circle')).toHaveLength(3);
    expect(c.root.querySelector('[role=menu]')).toBeNull();expect(c.root.querySelector('.return-access')).toBeNull();
    c.open();
    expect(c.trigger.getAttribute('aria-expanded')).toBe('true');
    expect([...c.root.querySelectorAll('[role=menuitem]')].map(item=>item.textContent?.trim())).toEqual([
      'Quelle öffnen','Neu importieren & Drift prüfen','Berechtigungen zurückgeben',
    ]);
    expect(c.root.querySelector('a[role=menuitem]')?.getAttribute('href')).toBe('/physical-models/source?logicalModelId=model');
  });
  it('preserves import permission and navigates enabled items with the keyboard',()=>{
    const c=setup(false);c.trigger.focus();c.key(c.trigger,'ArrowDown');
    const items=[...c.root.querySelectorAll<HTMLElement>('[role=menuitem]')];
    expect((items[1] as HTMLButtonElement).disabled).toBe(true);
    expect(document.activeElement).toBe(items[0]);c.key(items[0],'ArrowDown');expect(document.activeElement).toBe(items[2]);
    c.key(items[2],'Home');expect(document.activeElement).toBe(items[0]);
    c.key(items[0],'End');expect(document.activeElement).toBe(items[2]);
    c.key(items[2],'Escape');expect(c.root.querySelector('[role=menu]')).toBeNull();expect(document.activeElement).toBe(c.trigger);
  });
  it('closes on an outside click or identity change and emits imports only when selected',()=>{
    const c=setup();const imported=vi.fn();c.component.importRequested.subscribe(imported);c.open();
    document.body.click();c.fixture.detectChanges();expect(c.root.querySelector('[role=menu]')).toBeNull();
    c.open();(c.root.querySelectorAll('[role=menuitem]')[1] as HTMLButtonElement).click();
    expect(imported).toHaveBeenCalledOnce();expect(c.component.menuOpen()).toBe(false);
    c.open();c.identity.userId.set('other');TestBed.tick();c.fixture.detectChanges();expect(c.component.menuOpen()).toBe(false);
  });
  it('opens the existing confirmation and restores focus to the menu trigger after cancellation',()=>{
    const c=setup();c.open();(c.root.querySelectorAll('[role=menuitem]')[2] as HTMLButtonElement).click();c.fixture.detectChanges();
    expect(c.dialog.open).toBe(true);expect(c.root.querySelector('[role=menu]')).toBeNull();
    expect(c.api.relinquishSourceAccess).not.toHaveBeenCalled();
    (c.dialog.querySelector('footer button') as HTMLButtonElement).click();c.fixture.detectChanges();
    expect(c.dialog.open).toBe(false);expect(document.activeElement).toBe(c.trigger);
  });
  it('offers inventory actions in the same three-dot menu and keeps the existing confirmation',()=>{
    const c=setup(true,true);c.open();
    expect([...c.root.querySelectorAll('[role=menuitem]')].map(item=>item.textContent?.trim())).toEqual(['Inventar \u00f6ffnen','Archivieren','L\u00f6schen']);
    expect(c.root.querySelector('.actions')).toBeNull();
    (c.root.querySelectorAll('[role=menuitem]')[2] as HTMLButtonElement).click();c.fixture.detectChanges();
    expect(c.dialog.open).toBe(true);expect(c.api.manageStructureInventory).not.toHaveBeenCalled();
    (c.dialog.querySelector('footer button') as HTMLButtonElement).click();c.fixture.detectChanges();
    expect(c.dialog.open).toBe(false);expect(document.activeElement).toBe(c.trigger);
    c.open();(c.root.querySelectorAll('[role=menuitem]')[1] as HTMLButtonElement).click();c.fixture.detectChanges();
    (c.dialog.querySelectorAll('footer button')[1] as HTMLButtonElement).click();
    expect(c.api.manageStructureInventory).toHaveBeenCalledExactlyOnceWith('source',3,'archive');
  });
  it('keeps CSV navigation available to readers without exposing archive or delete',()=>{
    const c=setup(false,true,false);c.open();expect(c.root.querySelectorAll('[role=menuitem]')).toHaveLength(1);
    c.component.inventoryAction('delete');c.fixture.detectChanges();expect(c.dialog.open).toBe(false);
  });

});
