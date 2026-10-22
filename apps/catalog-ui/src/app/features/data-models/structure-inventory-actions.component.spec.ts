import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService } from './data-models-api.service';
import { FALLBACK_PHYSICAL_SNAPSHOT } from './mapping-fallback';
import { StructureInventoryActionsComponent } from './structure-inventory-actions.component';
import { StructureInventoryAuditComponent } from './structure-inventory-audit.component';

describe('Structure inventory lifecycle controls', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup() {
    const api = {manageStructureInventory: vi.fn(() => of(null))};
    const identity = {userId: signal('steward')};
    TestBed.configureTestingModule({imports: [StructureInventoryActionsComponent], providers: [
      {provide: DataModelsApiService, useValue: api}, {provide: DemoIdentityService, useValue: identity},
    ]});
    const fixture = TestBed.createComponent(StructureInventoryActionsComponent);
    fixture.componentRef.setInput('source', {id:'inventory', name:'Gebäude', revision:3, connectorType:'csv', lifecycle:'active', inventoryManageable:true});
    fixture.detectChanges(); TestBed.tick(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement; const dialog = root.querySelector('dialog')!;
    Object.defineProperty(dialog,'showModal',{configurable:true,value:vi.fn(() => dialog.setAttribute('open',''))});
    Object.defineProperty(dialog,'close',{configurable:true,value:vi.fn(() => dialog.removeAttribute('open'))});
    return {fixture,root,dialog,api,identity,component:fixture.componentInstance};
  }
  it('requires confirmation, supports cancellation and sends the current inventory version', () => {
    const context = setup();
    const changed = vi.fn(); context.component.changed.subscribe(changed);
    (context.root.querySelector('.actions button') as HTMLButtonElement).click(); context.fixture.detectChanges();
    expect(context.dialog.textContent).toContain('Gebäude');
    expect(context.dialog.textContent).toContain('bestehenden Verknüpfungen bleiben erhalten');
    expect(context.api.manageStructureInventory).not.toHaveBeenCalled();
    context.component.cancel();
    expect(context.dialog.open).toBe(false);
    (context.root.querySelector('.actions button') as HTMLButtonElement).click(); context.component.confirm();
    expect(context.api.manageStructureInventory).toHaveBeenCalledWith('inventory',3,'archive');
    expect(changed).toHaveBeenCalledWith({action:'archive',name:'Gebäude'});
  });
  it('explains a blocked deletion and keeps the dialog open without emitting success', () => {
    const context = setup(); const changed=vi.fn();context.component.changed.subscribe(changed);
    context.api.manageStructureInventory.mockReturnValue(throwError(() => new Error('Historische Mappings verhindern das Löschen. Bitte archivieren.')));
    (context.root.querySelector('.danger') as HTMLButtonElement).click(); context.fixture.detectChanges();
    expect(context.dialog.textContent).toContain('endgültig gelöscht');
    context.component.confirm(); context.fixture.detectChanges();
    expect(context.root.querySelector('[role=alert]')?.textContent).toContain('Bitte archivieren');
    expect(changed).not.toHaveBeenCalled(); expect(context.dialog.open).toBe(true);
  });
  it('offers restoration for an archive and hides actions when permission is missing', () => {
    const context = setup();
    context.fixture.componentRef.setInput('source',{...context.component.source(),lifecycle:'archived'});context.fixture.detectChanges();
    const restore = context.root.querySelector('.actions button') as HTMLButtonElement;
    expect(restore.textContent).toContain('Wiederherstellen');restore.click();context.component.confirm();
    expect(context.api.manageStructureInventory).toHaveBeenCalledWith('inventory',3,'restore');
    context.fixture.componentRef.setInput('source',{...context.component.source(),inventoryManageable:false});context.fixture.detectChanges();
    expect(context.root.querySelector('.actions')).toBeNull();
  });
  it('discards the previous actor’s dialog on identity changes', () => {
    const context = setup();(context.root.querySelector('.danger') as HTMLButtonElement).click();
    context.identity.userId.set('other-user');TestBed.tick();context.fixture.detectChanges();
    expect(context.dialog.open).toBe(false);
    expect(context.api.manageStructureInventory).not.toHaveBeenCalled();
  });
  it('shows durable deletion history and clears it when the identity changes', () => {
    const identity={userId:signal('steward')};
    TestBed.configureTestingModule({imports:[StructureInventoryAuditComponent],providers:[
      {provide:DemoIdentityService,useValue:identity},
      {provide:DataModelsApiService,useValue:{structureInventoryAudit:()=>of([{id:'audit',resourceId:FALLBACK_PHYSICAL_SNAPSHOT.sourceId,action:'deleted',actor:'steward',revision:4,occurredAt:'2026-10-22T10:00:00Z',details:{name:'Gelöschtes Inventar'}}])}},
    ]});
    const fixture=TestBed.createComponent(StructureInventoryAuditComponent);fixture.detectChanges();TestBed.tick();
    const dialog=(fixture.nativeElement as HTMLElement).querySelector('dialog')!;
    Object.defineProperty(dialog,'showModal',{value:()=>dialog.setAttribute('open','')});Object.defineProperty(dialog,'close',{value:()=>dialog.removeAttribute('open')});
    fixture.componentInstance.open();fixture.detectChanges();
    expect(dialog.textContent).toContain('Gelöschtes Inventar');expect(dialog.textContent).toContain('Gelöscht');expect(dialog.textContent).toContain('steward');
    identity.userId.set('other');TestBed.tick();fixture.detectChanges();
    expect(fixture.componentInstance.events()).toEqual([]);expect(dialog.open).toBe(false);
  });
});
