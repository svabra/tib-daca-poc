import { Routes } from '@angular/router';
import { FederationDashboardComponent } from './features/federation/federation-dashboard.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'federation' },
  { path: 'federation', component: FederationDashboardComponent, title: 'Central catalog status | BIT DaCa' },
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
  { path: 'settings', pathMatch: 'full', redirectTo: 'settings/features' },
  { path: 'settings/features', loadComponent: () => import('./feature-list-page.component').then((m) => m.FeatureListPageComponent), title: 'Feature list | BIT DaCa' },
  { path: '**', redirectTo: 'federation' },
];
