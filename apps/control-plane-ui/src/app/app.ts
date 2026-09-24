import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DacaNavigationItem, FederalShellComponent } from '@bit-daca/design-system';

@Component({
  selector: 'daca-control-root',
  standalone: true,
  imports: [FederalShellComponent, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <daca-federal-shell appTitle="BIT DaCa Control Plane" versionProductName="DaCa Control Plane" versionFeatureScope="control-plane" [navigation]="navigation">
      <router-outlet />
    </daca-federal-shell>
  `,
})
export class App {
  readonly navigation: readonly DacaNavigationItem[] = [
    { label: 'Central catalog status', path: '/federation' },
    { label: 'Catalog records', path: '/instances' },
    { label: 'PoC trust records', path: '/trust' },
    { label: 'PoC sync records', path: '/sync' },
  ];
}
