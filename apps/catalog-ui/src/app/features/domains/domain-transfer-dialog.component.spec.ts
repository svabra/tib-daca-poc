import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DomainSummary } from '../../core/catalog.models';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { DomainTransferDialogComponent } from './domain-transfer-dialog.component';

const domain={id:'domain',revision:7,preferredLabel:'Personal',ownerUserId:'old',ownerName:'Bisherige Person'} as DomainSummary;

describe('DomainTransferDialogComponent',()=>{
  afterEach(()=>TestBed.resetTestingModule());
  async function render(){
    const result=new Subject<DomainSummary>(),transferDomainOwnership=vi.fn(()=>result);
    Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,writable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,writable:true,value:function(this:HTMLDialogElement){this.removeAttribute('open');}});
    TestBed.configureTestingModule({imports:[DomainTransferDialogComponent],providers:[{provide:UserPreferencesService,useValue:{language:signal('de')}},{provide:DemoIdentityService,useValue:{users:signal([{id:'old',displayName:'Bisherige Person',organization:'Amt'},{id:'new',displayName:'Noémie Neu',organization:'Anderes Amt'},{id:'deputy',displayName:'Stellvertretung',organization:'Amt'}])}},{provide:CatalogApiService,useValue:{transferDomainOwnership}}]});
    const fixture=TestBed.createComponent(DomainTransferDialogComponent);fixture.componentRef.setInput('domain',domain);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();return{fixture,result,transferDomainOwnership};
  }
  it('searches people and only transfers on explicit confirmation',async()=>{
    const {fixture,result,transferDomainOwnership}=await render(),component=fixture.componentInstance,saved=vi.fn();component.saved.subscribe(saved);
    component.query.set('noemie');expect(component.ownerChoices().map(person=>person.id)).toEqual(['new']);
    component.owner='new';component.deputy='deputy';component.reason='Bewusste Übergabe';component.transfer();expect(transferDomainOwnership).not.toHaveBeenCalled();
    component.confirmed=true;component.transfer();expect(transferDomainOwnership).toHaveBeenCalledWith(domain,{ownerUserId:'new',deputyOwnerUserId:'deputy',reason:'Bewusste Übergabe'});
    result.next({...domain,ownerUserId:'new',revision:8});expect(saved).toHaveBeenCalledOnce();
  });
  it('cancels without writing and retains the complete handover on conflicts',async()=>{
    const {fixture,result,transferDomainOwnership}=await render(),component=fixture.componentInstance,closed=vi.fn();component.closed.subscribe(closed);
    component.close();expect(transferDomainOwnership).not.toHaveBeenCalled();expect(closed).toHaveBeenCalledOnce();
    component.owner='new';component.deputy='deputy';component.reason='Bewusste Übergabe';component.confirmed=true;component.transfer();result.error({error:{detail:'Revision changed'}});
    expect(component.owner).toBe('new');expect(component.deputy).toBe('deputy');expect(component.reason).toBe('Bewusste Übergabe');expect(component.error()).toBe('Revision changed');expect(component.busy()).toBe(false);
  });
});
