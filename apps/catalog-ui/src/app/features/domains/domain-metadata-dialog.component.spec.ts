import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DomainSummary } from '../../core/catalog.models';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { DomainMetadataDialogComponent } from './domain-metadata-dialog.component';

const domain={id:'domain',revision:3,preferredLabel:'Personal',definition:'Beschreibung',labels:[{language:'de',preferredLabel:'Personal',definition:'Beschreibung'},{language:'en',preferredLabel:'Personnel',definition:'Description'}]} as DomainSummary;

describe('DomainMetadataDialogComponent',()=>{
  afterEach(()=>TestBed.resetTestingModule());
  async function render(){
    const result=new Subject<DomainSummary>(),updateDomainDirect=vi.fn(()=>result);
    Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,writable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});
    Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,writable:true,value:function(this:HTMLDialogElement){this.removeAttribute('open');}});
    TestBed.configureTestingModule({imports:[DomainMetadataDialogComponent],providers:[{provide:UserPreferencesService,useValue:{language:signal('de')}},{provide:CatalogApiService,useValue:{updateDomainDirect}}]});
    const fixture=TestBed.createComponent(DomainMetadataDialogComponent);fixture.componentRef.setInput('domain',domain);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();return{fixture,result,updateDomainDirect};
  }
  it('stages all existing languages and sends only metadata on explicit save',async()=>{
    const {fixture,result,updateDomainDirect}=await render(),component=fixture.componentInstance,saved=vi.fn();component.saved.subscribe(saved);
    component.labels()[0].definition='Neue Beschreibung';expect(updateDomainDirect).not.toHaveBeenCalled();component.save();
    expect(updateDomainDirect).toHaveBeenCalledWith(domain,{localizations:[{language:'de',preferredLabel:'Personal',definition:'Neue Beschreibung'},{language:'en',preferredLabel:'Personnel',definition:'Description'}]});
    result.next({...domain,revision:4});expect(saved).toHaveBeenCalledWith({...domain,revision:4});
  });
  it('cancels without writing and retains entries on a server error',async()=>{
    const {fixture,result,updateDomainDirect}=await render(),component=fixture.componentInstance,closed=vi.fn();component.closed.subscribe(closed);component.close();expect(closed).toHaveBeenCalledOnce();expect(updateDomainDirect).not.toHaveBeenCalled();
    component.labels()[0].definition='Lokale Eingabe';component.save();result.error({error:{detail:'Version changed'}});expect(component.error()).toBe('Version changed');expect(component.labels()[0].definition).toBe('Lokale Eingabe');expect(component.busy()).toBe(false);
  });
});
