import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { SearchViewsComponent } from './search-views.component';
import { EMPTY_SEARCH_VIEW, SearchView, SearchViewsApiService, SharedSearchView } from './search-views-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { CatalogApiService } from '../../core/catalog-api.service';
import { UserPreferencesService } from '../../core/user-preferences.service';

const VIEW:SearchView={id:'view-id',ownerUserId:'sender',name:'Gebäude',description:'Strukturinventare',configuration:{...EMPTY_SEARCH_VIEW,query:'Gebäude',kind:'structure',connection:'metadata'},revision:3,createdAt:'2026-10-31T00:00:00Z',updatedAt:'2026-10-31T00:00:00Z'};
const SHARE:SharedSearchView={id:'share-id',senderUserId:'other',senderName:'Andere Person',sourceRevision:1,
  snapshot:{name:'Gesendete View',description:'Fester Stand',configuration:{...EMPTY_SEARCH_VIEW,kind:'field',mode:'focus'}},message:'Bitte prüfen',sentAt:'2026-10-31T00:00:00Z',acceptedAt:null,acceptedViewId:null,dismissedAt:null};

describe('Personal search Views',()=>{
  beforeEach(()=>{
    Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,writable:true,value:function(this:HTMLDialogElement){this.open=true;}});
    Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,writable:true,value:function(this:HTMLDialogElement){this.open=false;}});
  });
  afterEach(()=>{TestBed.resetTestingModule();vi.restoreAllMocks();});
  function render(){
    const actor=signal('sender');
    const api={list:vi.fn(()=>of([VIEW])),inbox:vi.fn(()=>of([SHARE])),received:vi.fn(()=>of(SHARE)),
      create:vi.fn((body)=>of({...VIEW,...body,id:'created',revision:1})),update:vi.fn((view,body)=>of({...view,...body,revision:view.revision+1})),
      delete:vi.fn(()=>of(undefined)),share:vi.fn(()=>of({createdCount:1})),accept:vi.fn(()=>of({...VIEW,id:'adopted',name:SHARE.snapshot.name,configuration:SHARE.snapshot.configuration})),dismiss:vi.fn(()=>of(undefined))};
    TestBed.configureTestingModule({providers:[{provide:SearchViewsApiService,useValue:api},
      {provide:DemoIdentityService,useValue:{userId:actor,users:signal([{id:'sender',displayName:'Sender',organization:'BIT'},{id:'recipient',displayName:'Noémie Test',organization:'ESTV'}])}},
      {provide:CatalogApiService,useValue:{refreshWorkflowTasks:vi.fn()}},{provide:UserPreferencesService,useValue:{language:signal('de')}}]});
    const fixture=TestBed.createComponent(SearchViewsComponent);
    fixture.componentRef.setInput('configuration',VIEW.configuration);fixture.componentRef.setInput('activeId',VIEW.id);fixture.detectChanges();
    return{fixture,component:fixture.componentInstance,root:fixture.nativeElement as HTMLElement,api,actor};
  }

  it('selects a newly inserted View option after Save',async()=>{
    const {component,fixture,root}=render();
    component.applied.subscribe(view=>fixture.componentRef.setInput('activeId',view?.id??null));
    component.open('create',null);fixture.detectChanges();
    component.form.name='New saved search';component.submit();fixture.detectChanges();await fixture.whenStable();
    expect(root.querySelector<HTMLSelectElement>('.view-select select')?.value).toBe('created');
  });

  it('creates from the current filters and edits a saved view without changing it before Save',()=>{
    const {component,fixture,api}=render();const applied=vi.fn();component.applied.subscribe(applied);
    component.open('create',null);fixture.detectChanges();component.form.name='Neue View';component.submit();
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({name:'Neue View',configuration:VIEW.configuration}));
    expect(applied).toHaveBeenCalledWith(expect.objectContaining({id:'created'}));
    component.open('edit',null);fixture.detectChanges();component.form.configuration.query='Lokal geändert';
    expect(VIEW.configuration.query).toBe('Gebäude');component.close();expect(api.update).not.toHaveBeenCalled();
    component.open('edit',null);component.form.name='Umbenannt';component.submit();
    expect(api.update).toHaveBeenCalledWith(VIEW,expect.objectContaining({name:'Umbenannt'}));
  });

  it('keeps selected recipients while searching and sends only the saved revision after an explicit submit',()=>{
    const {component,fixture,api}=render();
    component.open('share',null);fixture.detectChanges();
    expect(api.share).not.toHaveBeenCalled();expect(component.people().map(person=>person.id)).toEqual(['recipient']);
    component.toggleRecipient('recipient',true);component.personQuery.set('noemie');expect(component.people()).toHaveLength(1);
    component.personQuery.set('absent');expect(component.people()).toHaveLength(0);expect(component.recipients().size).toBe(1);
    component.message='Bitte nutzen';component.submit();
    expect(api.share).toHaveBeenCalledWith(VIEW,['recipient'],'Bitte nutzen');
    expect(component.dialogMode()).toBeNull();
  });

  it('preserves an edit after a concurrency conflict and does not apply an unconfirmed value',()=>{
    const {component,fixture,api}=render();const applied=vi.fn();component.applied.subscribe(applied);
    api.update.mockReturnValueOnce(throwError(()=>({status:412})));
    component.open('edit',null);fixture.detectChanges();component.form.name='Mein Entwurf';component.submit();
    expect(component.form.name).toBe('Mein Entwurf');expect(component.dialogMode()).toBe('edit');
    expect(component.error()).toContain('zwischenzeitlich geändert');expect(applied).not.toHaveBeenCalled();
  });

  it('adopts the sent filters and clears the pending message only after success',()=>{
    const {component,fixture,api}=render();const applied=vi.fn();component.applied.subscribe(applied);
    component.review(SHARE.id);fixture.detectChanges();
    expect(component.shared()?.snapshot.configuration).toEqual(SHARE.snapshot.configuration);
    component.adoptedName='Meine Kopie';component.submit();
    expect(api.accept).toHaveBeenCalledWith(SHARE,'Meine Kopie');
    expect(applied).toHaveBeenCalledWith(expect.objectContaining({id:'adopted',configuration:SHARE.snapshot.configuration}));
    expect(component.incoming()).toEqual([]);expect(component.dialogMode()).toBeNull();
  });

  it('requires deletion confirmation and discards stale private reads when the identity changes',()=>{
    const {component,fixture,api,actor}=render();
    component.open('delete',null);fixture.detectChanges();expect(api.delete).not.toHaveBeenCalled();
    component.close();expect(api.delete).not.toHaveBeenCalled();
    const pending=new Subject<SearchView[]>();api.list.mockReturnValueOnce(pending);component.load();
    api.list.mockReturnValueOnce(of([]));actor.set('recipient');fixture.detectChanges();
    pending.next([VIEW]);pending.complete();
    expect(component.views()).toEqual([]);expect(component.dialogMode()).toBeNull();
  });
});
