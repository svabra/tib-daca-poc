import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { catalogCopy } from '../../core/catalog-localization';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { PipelineCopy } from './documentation-pipeline';

/** Shared navigation for every timed documentation use case. */
@Component({
  selector: 'ol[daca-animation-stations]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@for (step of steps(); track $index; let index = $index) {
    <li><button type="button" [attr.aria-current]="active() === index ? 'step' : null"
      [attr.aria-controls]="controls()" (click)="stepSelected.emit(index)">
      <b>{{ index + 1 < 10 ? '0' : '' }}{{ index + 1 }}</b>
      <span><strong>{{ tr(step.title) }}</strong><small>{{ seconds(times()[index]) }}–{{ seconds(times()[index + 1] ?? duration()) }} s</small></span>
    </button></li>
  }`,
  styleUrl: './documentation-animation-stations.component.css',
  host: {
    class: 'animation-stations',
    '[style.--station-columns]': 'steps().length',
    '[attr.aria-label]': "tr(['Stationen', 'Étapes', 'Stazioni', 'Stations'])",
  },
})
export class DocumentationAnimationStationsComponent {
  readonly steps = input.required<readonly { title: PipelineCopy }[]>();
  readonly times = input.required<readonly number[]>();
  readonly duration = input.required<number>();
  readonly active = input.required<number>();
  readonly controls = input.required<string>();
  readonly stepSelected = output<number>();
  private readonly preferences = inject(UserPreferencesService);
  private readonly formatter = computed(() => new Intl.NumberFormat(this.preferences.language(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  seconds(time: number): string { return this.formatter().format(time); }
  tr(copy: PipelineCopy): string { return catalogCopy(copy, this.preferences.language()); }
}
