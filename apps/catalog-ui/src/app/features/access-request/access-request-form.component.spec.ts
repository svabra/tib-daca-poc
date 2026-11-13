import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { FALLBACK_PRODUCT } from '../../core/catalog.seed';
import { AccessRequestFormComponent } from './access-request-form.component';
import { ProductEffectiveAccessResponse } from '../../core/catalog.models';

vi.mock('@bit-daca/design-system',async()=>{
  const {Component}=await import('@angular/core');class Glossary {}
  Component({selector:'daca-glossary-term',standalone:true,template:'',inputs:['term']})(Glossary);
  return {DacaGlossaryTermComponent:Glossary};
});

describe('Access request end date',()=>{
  afterEach(()=>{TestBed.resetTestingModule();vi.restoreAllMocks();});
  function render(){
    vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
    const actor=signal('beat.stalder');
    const api={product:signal(FALLBACK_PRODUCT),products:signal([FALLBACK_PRODUCT]),selectProduct:vi.fn(),
      identityUserId:actor,identityUser:()=>({displayName:'Beat Stalder',organization:'St. Gallen',email:'beat@example.invalid'}),
      loadEffectiveAccess:vi.fn((_id:string):Observable<ProductEffectiveAccessResponse>=>of({granted:false,asOfDate:'2026-11-12',policyRevision:null,grants:[]})),
      loadMyAccessRequests:()=>of([]),createAccessRequest:vi.fn((_id,body)=>of({...body,id:'request',requestNumber:'ZA-1',status:'submitted',createdAt:'2026-11-02T10:00:00Z'})),
    };
    TestBed.configureTestingModule({imports:[AccessRequestFormComponent],providers:[provideRouter([]),{provide:CatalogApiService,useValue:api},
      {provide:DemoIdentityService,useValue:{users:signal([{id:'kassandra.valdata',displayName:'Kassandra Valdata',organization:'EFD ESTV',avatarUrl:'/assets/kassandra-valdata.webp',email:'kassandra.valdata@estv.admin.ch',phone:null,roles:['data_owner']}])}},
      {provide:ActivatedRoute,useValue:{snapshot:{paramMap:convertToParamMap({id:FALLBACK_PRODUCT.id})}}}]});
    const fixture=TestBed.createComponent(AccessRequestFormComponent);fixture.detectChanges();
    fixture.componentInstance.form.patchValue({purpose:'Synthetische Statistik zur kantonalen Qualitätssicherung',legalBasis:'Amtshilfe zwischen Behörden',validFrom:'2026-11-02',validUntil:'2027-11-02',conditionsAccepted:true});
    return {fixture,component:fixture.componentInstance,api,actor};
  }
  it('submits explicit null when the user selects an indefinite end date',()=>{
    const {fixture,component,api}=render();
    const checkbox=fixture.nativeElement.querySelector('input[formcontrolname="openEnded"]') as HTMLInputElement;
    checkbox.click();fixture.detectChanges();
    expect(component.form.controls.validUntil.disabled).toBe(true);
    component.submit();fixture.detectChanges();
    expect(api.createAccessRequest).toHaveBeenCalledWith(FALLBACK_PRODUCT.id,expect.objectContaining({validUntil:null}));
    expect(fixture.nativeElement.querySelector('.access-request-confirmation').textContent).toContain('Unbestimmtes Enddatum');
    expect(fixture.nativeElement.textContent).not.toContain('9999');
  });
  it('requires a valid bounded end date again when the option is switched off',()=>{
    const {component,api}=render();
    component.form.controls.openEnded.setValue(true);component.endDateModeChanged();
    component.form.controls.openEnded.setValue(false);component.endDateModeChanged();
    component.form.controls.validUntil.setValue('');component.submit();expect(api.createAccessRequest).not.toHaveBeenCalled();
    component.form.controls.validUntil.setValue('2026-11-01');expect(component.periodInvalid()).toBe(true);
    component.form.controls.validUntil.setValue('2027-11-02');component.submit();
    expect(api.createAccessRequest).toHaveBeenCalledWith(FALLBACK_PRODUCT.id,expect.objectContaining({validUntil:'2027-11-02'}));
  });
  it('shows a change form for a group member and submits the desired personal scope through the existing workflow',async()=>{
    const {fixture,component,api}=render();
    api.loadEffectiveAccess.mockReturnValue(of({granted:true,asOfDate:'2026-11-12',policyRevision:3,grants:[{
      grantId:'group-grant',subjectType:'group',subjectDisplayName:'Steueranalyse SG',subjectOrganization:'St. Gallen',groupId:'analyse-sg',
      protocols:['http'],dataVariant:'modified',validFrom:'2026-01-01',validUntil:'9999-12-31',weeklyAvailability:null,purpose:null,
      expiresInDays:2000000,expiryState:'active',sourceRequestId:null,sourceRequestNumber:null,renewalEligibility:{eligible:false,reason:'unsupportedSubject',renewalRequestId:null},
    }]}));
    component.form.markAsPristine();component.personalAccess.load(FALLBACK_PRODUCT.id);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Zugriffänderung beantragen');
    expect(fixture.nativeElement.textContent).toContain('Über Gruppe · Steueranalyse SG');
    expect(component.form.controls.requestedVariant.value).toBe('modified');
    expect(component.form.controls.openEnded.value).toBe(true);expect(component.form.controls.validUntil.disabled).toBe(true);
    component.form.patchValue({requestedProtocol:'both',requestedVariant:'original',conditionsAccepted:true});component.submit();fixture.detectChanges();
    expect(api.createAccessRequest).toHaveBeenCalledWith(FALLBACK_PRODUCT.id,expect.objectContaining({consumerType:'person',machineId:null,requestedProtocol:'both',requestedVariant:'original',validUntil:null}));
    expect(fixture.nativeElement.textContent).toContain('Ihr Änderungsantrag ist eingegangen');
  });
  it('discards a draft and prior receipt when the identity changes',()=>{
    const {fixture,component,api,actor}=render();component.submit();expect(api.createAccessRequest).toHaveBeenCalled();
    actor.set('jan.waser');fixture.detectChanges();
    expect(component.createdRequest()).toBeNull();expect(component.form.controls.purpose.value).toBe('');
    expect(component.form.controls.conditionsAccepted.value).toBe(false);
  });
});
