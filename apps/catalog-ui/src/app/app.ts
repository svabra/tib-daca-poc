import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DidacaNavigationItem, FederalShellComponent } from '@bit-didaca/design-system';
import { CatalogApiService } from './core/catalog-api.service';

@Component({
  selector: 'didaca-root',
  standalone: true,
  imports: [FederalShellComponent, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <didaca-federal-shell
      appTitle="Data Catalog"
      appSubtitle="Data Platform BIT"
      footerText="DaCa · Distributed Data Catalog · Proof of Concept. Teil der der Data Platform BIT. Im Co-Design erarbeitet mit der ESTV, V, BK, BFS und weiteren Ämtern."
      locale="de"
      userName="Kassandra Valdata"
      notificationHref="/#handlungsbedarf"
      [notificationCount]="notificationCount()"
      [subtitleBelow]="true"
      [navigation]="navigation"
    >
      <router-outlet />
    </didaca-federal-shell>
  `,
})
export class App {
  private readonly api = inject(CatalogApiService);
  readonly notificationCount = computed(() => this.api.ownerAccessRequests().length);
  readonly navigation: readonly DidacaNavigationItem[] = [
    { label: 'Startseite', path: '/', exact: true },
    { label: 'Meine Datenprodukte', path: '/metadata' },
    { label: 'Freigabe & MCP', path: '/exposure' },
    { label: 'Lineage & Provenienz', path: '/lineage' },
    { label: 'Sicherheit & Zugriff', path: '/security' },
  ];
}
