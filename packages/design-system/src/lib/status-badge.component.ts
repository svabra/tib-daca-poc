import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type DacaStatusTone = 'green' | 'blue' | 'orange' | 'red' | 'neutral';

@Component({
  selector: 'daca-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'hostClass()' },
  template: `<span class="daca-status-dot" aria-hidden="true"></span><ng-content />`,
})
export class StatusBadgeComponent {
  readonly tone = input<DacaStatusTone>('neutral');
  readonly hostClass = computed(() => `daca-status-badge is-${this.tone()}`);
}

