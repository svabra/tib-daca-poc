import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DacaAppUpdateService } from '../../../../packages/design-system/src/lib/app-update.service';
import { FederalShellComponent } from '../../../../packages/design-system/src/lib/federal-shell.component';
import { DACA_VERSION } from '../../../../packages/design-system/src/lib/version';

describe('Control-plane runtime version overlay', () => {
  it('opens an English, plain-language feature list tied to the shared release', async () => {
    await TestBed.configureTestingModule({
      imports: [FederalShellComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(FederalShellComponent);
    fixture.componentRef.setInput('appTitle', 'BIT DaCa Control Plane');
    fixture.componentRef.setInput('navigation', []);
    fixture.componentRef.setInput('versionProductName', 'DaCa Control Plane');
    fixture.componentRef.setInput('versionFeatureScope', 'control-plane');
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('.daca-version-overlay') as HTMLElement | null;
    const trigger = fixture.nativeElement.querySelector('.daca-version-feature-trigger') as HTMLButtonElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute('aria-label')).toBe('DaCa application version');
    expect(overlay?.textContent).toContain('DaCa Control Plane');
    expect(overlay?.textContent).toContain(`V${DACA_VERSION}`);
    expect(trigger?.textContent?.trim()).toBe('View feature list');

    trigger?.click();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('.daca-feature-dialog') as HTMLDialogElement | null;
    const features = fixture.nativeElement.querySelectorAll('.daca-feature-list li');
    expect(dialog?.hasAttribute('open')).toBe(true);
    expect(dialog?.textContent).toContain(`Feature list · V${DACA_VERSION}`);
    expect(dialog?.textContent).toContain('What can DaCa Control Plane do?');
    expect(dialog?.textContent).toContain('Apply new versions without F5');
    expect(dialog?.textContent).toContain('Register catalogs');
    expect(dialog?.textContent).toContain('current PoC');
    expect(features.length).toBe(5);

    const cancelEvent = new Event('cancel', { cancelable: true });
    dialog?.dispatchEvent(cancelEvent);
    fixture.detectChanges();
    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(dialog?.hasAttribute('open')).toBe(false);
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
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
    expect(fixture.nativeElement.textContent).toContain('Build update for V0.1.12');
    expect(fixture.nativeElement.textContent).not.toContain('V0.1.12 → V0.1.12');
  });
});
