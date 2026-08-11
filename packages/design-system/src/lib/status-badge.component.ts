import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type DidacaStatusTone = 'green' | 'blue' | 'orange' | 'red' | 'neutral';

@Component({
  selector: 'didaca-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'hostClass()' },
  template: `<span class="didaca-status-dot" aria-hidden="true"></span><ng-content />`,
})
export class StatusBadgeComponent {
  readonly tone = input<DidacaStatusTone>('neutral');
  readonly hostClass = computed(() => `didaca-status-badge is-${this.tone()}`);
}

