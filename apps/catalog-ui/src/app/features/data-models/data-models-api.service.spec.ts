import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService } from './data-models-api.service';
import { DcatContactPoint, LogicalModelCreator, LogicalModelWrite } from './data-models.models';

describe('DataModelsApiService', () => {
  const userId = signal('cinthya.thor');
  let api: DataModelsApiService; let http: HttpTestingController;
  beforeEach(() => { TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: DemoIdentityService, useValue: { userId, user: computed(() => ({ displayName: 'Cinthya Thor', email: 'cinthya.thor@vtg.admin.ch', organization: 'Verteidigung' })), headers: computed(() => new HttpHeaders({ 'X-DaCa-User': userId() })) } }] }); api = TestBed.inject(DataModelsApiService); http = TestBed.inject(HttpTestingController); });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  it('writes the separated logical aggregate using the canonical backend contract', () => {
    const value: LogicalModelWrite = { title:{de:'Mitarbeitende',fr:'',it:'',en:'Employees'},description:{de:'Fachliches Modell',fr:'',it:'',en:''},identifiers:['VBS-HR-1'],department:'VBS',office:'vbs-verteidigung',dataDomainId:'domain-personal',dataOwnerId:'christian.spider',deputyDataOwnerId:'sibilla.micheli',creator:{type:'application',applicationName:'HR-Core'},classification:'internal',dateCreated:'2026-09-07',entityName:'Mitarbeitende',conceptIds:[],fields:[{businessObject:'Mitarbeitende',entityName:'Mitarbeitende',name:'personalnummer',dataType:'xsd:string',length:12,shortDescription:'Personalnummer',comment:null,sourceSystem:null,classification:'internal',precision:null,decimalPlaces:null,nullable:false,minCount:1,maxCount:1,order:1,valueListConceptId:null,conceptIds:[],primaryConceptId:null}] };
    api.createLogicalModel(value).subscribe();
    const request = http.expectOne('/api/v1/logical-models');
    expect(request.request.method).toBe('POST'); expect(request.request.headers.get('X-DaCa-User')).toBe('cinthya.thor');
    expect(request.request.body).toEqual(expect.objectContaining({ organizationUnitId:'vbs-verteidigung',dataOwnerUserId:'christian.spider',dataClassification:'internal' }));
    expect(request.request.body.departmentCode).toBeUndefined();
    expect(request.request.body.organizationId).toBeUndefined();
    expect(request.request.body.creator).toEqual({type:'Application',applicationName:'HR-Core'}); expect(request.request.body.entities[0].fields[0].name).toBe('personalnummer');
    expect(request.request.body.conceptIds).toEqual([]);
    expect(request.request.body.entities[0].fields[0]).toEqual(expect.objectContaining({conceptIds:[],primaryConceptId:null,valueListConceptId:null}));
    expect(request.request.body.localizations).toEqual([{language:'de',title:'Mitarbeitende',description:'Fachliches Modell'}]);
    expect(request.request.body).toEqual(expect.objectContaining({contactPoints:[{name:'Cinthya Thor',email:'cinthya.thor@vtg.admin.ch'}],publisher:{name:'Verteidigung',identifier:'vbs-verteidigung',uri:'urn:daca:organization:vbs-verteidigung'},accessRights:'urn:daca:access-rights:internal',themes:[],distributions:[],dataServices:[]}));
    request.flush({ id:'model-1',urn:'urn:daca:logical-model:model-1',revision:1,identifiers:['VBS-HR-1'],localizations:[{language:'de',title:'Mitarbeitende',description:'Fachliches Modell'}],departmentCode:'VBS',organizationId:'vbs-verteidigung',dataOwnerUserId:'christian.spider',dataDomainId:'domain-personal',dataClassification:'internal',dateCreated:'2026-09-07',creator:{type:'Application',applicationName:'HR-Core'},versionId:'version-1',lockVersion:1,status:'draft',contactPoints:[{name:'Cinthya Thor',email:'cinthya.thor@vtg.admin.ch'}],publisher:{name:'Verteidigung'},accessRights:'urn:daca:access-rights:internal',entities:[] }, { headers: { ETag:'"1"' } });
  });

  it('round-trips Romansh localizations and separate entity roots', () => {
    const field=(entityName:string,name:string)=>({businessObject:entityName,entityName,name,dataType:'xsd:string',length:null,shortDescription:name,comment:null,sourceSystem:null,classification:'internal' as const,precision:null,decimalPlaces:null,nullable:false,minCount:1,maxCount:1,order:1,valueListConceptId:null,conceptIds:[],primaryConceptId:null});
    const peopleField=field('Mitarbeitende','personalnummer');const addressField=field('Adressen','strasse');
    const value:LogicalModelWrite={title:{de:'Mitarbeitende',fr:'',it:'',en:'',rm:'Collavuraturs'},description:{de:'Modell',fr:'',it:'',en:'',rm:'Model logic'},identifiers:['VBS-HR-MULTI'],department:'VBS',office:'vbs-verteidigung',dataDomainId:'domain-personal',dataOwnerId:'christian.spider',deputyDataOwnerId:null,creator:{type:'application',applicationName:'HR-Core'},classification:'internal',dateCreated:'2026-09-07',entityName:'Mitarbeitende',conceptIds:[],fields:[peopleField,addressField],entities:[
      {id:'11111111-1111-4111-8111-111111111111',name:'Mitarbeitende',businessObject:'Person',comment:'Personenstamm',order:1,fields:[peopleField]},
      {id:'22222222-2222-4222-8222-222222222222',name:'Adressen',businessObject:'Adresse',comment:null,order:2,fields:[addressField]},
    ]};
    let normalizedNames:string[]=[];
    api.createLogicalModel(value).subscribe(({body})=>{normalizedNames=body.entities.map((entity)=>entity.name);});
    const request=http.expectOne('/api/v1/logical-models');
    expect(request.request.body.localizations.at(-1)).toEqual({language:'rm',title:'Collavuraturs',description:'Model logic'});
    expect(request.request.body.entities.map((entity:{id:string;name:string})=>({id:entity.id,name:entity.name}))).toEqual([
      {id:'11111111-1111-4111-8111-111111111111',name:'Mitarbeitende'},
      {id:'22222222-2222-4222-8222-222222222222',name:'Adressen'},
    ]);
    request.flush({id:'model-multi',revision:1,versionId:'model-multi-v1',lockVersion:1,status:'draft',identifiers:value.identifiers,localizations:[{language:'de',title:'Mitarbeitende',description:'Modell'},{language:'rm',title:'Collavuraturs',description:'Model logic'}],departmentCode:value.department,organizationId:value.office,dataDomainId:value.dataDomainId,dataOwnerUserId:value.dataOwnerId,dataClassification:value.classification,dateCreated:value.dateCreated,creator:{type:'Application',applicationName:'HR-Core'},entities:[
      {id:'11111111-1111-4111-8111-111111111111',entityVersionId:'entity-person-v1',name:'Mitarbeitende',businessObject:'Person',comment:'Personenstamm',position:1,fields:[]},
      {id:'22222222-2222-4222-8222-222222222222',entityVersionId:'entity-address-v1',name:'Adressen',businessObject:'Adresse',comment:null,position:2,fields:[]},
    ]});
    expect(normalizedNames).toEqual(['Mitarbeitende','Adressen']);
  });

  it('preserves a URI-only DCAT contact without writing an empty email field back', () => {
    const value: LogicalModelWrite = {
      title: { de: 'Kontaktmodell', fr: '', it: '', en: '' }, description: { de: 'URI-only Kontakt', fr: '', it: '', en: '' },
      identifiers: ['VBS-CONTACT-1'], department: 'VBS', office: 'vbs-verteidigung', dataDomainId: 'domain-personal',
      dataOwnerId: 'christian.spider', deputyDataOwnerId: 'sibilla.micheli',
      creator: { type: 'application', applicationName: 'DaCa' }, classification: 'internal', dateCreated: '2026-09-07',
      entityName: 'Kontakt', conceptIds: [], fields: [],
      contactPoints: [{ name: 'Fachstelle Daten', email: '', uri: 'https://example.test/contact' }],
    };
    let normalizedContact: DcatContactPoint | undefined;
    api.createLogicalModel(value).subscribe((result) => { normalizedContact = result.body.contactPoints[0]; });

    const request = http.expectOne('/api/v1/logical-models');
    expect(request.request.body.contactPoints).toEqual([{ name: 'Fachstelle Daten', uri: 'https://example.test/contact' }]);
    expect('email' in request.request.body.contactPoints[0]).toBe(false);
    const responseBody = {
      id: 'model-uri-contact', urn: 'urn:daca:logical-model:model-uri-contact', revision: 1, versionId: 'version-uri-contact', lockVersion: 1,
      status: 'draft', identifiers: ['VBS-CONTACT-1'], localizations: [{ language: 'de', title: 'Kontaktmodell', description: 'URI-only Kontakt' }],
      departmentCode: 'VBS', organizationId: 'vbs-verteidigung', dataOwnerUserId: 'christian.spider', dataDomainId: 'domain-personal',
      dataClassification: 'internal', dateCreated: '2026-09-07', creator: { type: 'Application', applicationName: 'DaCa' },
      contactPoints: [{ name: 'Fachstelle Daten', uri: 'https://example.test/contact' }], publisher: { name: 'Verteidigung' }, entities: [],
    };
    request.flush(responseBody, { headers: { ETag: '"1"' } });

    expect(normalizedContact).toEqual({ name: 'Fachstelle Daten', email: null, uri: 'https://example.test/contact' });
    api.updateLogicalModel('model-uri-contact', 'version-uri-contact', { ...value, contactPoints: [normalizedContact!] }, '"1"').subscribe();
    const update = http.expectOne('/api/v1/logical-models/model-uri-contact/versions/version-uri-contact');
    expect(update.request.headers.get('If-Match')).toBe('"1"');
    expect(update.request.body.contactPoints).toEqual([{ name: 'Fachstelle Daten', uri: 'https://example.test/contact' }]);
    update.flush({ ...responseBody, revision: 2, lockVersion: 2 }, { headers: { ETag: '"2"' } });
  });

  it('round-trips every creator variant without deriving creator identity from the dataset office', () => {
    const variants: Array<{ ui: LogicalModelCreator; api: Record<string, unknown> }> = [
      { ui: { type: 'application', applicationName: 'HR-Core' }, api: { type: 'Application', applicationName: 'HR-Core' } },
      { ui: { type: 'internal_organisation', organizationId: 'fedpol', englishName: 'Federal Office of Police' }, api: { type: 'InternalOrganisation', organizationId: 'fedpol', englishName: 'Federal Office of Police' } },
      { ui: { type: 'internal_person', userId: 'christian.spider' }, api: { type: 'InternalPerson', userId: 'christian.spider' } },
      { ui: { type: 'external_organisation_or_person', organizationName: 'Example Institute', personName: 'Ada Example' }, api: { type: 'ExternalOrganisationOrPerson', organizationName: 'Example Institute', personName: 'Ada Example' } },
    ];
    for (const [index, variant] of variants.entries()) {
      const value: LogicalModelWrite = {
        title: { de: 'Creator-Test', fr: '', it: '', en: '' }, description: { de: 'Creator-Test', fr: '', it: '', en: '' }, identifiers: [`CREATOR-${index}`],
        department: 'VBS', office: 'vbs-verteidigung', dataDomainId: 'domain-personal', dataOwnerId: 'christian.spider', deputyDataOwnerId: null,
        creator: variant.ui, classification: 'internal', dateCreated: '2026-09-07', entityName: 'CreatorTest', conceptIds: [], fields: [],
      };
      let normalized: LogicalModelCreator | undefined;
      api.createLogicalModel(value).subscribe(({ body }) => { normalized = body.creator; });
      const request = http.expectOne('/api/v1/logical-models');
      expect(request.request.body.creator).toEqual(variant.api);
      request.flush({
        id: `creator-model-${index}`, revision: 1, versionId: `creator-version-${index}`, lockVersion: 1, status: 'draft',
        identifiers: value.identifiers, localizations: [{ language: 'de', title: 'Creator-Test', description: 'Creator-Test' }],
        departmentCode: value.department, organizationId: value.office, dataDomainId: value.dataDomainId, dataOwnerUserId: value.dataOwnerId,
        dataClassification: value.classification, dateCreated: value.dateCreated, creator: variant.api, entities: [],
      });
      expect(normalized).toEqual(variant.ui);
    }
  });

  it('uses physical source, snapshot and asset-mapping resource boundaries', () => {
    api.importPhysicalSource('source-1',7,'drift').subscribe(); api.loadPhysicalSnapshot('snapshot-2').subscribe();
    api.createMapping({logicalModelVersionId:'version-1',logicalFieldVersionIds:['field-1'],physicalSnapshotId:'snapshot-2',physicalColumnIds:['column-1'],mappingType:'Direct',classification:'internal',transformationRule:null,comment:null,responsibleUserId:'cinthya.thor',validFrom:'2026-09-07',validTo:null}).subscribe();
    const imported=http.expectOne('/api/v1/physical-sources/source-1/imports');expect(imported.request.headers.get('If-Match')).toBe('"7"');expect(imported.request.body).toEqual({fixtureVariant:'drift'});imported.flush({snapshot:{id:'snapshot-2',sourceId:'source-1',sequence:2},databases:[]},{headers:{ETag:'"8"'}});
    const snapshot=http.expectOne('/api/v1/physical-snapshots/snapshot-2');snapshot.flush({snapshot:{id:'snapshot-2',sourceId:'source-1',sequence:2},databases:[]});
    const mapping=http.expectOne('/api/v1/asset-mappings');expect(mapping.request.body.logicalFieldVersionIds).toEqual(['field-1']);mapping.flush({id:'mapping-1',versionId:'mapping-version-1',lockVersion:1,logicalModelVersionId:'version-1',logicalFieldVersionIds:['field-1'],physicalSnapshotId:'snapshot-2',physicalColumnIds:['column-1'],mappingType:'Direct',status:'draft'});
  });

  it('uses immutable submit and supersede workflow routes with optimistic locking', () => {
    api.submitMapping('mapping-1', 'mapping-version-1', '"7"').subscribe();
    const submit = http.expectOne('/api/v1/asset-mappings/mapping-1/versions/mapping-version-1/submit');
    expect(submit.request.method).toBe('POST');
    expect(submit.request.body).toBeNull();
    expect(submit.request.headers.get('If-Match')).toBe('"7"');
    submit.flush({ id:'mapping-1',versionId:'mapping-version-2',lockVersion:8,logicalModelVersionId:'version-1',logicalFieldVersionIds:['field-1'],physicalSnapshotId:'snapshot-2',physicalColumnIds:['column-1'],mappingType:'Direct',status:'review_pending' }, { headers: { ETag: '"8"' } });

    api.supersedeMapping('mapping-1', 'mapping-version-2', '"8"').subscribe();
    const supersede = http.expectOne('/api/v1/asset-mappings/mapping-1/versions/mapping-version-2/supersede');
    expect(supersede.request.method).toBe('POST');
    expect(supersede.request.body).toBeNull();
    expect(supersede.request.headers.get('If-Match')).toBe('"8"');
    supersede.flush({ id:'mapping-1',versionId:'mapping-version-3',lockVersion:9,logicalModelVersionId:'version-1',logicalFieldVersionIds:['field-1'],physicalSnapshotId:'snapshot-2',physicalColumnIds:['column-1'],mappingType:'Direct',status:'superseded' }, { headers: { ETag: '"9"' } });
  });

  it('retires a published logical model through its immutable version route and If-Match', () => {
    api.retireLogicalModel('model/1', 'version 7', '"3"').subscribe();
    const request = http.expectOne('/api/v1/logical-models/model%2F1/versions/version%207/retire');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    expect(request.request.headers.get('X-DaCa-User')).toBe('cinthya.thor');
    expect(request.request.headers.get('If-Match')).toBe('"3"');
    request.flush({ id:'model/1',versionId:'version 8',revision:8,lockVersion:1,status:'retired',departmentCode:'VBS',organizationId:'vbs-verteidigung',dataOwnerUserId:'christian.spider',identifiers:['MODEL-1'],localizations:[],entities:[] }, { headers: { ETag:'"1"' } });
  });

  it('downloads RDF exports as blobs with the current demo actor header', () => {
    let downloaded: { blob: Blob; filename: string } | undefined;
    api.downloadLogicalModelExport('model/1', 'version 2', 'shacl-jsonld').subscribe((value) => { downloaded = value; });

    const request = http.expectOne('/api/v1/logical-models/model%2F1/versions/version%202/exports/shacl/jsonld');
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');
    expect(request.request.headers.get('X-DaCa-User')).toBe('cinthya.thor');
    const body = new Blob(['{"@graph":[]}'], { type: 'application/ld+json' });
    request.flush(body, { headers: { 'Content-Disposition': 'attachment; filename="modell-shape.jsonld"' } });

    expect(downloaded?.blob).toBe(body);
    expect(downloaded?.filename).toBe('modell-shape.jsonld');
  });
});
