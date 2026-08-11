import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DidacaNavigationItem, FederalShellComponent } from '@bit-didaca/design-system';

@Component({
  selector: 'didaca-control-root',
  standalone: true,
  imports: [FederalShellComponent, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <didaca-federal-shell appTitle="BIT DiDaCa Control Plane" [navigation]="navigation">
      <router-outlet />
    </didaca-federal-shell>
  `,
})
export class App {
  readonly navigation: readonly DidacaNavigationItem[] = [
    { label: 'Security & federation', path: '/federation' },
    { label: 'Catalog instances', path: '/instances' },
    { label: 'Directed trust', path: '/trust' },
    { label: 'Sync intent', path: '/sync' },
  ];
}
