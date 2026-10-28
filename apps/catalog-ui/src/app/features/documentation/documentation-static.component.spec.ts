import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DocumentationApiService } from '../../core/documentation-api.service';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { DocumentationStaticComponent } from './documentation-static.component';

describe('DocumentationStaticComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('searches role descriptions and the full source matrix, supports no results and reset',async()=>{
    TestBed.configureTestingModule({imports:[DocumentationStaticComponent],providers:[provideRouter([]),{provide:UserPreferencesService,useValue:{language:signal('de')}},{provide:DocumentationApiService,useValue:{}}]});
    const fixture=TestBed.createComponent(DocumentationStaticComponent);fixture.detectChanges();await fixture.whenStable();
    const root=fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('daca-governance-information tbody tr')).toHaveLength(19);
    expect(root.querySelector('#rollen-zustaendigkeiten')?.textContent).toContain('Amt Local Data Steward');
    expect(root.querySelector('#rollen-zustaendigkeiten')?.textContent).not.toMatch(/\b(?:VBS|SLDS)\b/);
    fixture.componentInstance.query.set('DATENDOMANEN');fixture.detectChanges();await fixture.whenStable();
    expect([...root.querySelectorAll<HTMLElement>('.documentation-articles>article')].filter(article=>!article.hidden).map(article=>article.id)).toEqual(['rollen-zustaendigkeiten']);
    fixture.componentInstance.query.set('Unauffindbarer Suchtext');fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(root.textContent).toContain('Keine passenden Beiträge');expect(fixture.componentInstance.visibleArticleCount()).toBe(0);
    fixture.componentInstance.query.set('');fixture.detectChanges();await fixture.whenStable();expect(fixture.componentInstance.visibleArticleCount()).toBe(5);
  });

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
