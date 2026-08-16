import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
    expect(dialog?.textContent).toContain('Register catalogs');
    expect(dialog?.textContent).toContain('current PoC');
    expect(features.length).toBe(4);

    const cancelEvent = new Event('cancel', { cancelable: true });
    dialog?.dispatchEvent(cancelEvent);
    fixture.detectChanges();
    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(dialog?.hasAttribute('open')).toBe(false);
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  });
});
