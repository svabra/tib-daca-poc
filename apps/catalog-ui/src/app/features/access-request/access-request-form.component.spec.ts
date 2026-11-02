import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { FALLBACK_PRODUCT } from '../../core/catalog.seed';
import { AccessRequestFormComponent } from './access-request-form.component';

vi.mock('@bit-daca/design-system',async()=>{
  const {Component}=await import('@angular/core');class Glossary {}
  Component({selector:'daca-glossary-term',standalone:true,template:'',inputs:['term']})(Glossary);
  return {DacaGlossaryTermComponent:Glossary};
});

describe('Access request end date',()=>{
  afterEach(()=>{TestBed.resetTestingModule();vi.restoreAllMocks();});
  function render(){
    vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
    const api={product:signal(FALLBACK_PRODUCT),products:signal([FALLBACK_PRODUCT]),selectProduct:vi.fn(),
      identityUserId:()=> 'beat.stalder',identityUser:()=>({displayName:'Beat Stalder',organization:'St. Gallen',email:'beat@example.invalid'}),
      loadMyAccessRequests:()=>of([]),createAccessRequest:vi.fn((_id,body)=>of({...body,id:'request',requestNumber:'ZA-1',status:'submitted',createdAt:'2026-11-02T10:00:00Z'})),
    };
    TestBed.configureTestingModule({imports:[AccessRequestFormComponent],providers:[provideRouter([]),{provide:CatalogApiService,useValue:api},
      {provide:DemoIdentityService,useValue:{users:signal([{id:'kassandra.valdata',displayName:'Kassandra Valdata',organization:'EFD ESTV',avatarUrl:'/assets/kassandra-valdata.webp',email:'kassandra.valdata@estv.admin.ch',phone:null,roles:['data_owner']}])}},
      {provide:ActivatedRoute,useValue:{snapshot:{paramMap:convertToParamMap({id:FALLBACK_PRODUCT.id})}}}]});
    const fixture=TestBed.createComponent(AccessRequestFormComponent);fixture.detectChanges();
    fixture.componentInstance.form.patchValue({purpose:'Synthetische Statistik zur kantonalen Qualitätssicherung',legalBasis:'Amtshilfe zwischen Behörden',validFrom:'2026-11-02',validUntil:'2027-11-02',conditionsAccepted:true});
    return {fixture,component:fixture.componentInstance,api};
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
});
