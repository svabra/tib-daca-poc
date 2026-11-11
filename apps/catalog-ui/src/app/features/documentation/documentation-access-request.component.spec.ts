import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CatalogLanguage, UserPreferencesService } from '../../core/user-preferences.service';
import { ACCESS_REQUEST_DURATION, sampleAccessRequest } from './documentation-access-request-animation';
import { DocumentationAccessRequestComponent } from './documentation-access-request.component';

describe('Access request explanation', () => {
  let media: EventTarget & { matches: boolean };
  beforeEach(() => {
    vi.useFakeTimers();
    media = Object.assign(new EventTarget(), { matches: false });
    vi.stubGlobal('matchMedia', () => media);
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  function setup() {
    const language = signal<CatalogLanguage>('de');
    TestBed.configureTestingModule({ imports: [DocumentationAccessRequestComponent], providers: [provideRouter([]), { provide: UserPreferencesService, useValue: { language } }] });
    const fixture = TestBed.createComponent(DocumentationAccessRequestComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, root: fixture.nativeElement as HTMLElement, language };
  }

  it('reveals metadata only after separate approval and never treats a payload request as a payload grant', () => {
    expect(sampleAccessRequest(0)).toMatchObject({ station: 0, found: false, introspectionApproved: false, metadataVisible: false, payloadSubmitted: false });
    expect(sampleAccessRequest(4).found).toBe(true);
    expect(sampleAccessRequest(7)).toMatchObject({ station: 1, introspectionApproved: false });
    expect(sampleAccessRequest(9.5)).toMatchObject({ introspectionRequest: 1, metadataVisible: false });
    expect(sampleAccessRequest(10.5)).toMatchObject({ introspectionApproved: true, metadataVisible: false });
    expect(sampleAccessRequest(13)).toMatchObject({ metadataVisible: true, payloadSubmitted: false });
    expect(sampleAccessRequest(15)).toMatchObject({ station: 2, form: 0 });
    expect(sampleAccessRequest(19.9).payloadSubmitted).toBe(false);
    expect(sampleAccessRequest(20).payloadSubmitted).toBe(true);
    for (let time = 0; time <= ACCESS_REQUEST_DURATION; time += .1) {
      const state = sampleAccessRequest(time);
      expect(state.payloadAuthorized).toBe(false);
      expect(state.submission > 0 ? state.metadataVisible : true).toBe(true);
      if (state.metadataVisible) expect(state.introspectionApproved).toBe(true);
    }
    for (const time of [-1, NaN, Infinity]) expect(sampleAccessRequest(time)).toEqual(sampleAccessRequest(0));
  });

  it('selects stations, seeks backward without stale grants and describes the pending payload decision', () => {
    const { fixture, component, root } = setup();
    const buttons = root.querySelectorAll<HTMLButtonElement>('.request-stations button');
    expect(buttons).toHaveLength(3);
    buttons[1].click(); fixture.detectChanges();
    expect(component.position()).toBe(7);
    expect(buttons[1].getAttribute('aria-current')).toBe('step');
    const slider = root.querySelector<HTMLInputElement>('#request-position')!;
    slider.value = '22'; slider.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(component.state().payloadSubmitted).toBe(true);
    expect(root.querySelector('.request-outcome strong')?.textContent).toContain('Entscheidung über Nutzlastdaten ausstehend');
    expect(root.querySelector('.pipeline-time')?.textContent).toContain('22,0 s / 24,0 s');
    const end = root.querySelector('#request-scene')!.innerHTML;
    component.seekTo(0); fixture.detectChanges();
    expect(component.state().metadataVisible).toBe(false);
    component.seekTo(22); fixture.detectChanges();
    expect(root.querySelector('#request-scene')!.innerHTML).toBe(end);
    expect(root.querySelectorAll('.request-layer.is-current')).toHaveLength(1);
    component.selectStation(99);
    expect(component.position()).toBe(22);
  });

  it('pauses, resumes, loops, resets and cancels its frame on destruction', () => {
    const { fixture, component } = setup();
    component.seekTo(10); fixture.detectChanges();
    vi.advanceTimersByTime(1000); expect(component.position()).toBe(10);
    component.togglePlayback(); fixture.detectChanges(); vi.advanceTimersByTime(600); fixture.detectChanges();
    expect(component.position()).toBeGreaterThan(10.4);
    component.seekTo(23.8); fixture.detectChanges(); component.togglePlayback(); fixture.detectChanges();
    vi.advanceTimersByTime(600); fixture.detectChanges();
    expect(component.position()).toBeLessThan(.6);
    expect(component.state().payloadSubmitted).toBe(false);
    component.seekTo(24); fixture.detectChanges(); component.togglePlayback(); fixture.detectChanges();
    expect(component.position()).toBe(0);
    component.seekTo(22); fixture.detectChanges(); component.restart(); fixture.detectChanges();
    expect(component.state().metadataVisible).toBe(false);
    expect(component.running()).toBe(true);
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    fixture.destroy(); expect(cancel).toHaveBeenCalled();
  });

  it('respects reduced motion and hidden tabs while preserving manual exploration', () => {
    media.matches = true;
    const { fixture, component, root } = setup();
    vi.advanceTimersByTime(1000); expect(component.position()).toBe(0);
    expect(root.querySelector<HTMLButtonElement>('.request-playback')!.disabled).toBe(true);
    component.selectStation(2); fixture.detectChanges(); expect(component.position()).toBe(15);
    component.restart(); fixture.detectChanges(); expect(component.running()).toBe(false);
    media.matches = false; media.dispatchEvent(new Event('change')); fixture.detectChanges();
    vi.advanceTimersByTime(500); fixture.detectChanges(); expect(component.position()).toBeGreaterThan(.3);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange')); fixture.detectChanges();
    const frozen = component.position(); vi.advanceTimersByTime(1000); expect(component.position()).toBe(frozen);
  });

  it('localizes the scene and retains plain routes to sourcing and owner permissions', () => {
    const { fixture, root, language } = setup();
    for (const [locale, title] of [['fr', 'Trouver des données et demander l’accès'], ['it', 'Trovare dati e richiedere l’accesso'], ['en', 'Find data and request access']] as const) {
      language.set(locale); fixture.detectChanges();
      expect(root.querySelector('h1')!.textContent).toBe(title);
      expect(root.textContent).toContain('Data Owner');
    }
    expect([...root.querySelectorAll('.request-links a')].map(a => a.getAttribute('href'))).toEqual(['/documentation/animated/data-sources/sourcing', '/documentation/animated/data-consumers/access-management']);
  });
});
