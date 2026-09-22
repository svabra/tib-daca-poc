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
import { DemoIdentityService } from '../../core/demo-identity.service';

describe('PoC guide contract', () => {
  it('defines ten complete, uniquely addressable journeys and twenty-nine screenshot contracts', () => {
    expect(POC_JOURNEYS.map((journey) => journey.id)).toEqual([
      'understand-and-use-product',
      'data-analysts-journey',
      'consumer-access-request',
      'metadata-quality',
      'governance-exception',
      'change-history',
      'access-renewal',
      'domain-governance',
      'glossary-governance',
      'create-data-model',
    ]);
    expect(POC_JOURNEYS.map((journey) => journey.number)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']);
    expect(POC_JOURNEYS[1].verification?.label).toBe('Durchgängig verifiziert');
    expect(new Set(POC_JOURNEYS.map((journey) => journey.id)).size).toBe(10);
    const screenshots = POC_JOURNEYS.flatMap((journey) => journey.steps.flatMap((step) => step.screenshots ?? []));
    expect(screenshots.length).toBe(29);
    expect(screenshots.slice(0, 4).map((screenshot) => screenshot.src)).toEqual([
      '/assets/poc-guide/journey-01-product-search.webp',
      '/assets/poc-guide/journey-01-data-dictionary.webp',
      '/assets/poc-guide/journey-01-service-level.webp',
      '/assets/poc-guide/journey-01-endpoint-quickstart.webp',
    ]);
    expect(screenshots.slice(-3).map((screenshot) => screenshot.src)).toEqual([
      '/assets/poc-guide/journey-08-semantic-suggestions.webp',
      '/assets/poc-guide/journey-08-domain-register.webp',
      '/assets/poc-guide/journey-09-glossary-review.webp',
    ]);
    const consumerActions = POC_JOURNEYS[0].steps.flatMap((step) => step.actions ?? []);
    expect(consumerActions).toContainEqual(expect.objectContaining({
      path: '/products/3a2930ed-3eee-599b-82b5-e138b149d1a2/sla',
      demoUserId: 'beat.stalder',
    }));
    expect(consumerActions).toContainEqual(expect.objectContaining({
      path: '/products/3a2930ed-3eee-599b-82b5-e138b149d1a2/usage',
      fragment: 'data-dictionary',
      demoUserId: 'beat.stalder',
    }));
    expect(consumerActions).toContainEqual(expect.objectContaining({
      path: '/products/3a2930ed-3eee-599b-82b5-e138b149d1a2/usage',
      fragment: 'endpoint-quickstart',
      demoUserId: 'beat.stalder',
    }));
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
    expect(POC_GUIDE_CAPABILITIES.map((item) => item.title)).toContain('Auslaufende Freigaben rechtzeitig verlängern');
    expect(POC_GUIDE_LIMITS.every((item) => item.status === 'out-of-scope')).toBe(true);
    expect(POC_GUIDE_LIMITS.map((item) => item.title)).toContain('Keine Rezertifizierungskampagnen');
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
    const journeyCards = root.querySelectorAll('[data-poc-guide-journey]');
    expect(journeyCards.length).toBe(10);
    expect(journeyCards.item(0).getAttribute('data-poc-guide-journey')).toBe('understand-and-use-product');
    expect(journeyCards.item(9).getAttribute('data-poc-guide-journey')).toBe('create-data-model');
    expect(journeyCards.item(8).textContent).toContain('Glossarterm gemeinsam prüfen');
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
    expect(service.externalHref('daaif-source-explorer')).toBe('https://daaif.example.test/base/catalog/sources/bit-shared-pg/explorer');
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
          : target === 'daaif-loader' ? `${daaifUiUrl}/loader-workbench`
            : target === 'daaif-source-explorer' ? `${daaifUiUrl}/catalog/sources/bit-shared-pg/explorer` : null;
      },
    };
    const identity = { select: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [PocGuideDetailComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(paramMap), snapshot: { paramMap } } },
        { provide: PocGuideConfigService, useValue: guideConfig },
        { provide: DemoIdentityService, useValue: identity },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PocGuideDetailComponent);
    fixture.detectChanges();
    return { fixture, identity };
  }

  it('renders roles, checkpoints, safe external links and accessible screenshots', async () => {
    const { fixture } = await render('data-analysts-journey');
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('h1')?.textContent).toContain('A Data Analyst’s Journey');
    expect(root.textContent).toContain('Joel Ruod');
    expect(root.querySelectorAll('[data-poc-guide-step]').length).toBe(11);
    const external = root.querySelector('a[href^="https://daaif.test"]') as HTMLAnchorElement | null;
    expect(external?.rel).toContain('noopener');
    expect(root.querySelector('a[href="https://daaif.test/catalog/sources/bit-shared-pg/explorer"]')).not.toBeNull();
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
    const { fixture } = await render('data-analysts-journey', '');
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelectorAll('.poc-guide-external-unavailable').length).toBe(3);
    expect(root.textContent).toContain('DAAIF-Link ist in dieser Umgebung nicht konfiguriert.');
    expect(root.querySelector('a[href*="data-analysts-journey-cantonal-business-tax"]')).toBeNull();
  });

  it('renders the read-only consumer journey with prefilled search and anchored usage actions', async () => {
    const { fixture, identity } = await render('understand-and-use-product');
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('h1')?.textContent).toContain('Datenprodukt finden, verstehen und nutzen');
    expect(root.textContent).toContain('Beat Stalder');
    expect(root.textContent).toContain('Joel Ruod');
    expect(root.textContent).toContain('vollständig read-only');
    expect(root.querySelectorAll('[data-poc-guide-step]').length).toBe(7);
    expect(root.querySelectorAll('.poc-guide-screenshot-list button').length).toBe(4);

    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('.poc-guide-actions a'));
    expect(links.some((link) => {
      const url = new URL(link.href);
      return url.pathname === '/search'
        && url.searchParams.get('q') === 'Gewerbesteuer'
        && url.searchParams.get('demoUser') === 'beat.stalder';
    })).toBe(true);
    expect(links.some((link) => {
      const url = new URL(link.href);
      return url.pathname.endsWith('/overview') && url.searchParams.get('demoUser') === 'beat.stalder';
    })).toBe(true);
    expect(links.some((link) => link.hash === '#data-dictionary')).toBe(true);
    expect(links.some((link) => link.pathname.endsWith('/sla'))).toBe(true);
    expect(links.some((link) => link.hash === '#endpoint-quickstart')).toBe(true);

    const searchAction = POC_JOURNEYS[0].steps[0].actions?.[0];
    expect(searchAction).toBeDefined();
    expect(fixture.componentInstance.internalQueryParams(searchAction!)).toEqual({
      q: 'Gewerbesteuer',
      demoUser: 'beat.stalder',
    });
    fixture.componentInstance.selectDemoUser(searchAction!);
    expect(identity.select).toHaveBeenCalledWith('beat.stalder');
  });

  it('renders the read-only change-history journey for owner, approver and consumer', async () => {
    const { fixture, identity } = await render('change-history');
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('h1')?.textContent).toContain('Änderungen und Freigaben nachvollziehen');
    expect(root.textContent).toContain('Joel Ruod');
    expect(root.textContent).toContain('Thomas Kriegli');
    expect(root.textContent).toContain('Beat Stalder');
    expect(root.textContent).toContain('vollständig read-only');
    expect(root.querySelectorAll('[data-poc-guide-step]').length).toBe(7);
    expect(root.querySelectorAll('.poc-guide-screenshot-list button').length).toBe(3);
    expect(root.querySelector('a[href*="/history?demoUser=joel.ruod"]')).not.toBeNull();
    expect(root.querySelector('a[href*="/history?demoUser=beat.stalder"]')).not.toBeNull();
    expect(root.textContent).toContain('Lineage erklärt Quelle und Verarbeitung');

    fixture.componentInstance.selectDemoUser({
      label: 'Änderungsverlauf als Beat öffnen',
      target: 'internal',
      demoUserId: 'beat.stalder',
    });
    expect(identity.select).toHaveBeenCalledWith('beat.stalder');
  });

  it('renders the access-renewal journey with stable entry routes and dynamic-ID hand-offs', async () => {
    const { fixture, identity } = await render('access-renewal');
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('h1')?.textContent).toContain('Zugriff vor Ablauf verlängern');
    expect(root.textContent).toContain('Beat Stalder');
    expect(root.textContent).toContain('Kassandra Valdata');
    expect(root.textContent).toContain('Thomas Kriegli');
    expect(root.textContent).toContain('14 verbleibende Tage');
    expect(root.textContent).toContain('OPA und PostgreSQL');
    expect(root.textContent).toContain('200');
    expect(root.textContent).toContain('403');
    expect(root.querySelectorAll('[data-poc-guide-step]').length).toBe(7);
    expect(root.querySelectorAll('.poc-guide-screenshot-list button').length).toBe(5);

    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('.poc-guide-actions a'));
    expect(links.some((link) => {
      const url = new URL(link.href);
      return url.pathname === '/poc-simulation/access-renewal'
        && url.searchParams.get('demoUser') === 'kassandra.valdata';
    })).toBe(true);
    expect(links.some((link) => {
      const url = new URL(link.href);
      return url.pathname === '/products/11111111-1111-4111-8111-111111111111/usage'
        && url.searchParams.get('demoUser') === 'beat.stalder';
    })).toBe(true);
    expect(links.some((link) => {
      const url = new URL(link.href);
      return url.pathname === '/tasks'
        && url.searchParams.get('product') === '11111111-1111-4111-8111-111111111111'
        && url.searchParams.get('demoUser') === 'kassandra.valdata';
    })).toBe(true);
    expect(links.some((link) => {
      const url = new URL(link.href);
      return url.pathname === '/tasks'
        && url.searchParams.get('demoUser') === 'thomas.kriegli';
    })).toBe(true);
    expect(links.every((link) => !link.pathname.includes('/access-renewal/'))).toBe(true);

    const thomasAction = POC_JOURNEYS[6].steps[4].actions?.[0];
    expect(thomasAction).toBeDefined();
    fixture.componentInstance.selectDemoUser(thomasAction!);
    expect(identity.select).toHaveBeenCalledWith('thomas.kriegli');
  });

  it('shows a stable not-found state for unknown journey IDs', async () => {
    const { fixture } = await render('does-not-exist');

    expect((fixture.nativeElement as HTMLElement).querySelector('[data-poc-guide-not-found]')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Journey nicht gefunden');
  });
});
