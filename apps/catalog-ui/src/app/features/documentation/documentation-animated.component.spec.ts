import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { CatalogLanguage, UserPreferencesService } from '../../core/user-preferences.service';
import { DocumentationAnimatedComponent } from './documentation-animated.component';
import { PIPELINE_CYCLE, PRODUCT_UNION_START, PRODUCT_UNION_END } from './documentation-pipeline-animation';

describe('DocumentationAnimatedComponent', () => {
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
    TestBed.configureTestingModule({
      imports: [DocumentationAnimatedComponent],
      providers: [provideRouter([]), { provide: UserPreferencesService, useValue: { language } }],
    });
    const fixture = TestBed.createComponent(DocumentationAnimatedComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, root: fixture.nativeElement as HTMLElement, language };
  }

  it('lists every animation before the overview and opens a selected use case', () => {
    const { fixture, component, root, language } = setup();
    const index = root.querySelector('.animation-index')!;
    expect(index.compareDocumentPosition(root.querySelector('.pipeline')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const links = index.querySelectorAll<HTMLAnchorElement>('a');
    expect([...links].map(link => link.getAttribute('href'))).toEqual([
      '/documentation/animated#pipeline-title',
      '/documentation/animated/data-sources/sourcing',
      '/documentation/animated/data-consumers/access-request',
      '/documentation/animated/data-consumers/access-management',
    ]);
    expect([...index.querySelectorAll('.animation-duration')].map(node => node.textContent?.trim())).toEqual(['26 s', '24 s', '24 s', '32 s']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    links[2].click(); fixture.detectChanges();
    expect(navigate).toHaveBeenCalledOnce();
    expect(component.running()).toBe(false);
    language.set('fr'); fixture.detectChanges();
    expect(root.querySelector('#animation-index-title')?.textContent).toBe('Toutes les animations');
  });

  it('follows the animation clock, pauses for reading and resumes from the retained position', () => {
    const { fixture, component, root } = setup();
    const cards = root.querySelectorAll<HTMLButtonElement>('.pipeline-node');
    expect(cards).toHaveLength(6);
    expect([...root.querySelectorAll('.source-label')].map(node => node.textContent)).toEqual(['S3', 'Dateien', 'Datenbanken', 'REST API']);
    expect(root.querySelectorAll('.source-route')).toHaveLength(4);
    expect(root.querySelectorAll('.flow-particle[transform]')).toHaveLength(6);
    expect(root.querySelectorAll('.flow-product[transform]')).toHaveLength(3);
    vi.advanceTimersByTime(3200);
    fixture.detectChanges();
    expect(component.step()).toBe(1);
    cards[4].click();
    fixture.detectChanges();
    expect(component.running()).toBe(false);
    const frozenParticles = [...root.querySelectorAll('.flow-particle')].map(node => node.getAttribute('transform'));
    expect(root.querySelector('#pipeline-detail-title')?.textContent).toBe('Datenschutz');
    expect(cards[4].getAttribute('aria-pressed')).toBe('true');
    vi.advanceTimersByTime(6400);
    expect(component.step()).toBe(4);
    expect([...root.querySelectorAll('.flow-particle')].map(node => node.getAttribute('transform'))).toEqual(frozenParticles);
    root.querySelector<HTMLButtonElement>('.pipeline-playback')!.click();
    fixture.detectChanges();
    vi.advanceTimersByTime(3200);
    fixture.detectChanges();
    expect(component.step()).toBe(2);
    vi.advanceTimersByTime(3200);
    fixture.detectChanges();
    expect(component.step()).toBe(2);
    fixture.destroy();
    vi.advanceTimersByTime(6400);
    expect(component.step()).toBe(2);
  });

  it('opens sourcing from the source layer and pauses the overview before leaving', () => {
    const { fixture, component, root } = setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const source = root.querySelector<HTMLAnchorElement>('.pipeline-drilldown')!;
    expect(source.getAttribute('href')).toBe('/documentation/animated/data-sources/sourcing');
    expect(source.getAttribute('aria-label')).toBe('Data Sourcing entdecken');
    source.click();
    fixture.detectChanges();
    expect(navigate).toHaveBeenCalledOnce();
    expect(component.running()).toBe(false);
    expect(component.step()).toBe(0);
    component.selectStep(5);
    component.nextStep();
    expect(component.step()).toBe(0);
    expect(navigate).toHaveBeenCalledOnce();
  });

  it('opens access management from the consumer layer and pauses without changing the clock', () => {
    const { fixture, component, root } = setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    vi.advanceTimersByTime(3200);
    fixture.detectChanges();
    const position = component.position();
    const consumer = root.querySelector<HTMLAnchorElement>('.pipeline-consumer-drilldown')!;
    expect(consumer).toBe(root.querySelectorAll('.pipeline-node')[5]);
    expect(consumer.tagName).toBe('A');
    expect(consumer.getAttribute('href')).toBe('/documentation/animated/data-consumers/access-management');
    expect(consumer.getAttribute('aria-label')).toBeTruthy();
    consumer.click();
    fixture.detectChanges();
    expect(navigate).toHaveBeenCalledOnce();
    expect(component.running()).toBe(false);
    expect(component.step()).toBe(5);
    expect(component.position()).toBe(position);
    expect(root.querySelector('.pipeline-drilldown')?.getAttribute('href')).toBe('/documentation/animated/data-sources/sourcing');
  });

  it('honors reduced motion initially and when changed, retaining manual navigation', () => {
    media.matches = true;
    const { fixture, component, root } = setup();
    vi.advanceTimersByTime(10000);
    expect(component.step()).toBe(0);
    expect(component.position()).toBe(0);
    expect(root.querySelector<HTMLButtonElement>('.pipeline-playback')?.disabled).toBe(true);
    root.querySelector<HTMLButtonElement>('.pipeline-detail button')!.click();
    fixture.detectChanges();
    expect(component.step()).toBe(1);
    media.matches = false;
    media.dispatchEvent(new Event('change'));
    component.seekTo(2.4);
    component.paused.set(false);
    fixture.detectChanges();
    vi.advanceTimersByTime(3200);
    fixture.detectChanges();
    expect(component.step()).toBe(2);
    media.matches = true;
    media.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    vi.advanceTimersByTime(6400);
    expect(component.step()).toBe(2);
  });

  it('seeks the whole scene and clock, then restarts deterministically from zero', () => {
    const { fixture, component, root } = setup();
    const shapes = () => [...root.querySelectorAll('.flow-particle,.flow-product,.gear-rotor')].map(node => node.getAttribute('transform'));
    const initial = shapes();
    const initialGearAngle = Number(root.querySelector('.gear-rotor')!.getAttribute('transform')!.slice(7, -1));
    const slider = root.querySelector<HTMLInputElement>('#pipeline-position')!;
    expect(slider.max).toBe('26');
    slider.value = '20.6';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(component.position()).toBe(20.6);
    expect(component.running()).toBe(false);
    expect(root.querySelector('.pipeline-time')?.textContent).toContain('20,6 s');
    expect(root.querySelector('.pipeline-time')?.textContent).toContain('26,0 s');
    expect(root.querySelector('.flow-product')?.getAttribute('transform')).toBe('translate(1080 320)');
    expect(root.querySelector('.product-shield')?.getAttribute('transform')).toBe('scale(1)');
    const soughtGearAngle = Number(root.querySelector('.gear-rotor')!.getAttribute('transform')!.slice(7, -1));
    expect(soughtGearAngle - initialGearAngle).toBeCloseTo(824);
    const sought = shapes();
    vi.advanceTimersByTime(1000);
    expect(shapes()).toEqual(sought);
    root.querySelector<HTMLButtonElement>('.pipeline-restart')!.click();
    fixture.detectChanges();
    expect(component.position()).toBe(0);
    expect(component.step()).toBe(0);
    expect(component.running()).toBe(true);
    expect(shapes()).toEqual(initial);
    vi.advanceTimersByTime(1200);
    fixture.detectChanges();
    expect(component.position()).toBeGreaterThan(1);
    expect(component.position()).toBeLessThan(1.3);
    expect(shapes()).not.toEqual(initial);
  });

  it('supports both time boundaries and manual scrubbing in reduced-motion mode', () => {
    media.matches = true;
    const { fixture, component, root } = setup();
    component.seekTo(20.6);
    fixture.detectChanges();
    expect(component.position()).toBe(20.6);
    expect(root.querySelector('.flow-product')?.getAttribute('transform')).toBe('translate(1080 320)');
    vi.advanceTimersByTime(1000);
    expect(component.position()).toBe(20.6);
    component.restart();
    fixture.detectChanges();
    expect(component.position()).toBe(0);
    expect(component.running()).toBe(false);
    component.seekTo(50);
    fixture.detectChanges();
    expect(component.position()).toBe(PIPELINE_CYCLE);
    component.seekTo(-10);
    fixture.detectChanges();
    expect(component.position()).toBe(0);
    component.seekTo(NaN);
    expect(component.position()).toBe(0);
  });

  it('plays from zero when resumed at the end and loops the 26-second clock', () => {
    const { fixture, component } = setup();
    component.seekTo(PIPELINE_CYCLE);
    fixture.detectChanges();
    expect(component.position()).toBe(PIPELINE_CYCLE);
    component.togglePlayback();
    fixture.detectChanges();
    expect(component.position()).toBe(0);
    vi.advanceTimersByTime((PIPELINE_CYCLE + 1) * 1000);
    fixture.detectChanges();
    expect(component.position()).toBeGreaterThan(.8);
    expect(component.position()).toBeLessThan(1.1);
  });

  it('seeks, freezes and rewinds collection and welding before resetting on restart', () => {
    const { fixture, component, root } = setup();
    const ring = root.querySelector('.product-union-ring')!;
    const wave = root.querySelector('.product-union-wave')!;
    const body = root.querySelector('.product-body')!;
    const particles = [...root.querySelectorAll('.flow-particle')];
    const state = () => ({
      particles: particles.map(node => [node.getAttribute('transform'), node.getAttribute('opacity')]),
      ring: [ring.getAttribute('r'), ring.getAttribute('transform')],
      body: body.getAttribute('r'), wave: [wave.getAttribute('r'), wave.getAttribute('opacity')],
    });
    component.seekTo(14.6);
    fixture.detectChanges();
    expect(ring.getAttribute('r')).toBe('48');
    expect(wave.getAttribute('opacity')).toBe('0');
    expect(body.getAttribute('r')).toBe('0');
    expect(particles.every(node => Number(node.getAttribute('opacity')) === 1)).toBe(true);
    expect(new Set(particles.map(node => node.getAttribute('transform'))).size).toBe(6);
    const collected = state();
    component.seekTo(PRODUCT_UNION_START + .7);
    fixture.detectChanges();
    expect(Number(body.getAttribute('r'))).toBeGreaterThan(0);
    expect(Number(body.getAttribute('r'))).toBeLessThan(29);
    const product = root.querySelector('.flow-product')!;
    expect(product.compareDocumentPosition(particles[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const welding = state();
    vi.advanceTimersByTime(1000);
    expect(state()).toEqual(welding);
    component.seekTo(PRODUCT_UNION_END - .1);
    fixture.detectChanges();
    expect(Number(ring.getAttribute('r'))).toBeLessThan(34);
    expect(ring.getAttribute('stroke-dasharray')).toBe('none');
    component.seekTo(PRODUCT_UNION_END + .4);
    fixture.detectChanges();
    const radius = wave.getAttribute('r');
    expect(Number(wave.getAttribute('opacity'))).toBeGreaterThan(.5);
    expect(Number(body.getAttribute('r'))).toBe(29);
    expect(particles.every(node => Number(node.getAttribute('opacity')) === 0)).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(wave.getAttribute('r')).toBe(radius);
    component.seekTo(14.6);
    fixture.detectChanges();
    expect(state()).toEqual(collected);
    component.restart();
    fixture.detectChanges();
    expect(ring.getAttribute('r')).toBe('48');
    expect(wave.getAttribute('opacity')).toBe('0');
  });

  it('shows three simultaneous shielded copies after protecting a single product', () => {
    const { fixture, component, root } = setup();
    const copies = () => [...root.querySelectorAll('.flow-product[data-batch="0"]')].filter(node => Number(node.getAttribute('opacity')) > 0);
    component.seekTo(20.6);
    fixture.detectChanges();
    expect(copies()).toHaveLength(1);
    component.seekTo(22.6);
    fixture.detectChanges();
    const delivered = copies();
    expect(delivered).toHaveLength(3);
    expect(new Set(delivered.map(node => node.getAttribute('transform'))).size).toBe(3);
    expect(delivered.every(node => node.querySelector('.product-shield')?.getAttribute('transform') === 'scale(1)')).toBe(true);
    const positions = delivered.map(node => node.getAttribute('transform'));
    vi.advanceTimersByTime(500);
    expect(copies().map(node => node.getAttribute('transform'))).toEqual(positions);
    component.restart();
    fixture.detectChanges();
    expect(copies()).toHaveLength(0);
  });

  it('starts empty, retains separate points during collection and forms a product only while welding', () => {
    const { fixture, component, root } = setup();
    const products = () => [...root.querySelectorAll('.flow-product')];
    const visible = () => products().filter(node => Number(node.getAttribute('opacity')) > 0 && Number(node.querySelector('.product-body')?.getAttribute('r')) > 0);
    const expectEmpty = () => {
      expect(visible()).toHaveLength(0);
      expect(products().every(node => node.querySelector('.product-body')?.getAttribute('r') === '0')).toBe(true);
    };
    expect(component.position()).toBe(0);
    expectEmpty();
    component.seekTo(11);
    fixture.detectChanges();
    expectEmpty();
    component.seekTo(12);
    fixture.detectChanges();
    expectEmpty();
    expect([...root.querySelectorAll('.flow-particle')].filter(node => Number(node.getAttribute('opacity')) > 0)).not.toHaveLength(0);
    component.seekTo(PRODUCT_UNION_START - .1);
    fixture.detectChanges();
    expectEmpty();
    component.seekTo(PRODUCT_UNION_START + .7);
    fixture.detectChanges();
    expect(visible()).toHaveLength(1);
    component.seekTo(22.6);
    fixture.detectChanges();
    expect(visible()).toHaveLength(3);
    component.seekTo(0);
    fixture.detectChanges();
    expectEmpty();
    component.restart();
    fixture.detectChanges();
    expectEmpty();
    vi.advanceTimersByTime((PIPELINE_CYCLE + 1) * 1000);
    fixture.detectChanges();
    expect(component.position()).toBeLessThan(1.1);
    expectEmpty();
  });

  it('stops in hidden tabs and removes its media/visibility listeners on navigation', () => {
    const removeMedia = vi.spyOn(media, 'removeEventListener');
    const removeVisibility = vi.spyOn(document, 'removeEventListener');
    const { fixture, component } = setup();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    fixture.detectChanges();
    vi.advanceTimersByTime(6400);
    expect(component.step()).toBe(0);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    fixture.detectChanges();
    vi.advanceTimersByTime(3200);
    expect(component.step()).toBe(1);
    fixture.destroy();
    expect(removeMedia).toHaveBeenCalledWith('change', expect.any(Function));
    expect(removeVisibility).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('keeps platform processing and central catalog responsibilities clear across languages', () => {
    const { fixture, root, language } = setup();
    for (const [locale, title] of [['de', 'Vom Ursprung zum Datenprodukt'], ['fr', 'De la source au produit de données'], ['it', 'Dall’origine al prodotto di dati'], ['en', 'From source to data product'], ['rm', 'From source to data product']] as const) {
      language.set(locale);
      fixture.detectChanges();
      expect(root.querySelector('h1')?.textContent).toBe(title);
      expect(root.querySelectorAll('.node-tags')[3].textContent).toContain('Data Owner');
      expect(root.querySelector('.catalog-band')?.textContent).toContain('DaCa');
    }
  });
});
