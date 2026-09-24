import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { GlossaryWordComponent } from './glossary-word.component';

describe('GlossaryWordComponent', () => {
  afterEach(() => { vi.useRealTimers(); TestBed.resetTestingModule(); });

  it('loads a short description only on interaction and keeps the popup open after the first click', () => {
    TestBed.configureTestingModule({
      imports: [GlossaryWordComponent],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: DemoIdentityService, useValue: { userId: signal('christian.man'), headers: () => new HttpHeaders({ 'X-DaCa-User': 'christian.man' }) } },
        { provide: UserPreferencesService, useValue: { language: signal('de') } },
      ],
    });
    const fixture = TestBed.createComponent(GlossaryWordComponent);
    fixture.componentRef.setInput('lookup', 'Data Steward');
    fixture.componentRef.setInput('label', 'Data Steward');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectNone('/api/v1/documentation/glossary/lookup');

    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    button.focus();
    button.click();
    const request = http.expectOne((entry) => entry.url === '/api/v1/documentation/glossary/lookup');
    expect(request.request.params.get('term')).toBe('Data Steward');
    request.flush({ id: 'term-1', term: 'Data Steward', shortDescription: 'Pflegt Modelle.', detailedDescription: 'Lange Erklärung.' });
    fixture.detectChanges();

    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Pflegt Modelle.');
    expect((fixture.nativeElement as HTMLElement).querySelector('a')?.getAttribute('href')).toBe('/documentation/glossary/term-1');
    http.verify();
  });

  it('keeps the popup and its glossary link available while the pointer crosses the gap', () => {
    TestBed.configureTestingModule({
      imports: [GlossaryWordComponent],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: DemoIdentityService, useValue: { userId: signal('christian.man'), headers: () => new HttpHeaders({ 'X-DaCa-User': 'christian.man' }) } },
        { provide: UserPreferencesService, useValue: { language: signal('de') } },
      ],
    });
    const fixture = TestBed.createComponent(GlossaryWordComponent);
    fixture.componentRef.setInput('lookup', 'Data Owner');
    fixture.componentRef.setInput('label', 'Data Owner');
    fixture.detectChanges();
    vi.useFakeTimers();
    const host = (fixture.nativeElement as HTMLElement).querySelector('.glossary-word')!;
    host.dispatchEvent(new MouseEvent('mouseenter'));
    TestBed.inject(HttpTestingController).expectOne((request) => request.url.endsWith('/glossary/lookup'))
      .flush({ id: 'owner-1', term: 'Data Owner', shortDescription: 'Fachliche Verantwortung.', detailedDescription: 'Aufgaben und Verantwortung.' });
    fixture.detectChanges();

    host.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(100);
    const popup = host.querySelector('.glossary-word-popup')!;
    popup.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    const link = host.querySelector<HTMLAnchorElement>('.glossary-word-popup a')!;
    expect(link).not.toBeNull();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    link.click();
    expect(navigate).toHaveBeenCalled();

    host.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(250);
    fixture.detectChanges();
    expect(host.querySelector('.glossary-word-popup')).toBeNull();
    TestBed.inject(HttpTestingController).verify();
  });
});
