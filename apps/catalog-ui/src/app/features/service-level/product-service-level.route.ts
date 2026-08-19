import { Route } from '@angular/router';

export const PRODUCT_SERVICE_LEVEL_ROUTE: Route = {
  path: 'products/:id/sla',
  loadComponent: () => import('./product-service-level.component').then((module) => module.ProductServiceLevelComponent),
  title: 'SLA & Nutzungsbedingungen | DaCa',
};
