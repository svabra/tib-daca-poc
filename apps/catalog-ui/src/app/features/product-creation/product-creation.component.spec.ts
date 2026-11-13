import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { CreationRequest, ProductCreationApiService } from './product-creation-api.service';
import { ProductCreationComponent } from './product-creation.component';

const request: CreationRequest = {
  id: 'request-id', requestNumber: 'NEW-1', revision: 1, requesterUserId: 'jan.waser', requesterName: 'Jan Waser',
  ownerUserId: 'kassandra.valdata', ownerName: 'Kassandra Valdata', sourceProductIds: ['source-id'], sourceTitles: ['Firmenprodukt'],
  proposedTitle: 'MWST SG 2026', purpose: 'Private kantonale Analyse', taxYear: 2026, cantonCode: 'SG', formats: ['xlsx','parquet','csv'],
  status: 'submitted', decisionComment: null, resultProductId: null, daaifNotebookUrl: 'http://127.0.0.1:8011/notebooks/mwst?creationRequest=request-id',
  createdAt: '2026-11-12T10:00:00Z', updatedAt: '2026-11-12T10:00:00Z',
};
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return {promise, resolve}; }

describe('Product creation request workspace', () => {
  afterEach(()=>TestBed.resetTestingModule());
  async function render(id = 'request-id', row:CreationRequest = request) {
    const actor = signal('kassandra.valdata');
    const params = convertToParamMap({id});
    const query = convertToParamMap({source:'daaif:mwst-ertraege-firmen-2016-2026:v1'});
    const api = {
      products: vi.fn().mockResolvedValue([{id:'source-id',title:'Firmenprodukt',ownerUserId:'kassandra.valdata',lifecycle:'active',metadata:{sourceProductId:'daaif:mwst-ertraege-firmen-2016-2026:v1'}}]),
      read: vi.fn().mockResolvedValue(row), list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(request), decide: vi.fn().mockResolvedValue({...request,status:'in_progress'}), fulfill: vi.fn(),
    };
    await TestBed.configureTestingModule({imports:[ProductCreationComponent], providers:[
      provideRouter([]), {provide:ActivatedRoute,useValue:{paramMap:of(params),snapshot:{paramMap:params,queryParamMap:query}}},
      {provide:DemoIdentityService,useValue:{userId:actor}}, {provide:ProductCreationApiService,useValue:api},
      {provide:CatalogApiService,useValue:{refreshWorkflowTasks:vi.fn()}},
    ]}).compileComponents();
    const fixture = TestBed.createComponent(ProductCreationComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    await vi.waitFor(()=>expect(fixture.componentInstance.loading()).toBe(false));fixture.detectChanges();
    return {fixture, component:fixture.componentInstance, actor, api};
  }

  it('prefills only the source and submits the selected general requirements without an owner or canton/year', async () => {
    const {component,api,fixture} = await render('new');
    expect(component.sourceId).toBe('source-id');
    expect(component.title).toBe('');expect(component.basisFrom).toBe('');expect(component.frequency).toBe('');expect(component.formats).toEqual([]);
    expect(fixture.nativeElement.querySelector('input[name="canton"]')).toBeNull();expect(fixture.nativeElement.querySelector('input[name="year"]')).toBeNull();
    component.title='Finanzplanung';component.purpose='Finanzplanung für die Verwaltung';
    component.basisFrom='2016-01-01';component.basisUntil='2025-12-31';component.legalBasis='Art. 10 des gesetzlichen Statistikauftrags';
    component.frequency='daily';component.addFormat('http-rest');component.addFormat('parquet');
    const navigate = vi.spyOn(TestBed.inject(Router),'navigate').mockResolvedValue(true);
    await component.submit();
    expect(api.create).toHaveBeenCalledWith({sourceProductIds:['source-id'],proposedTitle:'Finanzplanung',purpose:component.purpose,
      basisWindowType:'fixed',basisFrom:'2016-01-01',basisUntil:'2025-12-31',legalBasis:component.legalBasis,updateFrequency:'daily',formats:['http-rest','parquet']});
    expect(api.create.mock.calls[0][0]).not.toHaveProperty('ownerUserId');
    expect(api.create.mock.calls[0][0]).not.toHaveProperty('taxYear');expect(api.create.mock.calls[0][0]).not.toHaveProperty('cantonCode');
    expect(navigate).toHaveBeenCalledWith(['/product-creation-requests','request-id']);
  });

  it('validates the period and requires selected formats, legal mandate and update frequency',async()=>{
    const {component,api,fixture}=await render('new');
    component.title='Finanzplanung';component.purpose='Analyse historischer Jahreswerte';component.basisFrom='2026-01-01';component.basisUntil='2025-12-31';
    component.legalBasis='Art. 10 Statistikauftrag';component.frequency='once';component.addFormat('csv');
    expect(component.periodInvalid()).toBe(true);await component.submit();expect(api.create).not.toHaveBeenCalled();
    component.basisUntil='2026-12-31';expect(component.canSubmit()).toBe(true);
    component.addFormat('csv');expect(component.formats).toEqual(['csv']);component.removeFormat('csv');expect(component.canSubmit()).toBe(false);
    fixture.detectChanges();await fixture.whenStable();
    const picker=fixture.nativeElement.querySelector('select[name="formatPicker"]') as HTMLSelectElement;
    expect([...picker.options].map(option=>option.text)).toEqual(['Format auswählen','Parquet','HTTP REST API','CSV','Excel']);
    const frequency=fixture.nativeElement.querySelector('select[name="updateFrequency"]') as HTMLSelectElement;
    expect([...frequency.options].filter(option=>!option.disabled).map(option=>option.value)).toEqual(['','once','realtime','hourly','daily','weekly','annually']);
    expect([...frequency.options].find(option=>option.text.includes('──'))?.disabled).toBe(true);
  });

  it('switches between mutually exclusive fixed and rolling requirements and saves the chosen duration',async()=>{
    const {component,fixture,api}=await render('new');
    component.title='Rollierende Finanzplanung';component.purpose='Analyse der letzten Monate für die Verwaltung';
    component.legalBasis='Art. 10 Statistikauftrag';component.frequency='daily';component.addFormat('parquet');
    component.basisFrom='2026-01-01';component.basisUntil='2026-11-12';fixture.detectChanges();
    const selector=fixture.nativeElement.querySelector('select[name="basisWindowType"]') as HTMLSelectElement;
    expect([...selector.options].map(option=>option.text)).toEqual(['Fixes Zeitfenster','Rollierendes Zeitfenster']);
    selector.value='rolling';selector.dispatchEvent(new Event('change'));fixture.detectChanges();
    expect(component.basisFrom).toBe('');expect(component.basisUntil).toBe('');expect(component.canSubmit()).toBe(false);
    expect(fixture.nativeElement.querySelector('input[name="basisFrom"]')).toBeNull();
    for(const size of [0,-1,1.5,10001]){component.rollingWindowSize=size;expect(component.canSubmit()).toBe(false);}
    component.rollingWindowSize=12;component.rollingWindowUnit='months';expect(component.canSubmit()).toBe(true);
    vi.spyOn(TestBed.inject(Router),'navigate').mockResolvedValue(true);await component.submit();
    expect(api.create).toHaveBeenCalledWith({sourceProductIds:['source-id'],proposedTitle:component.title,purpose:component.purpose,
      basisWindowType:'rolling',rollingWindowSize:12,rollingWindowUnit:'months',legalBasis:component.legalBasis,formats:['parquet'],updateFrequency:'daily'});
    component.changeWindowType('fixed');fixture.detectChanges();expect(component.rollingWindowSize).toBeNull();expect(component.canSubmit()).toBe(false);
    expect(fixture.nativeElement.querySelector('input[name="rollingWindowSize"]')).toBeNull();
  });

  it('shows an owner the saved rolling window and update frequency without legacy canton/year instructions',async()=>{
    const rolling:CreationRequest={...request,status:'in_progress',taxYear:null,cantonCode:null,basisWindowType:'rolling',
      basisFrom:null,basisUntil:null,rollingWindowSize:12,rollingWindowUnit:'months',legalBasis:'Art. 10 Statistikauftrag',updateFrequency:'daily'};
    const {fixture}=await render('request-id',rolling);
    expect(fixture.nativeElement.textContent).toContain('Rollierendes Zeitfenster: 12 Monate');
    expect(fixture.nativeElement.textContent).toContain('jeweiligen Datenstand');expect(fixture.nativeElement.textContent).toContain('Täglich');
    expect(fixture.nativeElement.textContent).not.toContain('Keine Summierung');
  });

  it('shows the persisted general requirements to the Data Owner instead of a tax-specific scope',async()=>{
    const general:CreationRequest={...request,status:'in_progress',taxYear:null,cantonCode:null,basisFrom:'2016-01-01',basisUntil:'2025-12-31',legalBasis:'Art. 10 Statistikauftrag',updateFrequency:'hourly',formats:['http-rest','csv']};
    const {fixture}=await render('request-id',general);
    const text=fixture.nativeElement.textContent;
    expect(text).toContain('Art. 10 Statistikauftrag');expect(text).toContain('Stündlich');expect(text).toContain('HTTP REST API');
    expect(text).not.toContain('Keine Summierung');expect(text).not.toContain('Firmenzeilen ·');
  });

  it('discards a completed owner decision after the active identity changes', async () => {
    const {component,fixture,actor,api} = await render();
    const pending = deferred<CreationRequest>(); api.decide.mockReturnValueOnce(pending.promise);
    const mutation = component.decide('accept');
    api.read.mockResolvedValueOnce({...request,ownerUserId:'another.owner',purpose:'Current actor request'});
    actor.set('another.owner'); fixture.detectChanges(); await fixture.whenStable();
    pending.resolve({...request,status:'in_progress'}); await mutation;
    expect(component.detail()?.purpose).toBe('Current actor request');
    expect(component.detail()?.ownerUserId).toBe('another.owner');
  });

  it('clears private form text and ignores a stale source/detail response on an identity switch', async () => {
    const {component,fixture,actor,api} = await render('new');
    component.purpose = 'Private request purpose'; component.comment = 'Private comment';component.title='Private title';component.legalBasis='Privater gesetzlicher Auftrag';component.formats=['xlsx'];component.frequency='weekly';component.basisFrom='2026-01-01';
    const pending = deferred<[]>(); api.products.mockReturnValueOnce(pending.promise);
    actor.set('jan.waser'); fixture.detectChanges();
    expect(component.purpose).toBe(''); expect(component.comment).toBe('');
    expect(component.title).toBe('');expect(component.legalBasis).toBe('');expect(component.formats).toEqual([]);expect(component.frequency).toBe('');expect(component.basisFrom).toBe('');
    actor.set('kassandra.valdata'); fixture.detectChanges(); await fixture.whenStable();
    pending.resolve([]); await Promise.resolve(); await Promise.resolve();
    expect(component.sourceId).toBe('source-id');
  });
});
