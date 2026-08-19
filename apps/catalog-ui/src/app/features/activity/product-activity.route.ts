import { Route } from '@angular/router';

export const PRODUCT_ACTIVITY_ROUTE: Route = {
  path: 'products/:id/history',
  loadComponent: () => import('./product-activity.component').then((module) => module.ProductActivityComponent),
  title: 'Änderungsverlauf | DaCa',
};
