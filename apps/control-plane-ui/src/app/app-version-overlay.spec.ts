import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DacaAppUpdateService } from '../../../../packages/design-system/src/lib/app-update.service';
import { FederalShellComponent } from '../../../../packages/design-system/src/lib/federal-shell.component';
import { DACA_VERSION } from '../../../../packages/design-system/src/lib/version';

describe('Control-plane runtime version overlay', () => {
  it('shows only the latest release and links to the searchable history', async () => {
    await TestBed.configureTestingModule({ imports: [FederalShellComponent], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(FederalShellComponent);
    fixture.componentRef.setInput('appTitle', 'BIT DaCa Control Plane');
    fixture.componentRef.setInput('navigation', []);
    fixture.componentRef.setInput('versionProductName', 'DaCa Control Plane');
    fixture.componentRef.setInput('versionFeatureScope', 'control-plane');
    fixture.detectChanges();
    const overlay = fixture.nativeElement.querySelector('.daca-version-overlay') as HTMLElement;
    expect(overlay.textContent).toContain(`V${DACA_VERSION}`);
    expect(overlay.textContent).toContain('Version is current');
    expect(overlay.textContent).toContain('Co-Designed by V, armasuisse, ESTV und BIT');
    expect(fixture.nativeElement.querySelector('.daca-header-settings')?.getAttribute('href')).toBe('/settings');
    (overlay.querySelector('.daca-version-feature-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('.daca-feature-dialog') as HTMLDialogElement;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.textContent).toContain(`V${DACA_VERSION}`);
    expect(dialog.textContent).toContain('Find improvements faster');
    expect(dialog.textContent).not.toContain('Monitor catalogs');
    expect(dialog.querySelector('a')?.getAttribute('href')).toBe('/settings/features');
  });

  it('renders a blocking, accessible update screen with a build-safe version transition', async () => {
    const update = {
      updateReady: signal(false),
      updating: signal(true),
      targetVersion: signal<string | null>('0.1.12'),
      currentVersion: '0.1.11',
      reloadToLatest: vi.fn(),
    } as unknown as DacaAppUpdateService;
    await TestBed.configureTestingModule({
      imports: [FederalShellComponent],
      providers: [
        provideRouter([]),
        { provide: DacaAppUpdateService, useValue: update },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(FederalShellComponent);
    fixture.componentRef.setInput('appTitle', 'BIT DaCa Control Plane');
    fixture.componentRef.setInput('navigation', []);
    fixture.componentRef.setInput('versionProductName', 'DaCa Control Plane');
    fixture.detectChanges();
    await fixture.whenStable();

    const overlay = fixture.nativeElement.querySelector('[data-testid="app-update-overlay"]') as HTMLDialogElement;
    expect(overlay.hasAttribute('open')).toBe(true);
    expect(overlay.getAttribute('aria-labelledby')).toBe('daca-app-update-title');
    expect(overlay.querySelector('[role="status"]')?.getAttribute('aria-busy')).toBe('true');
    expect(overlay.textContent).toContain('Updating Version...');
    expect(overlay.textContent).toContain('DaCa Control Plane · V0.1.11 → V0.1.12');
    expect(overlay.textContent).toContain('The new DaCa version is loading.');
    expect(fixture.nativeElement.querySelector('[data-testid="app-update-reload"]')).toBeNull();
  });

  it('opens the ready update decision automatically in the control plane', async () => {
    const update = {
      updateReady: signal(true),
      updating: signal(false),
      targetVersion: signal<string | null>('0.1.12'),
      currentVersion: '0.1.11',
      reloadToLatest: vi.fn(),
    } as unknown as DacaAppUpdateService;
    await TestBed.configureTestingModule({
      imports: [FederalShellComponent],
      providers: [provideRouter([]), { provide: DacaAppUpdateService, useValue: update }],
    }).compileComponents();

    const fixture = TestBed.createComponent(FederalShellComponent);
    fixture.componentRef.setInput('appTitle', 'BIT DaCa Control Plane');
    fixture.componentRef.setInput('navigation', []);
    fixture.componentRef.setInput('versionProductName', 'DaCa Control Plane');
    fixture.componentRef.setInput('versionFeatureScope', 'control-plane');
    fixture.detectChanges();
    await fixture.whenStable();

    const dialog = fixture.nativeElement.querySelector('[data-testid="app-update-confirmation"]') as HTMLDialogElement;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.textContent).toContain('DaCa Control Plane · V0.1.11 → V0.1.12');
    expect(dialog.textContent).toContain('Unsaved page content will be lost');
    expect(dialog.querySelector('a')?.getAttribute('href')).toBe('/settings/features');
    expect(dialog.textContent).toContain('Update later');
    expect(dialog.textContent).toContain('Apply update');
  });

  it('uses safe labels for missing metadata and same-version build updates', async () => {
    const targetVersion = signal<string | null>(null);
    const update = {
      updateReady: signal(false),
      updating: signal(true),
      targetVersion,
      currentVersion: '0.1.12',
      reloadToLatest: vi.fn(),
    } as unknown as DacaAppUpdateService;
    await TestBed.configureTestingModule({
      imports: [FederalShellComponent],
      providers: [provideRouter([]), { provide: DacaAppUpdateService, useValue: update }],
    }).compileComponents();
    const fixture = TestBed.createComponent(FederalShellComponent);
    fixture.componentRef.setInput('appTitle', 'BIT DaCa Control Plane');
    fixture.componentRef.setInput('navigation', []);
    fixture.componentRef.setInput('versionProductName', 'DaCa Control Plane');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('V0.1.12 → new version');

    targetVersion.set('0.1.12');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('V0.1.12 → V0.1.12 · new build');
  });
});
