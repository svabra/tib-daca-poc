import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { StoredAccessRequest } from '../../core/catalog.models';
import { ProductAccessRequestsComponent } from './product-access-requests.component';

const REQUEST: StoredAccessRequest = {
  id:'request-1',requestNumber:'ZA-2026-ONE',dataProductId:'product',requesterId:'beat.stalder',requesterName:'Beat Stalder',requesterOrganization:'St. Gallen',
  consumerType:'person',machineId:null,purpose:'Kantonale Finanzplanung und Statistik',legalBasis:'Amtshilfe',contactEmail:'beat@example.invalid',notes:null,
  requestedProtocol:'http',requestedVariant:'either',validFrom:'2026-01-01',validUntil:null,status:'rejected',requestKind:'initial',renewalOfRequestId:null,renewalOfRequestNumber:null,renewalContext:null,
  createdAt:'2026-11-01T10:00:00Z',updatedAt:'2026-11-03T12:00:00Z',
};

function setup() {
  const actor=signal('owner');
  const api={identityUserId:actor,loadProductAccessRequests:vi.fn(()=>of<readonly StoredAccessRequest[]>([
    REQUEST,{...REQUEST,id:'request-2',requestNumber:'ZA-2026-TWO',createdAt:'2026-11-02T09:00:00Z',updatedAt:'2026-11-02T09:00:00Z',status:'granted_modified'},
    {...REQUEST,id:'request-3',requestNumber:'ZA-2026-THREE',createdAt:'2026-11-03T08:00:00Z',status:'submitted'},
  ]))};
  TestBed.configureTestingModule({imports:[ProductAccessRequestsComponent],providers:[{provide:CatalogApiService,useValue:api}]});
  const fixture=TestBed.createComponent(ProductAccessRequestsComponent);fixture.componentRef.setInput('productId','product');fixture.detectChanges();
  return {fixture,component:fixture.componentInstance,root:fixture.nativeElement as HTMLElement,api,actor};
}

describe('Product access requests stay in the product workspace',()=>{
  afterEach(()=>TestBed.resetTestingModule());
  it('includes answered requests and sorts by arrival descending, independently of the last edit',()=>{
    const {component,root,fixture}=setup();
    const ids=()=>[...root.querySelectorAll('article')].map(row=>row.getAttribute('data-access-request-id'));
    expect(ids()).toEqual(['request-3','request-2','request-1']);
    expect(root.textContent).toContain('2 beantwortet');expect(root.textContent).toContain('Abgelehnt');expect(root.textContent).toContain('Zugriff gewährt (modifiziert)');
    const select=root.querySelector('select')!;select.value='asc';select.dispatchEvent(new Event('change'));fixture.detectChanges();
    expect(ids()).toEqual(['request-1','request-2','request-3']);expect(component.direction()).toBe('asc');
    expect(root.querySelector('[data-access-request-id=request-1] dl')?.textContent).toContain('Zuletzt bearbeitet');
    expect([...root.querySelectorAll('[data-access-request-id=request-1] time')].map(time=>time.getAttribute('datetime'))).toEqual([REQUEST.createdAt,REQUEST.updatedAt]);
    root.querySelector('summary')!.click();fixture.detectChanges();
    expect(root.querySelector('details')?.open).toBe(true);expect(root.querySelector('a')).toBeNull();
    expect(root.textContent).toContain('Unbestimmtes Enddatum');
  });
  it('distinguishes approval pending activation from granted access',()=>{
    const {component,root,fixture}=setup();component.requests.set([{...REQUEST,status:'approved_policy_pending'}]);fixture.detectChanges();
    expect(root.textContent).toContain('Genehmigt · Aktivierung ausstehend');expect(root.textContent).not.toContain('Zugriff gewährt');
  });
  it('clears former product/identity details and ignores late responses',()=>{
    const {component,fixture,api,actor,root}=setup();const pending=new Subject<readonly StoredAccessRequest[]>();api.loadProductAccessRequests.mockReturnValue(pending);
    component.reload(true);actor.set('reader');api.loadProductAccessRequests.mockReturnValue(throwError(()=>({status:403})));fixture.detectChanges();
    pending.next([REQUEST]);pending.complete();fixture.detectChanges();
    expect(root.querySelector('article')).toBeNull();expect(root.textContent).not.toContain('Beat Stalder');expect(root.textContent).toContain('nur für den zuständigen Data Owner');
    api.loadProductAccessRequests.mockReturnValue(of([]));fixture.componentRef.setInput('productId','other');fixture.detectChanges();
    expect(api.loadProductAccessRequests).toHaveBeenLastCalledWith('other');expect(root.textContent).toContain('noch keine Zugriffsanfragen');
  });
  it('retains ascending sorting on refresh and reports failures without stale results or diagnostics',()=>{
    const {component,fixture,api,root}=setup();component.direction.set('asc');component.reload(true);fixture.detectChanges();expect(component.direction()).toBe('asc');
    api.loadProductAccessRequests.mockReturnValue(throwError(()=>new Error('private diagnostic')));component.reload(true);fixture.detectChanges();
    expect(root.querySelector('article')).toBeNull();expect(root.textContent).toContain('nicht geladen');expect(root.textContent).not.toContain('private diagnostic');
  });
});
