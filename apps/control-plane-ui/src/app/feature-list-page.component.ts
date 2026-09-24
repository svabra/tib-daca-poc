import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DacaReleaseHistoryComponent } from '../../../../packages/design-system/src/lib/release-history.component';

@Component({
  standalone: true,
  imports: [DacaReleaseHistoryComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<daca-release-history scope="control-plane" locale="en" />`,
})
export class FeatureListPageComponent {}
