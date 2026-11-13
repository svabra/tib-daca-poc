import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { ProductEffectiveAccessGrant, ProductEffectiveAccessResponse } from '../../core/catalog.models';
import { ProductPersonalAccessService, isConsistentPersonalAccess } from './product-personal-access.service';

const grant:ProductEffectiveAccessGrant={grantId:'grant-1',subjectType:'group',subjectDisplayName:'Steueranalyse SG',subjectOrganization:'St. Gallen',groupId:'sg',
  protocols:['http'],dataVariant:'modified',validFrom:'2026-11-01',validUntil:'2027-11-30',weeklyAvailability:null,purpose:null,expiresInDays:383,
  expiryState:'active',sourceRequestId:null,sourceRequestNumber:null,renewalEligibility:{eligible:false,reason:'unsupportedSubject',renewalRequestId:null}};
const granted:ProductEffectiveAccessResponse={granted:true,asOfDate:'2026-11-12',policyRevision:2,grants:[grant]};
const denied:ProductEffectiveAccessResponse={granted:false,asOfDate:'2026-11-12',policyRevision:2,grants:[]};

describe('Personal access context',()=>{
  afterEach(()=>TestBed.resetTestingModule());
  it('drops a late grant response after switching users',()=>{
    const actor=signal('jan.waser');const first=new Subject<ProductEffectiveAccessResponse>();const second=new Subject<ProductEffectiveAccessResponse>();
    const api={identityUserId:actor,loadEffectiveAccess:vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)};
    TestBed.configureTestingModule({providers:[ProductPersonalAccessService,{provide:CatalogApiService,useValue:api}]});
    const service=TestBed.inject(ProductPersonalAccessService);
    service.load('product');actor.set('noemie.rochat');service.load('product');
    expect(service.status()).toBeNull();expect(service.ready()).toBe(false);
    second.next(denied);first.next(granted);
    expect(service.status()).toEqual(denied);expect(service.granted()).toBe(false);
  });
  it('clears previous permissions and retains an unknown state on failure; retry reloads',()=>{
    TestBed.configureTestingModule({providers:[ProductPersonalAccessService,{provide:CatalogApiService,useValue:{identityUserId:()=> 'jan.waser',
      loadEffectiveAccess:vi.fn().mockReturnValueOnce(of(granted)).mockReturnValueOnce(throwError(()=>new Error('unavailable'))).mockReturnValueOnce(of(denied))}}]});
    const service=TestBed.inject(ProductPersonalAccessService);service.load('p');expect(service.granted()).toBe(true);
    service.load('p');expect(service.ready()).toBe(false);expect(service.error()).toBe(true);expect(service.status()).toBeNull();
    service.retry();expect(service.ready()).toBe(true);expect(service.granted()).toBe(false);
  });
  it('rejects contradictory, incomplete and out-of-date grant evidence',()=>{
    expect(isConsistentPersonalAccess(granted)).toBe(true);expect(isConsistentPersonalAccess(denied)).toBe(true);
    for(const value of [{...granted,grants:[]},{...granted,granted:false},{...granted,policyRevision:null},
      {...granted,grants:[{...grant,groupId:null}]},{...granted,grants:[{...grant,validUntil:'2026-11-11'}]},
      {...granted,grants:[{...grant,subjectDisplayName:''}]}]) expect(isConsistentPersonalAccess(value)).toBe(false);
  });
});
