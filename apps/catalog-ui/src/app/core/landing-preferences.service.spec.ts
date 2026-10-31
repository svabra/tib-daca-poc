import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DemoIdentityService } from './demo-identity.service';
import { LandingPreferencesService } from './landing-preferences.service';

describe('LandingPreferencesService', () => {
  const userId = signal('welcome-test-a');
  beforeEach(() => {
    userId.set('welcome-test-a'); localStorage.removeItem('daca.preference.welcome-test-a.welcome-intro'); localStorage.removeItem('daca.preference.welcome-test-b.welcome-intro');
    TestBed.configureTestingModule({ providers: [{ provide: DemoIdentityService, useValue: { userId } }] });
  });
  afterEach(() => { TestBed.resetTestingModule(); localStorage.removeItem('daca.preference.welcome-test-a.welcome-intro'); localStorage.removeItem('daca.preference.welcome-test-b.welcome-intro'); vi.restoreAllMocks(); });
  it('persists hide/restore per person without hiding another person’s welcome', () => {
    const service = TestBed.inject(LandingPreferencesService); TestBed.tick();
    expect(service.welcomeVisible()).toBe(true); service.setWelcome(false);
    expect(localStorage.getItem('daca.preference.welcome-test-a.welcome-intro')).toBe('hidden');
    userId.set('welcome-test-b'); expect(service.welcomeVisible()).toBe(true); TestBed.tick();
    userId.set('welcome-test-a'); TestBed.tick(); expect(service.welcomeVisible()).toBe(false);
    service.setWelcome(true); expect(localStorage.getItem('daca.preference.welcome-test-a.welcome-intro')).toBe('shown');
  });
  it('keeps the current session usable and reports unavailable storage', () => {
    const service = TestBed.inject(LandingPreferencesService); TestBed.tick();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    service.setWelcome(false); expect(service.welcomeVisible()).toBe(false); expect(service.storageError()).toBe(true);
  });
});
