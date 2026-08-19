import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FederalShellComponent } from '../../../../packages/design-system/src/lib/federal-shell.component';
import { DACA_VERSION } from '../../../../packages/design-system/src/lib/version';

describe('Catalog runtime version overlay', () => {
  it('opens a German, plain-language feature list tied to the shared release', async () => {
    await TestBed.configureTestingModule({
      imports: [FederalShellComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(FederalShellComponent);
    fixture.componentRef.setInput('appTitle', 'Data Catalog');
    fixture.componentRef.setInput('navigation', []);
    fixture.componentRef.setInput('locale', 'de');
    fixture.componentRef.setInput('versionProductName', 'DaCa Catalog');
    fixture.componentRef.setInput('versionFeatureScope', 'catalog');
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('.daca-version-overlay') as HTMLElement | null;
    const trigger = fixture.nativeElement.querySelector('.daca-version-feature-trigger') as HTMLButtonElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute('aria-label')).toBe('DaCa-Anwendungsversion');
    expect(overlay?.textContent).toContain('DaCa Catalog');
    expect(overlay?.textContent).toContain(`V${DACA_VERSION}`);
    expect(trigger?.textContent?.trim()).toBe('Featureliste anzeigen');
    expect(trigger?.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');

    trigger?.click();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('.daca-feature-dialog') as HTMLDialogElement | null;
    const features = fixture.nativeElement.querySelectorAll('.daca-feature-list li');
    expect(dialog?.hasAttribute('open')).toBe(true);
    expect(dialog?.getAttribute('aria-labelledby')).toBe('daca-feature-list-title');
    expect(dialog?.getAttribute('aria-describedby')).toBe('daca-feature-list-introduction');
    expect(dialog?.textContent).toContain(`Featureliste · V${DACA_VERSION}`);
    expect(dialog?.textContent).toContain('Was kann DaCa Catalog?');
    expect(dialog?.textContent).toContain('Datenprodukte finden und verstehen');
    expect(dialog?.textContent).toContain('Änderungen nachvollziehen');
    expect(dialog?.textContent).toContain('PoC anhand geführter Journeys erleben');
    expect(dialog?.textContent).toContain('aktuellen PoC-Stand');
    expect(features.length).toBe(7);
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');

    const close = fixture.nativeElement.querySelector('.daca-feature-dialog-close') as HTMLButtonElement | null;
    expect(close?.getAttribute('aria-label')).toBe('Featureliste schliessen');
    close?.click();
    fixture.detectChanges();
    expect(dialog?.hasAttribute('open')).toBe(false);
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  });
});
