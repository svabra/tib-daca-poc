import { UserPreferencesService } from '../../core/user-preferences.service';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { CatalogApiService } from '../../core/catalog-api.service';
import { FALLBACK_PRODUCT } from '../../core/catalog.seed';
import { DomainSummary, DomainModelMemberships, GlossaryTermSummary } from '../../core/catalog.models';
import { DomainDetailComponent } from './domain-detail.component';

vi.mock('@bit-daca/design-system', async () => {
  const { Component } = await import('@angular/core');
  class StatusBadgeStub {}
  Component({ selector: 'daca-status-badge', standalone: true, template: '<ng-content />', inputs: ['tone'] })(StatusBadgeStub);
  return { StatusBadgeComponent: StatusBadgeStub };
});

const DOMAIN_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const DOMAIN: DomainSummary = {
  id: DOMAIN_ID,
  urn: 'urn:daca:domain:defence',
  originCatalogId: 'catalog',
  revision: 2,
  status: 'active',
  preferredLabel: 'Verteidigung',
  definition: 'Fachliche Verteidigungsdaten',
  labels: [{ language: 'de', preferredLabel: 'Verteidigung', alternativeLabels: [], definition: 'Fachliche Verteidigungsdaten' }],
  ownerUserId: 'sibilla.micheli',
  ownerName: 'Sibilla Micheli',
  ownerOrganization: 'VBS',
  deputyOwnerUserId: 'sandro.wenger',
  deputyOwnerName: 'Sandro Wenger',
  deputyOwnerOrganization: 'BAZG',
  productCount: 1,
  termCount: 0,
  updatedAt: '2026-08-25T10:00:00Z',
};
const PRODUCT = {
  ...FALLBACK_PRODUCT,
  id: PRODUCT_ID,
  globalId: 'urn:daca:product:armoured-fleet',
  title: 'Flottenbestand gepanzerte Fahrzeuge',
  domains: [DOMAIN],
};
const TERM: GlossaryTermSummary = {
  id: '33333333-3333-4333-8333-333333333333',
  urn: 'urn:daca:term:armoured-vehicle',
  originCatalogId: 'catalog',
  revision: 1,
  status: 'active',
  preferredLabel: 'Gepanzertes Fahrzeug',
  definition: 'Militärisches Fahrzeug mit konstruktivem Schutz.',
  labels: [
    { language: 'de', preferredLabel: 'Gepanzertes Fahrzeug', alternativeLabels: ['GepFz', 'Panzerfahrzeug'], definition: 'Militärisches Fahrzeug mit konstruktivem Schutz.' },
    { language: 'en', preferredLabel: 'Armoured Vehicle', alternativeLabels: ['AFV'], definition: 'A protected military vehicle.' },
  ],
  domains: [DOMAIN],
  relations: [],
  updatedAt: '2026-08-25T10:00:00Z',
};

