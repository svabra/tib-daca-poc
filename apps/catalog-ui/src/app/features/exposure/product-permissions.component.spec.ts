import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { PermissionLogItem, PermissionScope, ProductPermissionsResponse, PermissionRevocationResponse } from '../../core/catalog.models';
import { ProductPermissionsComponent } from './product-permissions.component';

const GRANT:PermissionScope={subject:{type:'person',id:'beat.stalder'},actions:['data.read'],protocols:['http'],validFrom:'2026-01-01',validUntil:'9999-12-31',dataVariant:'original',metadataChannels:{kobyMcp:false,i14y:false}};
const REGISTRY:ProductPermissionsResponse={productId:'product',asOfDate:'2026-11-03',policyRevision:7,latestRevision:7,state:'confirmed',canManage:true,canRevoke:true,items:[
  {grantId:'person-grant',displayName:'Beat Stalder',organization:'St. Gallen',grant:GRANT,groupMembers:[]},
  {grantId:'group-grant',displayName:'Analysten',organization:'BIT',grant:{...GRANT,subject:{type:'group',id:'group'},groupSnapshot:{groupId:'group',membershipRevision:3,memberIds:['ariane.keller']}},groupMembers:[{id:'ariane.keller',displayName:'Ariane Keller',organization:'ESTV'}]},
]};
const EVENT:PermissionLogItem={id:'event',action:'changed',occurredAt:'2026-11-03T10:00:00Z',actorId:'owner',actorName:'Data Owner',subjectType:'person',subjectId:GRANT.subject.id,displayName:'Beat Stalder',organization:'St. Gallen',policyRevision:7,before:[GRANT],after:[{...GRANT,dataVariant:'modified'}],source:'audit'};

function setup(){
  const actor=signal('owner');
  const api={identityUserId:actor,loadProductPermissions:vi.fn(()=>of(REGISTRY)),loadPermissionLog:vi.fn(()=>of({items:[EVENT],total:1})),revokeProductPermission:vi.fn(()=>of<PermissionRevocationResponse>({policyId:'new-policy',policyRevision:8,state:'activating',governanceSubmissionId:null}))};
  TestBed.configureTestingModule({imports:[ProductPermissionsComponent],providers:[{provide:CatalogApiService,useValue:api}]});
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});
  const fixture=TestBed.createComponent(ProductPermissionsComponent);fixture.componentRef.setInput('productId','product');fixture.detectChanges();
  return{fixture,component:fixture.componentInstance,api,actor,root:fixture.nativeElement as HTMLElement};
}

describe('Product permission registry and append-only history',()=>{
  afterEach(()=>TestBed.resetTestingModule());
  it('shows all grants initially and searches identities, organizations and frozen group members',()=>{
    const {component,fixture,root}=setup();expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
    component.query.set('ariane estv');fixture.detectChanges();expect(root.querySelectorAll('tbody tr')).toHaveLength(1);expect(root.querySelector('tbody')?.textContent).toContain('Analysten');
    component.query.set('st. gallen beat');fixture.detectChanges();expect(component.filtered().map(item=>item.grantId)).toEqual(['person-grant']);
    component.query.set('');fixture.detectChanges();expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(root.textContent).toContain('Unbestimmtes Enddatum');
  });
  it('searches complete history and reveals before/after conditions with incremental display',()=>{
    const {component,fixture,root}=setup();expect(root.querySelector('[data-permission-event=changed]')?.textContent).toContain('Berechtigung geändert');
    component.logQuery.set('Data Owner Modifizierte');fixture.detectChanges();expect(component.filteredEvents()).toHaveLength(1);
    component.events.set(Array.from({length:65},(_,index)=>({...EVENT,id:String(index)})));component.logQuery.set('');fixture.detectChanges();
    expect(component.visibleEvents()).toHaveLength(50);component.logLimit.update(component.more);fixture.detectChanges();expect(component.visibleEvents()).toHaveLength(65);
    expect(root.textContent).toContain('Vorher');expect(root.textContent).toContain('Nachher');
  });
  it('requires confirmation, preserves scope on cancellation and uses the exact revision on revoke',()=>{
    const {component,fixture,api,root}=setup();const trigger=root.querySelector<HTMLButtonElement>('.revoke-permission')!;
    trigger.click();fixture.detectChanges();expect(root.querySelector('dialog[open]')).not.toBeNull();component.closeConfirmation();fixture.detectChanges();expect(api.revokeProductPermission).not.toHaveBeenCalled();
    trigger.click();fixture.detectChanges();component.confirmRevocation();fixture.detectChanges();
    expect(api.revokeProductPermission).toHaveBeenCalledExactlyOnceWith('product','person-grant',7);
    expect(root.textContent).toContain('Entzug eingereicht');expect(root.textContent).not.toContain('Berechtigung entzogen. OPA');
    expect(component.data()?.items).toHaveLength(2);
  });
  it('shows a completed revoke only when its new policy revision is confirmed',()=>{
    const {component,fixture,api,root}=setup();api.loadProductPermissions.mockReturnValue(of({...REGISTRY,policyRevision:8,latestRevision:8,items:[REGISTRY.items[1]]}));
    component.openConfirmation(REGISTRY.items[0],null);fixture.detectChanges();component.confirmRevocation();fixture.detectChanges();
    expect(root.textContent).toContain('Berechtigung entzogen. OPA und PostgreSQL');expect(component.data()?.items).toHaveLength(1);
  });
  it('shows read-only grants and logs to readers and never offers a deletion action',()=>{
    const {component,fixture,api,root}=setup();api.loadProductPermissions.mockReturnValue(of({...REGISTRY,canManage:false,canRevoke:false}));component.reload();fixture.detectChanges();
    expect(root.querySelector('.revoke-permission')).toBeNull();expect(root.querySelector('tbody')?.textContent).toContain('Beat Stalder');expect(root.querySelector('#permission-log')).not.toBeNull();
    component.openConfirmation(REGISTRY.items[0],null);component.confirmRevocation();expect(api.revokeProductPermission).not.toHaveBeenCalled();
  });
  it('clears former-identity evidence and disables an open revocation immediately on actor changes',()=>{
    const {component,fixture,api,actor}=setup();component.openConfirmation(REGISTRY.items[0],null);fixture.detectChanges();
    const pending=new Subject<ProductPermissionsResponse>();api.loadProductPermissions.mockReturnValue(pending);
    actor.set('reader');expect(component.canRevoke()).toBe(false);component.confirmRevocation();expect(api.revokeProductPermission).not.toHaveBeenCalled();fixture.detectChanges();
    expect(component.data()).toBeNull();expect(component.confirming()).toBeNull();expect(component.events()).toHaveLength(1);
    pending.next({...REGISTRY,canManage:false,canRevoke:false});pending.complete();fixture.detectChanges();expect(component.canRevoke()).toBe(false);
  });
  it('reports unknown state on load failure without showing stale grants or private errors',()=>{
    const {component,fixture,api,root}=setup();api.loadProductPermissions.mockReturnValue(throwError(()=>new Error('secret diagnostic')));api.loadPermissionLog.mockReturnValue(throwError(()=>new Error('secret log diagnostic')));
    component.reload();fixture.detectChanges();expect(root.querySelector('tbody')).toBeNull();expect(root.textContent).toContain('nicht verlässlich geladen');expect(root.textContent).not.toContain('secret');expect(root.querySelector('.revoke-permission')).toBeNull();
  });
});
