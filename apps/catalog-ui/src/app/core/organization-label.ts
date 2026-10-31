/** Display-only compatibility for older PoC payloads. Current API labels use registry paths. */
const LEGACY_ORGANIZATIONS: Readonly<Record<string, string>> = {
  'VBS GS-VBS': 'VBS GS',
  'VBS GS VBS': 'VBS GS',
  'ESTV': 'EFD ESTV',
  'Eidgenössische Steuerverwaltung ESTV': 'EFD ESTV',
  'Eidg. Steuerverwaltung': 'EFD ESTV',
  'EFV': 'EFD EFV',
  'Eidgenössische Finanzverwaltung EFV': 'EFD EFV',
  'Eidg. Finanzverwaltung': 'EFD EFV',
  'BAZG': 'EFD BAZG',
  'Bundesamt für Zoll und Grenzsicherheit BAZG': 'EFD BAZG',
  'Bundesamt für Zoll BAZG': 'EFD BAZG',
  'BIT': 'EFD BIT',
  'BFS': 'EDI BFS',
  'Verteidigung': 'VBS V',
  'armasuisse': 'VBS armasuisse',
  'armasuisse Immobilien': 'VBS armasuisse Immobilien',
};

export function federalOrganizationLabel(value: string): string {
  const normalized = /^(?:EFD|EDI|VBS|UVEK|WBF|EJPD|EDA|BK)\s*[-–·]/.test(value)
    ? value.replace(/\s*[-–·]\s*/g, ' ').replace(/\s+/g, ' ').trim()
    : value.trim();
  return LEGACY_ORGANIZATIONS[normalized] ?? normalized;
}

export function organizationScopeLabel(department: string, label: string): string {
  const normalized = federalOrganizationLabel(label);
  return normalized === department || normalized.startsWith(department + ' ')
    ? normalized : `${department} ${normalized}`;
}
