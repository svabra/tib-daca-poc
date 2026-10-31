import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DomainSummary } from '../../core/catalog.models';
import { SemanticCreateDialogComponent } from './semantic-create-dialog.component';

describe('Domain canvas proposal form',()=>{
  afterEach(()=>TestBed.resetTestingModule());
  function render(pending?:Subject<DomainSummary[]>){
    const request={id:'request',status:'submitted'};
    const api={loadDomains:()=>pending??of([{ownerUserId:'owner',deputyOwnerUserId:'deputy'}]),loadGlossaryTerms:()=>of([]),
      createDomainChangeRequest:vi.fn(()=>of(request)),createDomainDirect:vi.fn()};
    TestBed.configureTestingModule({providers:[{provide:CatalogApiService,useValue:api},
      {provide:DemoIdentityService,useValue:{userId:signal('proposer'),users:signal([
        {id:'proposer',roles:['data_owner']},{id:'owner',roles:['data_consumer']},{id:'deputy',roles:['data_consumer']},
      ])}}]});
    const fixture=TestBed.createComponent(SemanticCreateDialogComponent);fixture.componentRef.setInput('kind','domain');fixture.detectChanges();
    return{fixture,component:fixture.componentInstance,api};
  }
  it('includes concrete Owners/deputies and submits a request even for a Data Owner proposer',async()=>{
    const {fixture,component,api}=render(),created=vi.fn();component.created.subscribe(created);
    expect(component.owners().map(user=>user.id)).toEqual(['proposer','owner','deputy']);
    component.label='New domain';component.definition='A personal proposal';component.owner='owner';component.deputy='deputy';
    await component.createDomain();
    expect(api.createDomainDirect).not.toHaveBeenCalled();
    expect(api.createDomainChangeRequest).toHaveBeenCalledWith(expect.objectContaining({operation:'create'}));
    expect(created).toHaveBeenCalledWith(expect.objectContaining({request:expect.objectContaining({status:'submitted'})}));
    expect(fixture.nativeElement.textContent).toContain('ALDS');
  });
  it('shows the shared spinner until foundations finish and retains the form when no ALDS is available',async()=>{
    const pending=new Subject<DomainSummary[]>(),{fixture,component,api}=render(pending);
    expect(fixture.nativeElement.querySelector('.small-spinner')).not.toBeNull();
    pending.next([]);pending.complete();fixture.detectChanges();expect(fixture.nativeElement.querySelector('.small-spinner')).toBeNull();
    api.createDomainChangeRequest.mockReturnValueOnce(throwError(()=>({error:{detail:'No other office ALDS is available.'}})));
    component.label='Retained draft';component.definition='Keep this text';component.owner='owner';component.deputy='deputy';
    await component.createDomain();expect(component.label).toBe('Retained draft');expect(component.error()).toContain('ALDS');
    expect(api.createDomainDirect).not.toHaveBeenCalled();
  });
});
