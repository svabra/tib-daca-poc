import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DocumentationApiService } from '../../core/documentation-api.service';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { DocumentationStaticComponent } from './documentation-static.component';

describe('DocumentationStaticComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('describes DaCa as the central catalog in every supported language', () => {
    const language = signal<'de' | 'fr' | 'it' | 'en'>('de');
    TestBed.configureTestingModule({
      imports: [DocumentationStaticComponent],
      providers: [
        provideRouter([]),
        { provide: UserPreferencesService, useValue: { language } },
        { provide: DocumentationApiService, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(DocumentationStaticComponent);
    for (const [locale, phrase] of [
      ['de', 'der zentrale Datenkatalog'],
      ['fr', 'catalogue de données central'],
      ['it', 'catalogo dati centrale'],
      ['en', 'the central data catalog'],
    ] as const) {
      language.set(locale);
      fixture.detectChanges();
      const description = (fixture.nativeElement as HTMLElement)
        .querySelector('.documentation-articles article p:not(.daca-eyebrow)')?.textContent ?? '';
      expect(description).toContain(phrase);
    }
  });
});
