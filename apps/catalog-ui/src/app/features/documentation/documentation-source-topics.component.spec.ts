import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { catalogCopy } from '../../core/catalog-localization';
import { CatalogLanguage, UserPreferencesService } from '../../core/user-preferences.service';
import { DocumentationSourceTopicsComponent } from './documentation-source-topics.component';

describe('DocumentationSourceTopicsComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup(metadata = false) {
    const language = signal<CatalogLanguage>('de');
    TestBed.configureTestingModule({
      imports: [DocumentationSourceTopicsComponent],
      providers: [provideRouter([]), { provide: UserPreferencesService, useValue: { language } }],
    });
    TestBed.inject(ActivatedRoute).snapshot.data = metadata ? { topic: 'metadata' } : {};
    const fixture = TestBed.createComponent(DocumentationSourceTopicsComponent);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement, language };
  }

  it('offers exactly two named source topics with direct links and a pipeline return link', () => {
    const { root } = setup();
    const cards = [...root.querySelectorAll<HTMLAnchorElement>('.source-topic')];
    expect(cards).toHaveLength(2);
    expect(cards.map(card => card.querySelector('h2')?.textContent)).toEqual(['Meta Daten', 'Data Access Management']);
    expect(cards.map(card => card.getAttribute('href'))).toEqual([
      '/documentation/animated/data-sources/metadata',
      '/documentation/animated/data-consumers/access-management',
    ]);
    expect(root.querySelector('.back-link')?.getAttribute('href')).toBe('/documentation/animated');
    expect(root.querySelector('.source-sourcing-link')?.getAttribute('href')).toBe('/documentation/animated/data-sources/sourcing');
    expect(cards[0].textContent).toContain('Data Owner');
    expect(cards[1].textContent).toContain('Vor jedem Speicher schützt ein SDAL den Zugriff');
    expect(cards[1].textContent).toContain('passende, zugewiesene Zugriffsrichtlinie');
  });

  it('renders a static source-to-catalog metadata explanation when selected by route data', () => {
    const { root } = setup(true);
    expect(root.querySelector('h1')?.textContent).toBe('Meta Daten');
    expect(root.querySelectorAll('.source-topic')).toHaveLength(0);
    expect([...root.querySelectorAll('.metadata-flow h2')].map(node => node.textContent)).toEqual(['Quelle', 'Beschreibung', 'DaCa']);
    expect([...root.querySelectorAll('.metadata-fields dt')].map(node => node.textContent)).toEqual(['Name', 'Herkunft', 'Schema', 'Data Owner', 'Klassifikation', 'Schnittstellen']);
    expect(root.querySelector('.metadata-description')?.textContent).toContain('Die Daten bleiben in ihrer Quelle.');
    expect(root.querySelector('.metadata-access-note')?.textContent).toContain('Eine Beschreibung ist noch keine Freigabe.');
    expect(root.querySelector('.source-note')?.textContent).toContain('HTTP/REST oder PostgreSQL');
    expect([...root.querySelectorAll<HTMLAnchorElement>('.source-links a')].map(link => link.getAttribute('href'))).toEqual([
      '/documentation/animated/data-sources',
      '/documentation/animated/data-sources/sourcing',
      '/documentation/animated/data-consumers/access-management',
    ]);
  });

  it('localizes source topics while preserving the Data Owner role and the management title', () => {
    const { fixture, root, language } = setup();
    for (const locale of ['de', 'fr', 'it', 'en', 'rm'] as const) {
      language.set(locale);
      fixture.detectChanges();
      expect(root.querySelector('.source-topic h2')?.textContent).toBe(catalogCopy(['Meta Daten', 'Métadonnées', 'Metadati', 'Metadata'], locale));
      expect(root.querySelectorAll('.source-topic h2')[1].textContent).toBe('Data Access Management');
      expect(root.querySelector('.source-topic')?.textContent).toContain('Data Owner');
      expect(root.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe(catalogCopy(['Datenquellen', 'Sources de données', 'Fonti di dati', 'Data sources'], locale));
    }
  });

  it('keeps metadata labels localized and all navigation links named', () => {
    const { fixture, root, language } = setup(true);
    for (const locale of ['de', 'fr', 'it', 'en', 'rm'] as const) {
      language.set(locale);
      fixture.detectChanges();
      expect(root.querySelector('h1')?.textContent).toBe(catalogCopy(['Meta Daten', 'Métadonnées', 'Metadati', 'Metadata'], locale));
      expect(root.querySelectorAll('.metadata-fields dt')[3].textContent).toBe('Data Owner');
      expect(root.querySelectorAll('.metadata-flow li')).toHaveLength(3);
      expect([...root.querySelectorAll<HTMLAnchorElement>('a')].every(link => !!link.textContent?.trim() && !!link.getAttribute('href'))).toBe(true);
      expect([...root.querySelectorAll('svg')].every(icon => icon.getAttribute('aria-hidden') === 'true')).toBe(true);
    }
  });
});
