import { PRODUCT_ACTIVITY_ROUTE } from './features/activity/product-activity.route';
import { PRODUCT_SERVICE_LEVEL_ROUTE } from './features/service-level/product-service-level.route';
import { PRODUCT_USAGE_ROUTE } from './features/usage/product-usage.route';
import { DOMAIN_ROUTES } from './features/domains/domain.routes';

describe('catalog routes', () => {
  it('defines a lazy product activity page at the public history route', () => {
    expect(PRODUCT_ACTIVITY_ROUTE.path).toBe('products/:id/history');
    expect(PRODUCT_ACTIVITY_ROUTE.title).toBe('Änderungsverlauf | DaCa');
    expect(PRODUCT_ACTIVITY_ROUTE.loadComponent).toBeTypeOf('function');
  });

  it('defines the read-only data and usage workspace', () => {
    expect(PRODUCT_USAGE_ROUTE.path).toBe('products/:id/usage');
    expect(PRODUCT_USAGE_ROUTE.title).toBe('Daten & Nutzung | DaCa');
    expect(PRODUCT_USAGE_ROUTE.loadComponent).toBeTypeOf('function');
  });

  it('defines the lazy service-level workspace at the permanent SLA route', () => {
    expect(PRODUCT_SERVICE_LEVEL_ROUTE.path).toBe('products/:id/sla');
    expect(PRODUCT_SERVICE_LEVEL_ROUTE.title).toBe('SLA & Nutzungsbedingungen | DaCa');
    expect(PRODUCT_SERVICE_LEVEL_ROUTE.loadComponent).toBeTypeOf('function');
  });

  it('exposes lazy domain, glossary review and knowledge-governance routes', () => {
    expect(DOMAIN_ROUTES.find((route) => route.path === 'domains')?.loadComponent).toBeTypeOf('function');
    expect(DOMAIN_ROUTES.find((route) => route.path === 'domains/:id')?.loadComponent).toBeTypeOf('function');
    expect(DOMAIN_ROUTES.find((route) => route.path === 'glossary/proposals/:id/review')?.loadComponent).toBeTypeOf('function');
  });
});
