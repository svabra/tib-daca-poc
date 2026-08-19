import { PRODUCT_ACTIVITY_ROUTE } from './features/activity/product-activity.route';

describe('catalog routes', () => {
  it('defines a lazy product activity page at the public history route', () => {
    expect(PRODUCT_ACTIVITY_ROUTE.path).toBe('products/:id/history');
    expect(PRODUCT_ACTIVITY_ROUTE.title).toBe('Änderungsverlauf | DaCa');
    expect(PRODUCT_ACTIVITY_ROUTE.loadComponent).toBeTypeOf('function');
  });
});
