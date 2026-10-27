import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService } from './data-models-api.service';
import { SourceAccessActionsComponent } from './source-access-actions.component';
import { ReturnedSourcesComponent } from './returned-sources.component';

describe('Personal source access', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup() {
    const identity={userId:signal('steward')};
    const api={relinquishSourceAccess:vi.fn(()=>of(null))};
    TestBed.configureTestingModule({imports:[SourceAccessActionsComponent],providers:[
      {provide:DemoIdentityService,useValue:identity}, {provide:DataModelsApiService,useValue:api},
      {provide:CatalogI18nService,useValue:{t:(key:string)=>key}},
    ]});
    const fixture=TestBed.createComponent(SourceAccessActionsComponent);
    fixture.componentRef.setInput('source',{id:'source',name:'VIBDBU',canRelinquishAccess:true});
    fixture.detectChanges();TestBed.tick();
    const root=fixture.nativeElement as HTMLElement;const dialog=root.querySelector('dialog')!;
    Object.defineProperty(dialog,'showModal',{value:()=>dialog.setAttribute('open','')});
    Object.defineProperty(dialog,'close',{value:()=>dialog.removeAttribute('open')});
    const open=()=>{(root.querySelector('.return-access') as HTMLButtonElement).click();fixture.detectChanges();};
    return {fixture,component:fixture.componentInstance,root,dialog,api,identity,open};
  }
  it('requires confirmation and preserves access when cancelled',()=>{
    const c=setup();c.open();expect(c.dialog.textContent).toContain('VIBDBU');expect(c.api.relinquishSourceAccess).not.toHaveBeenCalled();
    c.component.cancel();expect(c.dialog.open).toBe(false);expect(c.api.relinquishSourceAccess).not.toHaveBeenCalled();
    const returned=vi.fn();c.component.returned.subscribe(returned);c.open();c.component.confirm();
    expect(c.api.relinquishSourceAccess).toHaveBeenCalledWith('source');expect(returned).toHaveBeenCalledOnce();
  });
  it('keeps the dialog open on failure and does not report a returned permission',()=>{
    const c=setup();const returned=vi.fn();c.component.returned.subscribe(returned);
    c.api.relinquishSourceAccess.mockReturnValue(throwError(()=>new Error('Unavailable')));
    c.open();c.component.confirm();c.fixture.detectChanges();
    expect(c.root.querySelector('[role=alert]')?.textContent).toContain('Unavailable');expect(c.dialog.open).toBe(true);expect(returned).not.toHaveBeenCalled();
  });
  it('closes the prior identity dialog and hides controls without capability',()=>{
    const c=setup();c.open();c.identity.userId.set('other');TestBed.tick();expect(c.dialog.open).toBe(false);
    c.fixture.componentRef.setInput('source',{id:'csv',name:'Inventory',canRelinquishAccess:false});c.fixture.detectChanges();
    expect(c.root.querySelector('.return-access')).toBeNull();
  });
  it('shows minimal returned-source metadata, validates reasons and prevents duplicate requests',()=>{
    const identity={userId:signal('actor')};
    const items=[{sourceId:'source',sourceName:'VIBDBU',organization:'armasuisse',revision:1,request:null}];
    const pending=new Subject<never>();
    const api={returnedSources:vi.fn(()=>of(items)),requestSourceRestoration:vi.fn(()=>pending)};
    TestBed.configureTestingModule({imports:[ReturnedSourcesComponent],providers:[
      {provide:DemoIdentityService,useValue:identity},{provide:DataModelsApiService,useValue:api},
      {provide:CatalogI18nService,useValue:{t:(key:string)=>key}},
    ]});
    const fixture=TestBed.createComponent(ReturnedSourcesComponent);fixture.detectChanges();TestBed.tick();fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('VIBDBU');
    const component=fixture.componentInstance;component.reasons['source']=' ';component.submit(items[0]);expect(api.requestSourceRestoration).not.toHaveBeenCalled();
    component.reasons['source']='Need structure access';component.submit(items[0]);component.submit(items[0]);
    expect(api.requestSourceRestoration).toHaveBeenCalledOnce();expect(api.requestSourceRestoration).toHaveBeenCalledWith('source','Need structure access');
    api.returnedSources.mockReturnValue(of([]));identity.userId.set('other');TestBed.tick();fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('VIBDBU');pending.complete();
  });
});
