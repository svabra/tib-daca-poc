import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { FALLBACK_PRODUCT } from '../../core/catalog.seed';
import type { IdentityDirectoryEntry, StoredAccessRequest } from '../../core/catalog.models';
import { ExposureStudioComponent } from './exposure-studio.component';

vi.mock('@bit-daca/design-system',async()=>{
  const {Component}=await import('@angular/core');
  class Status {} class Glossary {}
  Component({selector:'daca-status-badge',standalone:true,template:'<ng-content />',inputs:['tone']})(Status);
  Component({selector:'daca-glossary-term',standalone:true,template:'',inputs:['term']})(Glossary);
  return {StatusBadgeComponent:Status,DacaGlossaryTermComponent:Glossary};
});

const person={id:'fausto.marzo',displayName:'Fausto Marzo',organization:'EFD BIT PS',organizationId:'efd-bit-ps',email:'fausto@example.invalid',source:'federal',sourceSystem:'test',active:true} as IdentityDirectoryEntry;
const request={id:'request-1',dataProductId:FALLBACK_PRODUCT.id,requestNumber:'ZA-TEST',requesterId:person.id,requesterName:person.displayName,consumerType:'person',purpose:'Synthetische Statistik zur Qualitätssicherung',validFrom:'2026-11-02',validUntil:'2027-11-02',requestedProtocol:'http',requestedVariant:'modified'} as StoredAccessRequest;

async function render(known=true,linkedProduct=FALLBACK_PRODUCT.id,end:string|null=request.validUntil){
  const api={product:signal(FALLBACK_PRODUCT),ownerAccessRequests:signal([{...request,dataProductId:linkedProduct,validUntil:end}]),selectProduct:vi.fn(),
    loadAdministrativeOrganizations:vi.fn(()=>of([])),searchDirectoryPeople:vi.fn(()=>of(known?[person]:[])),
    upsertAccessSetting:vi.fn(()=>of({id:'policy',revision:1})),publishPolicy:vi.fn(()=>of({})),
    loadLatestPolicyWire:vi.fn(()=>of({status:'published',deployments:['opa','postgresql'].map(target=>({target,observedRevision:1,desiredRevision:1}))})),
  };
  TestBed.configureTestingModule({imports:[ExposureStudioComponent],providers:[provideRouter([]),provideHttpClient(),
    {provide:CatalogApiService,useValue:api},{provide:ActivatedRoute,useValue:{snapshot:{paramMap:convertToParamMap({id:FALLBACK_PRODUCT.id}),queryParamMap:convertToParamMap({request:request.id})}}},
  ]});
  const fixture=TestBed.createComponent(ExposureStudioComponent);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  return {fixture,component:fixture.componentInstance,api};
}

describe('Product access request review context',()=>{
  afterEach(()=>TestBed.resetTestingModule());
  it('preserves an indefinite request in review and uses the existing open-ended policy ceiling',async()=>{
    const {fixture,component,api}=await render(true,FALLBACK_PRODUCT.id,null);
    expect(component.openEnded()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Unbestimmtes Enddatum');
    expect(fixture.nativeElement.textContent).not.toContain('9999');
    component.activate();
    expect(api.upsertAccessSetting).toHaveBeenCalledWith(FALLBACK_PRODUCT.id,expect.objectContaining({validUntil:'9999-12-31'}),expect.any(Array));
  });
  it('uses the trusted directory identity and preserves requested dates, protocol and modified variant',async()=>{
    const {fixture,component,api}=await render();
    expect(fixture.nativeElement.querySelector('[data-testid="linked-access-request"]').textContent).toContain('ZA-TEST');
    expect(component.selectedPerson()?.id).toBe(person.id);expect(component.canActivate()).toBe(true);
    component.activate();
    expect(api.upsertAccessSetting).toHaveBeenCalledWith(FALLBACK_PRODUCT.id,expect.objectContaining({subject:{type:'person',id:person.id},protocols:['http'],dataVariant:'modified',validFrom:request.validFrom,validUntil:request.validUntil}),[{accessRequestId:request.id,fulfillmentSubject:{type:'person',id:person.id}}]);
  });
  it('does not activate a request with an unknown directory identity',async()=>{
    const {component,api}=await render(false);expect(component.selectedPerson()).toBeNull();expect(component.canActivate()).toBe(false);
    component.activate();expect(api.upsertAccessSetting).not.toHaveBeenCalled();
  });
  it('rejects a request belonging to another product',async()=>{
    const {component,api}=await render(true,'different-product');expect(component.linkedAccessRequest()).toBeNull();expect(component.canActivate()).toBe(false);
    component.activate();expect(api.upsertAccessSetting).not.toHaveBeenCalled();
  });
});
