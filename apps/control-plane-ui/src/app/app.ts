import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DacaNavigationItem, FederalShellComponent } from '@bit-daca/design-system';

@Component({
  selector: 'daca-control-root',
  standalone: true,
  imports: [FederalShellComponent, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <daca-federal-shell appTitle="BIT DaCa Control Plane" [navigation]="navigation">
      <router-outlet />
    </daca-federal-shell>
  `,
})
export class App {
  readonly navigation: readonly DacaNavigationItem[] = [
    { label: 'Security & federation', path: '/federation' },
    { label: 'Catalog instances', path: '/instances' },
    { label: 'Directed trust', path: '/trust' },
    { label: 'Sync intent', path: '/sync' },
  ];
}
