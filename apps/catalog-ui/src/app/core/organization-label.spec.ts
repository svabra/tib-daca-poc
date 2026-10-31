import { describe, expect, it } from 'vitest';
import { federalOrganizationLabel, organizationScopeLabel } from './organization-label';

describe('Federal organization display compatibility', () => {
  it.each([
    ['EFD–BIT–PS–CPS', 'EFD BIT PS CPS'],
    ['EFD - ESTV', 'EFD ESTV'],
    ['ESTV', 'EFD ESTV'],
    ['VBS V Kdo Cy', 'VBS V Kdo Cy'],
    ['EFD ESTV Business Intelligence', 'EFD ESTV Business Intelligence'],
    ['armasuisse Immobilien', 'VBS armasuisse Immobilien'],
    ['Kanton Neuchâtel', 'Kanton Neuchâtel'],
    ['Example-Partners AG', 'Example-Partners AG'],
  ])('displays %s as %s', (input, expected) => {
    expect(federalOrganizationLabel(input)).toBe(expected);
  });

  it('keeps import selectors from repeating the department', () => {
    expect(organizationScopeLabel('EFD', 'EFD BIT PS CPS')).toBe('EFD BIT PS CPS');
    expect(organizationScopeLabel('VBS', 'armasuisse Immobilien')).toBe('VBS armasuisse Immobilien');
  });
});
