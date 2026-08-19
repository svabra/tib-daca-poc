import { Route } from '@angular/router';

export const PRODUCT_USAGE_ROUTE: Route = {
  path: 'products/:id/usage',
  loadComponent: () => import('./product-usage.component').then((module) => module.ProductUsageComponent),
  title: 'Daten & Nutzung | DaCa',
};
