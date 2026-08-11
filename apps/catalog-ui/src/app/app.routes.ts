import { Routes } from '@angular/router';
import { WelcomePageComponent } from './features/welcome/welcome-page.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: WelcomePageComponent, title: 'Willkommen | DaCa' },
  {
    path: 'metadata',
    loadComponent: () => import('./features/products/my-data-products.component').then((m) => m.MyDataProductsComponent),
    data: { preload: true },
    title: 'Meine Datenprodukte | DaCa',
  },
  {
    path: 'lineage',
    loadComponent: () => import('./features/lineage/lineage-explorer.component').then((m) => m.LineageExplorerComponent),
    data: { preload: true },
    title: 'Lineage & Provenienz | DaCa',
  },
  {
    path: 'security',
    loadComponent: () => import('./features/security/security-policy.component').then((m) => m.SecurityPolicyComponent),
    title: 'Sicherheit & Zugriff | DaCa',
  },
  {
    path: 'exposure',
    loadComponent: () => import('./features/exposure/exposure-studio.component').then((m) => m.ExposureStudioComponent),
    data: { preload: true },
    title: 'Datenprodukt freigeben | DaCa',
  },
  {
    path: 'products/:id/access-request',
    loadComponent: () => import('./features/access-request/access-request-form.component').then((m) => m.AccessRequestFormComponent),
    title: 'Zugriff anfragen | DaCa',
  },
  {
    path: 'products/:id/metadata',
    loadComponent: () => import('./features/metadata/metadata-studio.component').then((m) => m.MetadataStudioComponent),
    title: 'Produktmetadaten | DaCa',
  },
  {
    path: 'products/:id/lineage',
    loadComponent: () => import('./features/lineage/lineage-explorer.component').then((m) => m.LineageExplorerComponent),
    title: 'Produkt-Lineage | DaCa',
  },
  {
    path: 'products/:id/security',
    loadComponent: () => import('./features/security/security-policy.component').then((m) => m.SecurityPolicyComponent),
    title: 'Produktzugriff | DaCa',
  },
  { path: '**', redirectTo: '' },
];
