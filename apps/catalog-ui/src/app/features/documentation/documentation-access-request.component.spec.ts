import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CatalogLanguage, UserPreferencesService } from '../../core/user-preferences.service';
import { ACCESS_REQUEST_DURATION, ACCESS_REQUEST_MESSAGES, ACCESS_REQUEST_ROUTES, sampleAccessRequest } from './documentation-access-request-animation';
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
    expect(sampleAccessRequest(11.2)).toMatchObject({ policyStored: true, policyActive: false });
    expect(sampleAccessRequest(11.8)).toMatchObject({ policyActive: true, metadataVisible: false });
    expect(sampleAccessRequest(14.59).metadataVisible).toBe(false);
    expect(sampleAccessRequest(14.6)).toMatchObject({ metadataVisible: true, payloadSubmitted: false });
    expect(sampleAccessRequest(15)).toMatchObject({ station: 2, form: 0 });
    expect(sampleAccessRequest(19.9).payloadSubmitted).toBe(false);
    expect(sampleAccessRequest(20).payloadSubmitted).toBe(true);
    for (let time = 0; time <= ACCESS_REQUEST_DURATION; time += .1) {
      const state = sampleAccessRequest(time);
      expect(state.payloadAuthorized).toBe(false);
      expect(state.submission > 0 ? state.metadataVisible : true).toBe(true);
      if (state.metadataVisible) expect(state.introspectionApproved && state.policyStored && state.policyActive).toBe(true);
    }
    for (const time of [-1, NaN, Infinity]) expect(sampleAccessRequest(time)).toEqual(sampleAccessRequest(0));
  });

  it('routes applications through DaCa and delivers metadata only through the approved SDAL', () => {
    const itinerary = [
      ['search', 'analyst', 'catalog'], ['prose', 'catalog', 'analyst'],
      ['introspection-application', 'analyst', 'catalog'], ['introspection-review', 'catalog', 'owner'],
      ['approval', 'owner', 'catalog'], ['policy', 'catalog', 'sdal'],
      ['introspection-query', 'analyst', 'sdal'], ['source-query', 'sdal', 'source'],
      ['source-metadata', 'source', 'sdal'], ['metadata', 'sdal', 'analyst'],
      ['payload-application', 'analyst', 'catalog'], ['payload-review', 'catalog', 'owner'],
    ];
    expect(ACCESS_REQUEST_MESSAGES.map(event => {
      const state = sampleAccessRequest((event.start + event.end) / 2);
      expect(state.activeActors).toEqual([state.message!.from, state.message!.to]);
      return [state.message!.id, state.message!.from, state.message!.to];
    })).toEqual(itinerary);
    for (const event of ACCESS_REQUEST_MESSAGES) {
      const path = ACCESS_REQUEST_ROUTES.find(route => route.id === event.route)!;
      expect(sampleAccessRequest(event.start).message).toMatchObject({ x: path.points[0][0], y: path.points[0][1] });
      const end = sampleAccessRequest(event.end - .0000001).message!;
      expect(end.x).toBeCloseTo(path.points[3][0], 2);
      expect(end.y).toBeCloseTo(path.points[3][1], 2);
      expect(sampleAccessRequest(event.end).message?.id).not.toBe(event.id);
    }
    expect(sampleAccessRequest(22)).toMatchObject({ payloadAtOwner: true, payloadAuthorized: false, activeActors: ['owner'] });
  });

  it('renders connected components, shared message icons and a permanently protected payload', () => {
    const { fixture, component, root } = setup();
    expect(root.querySelectorAll('.scene-component')).toHaveLength(5);
    expect(root.querySelectorAll('.message-route')).toHaveLength(9);
    expect(root.querySelectorAll('.request-legend li')).toHaveLength(6);
    expect(root.querySelector('.message-token')).toBeNull();
    for (const [time, message] of [[8.9, 'introspection-review'], [13.8, 'metadata'], [19, 'payload-application']] as const) {
      component.seekTo(time); fixture.detectChanges();
      expect(root.querySelector('.message-token')?.getAttribute('data-message')).toBe(message);
      expect(root.querySelectorAll('.message-route.is-active')).toHaveLength(1);
      expect(root.querySelectorAll('.scene-component.is-active')).toHaveLength(2);
      expect(root.querySelector('.message-token use')?.getAttribute('href')).toContain('/animation-icons.svg#');
      expect(root.querySelector('.payload-lock')).not.toBeNull();
    }
    component.seekTo(13.8); fixture.detectChanges();
    expect(root.querySelector('.analyst-metadata')?.getAttribute('opacity')).toBe('0.15');
    component.seekTo(14.6); fixture.detectChanges();
    expect(root.querySelector('.analyst-metadata')?.getAttribute('opacity')).toBe('1');
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
    expect(root.querySelector('.scene-component.is-active')?.getAttribute('data-component')).toBe('owner');
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
