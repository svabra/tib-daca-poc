import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService } from './data-models-api.service';
import { PhysicalSource } from './data-models.models';
import { PhysicalImportJourneyComponent } from './physical-import-journey.component';

describe('AdA import journey menu',()=>{
  afterEach(()=>TestBed.resetTestingModule());
  const source={id:'ada',name:'AdA example',revision:7} as PhysicalSource;
  function setup(){
    const identity={userId:signal('steward'),canEditModels:signal(true),user:signal({office:'vbs-verteidigung'})};
    const api={adaImportJourney:vi.fn(()=>of<PhysicalSource|null>(source)),resetAdaImport:vi.fn(()=>of({alreadyReset:false}))};
    TestBed.configureTestingModule({imports:[PhysicalImportJourneyComponent],providers:[
      {provide:DemoIdentityService,useValue:identity},{provide:DataModelsApiService,useValue:api},
      {provide:CatalogI18nService,useValue:{t:(key:string)=>key}},
    ]});
    const fixture=TestBed.createComponent(PhysicalImportJourneyComponent);
    fixture.componentRef.setInput('scopes',[{id:'vbs-armasuisse-immobilien',department:'VBS',label:'armasuisse Immobilien'},{id:'vbs-verteidigung',department:'VBS',label:'Verteidigung'}]);
    fixture.detectChanges();TestBed.tick();
    const root=fixture.nativeElement as HTMLElement,dialog=root.querySelector('dialog')!;
    Object.defineProperty(dialog,'showModal',{value:()=>dialog.setAttribute('open','')});
    Object.defineProperty(dialog,'close',{value:()=>dialog.removeAttribute('open')});
    const reset=vi.fn();fixture.componentInstance.reset.subscribe(reset);
    const open=()=>{fixture.componentInstance.openReset();fixture.componentInstance.selectScope('vbs-verteidigung');};
    return{fixture,root,dialog,identity,api,reset,open,component:fixture.componentInstance};
  }
  it('offers the versioned CSV download and keyboard navigation without mutating data',()=>{
    const c=setup(),trigger=c.root.querySelector<HTMLButtonElement>('.journey-menu-trigger')!;
    trigger.click();c.fixture.detectChanges();TestBed.tick();
    const download=c.root.querySelector<HTMLAnchorElement>('[role=menuitem]')!;
    expect(download.getAttribute('href')).toBe('/api/v1/import-journeys/ada/inventory.csv');
    expect(download.getAttribute('download')).toBe('ada_bewirtschaftung.csv');
    c.component.menuKeydown(new KeyboardEvent('keydown',{key:'End'}));
    // Native dialog focus is exercised in the browser; unit test checks menu state and no write.
    c.component.menuKeydown(new KeyboardEvent('keydown',{key:'Escape'}));c.fixture.detectChanges();
    expect(c.component.menuOpen()).toBe(false);expect(c.api.adaImportJourney).not.toHaveBeenCalled();
    expect(c.api.resetAdaImport).not.toHaveBeenCalled();
  });
  it('requires an explicit organization with multiple scopes and cancellation makes no reset',()=>{
    const c=setup();c.component.openReset();c.fixture.detectChanges();expect(c.api.adaImportJourney).not.toHaveBeenCalled();
    expect(c.dialog.textContent).not.toContain('adaJourneyNotImported');
    c.component.selectScope('vbs-verteidigung');c.fixture.detectChanges();
    expect(c.api.adaImportJourney).toHaveBeenCalledWith('VBS','vbs-verteidigung');
    expect(c.dialog.textContent).toContain('AdA example');
    c.component.cancel();expect(c.dialog.open).toBe(false);expect(c.api.resetAdaImport).not.toHaveBeenCalled();
  });
  it('clears a former target while another scope loads and ignores a stale reply',()=>{
    const c=setup(),late=new Subject<PhysicalSource|null>();c.api.adaImportJourney.mockReturnValueOnce(late);
    c.open();c.component.selectScope('vbs-armasuisse-immobilien');
    late.next({...source,id:'wrong-scope'});
    expect(c.component.source()?.id).toBe('ada');
    c.component.confirm();expect(c.api.resetAdaImport).toHaveBeenCalledWith('VBS','vbs-armasuisse-immobilien',7);
  });
  it('retains a blocked target and emits success only after the scoped revision reset succeeds',()=>{
    const c=setup();c.open();
    c.api.resetAdaImport.mockReturnValueOnce(throwError(()=>new Error('Historische Verknüpfungen verhindern den Reset.')));
    c.component.confirm();c.fixture.detectChanges();
    expect(c.dialog.open).toBe(true);expect(c.reset).not.toHaveBeenCalled();
    expect(c.root.querySelector('[role=alert]')?.textContent).toContain('Verknüpfungen');
    c.component.confirm();expect(c.reset).toHaveBeenCalledWith({organizationId:'vbs-verteidigung'});
    expect(c.dialog.open).toBe(false);
  });
  it('prevents double submission, cancelling an active reset and success leaking to another identity',()=>{
    const c=setup(),pending=new Subject<{alreadyReset:boolean}>();c.api.resetAdaImport.mockReturnValue(pending);
    c.open();c.component.confirm();c.component.confirm();
    const event=new Event('cancel',{cancelable:true});c.component.cancel(event);
    expect(event.defaultPrevented).toBe(true);expect(c.api.resetAdaImport).toHaveBeenCalledOnce();
    c.identity.userId.set('other');TestBed.tick();pending.next({alreadyReset:false});
    expect(c.reset).not.toHaveBeenCalled();expect(c.dialog.open).toBe(false);
  });
  it('has no destructive action for an absent inventory or missing modeling permission',()=>{
    const c=setup();c.api.adaImportJourney.mockReturnValue(of(null));c.open();c.component.confirm();
    expect(c.api.resetAdaImport).not.toHaveBeenCalled();
    c.identity.canEditModels.set(false);c.fixture.detectChanges();
    expect(c.root.querySelector<HTMLButtonElement>('.journey-menu-trigger')!.disabled).toBe(true);
  });
});
