import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService } from './data-models-api.service';
import { LogicalModelWrite } from './data-models.models';

describe('logical-model contact-point contract', () => {
  const userId = signal('cinthya.thor');
  let api: DataModelsApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: DemoIdentityService,
          useValue: {
            userId,
            user: computed(() => ({
              displayName: 'Cinthya Thor',
              email: 'cinthya.thor@vtg.admin.ch',
              organization: 'Verteidigung',
            })),
            headers: computed(() => new HttpHeaders({ 'X-DaCa-User': userId() })),
          },
        },
      ],
    });
    api = TestBed.inject(DataModelsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('preserves a URI-only contact point from a read through the next write', () => {
    let value: LogicalModelWrite | undefined;
    api.loadLogicalModel('model-1').subscribe(({ body }) => {
      value = {
        title: body.title,
        description: body.description,
        identifiers: body.identifiers,
        department: body.department,
        office: body.office,
        dataDomainId: body.dataDomain.id,
        dataOwnerId: body.dataOwner.id,
        deputyDataOwnerId: body.deputyDataOwner?.id ?? null,
        creator: body.creator,
        classification: body.classification,
        dateCreated: body.dateCreated,
        entityName: body.entityName,
        conceptIds: [],
        fields: [],
        contactPoints: body.contactPoints,
      };
    });
    http.expectOne('/api/v1/logical-models/model-1').flush({
      id: 'model-1',
      urn: 'urn:daca:logical-model:model-1',
      revision: 1,
      versionId: 'version-1',
      lockVersion: 1,
      status: 'draft',
      identifiers: ['VBS-HR-1'],
      localizations: [{ language: 'de', title: 'Mitarbeitende', description: 'Fachmodell' }],
      departmentCode: 'VBS',
      organizationId: 'vbs-verteidigung',
      dataDomainId: 'domain-personal',
      dataOwnerUserId: 'christian.spider',
      creator: { type: 'Application', applicationName: 'HR-Core' },
      dataClassification: 'internal',
      dateCreated: '2026-09-07',
      contactPoints: [{ name: 'Data Office', uri: 'https://example.test/contact' }],
      entities: [],
    });

    expect(value?.contactPoints).toEqual([
      { name: 'Data Office', email: null, uri: 'https://example.test/contact' },
    ]);
    api.createLogicalModel(value!).subscribe();
    const write = http.expectOne('/api/v1/logical-models');
    expect(write.request.body.contactPoints).toEqual([
      { name: 'Data Office', uri: 'https://example.test/contact' },
    ]);
    write.flush({});
  });
});
