import { Routes } from '@angular/router';
import { FederationDashboardComponent } from './features/federation/federation-dashboard.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'federation' },
  { path: 'federation', component: FederationDashboardComponent, title: 'Federation overview | BIT DiDaCa' },
  {
    path: 'instances',
    loadComponent: () => import('./features/instances/instances.component').then((m) => m.InstancesComponent),
    data: { preload: true },
    title: 'Catalog instances | BIT DiDaCa',
  },
  {
    path: 'trust',
    loadComponent: () => import('./features/trust/trust.component').then((m) => m.TrustComponent),
    data: { preload: true },
    title: 'Directed trust | BIT DiDaCa',
  },
  {
    path: 'sync',
    loadComponent: () => import('./features/sync/sync.component').then((m) => m.SyncComponent),
    title: 'Sync configurations | BIT DiDaCa',
  },
  { path: '**', redirectTo: 'federation' },
];
