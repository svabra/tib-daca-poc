import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DataProduct } from '../core/catalog.models';

export type QualityMedalLevel = NonNullable<DataProduct['qualityMedal']>;

const QUALITY_MEDAL_LABELS: Record<QualityMedalLevel, string> = {
  bronze: 'Bronze',
  silver: 'Silber',
  gold: 'Gold',
  platinum: 'Platinum',
};

@Component({
  selector: 'daca-quality-medal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'product-quality-medal-host' },
  template: `
    <span
      class="product-quality-medal"
      [class]="'product-quality-medal is-' + medal()"
      [attr.aria-label]="accessibleLabel()"
      [attr.title]="accessibleLabel()"
    >{{ visibleLabel() }}</span>
  `,
})
export class QualityMedalComponent {
  readonly medal = input.required<QualityMedalLevel>();
  readonly score = input.required<number>();

  readonly visibleLabel = computed(() => {
    const label = QUALITY_MEDAL_LABELS[this.medal()];
    return `${label} · ${this.score()}/6`;
  });

  readonly accessibleLabel = computed(() => {
    const label = QUALITY_MEDAL_LABELS[this.medal()];
    return `Qualitätsmedaille ${label}, ${this.score()} von 6 Kriterien erfüllt`;
  });
}
