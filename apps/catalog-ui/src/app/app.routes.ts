import { Routes } from '@angular/router';
import { WelcomePageComponent } from './features/welcome/welcome-page.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: WelcomePageComponent, title: 'Willkommen | DaCa' },
  {
    path: 'products',
    pathMatch: 'full',
    loadComponent: () => import('./features/products/my-data-products.component').then((m) => m.MyDataProductsComponent),
    data: { preload: true },
    title: 'Meine Datenprodukte | DaCa',
  },
  {
    path: 'search',
    loadComponent: () => import('./features/search/catalog-expert-search.component').then((m) => m.CatalogExpertSearchComponent),
    title: 'Expertensuche | DaCa',
  },
  { path: 'metadata', pathMatch: 'full', redirectTo: 'products' },
  {
    path: 'tasks',
    loadComponent: () => import('./features/tasks/owner-tasks.component').then((m) => m.OwnerTasksComponent),
    data: { preload: true },
    title: 'Aufgaben | DaCa',
  },
  {
    path: 'governance-submissions/:id',
    loadComponent: () => import('./features/tasks/governance-review.component').then((m) => m.GovernanceReviewComponent),
    title: 'Publikationsfreigabe | DaCa',
  },
  {
    path: 'poc-simulation',
    pathMatch: 'full',
    loadComponent: () => import('./features/poc-simulation/poc-simulation-hub.component').then((m) => m.PocSimulationHubComponent),
    data: { preload: true },
    title: 'PoC Simulation | DaCa',
  },
  {
    path: 'poc-simulation/product-submitted',
    loadComponent: () => import('./features/settings/poc-settings.component').then((m) => m.PocSettingsComponent),
    title: 'Datenprodukt im DaCa eingereicht | PoC Simulation',
  },
  {
    path: 'poc-simulation/quality-below-threshold',
    loadComponent: () => import('./features/poc-simulation/poc-state-event.component').then((m) => m.PocStateEventComponent),
    data: { eventType: 'quality_below_threshold' },
    title: 'Datenqualität zu tief | PoC Simulation',
  },
  {
    path: 'poc-simulation/not-discoverable',
    loadComponent: () => import('./features/poc-simulation/poc-state-event.component').then((m) => m.PocStateEventComponent),
    data: { eventType: 'not_discoverable' },
    title: 'Datenprodukt nicht auffindbar | PoC Simulation',
  },
  {
    path: 'poc-simulation/isbo-restricted',
    loadComponent: () => import('./features/poc-simulation/poc-state-event.component').then((m) => m.PocStateEventComponent),
    data: { eventType: 'isbo_restricted' },
    title: 'Durch ISBO eingeschränkt | PoC Simulation',
  },
  { path: 'settings', pathMatch: 'full', redirectTo: 'poc-simulation/product-submitted' },
  {
    path: 'products/:id/quality',
    loadComponent: () => import('./features/quality/product-quality-wizard.component').then((m) => m.ProductQualityWizardComponent),
    title: 'Datenprodukt-Qualität | DaCa',
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
    path: 'products/:id/overview',
    loadComponent: () => import('./features/products/product-overview.component').then((m) => m.ProductOverviewComponent),
    title: 'Datenprodukt | DaCa',
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
    path: 'products/:id/access/grant',
    loadComponent: () => import('./features/exposure/exposure-studio.component').then((m) => m.ExposureStudioComponent),
    title: 'Zugriff einstellen | DaCa',
  },
  {
    path: 'products/:id/access',
    loadComponent: () => import('./features/exposure/access-workspace.component').then((m) => m.AccessWorkspaceComponent),
    title: 'Freigaben | DaCa',
  },
  {
    path: 'products/:id/security',
    loadComponent: () => import('./features/security/security-policy.component').then((m) => m.SecurityPolicyComponent),
    title: 'Produktzugriff | DaCa',
  },
  { path: '**', redirectTo: '' },
];
