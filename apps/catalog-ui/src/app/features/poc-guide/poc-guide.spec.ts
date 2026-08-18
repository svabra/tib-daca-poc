import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { POC_GUIDE_CAPABILITIES, POC_GUIDE_LIMITS, POC_JOURNEYS } from './poc-guide.data';
import { PocGuideConfigService } from './poc-guide-config.service';
import { PocGuideDetailComponent } from './poc-guide-detail.component';
import { PocGuideOverviewComponent } from './poc-guide-overview.component';

describe('PoC guide contract', () => {
  it('defines four complete, uniquely addressable German journeys and fourteen screenshots', () => {
    expect(POC_JOURNEYS.map((journey) => journey.id)).toEqual([
      'data-analysts-journey',
      'consumer-access-request',
      'metadata-quality',
      'governance-exception',
    ]);
    expect(POC_JOURNEYS[0].verification?.label).toBe('Durchgängig verifiziert');
    expect(new Set(POC_JOURNEYS.map((journey) => journey.id)).size).toBe(4);
    expect(POC_JOURNEYS.flatMap((journey) => journey.steps.flatMap((step) => step.screenshots ?? [])).length).toBe(14);
    for (const journey of POC_JOURNEYS) {
      expect(journey.roles.length).toBeGreaterThan(0);
      expect(journey.prerequisites.length).toBeGreaterThan(0);
      expect(journey.steps.length).toBeGreaterThanOrEqual(5);
      for (const screenshot of journey.steps.flatMap((step) => step.screenshots ?? [])) {
        expect(screenshot.src).toMatch(/^\/assets\/poc-guide\/.+\.webp$/);
        expect(screenshot.alt.length).toBeGreaterThan(30);
        expect(screenshot.caption.length).toBeGreaterThan(30);
      }
    }
    expect(POC_GUIDE_CAPABILITIES.every((item) => item.status !== 'out-of-scope')).toBe(true);
    expect(POC_GUIDE_LIMITS.every((item) => item.status === 'out-of-scope')).toBe(true);
  });

  it('renders the overview with journey links, boundaries and the simulation compatibility link', async () => {
    await TestBed.configureTestingModule({
      imports: [PocGuideOverviewComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(PocGuideOverviewComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h1')?.textContent).toContain('PoC Leitfaden');
    expect(root.querySelectorAll('[data-poc-guide-journey]').length).toBe(4);
    expect(root.textContent).toContain('Das können Sie testen');
    expect(root.textContent).toContain('Das ist nicht Teil des PoC');
    expect(root.querySelector('a[href="/poc-simulation"]')).not.toBeNull();
  });
});

describe('PoC guide public configuration', () => {
  it('builds exact external links from the server-provided DAAIF base URL', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(PocGuideConfigService);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/poc/guide-config').flush({
      daaifUiUrl: 'https://daaif.example.test/base',
      environment: 'test',
    });

    expect(service.externalHref('daaif-notebook')).toBe('https://daaif.example.test/base/notebooks/data-analysts-journey-cantonal-business-tax');
    expect(service.externalHref('daaif-loader')).toBe('https://daaif.example.test/base/loader-workbench');
    expect(service.externalHref('internal')).toBeNull();
    http.verify();
  });

  it('keeps the guide readable when public configuration is unavailable', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(PocGuideConfigService);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/poc/guide-config').flush('offline', { status: 503, statusText: 'Unavailable' });

    expect(service.loading()).toBe(false);
    expect(service.externalHref('daaif-notebook')).toBeNull();
    http.verify();
  });
});

describe('PoC guide detail', () => {
  async function render(journeyId: string, daaifUiUrl = 'https://daaif.test') {
    const paramMap = convertToParamMap({ journeyId });
    const guideConfig = {
      loading: signal(false),
      externalHref: (target: string) => {
        if (!daaifUiUrl) return null;
        return target === 'daaif-notebook'
          ? `${daaifUiUrl}/notebooks/data-analysts-journey-cantonal-business-tax`
          : target === 'daaif-loader' ? `${daaifUiUrl}/loader-workbench` : null;
      },
    };
    await TestBed.configureTestingModule({
      imports: [PocGuideDetailComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(paramMap), snapshot: { paramMap } } },
        { provide: PocGuideConfigService, useValue: guideConfig },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PocGuideDetailComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders roles, checkpoints, safe external links and accessible screenshots', async () => {
    const fixture = await render('data-analysts-journey');
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('h1')?.textContent).toContain('A Data Analyst’s Journey');
    expect(root.textContent).toContain('Joel Ruod');
    expect(root.querySelectorAll('[data-poc-guide-step]').length).toBe(10);
    const external = root.querySelector('a[href^="https://daaif.test"]') as HTMLAnchorElement | null;
    expect(external?.rel).toContain('noopener');
    const screenshotButton = root.querySelector('.poc-guide-screenshot-list button') as HTMLButtonElement;
    expect(screenshotButton.getAttribute('aria-label')).toContain('Screenshot vergrössern');

    screenshotButton.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const dialog = root.querySelector('.poc-guide-image-dialog') as HTMLDialogElement;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.querySelector('img')?.alt.length).toBeGreaterThan(30);

    (dialog.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(screenshotButton);
    expect(root.querySelector('a[href="/poc-simulation"]')).not.toBeNull();
  });

  it('explains why DAAIF actions are unavailable when no public URL is configured', async () => {
    const fixture = await render('data-analysts-journey', '');
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelectorAll('.poc-guide-external-unavailable').length).toBe(2);
    expect(root.textContent).toContain('DAAIF-Link ist in dieser Umgebung nicht konfiguriert.');
    expect(root.querySelector('a[href*="data-analysts-journey-cantonal-business-tax"]')).toBeNull();
  });

  it('shows a stable not-found state for unknown journey IDs', async () => {
    const fixture = await render('does-not-exist');

    expect((fixture.nativeElement as HTMLElement).querySelector('[data-poc-guide-not-found]')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Journey nicht gefunden');
  });
});
