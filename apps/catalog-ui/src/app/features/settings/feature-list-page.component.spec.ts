import { TestBed } from '@angular/core/testing';
import { DacaReleaseHistoryComponent } from '../../../../../../packages/design-system/src/lib/release-history.component';
import { DACA_VERSION } from '../../../../../../packages/design-system/src/lib/version';
import { dacaReleaseHistory } from '../../../../../../packages/design-system/src/lib/release-history';

describe('DaCa release history', () => {
  it('shows tagged releases and filters by feature or tag', async () => {
    await TestBed.configureTestingModule({ imports: [DacaReleaseHistoryComponent] }).compileComponents();
    const fixture = TestBed.createComponent(DacaReleaseHistoryComponent);
    fixture.componentRef.setInput('locale', 'de');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(`V${DACA_VERSION}`);
    expect(fixture.nativeElement.textContent).toContain('V0.1.1');
    expect(dacaReleaseHistory('catalog', 'de').every((release) => release.features.every((feature) => feature.tags.length > 0))).toBe(true);
    const search = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    search.value = 'Datenmodelle';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Mit einer vorhandenen Tabelle starten');
    expect(fixture.nativeElement.textContent).not.toContain('Verbesserungen schneller finden');
    search.value = 'nicht vorhanden';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Keine passenden Änderungen gefunden');
  });
});
