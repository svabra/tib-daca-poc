import { Routes } from '@angular/router';
import { WelcomePageComponent } from './features/welcome/welcome-page.component';
import { PRODUCT_ACTIVITY_ROUTE } from './features/activity/product-activity.route';
import { PRODUCT_SERVICE_LEVEL_ROUTE } from './features/service-level/product-service-level.route';
import { PRODUCT_USAGE_ROUTE } from './features/usage/product-usage.route';
import { DOMAIN_ROUTES } from './features/domains/domain.routes';
import { DATA_MODEL_ROUTES } from './features/data-models/data-model.routes';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: WelcomePageComponent, title: 'Willkommen | DaCa' },
  {
    path: 'products',
    pathMatch: 'full',
    loadComponent: () => import('./features/products/my-data-products.component').then((m) => m.MyDataProductsComponent),
    data: { preload: true },
    title: 'Meine Datenprodukte | DaCa',
  },
  ...DATA_MODEL_ROUTES,
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
  ...DOMAIN_ROUTES,
  {
    path: 'governance-submissions/:id',
    loadComponent: () => import('./features/tasks/governance-review.component').then((m) => m.GovernanceReviewComponent),
    title: 'Publikationsfreigabe | DaCa',
  },
  {
    path: 'poc-guide',
    pathMatch: 'full',
    loadComponent: () => import('./features/poc-guide/poc-guide-overview.component').then((m) => m.PocGuideOverviewComponent),
    data: { preload: true },
    title: 'PoC Leitfaden | DaCa',
  },
  {
    path: 'poc-guide/:journeyId',
    loadComponent: () => import('./features/poc-guide/poc-guide-detail.component').then((m) => m.PocGuideDetailComponent),
    title: 'Customer Journey | PoC Leitfaden',
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
    path: 'poc-simulation/access-renewal',
    loadComponent: () => import('./features/poc-simulation/access-renewal-fixture.component').then((m) => m.AccessRenewalFixtureComponent),
    title: 'Auslaufende Freigabe | PoC Simulation',
  },
  {
    path: 'poc-simulation/domain-glossary',
    loadComponent: () => import('./features/poc-simulation/domain-glossary-fixture.component').then((m) => m.DomainGlossaryFixtureComponent),
    title: 'Domäne und Terminology | PoC Simulation',
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
    path: 'products/:id/access-renewal/:grantId',
    loadComponent: () => import('./features/access-request/access-renewal-form.component').then((m) => m.AccessRenewalFormComponent),
    title: 'Freigabe verlängern | DaCa',
  },
  {
    path: 'products/:id/overview',
    loadComponent: () => import('./features/products/product-overview.component').then((m) => m.ProductOverviewComponent),
    title: 'Datenprodukt | DaCa',
  },
  PRODUCT_USAGE_ROUTE,
  PRODUCT_SERVICE_LEVEL_ROUTE,
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
  PRODUCT_ACTIVITY_ROUTE,
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
