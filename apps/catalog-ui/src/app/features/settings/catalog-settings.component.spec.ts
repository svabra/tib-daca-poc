import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { CatalogSettingsComponent } from './catalog-settings.component';

describe('CatalogSettingsComponent', () => {
  const language = signal<'de' | 'fr' | 'it' | 'en'>('de');
  const theme = signal<'light' | 'dark'>('light');
  const requestLanguage = vi.fn();
  const requestTheme = vi.fn();

  function create(section: 'language' | 'appearance' | 'features' | 'responsibilities' | 'role-changes') {
    TestBed.configureTestingModule({
      imports: [CatalogSettingsComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: { settingsSection: section } } } },
        { provide: UserPreferencesService, useValue: { language, theme, requestLanguage, requestTheme } },
      ],
    });
    const fixture = TestBed.createComponent(CatalogSettingsComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => { language.set('de'); theme.set('light'); vi.clearAllMocks(); });
  afterEach(() => TestBed.resetTestingModule());

  it('shows the settings links without tenant settings and changes the personal language', () => {
    const fixture = create('language');
    const root = fixture.nativeElement as HTMLElement;
    const links = [...root.querySelectorAll<HTMLAnchorElement>('.settings-navigation a')];
    expect(links.map((link) => [link.textContent?.trim(), link.getAttribute('href')])).toEqual([
      ['Spracheinstellungen', '/settings/language-personal'],
      ['Erscheinungsbild', '/settings/appearance'],
      ['Featureliste', '/settings/features'],
      ['Rollen und Zuständigkeiten', '/settings/responsibilities'],
      ['Rollenprotokoll', '/settings/role-changes'],
    ]);
    expect(root.textContent).not.toContain('Mandant');
    const select = root.querySelector<HTMLSelectElement>('.settings-language-field select')!;
    select.value = 'fr'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(requestLanguage).toHaveBeenCalledWith('fr');
  });

  it('offers light and dark mode through the existing preference confirmation', () => {
    const fixture = create('appearance');
    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.settings-theme-choice button')];
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    buttons[1].click();
    expect(requestTheme).toHaveBeenCalledWith('dark');
  });

  it('embeds the feature list below the shared settings navigation', () => {
    const fixture = create('features');
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('daca-release-history')).not.toBeNull();
    expect(root.textContent).toContain('Neue Features und Verbesserungen');
    expect(root.querySelector('.settings-navigation a[href="/settings/features"]')).not.toBeNull();
  });
});