describe('DomainDetailComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads products through the domain endpoint and renders them in the accessible graph alternative', async () => {
    const api = {
      loadSemanticGraph:()=>of({revision:0,positions:{},relations:[],canEditLayout:true,canEditRelations:false}),loadGlossaryTermProposals:()=>of([]),loadDomainModels: vi.fn(() => of({logicalModels:[],physicalModels:[]})),
      loadDomain: vi.fn(() => of(DOMAIN)),
      loadDataProductsForDomain: vi.fn(() => of([PRODUCT])),
      loadGlossaryTerms: vi.fn(() => of([])),
      loadDomainAuditEvents: vi.fn(() => of([])),
    };
    await TestBed.configureTestingModule({
      imports: [DomainDetailComponent],
      providers: [{provide:UserPreferencesService,useValue:{language:signal('de')}},
        provideRouter([]),
        {provide:DemoIdentityService,useValue:{userId:signal('christian.man')}},
        { provide: CatalogApiService, useValue: api },
        { provide: ActivatedRoute, useValue: { paramMap:of(convertToParamMap({id:DOMAIN_ID})), snapshot: { paramMap: convertToParamMap({ id: DOMAIN_ID }) } } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(DomainDetailComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const textAlternative = root.querySelector<HTMLElement>('.sr-only-graph');

    expect(api.loadDataProductsForDomain).toHaveBeenCalledOnce();
    expect(api.loadDataProductsForDomain).toHaveBeenCalledWith(DOMAIN_ID);
    expect(textAlternative?.textContent).toContain('Flottenbestand gepanzerte Fahrzeuge');
    expect(textAlternative?.textContent).toContain('Domain Verteidigung klassifiziert Produkt');
    expect(textAlternative?.querySelector<HTMLAnchorElement>('a')?.getAttribute('href'))
      .toBe(`/products/${PRODUCT_ID}/overview`);
    expect(root.querySelector('.semantic-graph')?.getAttribute('aria-label'))
      .toContain('mit 1 Produkten und 0 Begriffen');
  });

  it('offers a domain-prefilled term proposal and exposes abbreviations in the term presentation', async () => {
    const api = {
      loadSemanticGraph:()=>of({revision:0,positions:{},relations:[],canEditLayout:true,canEditRelations:false}),loadGlossaryTermProposals:()=>of([]),loadDomainModels: vi.fn(() => of({logicalModels:[],physicalModels:[]})),
      loadDomain: vi.fn(() => of(DOMAIN)),
      loadDataProductsForDomain: vi.fn(() => of([])),
      loadGlossaryTerms: vi.fn(() => of([TERM])),
      loadDomainAuditEvents: vi.fn(() => of([])),
    };
    await TestBed.configureTestingModule({
      imports: [DomainDetailComponent],
      providers: [{provide:UserPreferencesService,useValue:{language:signal('de')}},
        provideRouter([]),
        {provide:DemoIdentityService,useValue:{userId:signal('christian.man')}},
        { provide: CatalogApiService, useValue: api },
        { provide: ActivatedRoute, useValue: { paramMap:of(convertToParamMap({id:DOMAIN_ID})), snapshot: { paramMap: convertToParamMap({ id: DOMAIN_ID }) } } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(DomainDetailComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const proposalLink = [...root.querySelectorAll<HTMLAnchorElement>('a')]
      .find((link) => link.textContent?.includes('Term für diese Domain vorschlagen'));

    expect(proposalLink?.getAttribute('href')).toBe(`/glossary/proposals/new?domainId=${DOMAIN_ID}`);
    expect(root.querySelector('.domain-term-list')?.textContent).toContain('GepFz');
    expect(root.querySelector('.domain-term-list')?.textContent).toContain('AFV');
    expect(root.querySelector('.sr-only-graph')?.textContent).toContain('auch: GepFz, Panzerfahrzeug');
  });
  it('connects shared term nodes directly, labels relations and searches both model lists', async () => {
    const other = {...TERM,id:'other',preferredLabel:'Person',relations:[]};
    const linked = {...TERM,relations:[{id:'relation',relationType:'broader' as const,targetTermId:'other',targetUri:'',targetLabel:'Person'}]};
    const api = {
      loadDomain:()=>of(DOMAIN),loadDataProductsForDomain:()=>of([]),loadGlossaryTerms:()=>of([linked,other]),loadDomainAuditEvents:()=>of([]),
      loadSemanticGraph:()=>of({revision:0,positions:{},relations:[],canEditLayout:true,canEditRelations:false}),loadGlossaryTermProposals:()=>of([]),loadDomainModels:()=>of({logicalModels:[{id:'logical',title:'Personalbestand',description:'Mitarbeitende',status:'draft',revision:2,organizationId:'BIT',fieldCount:5}],
        physicalModels:[{id:'table',title:'s3://demo/personal.parquet',sourceId:'s3',sourceName:'Personaldaten',sourceType:'s3',modelType:'parquet',snapshotId:'snapshot',snapshotRevision:4}]}),
    };
    await TestBed.configureTestingModule({imports:[DomainDetailComponent],providers: [{provide:UserPreferencesService,useValue:{language:signal('de')}},provideRouter([]),{provide:DemoIdentityService,useValue:{userId:signal('christian.man')}},{provide:CatalogApiService,useValue:api},{provide:ActivatedRoute,useValue:{paramMap:of(convertToParamMap({id:DOMAIN_ID})),snapshot:{paramMap:convertToParamMap({id:DOMAIN_ID})}}}]}).compileComponents();
    const fixture=TestBed.createComponent(DomainDetailComponent);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.graph-node.is-term')).toHaveLength(2);
    expect(root.querySelectorAll('.graph-node.is-relation')).toHaveLength(0);
    expect(root.querySelector('.semantic-graph')?.textContent).toContain('hat Oberbegriff');
    expect(root.querySelector('.sr-only-graph')?.textContent).toContain('hat Oberbegriff zu Person');
    expect(root.querySelector('a[href="/models/logical"]')).toBeTruthy();
    expect(root.querySelector('a[href^="/physical-models/s3"]')?.getAttribute('href')).toBe('/physical-models/s3?snapshotId=snapshot&tableId=table');
    const search=root.querySelector<HTMLInputElement>('.model-search input')!;
    search.value='PARQUET';search.dispatchEvent(new Event('input'));fixture.detectChanges();
    expect(root.querySelector('.model-lists')?.textContent).not.toContain('Personalbestand');
    expect(root.querySelector('.model-lists')?.textContent).toContain('s3://demo/personal.parquet');
    search.value='mitarbeitende';search.dispatchEvent(new Event('input'));fixture.detectChanges();
    expect(root.querySelector('.model-lists')?.textContent).toContain('Personalbestand');
    expect(root.querySelector('.model-lists')?.textContent).not.toContain('s3://demo/personal.parquet');
    root.querySelector<HTMLButtonElement>('[aria-label="Ontologie vergrössern"]')!.click();fixture.detectChanges();
    expect(fixture.componentInstance.networkEditor?.zoom()).toBe(1);
  });

  it('keeps terms available when model loading fails and offers a retry', async () => {
    const api={loadDomain:()=>of(DOMAIN),loadDataProductsForDomain:()=>of([]),loadGlossaryTerms:()=>of([TERM]),loadDomainAuditEvents:()=>of([]),loadSemanticGraph:()=>of({revision:0,positions:{},relations:[],canEditLayout:true,canEditRelations:false}),loadGlossaryTermProposals:()=>of([]),loadDomainModels:vi.fn(()=>throwError(()=>new Error('unavailable')))};
    await TestBed.configureTestingModule({imports:[DomainDetailComponent],providers: [{provide:UserPreferencesService,useValue:{language:signal('de')}},provideRouter([]),{provide:DemoIdentityService,useValue:{userId:signal('christian.man')}},{provide:CatalogApiService,useValue:api},{provide:ActivatedRoute,useValue:{paramMap:of(convertToParamMap({id:DOMAIN_ID})),snapshot:{paramMap:convertToParamMap({id:DOMAIN_ID})}}}]}).compileComponents();
    const fixture=TestBed.createComponent(DomainDetailComponent);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.domain-term-list')?.textContent).toContain(TERM.preferredLabel);
    expect(root.querySelector('.domain-models [role="alert"]')?.textContent).toContain('konnten nicht geladen');
    root.querySelector<HTMLButtonElement>('.domain-models button')!.click();expect(api.loadDomainModels).toHaveBeenCalledTimes(2);
  });

  it('cancels stale scoped model requests when the identity changes', async () => {
    const first=new Subject<DomainModelMemberships>(),second=new Subject<DomainModelMemberships>();
    const userId=signal('christian.man');
    const api={loadDomain:()=>of(DOMAIN),loadDataProductsForDomain:()=>of([]),loadGlossaryTerms:()=>of([]),loadDomainAuditEvents:()=>of([]),loadSemanticGraph:()=>of({revision:0,positions:{},relations:[],canEditLayout:true,canEditRelations:false}),loadGlossaryTermProposals:()=>of([]),loadDomainModels:vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)};
    await TestBed.configureTestingModule({imports:[DomainDetailComponent],providers: [{provide:UserPreferencesService,useValue:{language:signal('de')}},provideRouter([]),{provide:DemoIdentityService,useValue:{userId}},{provide:CatalogApiService,useValue:api},{provide:ActivatedRoute,useValue:{paramMap:of(convertToParamMap({id:DOMAIN_ID})),snapshot:{paramMap:convertToParamMap({id:DOMAIN_ID})}}}]}).compileComponents();
    const fixture=TestBed.createComponent(DomainDetailComponent);fixture.detectChanges();
    userId.set('daca-test-editor');fixture.detectChanges();
    expect(api.loadDomainModels).toHaveBeenCalledTimes(2);
    expect(first.observed).toBe(false);
    second.next({logicalModels:[],physicalModels:[]});second.complete();fixture.detectChanges();
    expect(fixture.componentInstance.modelsLoading()).toBe(false);
    expect(fixture.componentInstance.models().physicalModels).toHaveLength(0);
    fixture.destroy();expect(second.observed).toBe(false);
  });

});
