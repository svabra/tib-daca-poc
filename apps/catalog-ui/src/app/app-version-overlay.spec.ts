import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DacaAppUpdateService } from '../../../../packages/design-system/src/lib/app-update.service';
import { FederalShellComponent } from '../../../../packages/design-system/src/lib/federal-shell.component';
import { DACA_VERSION } from '../../../../packages/design-system/src/lib/version';

describe('Catalog runtime version overlay', () => {
  it('shows only the latest release and links to the searchable history', async () => {
    await TestBed.configureTestingModule({ imports: [FederalShellComponent], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(FederalShellComponent);
    fixture.componentRef.setInput('appTitle', 'Data Catalog');
    fixture.componentRef.setInput('navigation', []);
    fixture.componentRef.setInput('locale', 'de');
    fixture.componentRef.setInput('versionProductName', 'DaCa Catalog');
    fixture.detectChanges();
    const overlay = fixture.nativeElement.querySelector('.daca-version-overlay') as HTMLElement;
    expect(overlay.textContent).toContain(`V${DACA_VERSION}`);
    expect(overlay.textContent).toContain('Version ist aktuell');
    expect(overlay.textContent).toContain('Co-Designed by V, armasuisse, ESTV und BIT');
    expect(overlay.querySelector('.daca-version-overlay-credit')?.nextElementSibling?.classList.contains('daca-version-overlay-status')).toBe(true);
    const settingsIcon = fixture.nativeElement.querySelector('.daca-header-settings') as HTMLAnchorElement;
    const themeIcon = fixture.nativeElement.querySelector('.daca-header-theme') as HTMLButtonElement;
    expect(settingsIcon.getAttribute('href')).toBe('/settings');
    expect(settingsIcon.querySelector('.daca-header-icon-tooltip')?.textContent).toBe('Einstellungen öffnen');
    expect(themeIcon.querySelector('.daca-header-icon-tooltip')?.textContent).toBe('Dunklen Modus einschalten');
    (overlay.querySelector('.daca-version-feature-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('.daca-feature-dialog') as HTMLDialogElement;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.textContent).toContain(`V${DACA_VERSION}`);
    expect(dialog.textContent).toContain('Verbesserungen schneller finden');
    expect(dialog.textContent).not.toContain('Datenprodukte leichter finden');
    expect(dialog.querySelector('a')?.getAttribute('href')).toBe('/settings/features');
  });

  it('offers a ready update with a safe confirmation before reloading', async () => {
    const reloadToLatest = vi.fn();
    const update = {
      updateReady: signal(true),
      updating: signal(false),
      targetVersion: signal<string | null>('0.1.12'),
      currentVersion: '0.1.11',
      reloadToLatest,
    } as unknown as DacaAppUpdateService;
    await TestBed.configureTestingModule({
      imports: [FederalShellComponent],
      providers: [
        provideRouter([]),
        { provide: DacaAppUpdateService, useValue: update },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(FederalShellComponent);
    fixture.componentRef.setInput('appTitle', 'Data Catalog');
    fixture.componentRef.setInput('navigation', []);
    fixture.componentRef.setInput('locale', 'de');
    fixture.componentRef.setInput('versionProductName', 'DaCa Catalog');
    fixture.detectChanges();

    const reload = fixture.nativeElement.querySelector('[data-testid="app-update-reload"]') as HTMLButtonElement;
    expect(reload.getAttribute('aria-label')).toBe('Neue DaCa-Version V0.1.12 laden');
    await fixture.whenStable();

    const confirmation = fixture.nativeElement.querySelector('[data-testid="app-update-confirmation"]') as HTMLDialogElement;
    expect(confirmation.hasAttribute('open')).toBe(true);
    expect(confirmation.textContent).toContain('DaCa Catalog · V0.1.11 → V0.1.12');
    expect(confirmation.textContent).toContain('Ungespeicherte Seiteninhalte gehen beim Update verloren');
    expect(confirmation.querySelector('a')?.getAttribute('href')).toBe('/settings/features');
    expect(confirmation.querySelector('button[autofocus]')?.textContent?.trim()).toBe('Update später durchführen');

    const notes = confirmation.querySelector('[data-testid="app-update-notes-toggle"]') as HTMLButtonElement;
    notes.click();
    fixture.detectChanges();
    expect(confirmation.textContent).toContain('Neue Versionen leichter übernehmen');

    const confirm = [...confirmation.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Update durchführen') as HTMLButtonElement;
    confirm.click();
    expect(reloadToLatest).toHaveBeenCalledTimes(1);
  });

  it('opens only once per ready build and keeps a manual retry after later', async () => {
    const ready = signal(true);
    const state = signal({ phase: 'ready', latestHash: 'first-build', targetVersion: null });
    const update = {
      updateReady: ready,
      updating: signal(false),
      targetVersion: signal<string | null>(null),
      state,
      currentVersion: '0.1.11',
      reloadToLatest: vi.fn(),
    } as unknown as DacaAppUpdateService;
    await TestBed.configureTestingModule({ imports: [FederalShellComponent], providers: [provideRouter([]), { provide: DacaAppUpdateService, useValue: update }] }).compileComponents();
    const fixture = TestBed.createComponent(FederalShellComponent);
    fixture.componentRef.setInput('appTitle', 'Data Catalog');
    fixture.componentRef.setInput('navigation', []);
    fixture.componentRef.setInput('locale', 'de');
    fixture.detectChanges();
    await fixture.whenStable();

    const dialog = fixture.nativeElement.querySelector('[data-testid="app-update-confirmation"]') as HTMLDialogElement;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.textContent).toContain('V0.1.11 → neue Version');
    expect(dialog.querySelector('[data-testid="app-update-notes-toggle"]')).toBeNull();
    const later = [...dialog.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Update später durchführen') as HTMLButtonElement;
    later.click();
    expect(dialog.hasAttribute('open')).toBe(false);

    ready.set(false);
    fixture.detectChanges();
    ready.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(dialog.hasAttribute('open')).toBe(false);
    (fixture.nativeElement.querySelector('[data-testid="app-update-reload"]') as HTMLButtonElement).click();
    expect(dialog.hasAttribute('open')).toBe(true);
    later.click();

    state.set({ phase: 'ready', latestHash: 'second-build', targetVersion: null });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(dialog.hasAttribute('open')).toBe(true);
  });
});
