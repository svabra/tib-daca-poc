import { Routes } from '@angular/router';
import { FederationDashboardComponent } from './features/federation/federation-dashboard.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'federation' },
  { path: 'federation', component: FederationDashboardComponent, title: 'Federation overview | BIT DaCa' },
  {
    path: 'instances',
    loadComponent: () => import('./features/instances/instances.component').then((m) => m.InstancesComponent),
    data: { preload: true },
    title: 'Catalog instances | BIT DaCa',
  },
  {
    path: 'trust',
    loadComponent: () => import('./features/trust/trust.component').then((m) => m.TrustComponent),
    data: { preload: true },
    title: 'Directed trust | BIT DaCa',
  },
  {
    path: 'sync',
    loadComponent: () => import('./features/sync/sync.component').then((m) => m.SyncComponent),
    title: 'Sync configurations | BIT DaCa',
  },
  { path: '**', redirectTo: 'federation' },
];
