import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DemoIdentityService, DemoUser } from './demo-identity.service';

const BEAT: DemoUser = {
  id: 'beat.stalder',
  displayName: 'Beat Stalder',
  organization: 'Kanton St. Gallen',
  email: 'beat.stalder@sg.ch',
  phone: null,
  avatarUrl: '/assets/data-owners/beat-stalder.webp',
  roles: ['data_consumer'],
};

const ADDITIONAL_POC_USER_IDS = [
  'ariane.keller',
  'daniel.aebischer',
  'lucien.morel',
  'sarah.brunner',
  'simone.wyss',
  'lea.hofmann',
  'sibilla.micheli',
  'christian.spider',
  'cinthya.thor',
  'lawrence.hill',
  'hong.an.captain',
  'christian.man',
  'giuseppe.starwars',
  'thomas.wikinger',
] as const;

function flushPersonas(http: HttpTestingController, personas: unknown[] = []): void {
  http.expectOne('/api/v1/modeling/personas').flush(personas);
}

describe('DemoIdentityService', () => {
  const originalUrl = window.location.href;

  beforeEach(() => {
    window.localStorage.removeItem('daca-demo-user');
    window.history.replaceState({}, '', '/poc-guide/data-product-finden-verstehen-nutzen');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
    window.localStorage.removeItem('daca-demo-user');
    window.history.replaceState({}, '', new URL(originalUrl).pathname);
  });

  it('applies a valid selection made before the directory resolves without removing newer query state', () => {
    const service = TestBed.inject(DemoIdentityService);
    const http = TestBed.inject(HttpTestingController);

    service.select('beat.stalder');
    window.history.pushState({}, '', '/products/product-1/usage?demoUser=beat.stalder#endpoint-quickstart');
    expect(service.userId()).toBe('kassandra.valdata');

    http.expectOne('/api/v1/demo-users').flush([
      service.users()[0],
      BEAT,
    ]);
    flushPersonas(http);

    expect(service.userId()).toBe('beat.stalder');
    expect(service.user().displayName).toBe('Beat Stalder');
    expect(window.location.search).toBe('?demoUser=beat.stalder');
    expect(window.location.hash).toBe('#endpoint-quickstart');
  });

  it('keeps the existing identity when an unknown ID is selected after directory load', () => {
    const service = TestBed.inject(DemoIdentityService);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/demo-users').flush([
      service.users()[0],
      BEAT,
    ]);
    flushPersonas(http);
    service.select('beat.stalder');
    service.select('not-a-demo-user');

    expect(service.userId()).toBe('beat.stalder');
  });

  it('does not remove an equal demo-user query from a newer SPA navigation', () => {
    window.history.replaceState({}, '', '/poc-guide?demoUser=beat.stalder');
    const service = TestBed.inject(DemoIdentityService);
    const http = TestBed.inject(HttpTestingController);
    window.history.pushState({}, '', '/products/product-1/usage?demoUser=beat.stalder#data-dictionary');

    http.expectOne('/api/v1/demo-users').flush([service.users()[0], BEAT]);
    flushPersonas(http);

    expect(service.userId()).toBe('beat.stalder');
    expect(window.location.pathname).toBe('/products/product-1/usage');
    expect(window.location.search).toBe('?demoUser=beat.stalder');
    expect(window.location.hash).toBe('#data-dictionary');
  });

  it('accepts Sandro Wenger from a deep link before the user directory resolves', () => {
    window.history.replaceState({}, '', '/products?demoUser=sandro.wenger');
    const service = TestBed.inject(DemoIdentityService);
    const sandro: DemoUser = {
      id: 'sandro.wenger',
      displayName: 'Sandro Wenger',
      organization: 'BAZG',
      email: 'sandro.wenger@bazg.admin.ch',
      phone: null,
      avatarUrl: '/assets/data-owners/sandro-wenger.webp',
      roles: ['data_owner'],
    };

    expect(service.userId()).toBe('sandro.wenger');
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/demo-users').flush([service.users()[0], sandro]);
    flushPersonas(http);

    expect(service.user()).toEqual(expect.objectContaining(sandro));
    expect(window.location.search).toBe('');
  });

  it.each(ADDITIONAL_POC_USER_IDS)('accepts %s from a deep link before the user directory resolves', (userId) => {
    window.history.replaceState({}, '', `/products?demoUser=${userId}`);
    const service = TestBed.inject(DemoIdentityService);
    const user: DemoUser = {
      id: userId,
      displayName: userId,
      organization: 'POC',
      email: `${userId}@example.admin.ch`,
      phone: null,
      avatarUrl: `/assets/data-owners/${userId.replace('.', '-')}.webp`,
      roles: ['data_owner'],
    };

    expect(service.userId()).toBe(userId);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/demo-users').flush([service.users()[0], user]);
    flushPersonas(http);

    expect(service.user()).toEqual(expect.objectContaining(user));
    expect(window.location.search).toBe('');
  });

  it('keeps every owner and deputy portrait available when the user directory is unavailable', () => {
    const service = TestBed.inject(DemoIdentityService);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/demo-users').flush('unavailable', {
      status: 503,
      statusText: 'Service Unavailable',
    });
    flushPersonas(http);

    const users = service.users();
    expect(users).toHaveLength(23);
    const modelingIds = ['christian.spider', 'sibilla.micheli', 'cinthya.thor', 'lawrence.hill', 'hong.an.captain', 'christian.man', 'mirjam.keller', 'daniel.wenger', 'eliane.rossi', 'giuseppe.starwars', 'thomas.wikinger'];
    expect(users.filter((user) => !modelingIds.includes(user.id)).every((user) => Boolean(user.avatarUrl))).toBe(true);
    expect(users.filter((user) => modelingIds.includes(user.id))).toHaveLength(11);
    expect(users.filter((user) => modelingIds.includes(user.id)).every((user) => user.department === 'VBS')).toBe(true);
    expect(users.find((user) => user.id === 'sibilla.micheli')).toEqual(expect.objectContaining({ organization: 'Verteidigung', avatarUrl: null, roles: expect.arrayContaining(['domain_register_owner']), modelingRoles: ['deputy_data_owner'] }));
    expect(users.find((user) => user.id === 'giuseppe.starwars')).toEqual(expect.objectContaining({ organization: 'armasuisse', office: 'vbs-armasuisse', modelingRoles: ['data_owner'] }));
    expect(users.find((user) => user.id === 'thomas.wikinger')).toEqual(expect.objectContaining({ organization: 'armasuisse', office: 'vbs-armasuisse', modelingRoles: ['data_steward'] }));
    expect(users.map((user) => user.id)).toEqual(expect.arrayContaining([
      'joel.ruod',
      'lucien.morel',
      'simone.wyss',
      'sarah.brunner',
      'lea.hofmann',
    ]));
  });

  it('merges modeling personas without changing legacy demo-user roles', () => {
    window.history.replaceState({}, '', '/models?demoUser=sibilla.micheli');
    const service = TestBed.inject(DemoIdentityService);
    const http = TestBed.inject(HttpTestingController);
    const sibilla: DemoUser = { id:'sibilla.micheli',displayName:'Sibilla Micheli',organization:'Verteidigung',email:'sibilla.micheli@vbs.admin.ch',phone:null,avatarUrl:null,roles:['data_owner','domain_register_owner','data_consumer'] };
    http.expectOne('/api/v1/demo-users').flush([sibilla]);
    flushPersonas(http,[{id:'assignment-1',userId:'sibilla.micheli',displayName:'Sibilla Micheli',departmentCode:'VBS',organizationId:'vbs-verteidigung',organizationName:'Verteidigung',role:'deputy_data_owner',delegatedOwnerUserId:'christian.spider'}]);
    expect(service.user().roles).toEqual(sibilla.roles);
    expect(service.user().modelingRoles).toEqual(['deputy_data_owner']);
    expect(service.user().office).toBe('vbs-verteidigung');
    expect(service.canPublishModels()).toBe(true);
  });

  it('grants model publication only to the scoped owner or the deputy delegated by that owner', () => {
    const service = TestBed.inject(DemoIdentityService);
    const http = TestBed.inject(HttpTestingController);
    const christian: DemoUser = { id:'christian.spider',displayName:'Christian Spider',organization:'Verteidigung',email:'christian.spider@vtg.admin.ch',phone:null,avatarUrl:null,roles:['data_owner'] };
    const sibilla: DemoUser = { id:'sibilla.micheli',displayName:'Sibilla Micheli',organization:'Verteidigung',email:'sibilla.micheli@vbs.admin.ch',phone:null,avatarUrl:null,roles:['data_owner'] };
    const lawrence: DemoUser = { id:'lawrence.hill',displayName:'Lawrence Hill',organization:'Verteidigung',email:'lawrence.hill@vtg.admin.ch',phone:null,avatarUrl:null,roles:['data_owner'] };
    http.expectOne('/api/v1/demo-users').flush([christian, sibilla, lawrence]);
    flushPersonas(http, [
      {id:'assignment-christian',userId:christian.id,displayName:christian.displayName,departmentCode:'VBS',organizationId:'vbs-verteidigung',organizationName:'Verteidigung',role:'data_owner',delegatedOwnerUserId:null},
      {id:'assignment-sibilla',userId:sibilla.id,displayName:sibilla.displayName,departmentCode:'VBS',organizationId:'vbs-verteidigung',organizationName:'Verteidigung',role:'deputy_data_owner',delegatedOwnerUserId:christian.id},
      {id:'assignment-lawrence',userId:lawrence.id,displayName:lawrence.displayName,departmentCode:'VBS',organizationId:'vbs-verteidigung',organizationName:'Verteidigung',role:'data_owner',delegatedOwnerUserId:null},
    ]);
    const christianModel = { department:'VBS',office:'vbs-verteidigung',dataOwner:{id:christian.id},deputyDataOwner:{id:sibilla.id} };
    const lawrenceModel = { department:'VBS',office:'vbs-verteidigung',dataOwner:{id:lawrence.id},deputyDataOwner:null };

    service.select(lawrence.id);
    expect(service.canPublishModels()).toBe(true);
    expect(service.canPublishModel(lawrenceModel)).toBe(true);
    expect(service.canPublishModel(christianModel)).toBe(false);

    service.select(sibilla.id);
    expect(service.canPublishModel(christianModel)).toBe(true);
    expect(service.canPublishModel(lawrenceModel)).toBe(false);
  });
});
