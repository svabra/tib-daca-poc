import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DemoIdentityService } from './demo-identity.service';
import { DemoSessionService } from './demo-session.service';
import { UserPreferencesService } from './user-preferences.service';

describe('DemoSessionService', () => {
  const originalUrl = window.location.href;
  const select = vi.fn();
  const restorePreferences = vi.fn();
  const resetPreferences = vi.fn();

  beforeEach(() => {
    window.history.replaceState({}, '', '/physical-models');
    select.mockReset();
    restorePreferences.mockReset();
    resetPreferences.mockReset();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: DemoIdentityService, useValue: { select } }, { provide: UserPreferencesService, useValue: { restore: restorePreferences, reset: resetPreferences } }] });
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
    window.history.replaceState({}, '', new URL(originalUrl).pathname);
  });

  it('restores, signs in and signs out through the server session API', () => {
    const service = TestBed.inject(DemoSessionService);
    const http = TestBed.inject(HttpTestingController);
    service.restore();
    http.expectOne('/api/v1/session').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(service.ready()).toBe(true);
    expect(service.activeUserId()).toBeNull();

    service.login('christian.spider');
    const login = http.expectOne('/api/v1/session/login');
    expect(login.request.body).toEqual({ userId: 'christian.spider' });
    login.flush({ userId: 'christian.spider' });
    expect(select).toHaveBeenCalledWith('christian.spider');
    expect(restorePreferences).toHaveBeenCalledWith('christian.spider');
    expect(service.activeUserId()).toBe('christian.spider');

    service.logout();
    http.expectOne('/api/v1/session/logout').flush({ ok: true });
    expect(service.activeUserId()).toBeNull();
    expect(resetPreferences).toHaveBeenCalled();
  });
});
