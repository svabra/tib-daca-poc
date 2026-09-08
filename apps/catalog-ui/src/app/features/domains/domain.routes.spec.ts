import { DOMAIN_ROUTES } from './domain.routes';

describe('semantic routes', () => {
  it('keeps the legacy domain entry point and exposes every semantic section as a real route', () => {
    const expected = ['domains', 'domains/terminology', 'domains/concepts', 'domains/themes', 'domains/governance'];
    for (const path of expected) {
      const route = DOMAIN_ROUTES.find((candidate) => candidate.path === path);
      expect(route?.pathMatch).toBe('full');
      expect(route?.loadComponent).toBeTypeOf('function');
    }

    expect(DOMAIN_ROUTES.find((route) => route.path === 'domains')?.data?.['semanticTab']).toBe('domains');
    expect(DOMAIN_ROUTES.find((route) => route.path === 'domains/terminology')?.data?.['semanticTab']).toBe('terms');
    expect(DOMAIN_ROUTES.find((route) => route.path === 'domains/glossary')?.redirectTo).toBe('domains/terminology');
    expect(DOMAIN_ROUTES.find((route) => route.path === 'domains/governance')?.data?.['semanticTab']).toBe('governance');
  });

  it('declares semantic sections before the dynamic domain detail route', () => {
    const detailIndex = DOMAIN_ROUTES.findIndex((route) => route.path === 'domains/:id');
    for (const path of ['domains/terminology', 'domains/concepts', 'domains/themes', 'domains/governance']) {
      expect(DOMAIN_ROUTES.findIndex((route) => route.path === path)).toBeLessThan(detailIndex);
    }
  });
});
