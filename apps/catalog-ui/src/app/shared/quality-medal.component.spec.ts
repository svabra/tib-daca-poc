import { TestBed } from '@angular/core/testing';
import { QualityMedalComponent, QualityMedalLevel } from './quality-medal.component';

describe('QualityMedalComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [QualityMedalComponent] }).compileComponents();
  });

  it.each([
    ['bronze', 'Bronze'],
    ['silver', 'Silber'],
    ['gold', 'Gold'],
    ['platinum', 'Platinum'],
  ] as const)('renders the %s quality level as text and a semantic class', (medal, label) => {
    const fixture = TestBed.createComponent(QualityMedalComponent);
    fixture.componentRef.setInput('medal', medal satisfies QualityMedalLevel);
    fixture.componentRef.setInput('score', 4);
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('.product-quality-medal') as HTMLElement;
    expect(badge.textContent?.trim()).toBe(`${label} · 4/6`);
    expect(badge.classList.contains(`is-${medal}`)).toBe(true);
    expect(badge.getAttribute('aria-label')).toBe(`Qualitätsmedaille ${label}, 4 von 6 Kriterien erfüllt`);
  });

  it('renders the canonical legacy fallback as Bronze with zero fulfilled criteria', () => {
    const fixture = TestBed.createComponent(QualityMedalComponent);
    fixture.componentRef.setInput('medal', 'bronze');
    fixture.componentRef.setInput('score', 0);
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('.product-quality-medal') as HTMLElement;
    expect(badge.textContent?.trim()).toBe('Bronze · 0/6');
    expect(badge.getAttribute('aria-label')).toBe('Qualitätsmedaille Bronze, 0 von 6 Kriterien erfüllt');
  });
});
