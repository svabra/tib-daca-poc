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
] as const;

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

    expect(service.userId()).toBe('beat.stalder');
    expect(service.user().displayName).toBe('Beat Stalder');
    expect(window.location.search).toBe('?demoUser=beat.stalder');
    expect(window.location.hash).toBe('#endpoint-quickstart');
  });

  it('keeps the existing identity when an unknown ID is selected after directory load', () => {
    const service = TestBed.inject(DemoIdentityService);
    TestBed.inject(HttpTestingController).expectOne('/api/v1/demo-users').flush([
      service.users()[0],
      BEAT,
    ]);
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
    TestBed.inject(HttpTestingController).expectOne('/api/v1/demo-users').flush([service.users()[0], sandro]);

    expect(service.user()).toEqual(sandro);
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
    TestBed.inject(HttpTestingController).expectOne('/api/v1/demo-users').flush([service.users()[0], user]);

    expect(service.user()).toEqual(user);
    expect(window.location.search).toBe('');
  });

  it('keeps every owner and deputy portrait available when the user directory is unavailable', () => {
    const service = TestBed.inject(DemoIdentityService);
    TestBed.inject(HttpTestingController).expectOne('/api/v1/demo-users').flush('unavailable', {
      status: 503,
      statusText: 'Service Unavailable',
    });

    const users = service.users();
    expect(users).toHaveLength(12);
    expect(users.every((user) => Boolean(user.avatarUrl))).toBe(true);
    expect(users.map((user) => user.id)).toEqual(expect.arrayContaining([
      'joel.ruod',
      'lucien.morel',
      'simone.wyss',
      'sarah.brunner',
      'lea.hofmann',
    ]));
  });
});
