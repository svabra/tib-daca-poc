import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DidacaNavigationItem, FederalShellComponent } from '@bit-didaca/design-system';
import { CatalogApiService } from './core/catalog-api.service';
import { DemoIdentityService } from './core/demo-identity.service';

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
    </didaca-federal-shell>
  `,
})
export class App {
  private readonly api = inject(CatalogApiService);
  readonly identity = inject(DemoIdentityService);
  readonly notificationCount = computed(() => this.api.workflowTasks().length + this.api.ownerAccessRequests().length);
  readonly navigation: readonly DidacaNavigationItem[] = [
    { label: 'Startseite', path: '/', exact: true },
    { label: 'Meine Datenprodukte', path: '/products' },
    { label: 'Aufgaben', path: '/tasks' },
    {
      label: 'PoC Simulation',
      path: '/poc-simulation',
      description: 'Bündelt kontrollierte, rücksetzbare Ereignisse, mit denen die wichtigsten DaCa-Abläufe anhand synthetischer Daten demonstriert werden.',
      children: [
        { label: 'Simulationsereignis: Datenprodukt im DaCa eingereicht', path: '/poc-simulation/product-submitted' },
        { label: 'Simulationsereignis: Datenqualität zu tief', path: '/poc-simulation/quality-below-threshold' },
        { label: 'Simulationsereignis: Ihr Datenprodukt ist nicht auffindbar', path: '/poc-simulation/not-discoverable' },
        { label: 'Simulationsereignis: Ihr Datenprodukt wurde durch den ISBO eingeschränkt', path: '/poc-simulation/isbo-restricted' },
      ],
    },
  ];

  switchUser(userId: string): void {
    this.identity.select(userId);
    this.api.refreshProducts();
    this.api.refreshOwnerAccessRequestInbox();
    this.api.refreshWorkflowTasks();
  }
}
