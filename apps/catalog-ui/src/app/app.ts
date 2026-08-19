import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DacaNavigationItem, FederalShellComponent } from '@bit-daca/design-system';
import { CatalogApiService } from './core/catalog-api.service';
import { DemoIdentityService } from './core/demo-identity.service';

@Component({
  selector: 'daca-root',
  standalone: true,
  imports: [FederalShellComponent, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <daca-federal-shell
      appTitle="Data Catalog"
      appSubtitle="Data Platform BIT"
      footerText="DaCa · Distributed Data Catalog · Proof of Concept. Teil der der Data Platform BIT. Im Co-Design erarbeitet mit der ESTV, V, BK, BFS und weiteren Ämtern."
      versionProductName="DaCa Catalog"
      versionFeatureScope="catalog"
      locale="de"
      [userName]="identity.user().displayName"
      [userId]="identity.userId()"
      [userAvatarUrl]="identity.user().avatarUrl"
      [users]="identity.users()"
      (userChange)="switchUser($event)"
      notificationHref="/tasks"
      [notificationCount]="notificationCount()"
      [subtitleBelow]="true"
      [navigation]="navigation"
    >
      <router-outlet />
    </daca-federal-shell>
  `,
})
export class App {
  private readonly api = inject(CatalogApiService);
  readonly identity = inject(DemoIdentityService);
  readonly notificationCount = computed(() => this.api.workflowTasks().length + this.api.ownerAccessRequests().length);
  readonly navigation: readonly DacaNavigationItem[] = [
    { label: 'Startseite', path: '/', exact: true },
    { label: 'Meine Datenprodukte', path: '/products' },
    { label: 'Aufgaben', path: '/tasks' },
    {
      label: 'PoC Leitfaden',
      path: '/poc-guide',
      description: 'Geführte Customer Journeys erklären Rollen, Möglichkeiten und Grenzen des DaCa Proof of Concept.',
      children: [
        { label: 'Übersicht: Was kann der PoC?', path: '/poc-guide' },
        { label: 'Journey 01: Finden, verstehen und nutzen', path: '/poc-guide/understand-and-use-product' },
        { label: 'Journey 02: A Data Analyst’s Journey', path: '/poc-guide/data-analysts-journey' },
        { label: 'Journey 03: Zugriff beantragen', path: '/poc-guide/consumer-access-request' },
        { label: 'Journey 04: Metadatenqualität', path: '/poc-guide/metadata-quality' },
        { label: 'Journey 05: Governance-Ausnahmefall', path: '/poc-guide/governance-exception' },
        { label: 'Journey 06: Änderungsverlauf', path: '/poc-guide/change-history' },
        { label: 'Simulationen und Grenzfälle', path: '/poc-simulation' },
      ],
    },
  ];

  switchUser(userId: string): void {
    this.identity.select(userId);
  }
}
