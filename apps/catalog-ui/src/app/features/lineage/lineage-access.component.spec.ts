import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { LineageAccessPage } from '../../core/catalog.models';
import { LineageAccessComponent } from './lineage-access.component';

const page:LineageAccessPage={resourceUrn:'urn:resource',resourceLabel:'Tax product',consumerUrn:'urn:consumer',consumerLabel:'Dashboard',
  items:[{id:'event',occurredAt:'2026-10-31T01:00:00Z',subjectType:'machine',subjectId:'svc-finance',subjectName:'svc-finance',protocol:'http-rest',outcome:'success'}],nextCursor:null};

describe('Lineage access logs',()=>{
  afterEach(()=>TestBed.resetTestingModule());
  function render(){
    const actor=signal('owner');const response=new Subject<LineageAccessPage>();
    const load=vi.fn(()=>response.asObservable());
    const params=convertToParamMap({id:'product',edgeId:'edge'});
    TestBed.configureTestingModule({providers:[provideRouter([]),
      {provide:ActivatedRoute,useValue:{paramMap:of(params),snapshot:{paramMap:params}}},
      {provide:CatalogApiService,useValue:{identityUserId:()=>actor(),loadLineageAccessEvents:load}},
    ]});
    const fixture=TestBed.createComponent(LineageAccessComponent);fixture.detectChanges();
    return{fixture,root:fixture.nativeElement as HTMLElement,actor,response,load};
  }
  it('shows the shared loader, actual machine receipts and sends identity/result filters to the server',()=>{
    const{fixture,root,response,load}=render();
    expect(root.querySelector('.small-spinner')).not.toBeNull();
    expect(load).toHaveBeenCalledWith('product','edge',expect.objectContaining({outcome:'success',after:expect.any(String)}));
    response.next(page);fixture.detectChanges();
    expect(root.textContent).toContain('svc-finance');expect(root.textContent).toContain('Maschine');
    expect(root.querySelector('.small-spinner')).toBeNull();
    fixture.componentInstance.subjectType='machine';fixture.componentInstance.load();
    expect(load).toHaveBeenLastCalledWith('product','edge',expect.objectContaining({subjectType:'machine'}));
  });
  it('clears private receipts on identity change and never restores an old response or fallback after denial',()=>{
    const{fixture,root,response,actor,load}=render();
    response.next(page);fixture.detectChanges();expect(root.textContent).toContain('svc-finance');
    const denied=new Subject<LineageAccessPage>();load.mockReturnValue(denied.asObservable());
    actor.set('reader');fixture.detectChanges();
    expect(root.textContent).not.toContain('svc-finance');
    response.next(page);fixture.detectChanges();expect(root.textContent).not.toContain('svc-finance');
    denied.error({status:403});fixture.detectChanges();
    expect(root.querySelector('[role=alert]')!.textContent).toContain('Nur der aktuelle Data Owner');
    expect(root.querySelector('tbody')).toBeNull();
  });
  it('uses the server cursor for more entries and clears old rows on refresh',()=>{
    const{fixture,response,load}=render();
    response.next({...page,nextCursor:'cursor'});fixture.detectChanges();
    fixture.componentInstance.load(true);expect(load).toHaveBeenLastCalledWith('product','edge',expect.objectContaining({cursor:'cursor'}));
    response.next({...page,items:[{...page.items[0],id:'next'}]});fixture.detectChanges();
    expect(fixture.componentInstance.page()!.items).toHaveLength(2);
    fixture.componentInstance.load();expect(fixture.componentInstance.page()).toBeNull();
  });
});
