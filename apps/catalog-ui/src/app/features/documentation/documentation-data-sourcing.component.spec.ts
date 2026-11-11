import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CatalogLanguage, UserPreferencesService } from '../../core/user-preferences.service';
import { DocumentationDataSourcingComponent } from './documentation-data-sourcing.component';

describe('single PostgreSQL sourcing scene', () => {
  let media: EventTarget & { matches: boolean };
  beforeEach(() => { vi.useFakeTimers(); media = Object.assign(new EventTarget(), { matches: false }); vi.stubGlobal('matchMedia', () => media); });
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  function setup() {
    const language = signal<CatalogLanguage>('de');
    TestBed.configureTestingModule({ imports: [DocumentationDataSourcingComponent], providers: [provideRouter([]), { provide: UserPreferencesService, useValue: { language } }] });
    const fixture = TestBed.createComponent(DocumentationDataSourcingComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, root: fixture.nativeElement as HTMLElement, language };
  }
  const projection = (root: HTMLElement) => [...root.querySelectorAll('[data-sourcing-packet],[data-sourcing-control],[data-sourcing-check],[data-sourcing-introspection],.sourcing-structured-cell,.sourcing-unstructured-dot,[data-sourcing-door-leaf],[data-sourcing-door-handle],[data-sourcing-belt-tread],[data-sourcing-roller],[data-sourcing-wizard-step],[data-sourcing-bridge],[data-sourcing-bridge-track],[data-sourcing-bridge-end],[data-sourcing-roller-mount]')]
    .map(node => ['transform', 'opacity', 'd', 'cx', 'cy', 'stroke-dashoffset', 'x', 'width'].map(attr => node.getAttribute(attr)));

  it('shows one PostgreSQL source, one SDAL PG and one SC PG without other sources or a merge', () => {
    const { root } = setup();
    for (const selector of ['.sourcing-source', '.sourcing-sdal', '.sourcing-connector', '[data-sourcing-control]', '[data-sourcing-check]', '[data-sourcing-introspection]']) expect(root.querySelectorAll(selector)).toHaveLength(1);
    expect(root.querySelector('.sourcing-source-name')?.textContent).toBe('PostgreSQL');
    expect(root.querySelector('.sourcing-sdal-name')?.textContent).toContain('Secure Data Access Layer');
    expect(root.querySelector('.sourcing-connector-name')?.textContent).toContain('Source Connector');
    expect(root.querySelectorAll('[data-sourcing-door-leaf],[data-sourcing-belt-tread]')).toHaveLength(2);
    expect(root.querySelector('.wizard-analyst use')?.getAttribute('href')).toBe('/assets/documentation/animation-icons.svg#person');
    expect(root.querySelectorAll('.wizard-field,.wizard-field-line')).toHaveLength(0);
    expect(root.querySelectorAll('[data-sourcing-wizard-step]')).toHaveLength(3);
    expect(root.querySelector('.sourcing-wizard')?.textContent).toMatch(/Quelle.*Transformation.*S3.*Ziel/s);
    expect(root.querySelectorAll('.sourcing-story,.sourcing-merge-ring')).toHaveLength(0);
    expect(root.textContent).not.toMatch(/Oracle|SAP|SC S3|Real-time|Batch/);
    expect(root.textContent).toContain('personalisierte Berechtigung');
    expect(root.querySelectorAll('[data-sourcing-packet]')).toHaveLength(6);
    expect(root.querySelector('#sourcing-scene')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('daca-policy-help a')?.getAttribute('href')).toBe('/documentation/animated/data-consumers/access-request');
  });

  it('selects all four stations and synchronizes the slider and explanatory text', () => {
    const { fixture, component, root } = setup();
    const buttons = root.querySelectorAll<HTMLButtonElement>('.animation-stations button');
    expect(buttons).toHaveLength(4);
    for (const [index, time] of [0, 5, 9, 14].entries()) {
      buttons[index].click(); fixture.detectChanges();
      expect(component.position()).toBe(time);
      expect(component.state().station).toBe(index);
      expect(buttons[index].getAttribute('aria-current')).toBe('step');
      expect(component.running()).toBe(false);
      expect(root.querySelector('#sourcing-station-detail')?.textContent).toContain(String(index + 1));
    }
    component.selectStation(-1); component.selectStation(4); expect(component.position()).toBe(14);
    expect(root.querySelector<HTMLInputElement>('#sourcing-position')?.max).toBe('24');
  });

  it('waits for personalized policy permission before showing payloads', () => {
    const { fixture, component, root } = setup();
    const visible = (selector: string) => root.querySelectorAll(selector + '[opacity="1"]').length;
    component.seekTo(6); fixture.detectChanges();
    expect(visible('[data-sourcing-control]')).toBe(1);
    expect(visible('[data-sourcing-packet]')).toBe(0);
    component.seekTo(10); fixture.detectChanges();
    expect(visible('[data-sourcing-check]')).toBe(1);
    expect(root.querySelector('.sourcing-sdal.is-active')).not.toBeNull();
    expect(component.state().jobReady).toBe(false);
    component.seekTo(12.5); fixture.detectChanges();
    expect(visible('[data-sourcing-introspection]')).toBe(1);
    expect(visible('[data-sourcing-packet]')).toBe(0);
    expect(Number(root.querySelector('[data-sourcing-door]')?.getAttribute('data-open'))).toBeGreaterThan(0);
    expect(Number(root.querySelector('[data-sourcing-bridge]')?.getAttribute('data-deployment'))).toBeGreaterThan(0);
    component.seekTo(14); fixture.detectChanges();
    expect(component.state().jobReady).toBe(true);
    expect(visible('[data-sourcing-packet]')).toBe(1);
    expect(root.querySelector('[data-sourcing-door]')?.getAttribute('data-open')).toBe('1');
    expect(root.querySelector('[data-sourcing-belt]')?.getAttribute('data-running')).toBe('true');
    expect(root.querySelector('[data-sourcing-bridge]')?.getAttribute('transform')).toBe('rotate(0)');
    component.seekTo(20); fixture.detectChanges();
    expect(root.querySelector('[data-sourcing-door]')?.getAttribute('data-open')).toBe('0');
    expect(root.querySelector('.sourcing-sdal')?.textContent).toContain('Durchgang geschlossen');
    expect(root.querySelector('[data-sourcing-bridge]')?.getAttribute('transform')).toBe('rotate(0)');
    component.seekTo(22); fixture.detectChanges();
    expect(root.querySelector('[data-sourcing-belt]')?.getAttribute('data-running')).toBe('false');
    expect(root.querySelector('.sourcing-connector')?.textContent).toContain('Abgeschlossen');
  });

  it('switches between alternative targets at the retained time with no stale records', () => {
    const { fixture, component, root } = setup();
    component.seekTo(22); fixture.detectChanges();
    expect(component.state().stored).toEqual({ structured: 6, unstructured: 0 });
    const radio = root.querySelector<HTMLInputElement>('input[value="unstructured"]')!;
    radio.click(); fixture.detectChanges();
    expect(component.target()).toBe('unstructured');
    expect(component.position()).toBe(22);
    expect(component.running()).toBe(false);
    expect(component.state().stored).toEqual({ structured: 0, unstructured: 6 });
    expect(root.querySelectorAll('.sourcing-structured-cell[opacity="1"]')).toHaveLength(0);
    expect(root.querySelectorAll('.sourcing-unstructured-dot[opacity="1"]')).toHaveLength(6);
    component.selectTarget('structured'); fixture.detectChanges();
    expect(root.querySelectorAll('.sourcing-unstructured-dot[opacity="1"]')).toHaveLength(0);
  });

  it('supports deterministic seeking, pause, restart and looping', () => {
    const { fixture, component, root } = setup();
    const slider = root.querySelector<HTMLInputElement>('#sourcing-position')!;
    slider.value = '16.4'; slider.dispatchEvent(new Event('input')); fixture.detectChanges();
    const saved = projection(root);
    vi.advanceTimersByTime(500); expect(projection(root)).toEqual(saved);
    component.seekTo(23); fixture.detectChanges(); component.seekTo(16.4); fixture.detectChanges();
    expect(projection(root)).toEqual(saved);
    component.seekTo(12.45); fixture.detectChanges();
    const opening = projection(root);
    vi.advanceTimersByTime(500); expect(projection(root)).toEqual(opening);
    component.seekTo(23); component.seekTo(12.45); fixture.detectChanges();
    expect(projection(root)).toEqual(opening);
    component.seekTo(.8); fixture.detectChanges();
    const firstIcon = projection(root);
    vi.advanceTimersByTime(500); expect(projection(root)).toEqual(firstIcon);
    component.seekTo(4); component.seekTo(.8); fixture.detectChanges();
    expect(projection(root)).toEqual(firstIcon);
    component.seekTo(23.8); fixture.detectChanges(); component.togglePlayback(); fixture.detectChanges();
    vi.advanceTimersByTime(600); fixture.detectChanges();
    expect(component.position()).toBeLessThan(.5);
    expect(component.state().stored).toEqual({ structured: 0, unstructured: 0 });
    component.seekTo(24); fixture.detectChanges(); component.togglePlayback(); fixture.detectChanges();
    expect(component.position()).toBe(0);
    component.seekTo(22); fixture.detectChanges(); component.restart(); fixture.detectChanges();
    expect(component.position()).toBe(0);
    expect(component.running()).toBe(true);
    expect(root.querySelectorAll('.sourcing-structured-cell[opacity="1"]')).toHaveLength(0);
  });

  it('respects reduced motion, hidden tabs and navigation cleanup', () => {
    media.matches = true;
    const { fixture, component, root } = setup();
    vi.advanceTimersByTime(1000); expect(component.position()).toBe(0);
    expect(root.querySelector<HTMLButtonElement>('.sourcing-playback')?.disabled).toBe(true);
    component.selectStation(3); fixture.detectChanges(); expect(component.position()).toBe(14);
    component.restart(); fixture.detectChanges(); expect(component.running()).toBe(false);
    media.matches = false; media.dispatchEvent(new Event('change')); fixture.detectChanges();
    vi.advanceTimersByTime(500); fixture.detectChanges(); expect(component.position()).toBeGreaterThan(.3);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange')); fixture.detectChanges();
    const time = component.position(); vi.advanceTimersByTime(500); expect(component.position()).toBe(time);
    const remove = vi.spyOn(document, 'removeEventListener');
    fixture.destroy(); expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('keeps the same PG actors and four stations in every supported language', () => {
    const { fixture, root, language } = setup();
    for (const locale of ['de', 'fr', 'it', 'en', 'rm'] as const) {
      language.set(locale); fixture.detectChanges();
      expect(root.querySelectorAll('.animation-stations button')).toHaveLength(4);
      expect(root.textContent).toContain('Secure Data Access Layer');
      expect(root.textContent).toContain('Source Connector');
      expect(root.textContent).not.toMatch(/SDAL PG|SC PG/);
      expect(root.textContent).toContain('Data Analyst');
      expect(root.querySelector('.sourcing-scene')?.textContent).not.toContain('?');
    }
  });
});
