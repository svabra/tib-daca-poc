import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DacaReleaseHistoryComponent } from '../../../../../../packages/design-system/src/lib/release-history.component';
import { UserPreferencesService } from '../../core/user-preferences.service';

@Component({
  standalone: true,
  imports: [DacaReleaseHistoryComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<daca-release-history scope="catalog" [locale]="preferences.language() === 'de' ? 'de' : 'en'" />`,
})
export class FeatureListPageComponent {
  readonly preferences = inject(UserPreferencesService);
}
