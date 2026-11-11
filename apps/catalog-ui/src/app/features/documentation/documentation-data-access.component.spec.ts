import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CatalogLanguage, UserPreferencesService } from '../../core/user-preferences.service';
import { DocumentationDataAccessComponent } from './documentation-data-access.component';
import { ACCESS_CYCLE } from './documentation-data-access-animation';

describe('DocumentationDataAccessComponent', () => {
  let media: EventTarget & { matches: boolean };
  beforeEach(() => {
    vi.useFakeTimers();
    media = Object.assign(new EventTarget(), { matches: false });
    vi.stubGlobal('matchMedia', () => media);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  function setup() {
    const language = signal<CatalogLanguage>('de');
    TestBed.configureTestingModule({ imports: [DocumentationDataAccessComponent],
      providers: [provideRouter([]), { provide: UserPreferencesService, useValue: { language } }] });
    const fixture = TestBed.createComponent(DocumentationDataAccessComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, root: fixture.nativeElement as HTMLElement, language };
  }
  const movingState = (root: HTMLElement) => [...root.querySelectorAll('[data-packet], .access-application-token, .access-review-token, .access-author-token')].map(node => [node.getAttribute('transform'), node.getAttribute('opacity')]);
  const visibleData = (root: HTMLElement) => [...root.querySelectorAll('.access-data')].filter(node => Number(node.getAttribute('opacity')) > 0);
  const receiptOpacities = (root: HTMLElement) => [...root.querySelectorAll('.access-receipt circle')].map(node => Number(node.getAttribute('opacity')));
  const auditRows = (root: HTMLElement) => [...root.querySelectorAll('.access-audit tbody tr[data-decision]')];
  const decisions = (root: HTMLElement, decision: 'allow' | 'deny') => auditRows(root).filter(row => row.getAttribute('data-decision') === decision);

  it('renders one consumer and three independently gated stores with an empty default-deny start', () => {
    const { root, component } = setup();
    expect(root.querySelectorAll('.access-consumer')).toHaveLength(1);
    expect(root.querySelectorAll('.access-gate')).toHaveLength(3);
    expect(root.querySelectorAll('.access-store')).toHaveLength(3);
    expect(root.querySelectorAll('.access-governed-route')).toHaveLength(3);
    expect(root.querySelector('#access-scene')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelectorAll('.access-story button[aria-current="step"]')).toHaveLength(1);
    expect(component.state().allowed).toBe(false);
    expect(root.querySelector('.access-decision')?.textContent).toContain('Blockiert');
    expect(visibleData(root)).toHaveLength(0);
    expect(receiptOpacities(root)).toEqual([0, 0, 0]);
    expect(root.querySelector('.access-policy-rule')?.getAttribute('opacity')).toBe('0');
    expect(root.querySelector('.access-backlinks a[href="/documentation/animated"]')).not.toBeNull();
  });

  it('seeks five stations and keeps the new application and review steps pending until owner approval', () => {
    const { root, fixture, component } = setup();
    const stations = root.querySelectorAll<HTMLButtonElement>('.access-story button');
    expect(stations).toHaveLength(5);
    for (const [index, time] of [0, 6, 10, 14, 20].entries()) {
      stations[index].click();
      fixture.detectChanges();
      expect(component.position()).toBe(time);
      expect(component.state().phase).toBe(index);
      expect(stations[index].getAttribute('aria-current')).toBe('step');
      expect(root.querySelector('#access-detail .daca-eyebrow')?.textContent).toContain(`${index + 1} / 5`);
    }
    for (const [time, selector] of [[7.8, '.access-application-token'], [11, '.access-review-token']] as const) {
      component.seekTo(time);
      fixture.detectChanges();
      expect(root.querySelector(selector)?.getAttribute('opacity')).toBe('1');
      expect(root.querySelector('.access-author-token')?.getAttribute('opacity')).toBe('0');
      expect(root.querySelector('.access-policy-rule')?.getAttribute('opacity')).toBe('0');
      expect(component.state().allowed).toBe(false);
      const paused = movingState(root);
      vi.advanceTimersByTime(1000);
      expect(movingState(root)).toEqual(paused);
      component.seekTo(31);
      component.seekTo(time);
      fixture.detectChanges();
      expect(movingState(root)).toEqual(paused);
    }
    component.seekTo(13);
    fixture.detectChanges();
    expect(root.querySelector('.access-owner-status')?.textContent).toContain('Prüft den Antrag');
    expect(root.querySelector('.access-application-status')?.textContent).toContain('Entscheidung ausstehend');
    component.seekTo(14);
    fixture.detectChanges();
    expect(root.querySelector('.access-owner-status')?.textContent).toContain('Zustimmung erteilt');
    expect(component.state().allowed).toBe(false);
    component.restart();
    fixture.detectChanges();
    expect(root.querySelector('.access-owner-status')).toBeNull();
    expect(root.querySelector('.access-application-token')?.getAttribute('opacity')).toBe('0');
    expect(root.querySelector('.access-review-token')?.getAttribute('opacity')).toBe('0');
  });

  it('keeps assigned policies blocked and seeks all packet attributes deterministically', () => {
    const { root, fixture, component } = setup();
    component.seekTo(19.2);
    fixture.detectChanges();
    expect(component.running()).toBe(false);
    expect(component.state().lanes.every(lane => lane.assigned && !lane.allowed)).toBe(true);
    expect([...root.querySelectorAll('.access-gate-list strong')].every(node => node.textContent?.includes('blockiert'))).toBe(true);
    expect(visibleData(root)).toHaveLength(0);
    component.seekTo(20);
    fixture.detectChanges();
    expect(component.state().allowed).toBe(true);
    expect([...root.querySelectorAll('.access-gate')].every(node => node.getAttribute('data-active') === 'true')).toBe(true);
    expect(visibleData(root)).toHaveLength(0);
    const slider = root.querySelector<HTMLInputElement>('#access-position')!;
    expect(slider.max).toBe('32');
    slider.value = '26.4';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(component.position()).toBe(26.4);
    expect(root.querySelector('.pipeline-time')?.textContent).toContain('26,4 s / 32,0 s');
    expect(visibleData(root)).toHaveLength(3);
    const sought = movingState(root);
    vi.advanceTimersByTime(1500);
    fixture.detectChanges();
    expect(movingState(root)).toEqual(sought);
    component.seekTo(1.8);
    fixture.detectChanges();
    expect(visibleData(root)).toHaveLength(0);
    expect(component.state().allowed).toBe(false);
    component.seekTo(26.4);
    fixture.detectChanges();
    expect(movingState(root)).toEqual(sought);
  });

  it('uses the story controls to pause and restarts the complete scene without data or a policy', () => {
    const { root, fixture, component } = setup();
    root.querySelectorAll<HTMLButtonElement>('.access-story button')[1].click();
    fixture.detectChanges();
    expect(component.position()).toBe(6);
    expect(component.state().phase).toBe(1);
    expect(component.running()).toBe(false);
    component.seekTo(31);
    fixture.detectChanges();
    expect(receiptOpacities(root)).toEqual([1, 1, 1]);
    root.querySelector<HTMLButtonElement>('.access-restart')!.click();
    fixture.detectChanges();
    expect(component.position()).toBe(0);
    expect(component.running()).toBe(true);
    expect(component.state().policyStage).toBe('absent');
    expect(receiptOpacities(root)).toEqual([0, 0, 0]);
    expect(root.querySelector('.access-policy-rule')?.getAttribute('opacity')).toBe('0');
    expect(visibleData(root)).toHaveLength(0);
    vi.advanceTimersByTime(1200);
    fixture.detectChanges();
    expect(component.position()).toBeGreaterThan(1);
    expect(component.position()).toBeLessThan(1.3);
  });

  it('resumes from the retained position and loops the 32-second cycle to default deny', () => {
    const { root, fixture, component } = setup();
    component.seekTo(26.4);
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.access-playback')!.click();
    fixture.detectChanges();
    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(component.position()).toBeGreaterThan(27.2);
    component.seekTo(ACCESS_CYCLE);
    fixture.detectChanges();
    expect(component.position()).toBe(32);
    component.togglePlayback();
    fixture.detectChanges();
    expect(component.position()).toBe(0);
    vi.advanceTimersByTime(33000);
    fixture.detectChanges();
    expect(component.position()).toBeGreaterThan(.8);
    expect(component.position()).toBeLessThan(1.1);
    expect(component.state().policyStage).toBe('absent');
    expect(visibleData(root)).toHaveLength(0);
  });

  it('honors reduced motion initially and dynamically while retaining manual seeking', () => {
    media.matches = true;
    const { root, fixture, component } = setup();
    vi.advanceTimersByTime(5000);
    expect(component.position()).toBe(0);
    expect(root.querySelector<HTMLButtonElement>('.access-playback')?.disabled).toBe(true);
    component.seekTo(26.4);
    fixture.detectChanges();
    expect(visibleData(root)).toHaveLength(3);
    const frozen = movingState(root);
    vi.advanceTimersByTime(2000);
    expect(movingState(root)).toEqual(frozen);
    component.restart();
    fixture.detectChanges();
    expect(component.position()).toBe(0);
    expect(component.running()).toBe(false);
    expect(visibleData(root)).toHaveLength(0);
    media.matches = false;
    media.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    vi.advanceTimersByTime(1200);
    fixture.detectChanges();
    expect(component.position()).toBeGreaterThan(1);
    media.matches = true;
    media.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const position = component.position();
    vi.advanceTimersByTime(1200);
    expect(component.position()).toBe(position);
  });

  it('stops hidden-tab work and removes every listener and frame on navigation', () => {
    const removeMedia = vi.spyOn(media, 'removeEventListener');
    const removeVisibility = vi.spyOn(document, 'removeEventListener');
    const frames = vi.spyOn(window, 'requestAnimationFrame');
    const { fixture, component } = setup();
    vi.advanceTimersByTime(1200);
    fixture.detectChanges();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    fixture.detectChanges();
    const position = component.position();
    vi.advanceTimersByTime(2000);
    expect(component.position()).toBe(position);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    fixture.detectChanges();
    vi.advanceTimersByTime(1200);
    expect(component.position()).toBeGreaterThan(position);
    fixture.destroy();
    const frameCount = frames.mock.calls.length;
    vi.advanceTimersByTime(2000);
    expect(frames.mock.calls).toHaveLength(frameCount);
    expect(removeMedia).toHaveBeenCalledWith('change', expect.any(Function));
    expect(removeVisibility).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('switches from the logical model to one persistence at the same clock position', () => {
    const { root, fixture, component } = setup();
    component.seekTo(26.8);
    fixture.detectChanges();
    expect(component.scope()).toBe('logical-model');
    expect(component.state().lanes.every(lane => lane.allowed)).toBe(true);
    expect(visibleData(root)).toHaveLength(3);
    const scopes = root.querySelectorAll<HTMLInputElement>('.access-scope input[type="radio"]');
    expect([...scopes].map(input => input.value)).toEqual(['logical-model', 'persistences']);
    expect(scopes[0].checked).toBe(true);
    scopes[1].click();
    fixture.detectChanges();
    expect(component.scope()).toBe('persistences');
    expect(component.selectedPersistences()).toEqual([1]);
    expect(component.position()).toBe(26.8);
    expect(component.running()).toBe(false);
    expect(component.state().lanes.map(lane => lane.allowed)).toEqual([false, true, false]);
    expect(root.querySelectorAll('.access-persistence-choice input[type="checkbox"]')).toHaveLength(3);
    expect(visibleData(root).map(node => node.getAttribute('data-lane'))).toEqual(['1']);
    expect(decisions(root, 'allow')).toHaveLength(1);
    expect(decisions(root, 'deny')).toHaveLength(5);
    component.seekTo(31);
    fixture.detectChanges();
    expect(receiptOpacities(root)).toEqual([0, 1, 0]);
    expect(component.state().policyStored).toBe(true);
  });

  it('toggles individual persistences and denies every lane when none is selected', () => {
    const { root, fixture, component } = setup();
    component.seekTo(26.8);
    component.selectScope('persistences');
    fixture.detectChanges();
    const choices = root.querySelectorAll<HTMLInputElement>('.access-persistence-choice input[type="checkbox"]');
    expect([...choices].map(choice => choice.checked)).toEqual([false, true, false]);
    choices[0].click();
    fixture.detectChanges();
    expect(new Set(component.selectedPersistences())).toEqual(new Set([0, 1]));
    expect(component.state().lanes.map(lane => lane.allowed)).toEqual([true, true, false]);
    expect(visibleData(root).map(node => node.getAttribute('data-lane'))).toEqual(['0', '1']);
    choices[1].click();
    fixture.detectChanges();
    expect(component.selectedPersistences()).toEqual([0]);
    choices[0].click();
    fixture.detectChanges();
    expect(component.selectedPersistences()).toEqual([]);
    expect(component.position()).toBe(26.8);
    expect(component.running()).toBe(false);
    expect(component.state().allowed).toBe(false);
    expect(component.state().lanes.every(lane => !lane.allowed)).toBe(true);
    expect(visibleData(root)).toHaveLength(0);
    expect(decisions(root, 'allow')).toHaveLength(0);
    expect(decisions(root, 'deny')).toHaveLength(6);
    component.seekTo(31);
    fixture.detectChanges();
    expect(receiptOpacities(root)).toEqual([0, 0, 0]);
    const model = root.querySelector<HTMLInputElement>('.access-scope input[value="logical-model"]')!;
    model.click();
    fixture.detectChanges();
    expect(component.scope()).toBe('logical-model');
    expect(component.position()).toBe(31);
    expect(component.state().lanes.every(lane => lane.allowed)).toBe(true);
    expect(receiptOpacities(root)).toEqual([1, 1, 1]);
  });

  it('keeps the policy visibly stored in DaCa PAP throughout distribution and data return', () => {
    const { root, fixture, component } = setup();
    component.seekTo(16.3);
    fixture.detectChanges();
    expect(component.state().policyStored).toBe(false);
    expect(root.querySelector('.access-pap-stored')?.getAttribute('opacity')).toBe('0');
    for (const time of [16.4, 19.2, 20, 26.8, 31]) {
      component.seekTo(time);
      fixture.detectChanges();
      expect(component.state().policyStored).toBe(true);
      expect(root.querySelector('.access-pap-stored')?.getAttribute('opacity')).toBe('1');
      expect(root.querySelector('.access-policy-card')?.textContent).toContain('PAP');
      expect(root.querySelector('.access-policy-card')?.textContent).toContain('Policy Administration Point');
    }
    component.restart();
    fixture.detectChanges();
    expect(component.state().policyStored).toBe(false);
    expect(root.querySelector('.access-pap-stored')?.getAttribute('opacity')).toBe('0');
  });

  it('automatically logs each decision and derives the audit view from the current time', () => {
    const { root, fixture, component } = setup();
    expect(auditRows(root)).toHaveLength(0);
    vi.advanceTimersByTime(3000);
    fixture.detectChanges();
    expect(auditRows(root)).toHaveLength(3);
    expect(decisions(root, 'deny')).toHaveLength(3);
    vi.advanceTimersByTime(20000);
    fixture.detectChanges();
    expect(auditRows(root)).toHaveLength(6);
    expect(decisions(root, 'deny')).toHaveLength(3);
    expect(decisions(root, 'allow')).toHaveLength(3);
    for (const row of auditRows(root)) {
      expect(row.textContent).toContain('Consumer A');
      expect(row.querySelectorAll('td').length).toBeGreaterThanOrEqual(5);
      expect(row.textContent?.trim()).not.toBe('');
    }
    expect(root.querySelector('.access-audit')?.textContent).toContain('Dateien');
    component.seekTo(2.4);
    fixture.detectChanges();
    expect(auditRows(root)).toHaveLength(2);
    expect(decisions(root, 'deny')).toHaveLength(2);
    component.seekTo(0);
    fixture.detectChanges();
    expect(auditRows(root)).toHaveLength(0);
    component.seekTo(26.8);
    fixture.detectChanges();
    expect(auditRows(root)).toHaveLength(6);
    component.restart();
    fixture.detectChanges();
    expect(auditRows(root)).toHaveLength(0);
  });

  it('localizes the explanation while retaining Data Owner and the actual PoC boundary', () => {
    const { fixture, root, component, language } = setup();
    const blocked = { de: 'Standardmässig blockiert', fr: 'Bloqué par défaut', it: 'Bloccato per impostazione predefinita', en: 'Blocked by default', rm: 'Blocked by default' };
    const models = { de: 'Logisches Modell A', fr: 'Modèle logique A', it: 'Modello logico A', en: 'Logical model A', rm: 'Logical model A' };
    for (const locale of ['de', 'fr', 'it', 'en', 'rm'] as const) {
      language.set(locale);
      fixture.detectChanges();
      expect(root.querySelector('#access-detail-title')?.textContent).toBe(blocked[locale]);
      expect(root.textContent).toContain('Data Owner');
      expect(root.querySelector('.access-policy-card')?.textContent).toContain('PAP');
      expect(root.querySelector('.access-policy-card')?.textContent).toContain('Policy Administration Point');
      expect(root.querySelector('.access-model-context')?.textContent).toContain(models[locale]);
      expect(root.querySelector('.pipeline-note')?.textContent).toContain('HTTP PEP/OPA');
      expect(root.querySelector('.pipeline-note')?.textContent).toContain('PostgreSQL ACL/RLS');
      component.seekTo(0);
    }
  });
});
