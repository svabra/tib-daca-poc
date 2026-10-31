import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { UserPreferencesService } from './user-preferences.service';

describe('UserPreferencesService', () => {
  beforeEach(() => {
    localStorage.removeItem('daca.preference.christian.spider.language');
    localStorage.removeItem('daca.preference.christian.spider.theme');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
    localStorage.removeItem('daca.preference.christian.spider.language');
    localStorage.removeItem('daca.preference.christian.spider.theme');
  });

  it('applies language immediately, asks for storage scope and persists profile choices on the server', () => {
    const service = TestBed.inject(UserPreferencesService);
    service.restore('christian.spider');
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/me/preferences/language').flush({ value: 'de' });
    http.expectOne('/api/v1/me/preferences/theme').flush({ value: 'light' });

    service.requestLanguage('fr');
    expect(service.language()).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
    expect(service.pending()?.previous).toBe('de');
    service.savePending('profile');
    const save = http.expectOne('/api/v1/me/preferences/language');
    expect(save.request.headers.get('X-DaCa-User')).toBe('christian.spider');
    save.flush({ value: 'fr' });
    expect(service.language()).toBe('fr');

    service.toggleTheme();
    expect(service.theme()).toBe('light');
    service.savePending('device');
    expect(service.theme()).toBe('dark');
    expect(document.documentElement.dataset['dacaTheme']).toBe('dark');
    expect(localStorage.getItem('daca.preference.christian.spider.theme')).toBe('dark');
  });

  it('reverts an unsaved language choice when the dialog is cancelled', () => {
    const service = TestBed.inject(UserPreferencesService);
    service.restore('christian.spider');
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/me/preferences/language').flush({ value: 'de' });
    http.expectOne('/api/v1/me/preferences/theme').flush({ value: 'light' });
    service.requestLanguage('it');
    expect(service.language()).toBe('it');
    service.requestLanguage('fr');
    expect(service.language()).toBe('fr');
    service.cancel();
    expect(service.language()).toBe('de');
    expect(service.pending()).toBeNull();
  });

  it('saves and restores Romansh from the profile and the per-user browser override', () => {
    const service = TestBed.inject(UserPreferencesService), http = TestBed.inject(HttpTestingController);
    service.restore('christian.spider');
    http.expectOne('/api/v1/me/preferences/language').flush({ value:'de' });
    http.expectOne('/api/v1/me/preferences/theme').flush({ value:'light' });
    service.requestLanguage('rm');
    expect(document.documentElement.lang).toBe('rm');
    service.savePending('profile');
    const save=http.expectOne('/api/v1/me/preferences/language');
    expect(save.request.body).toEqual({value:'rm'}); save.flush({value:'rm'});
    service.reset(); service.restore('christian.spider');
    http.expectOne('/api/v1/me/preferences/language').flush({value:'rm'});
    http.expectOne('/api/v1/me/preferences/theme').flush({value:'light'});
    expect(service.language()).toBe('rm');
    service.requestLanguage('de'); service.savePending('device');
    service.requestLanguage('rm'); service.savePending('device');
    service.reset(); service.restore('christian.spider');
    http.expectNone('/api/v1/me/preferences/language');
    http.expectOne('/api/v1/me/preferences/theme').flush({value:'light'});
    expect(service.language()).toBe('rm');
    expect(document.documentElement.lang).toBe('rm');
  });
});
