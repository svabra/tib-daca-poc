import {
  ServiceLevelDefinition,
  ServiceLevelDiffRow,
  ServiceLevelStatus,
  ServiceLevelRevision,
  ServiceLevelBaseline,
  ServiceLevelSummaryState,
  SupplementalLegalReference,
  ServiceLevelWeekday,
} from './product-service-level.models';

export const SERVICE_LEVEL_WEEKDAYS: readonly { id: ServiceLevelWeekday; label: string; longLabel: string }[] = [
  { id: 'monday', label: 'Mo', longLabel: 'Montag' },
  { id: 'tuesday', label: 'Di', longLabel: 'Dienstag' },
  { id: 'wednesday', label: 'Mi', longLabel: 'Mittwoch' },
  { id: 'thursday', label: 'Do', longLabel: 'Donnerstag' },
  { id: 'friday', label: 'Fr', longLabel: 'Freitag' },
  { id: 'saturday', label: 'Sa', longLabel: 'Samstag' },
  { id: 'sunday', label: 'So', longLabel: 'Sonntag' },
];

export const SUPPLEMENTAL_LEGAL_REFERENCES: readonly SupplementalLegalReference[] = [
  {
    code: 'BGÖ',
    title: 'Öffentlichkeitsgesetz',
    reference: 'SR 152.3',
    url: 'https://www.fedlex.admin.ch/eli/cc/2006/355/de',
    applicability: 'Kann für Zugang zu amtlichen Dokumenten relevant sein; gesetzliche Ausnahmen bleiben vorbehalten.',
  },
  {
    code: 'VBGÖ',
    title: 'Öffentlichkeitsverordnung',
    reference: 'SR 152.31',
    url: 'https://www.fedlex.admin.ch/eli/cc/2006/356/de',
    applicability: 'Konkretisiert Verfahren und Vollzug des Öffentlichkeitsgesetzes, soweit dieses anwendbar ist.',
  },
  {
    code: 'BGA',
    title: 'Archivierungsgesetz',
    reference: 'SR 152.1',
    url: 'https://www.fedlex.admin.ch/eli/cc/1999/354/de',
    applicability: 'Kann für Anbietepflicht, Aufbewahrung und Archivwürdigkeit von Unterlagen relevant sein.',
  },
  {
    code: 'VBGA',
    title: 'Archivierungsverordnung',
    reference: 'SR 152.11',
    url: 'https://www.fedlex.admin.ch/eli/cc/1999/371/de',
    applicability: 'Konkretisiert archivierungsrechtliche Zuständigkeiten und Verfahren, soweit anwendbar.',
  },
];

export const PLATFORM_SERVICE_LEVEL_BASELINE: ServiceLevelDefinition = {
  templateVersion: 1,
  purposeAndSuitableUse: 'Nutzung gemäss dokumentiertem Zweck des Datenprodukts und den erteilten Zugriffsfreigaben.',
  freshnessToleranceBusinessDays: 5,
  supportWindow: {
    weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    start: '08:00',
    end: '17:00',
    timezone: 'Europe/Zurich',
  },
  initialResponseTargetSupportHours: 16,
  plannedMaintenanceNoticeHours: 48,
  usageConditions: [
    'Nutzung nur für den genehmigten Zweck und innerhalb der publizierten Zugriffsrechte.',
    'Keine Weitergabe an nicht berechtigte Dritte.',
    'Schutzbedarf, Datenminimierung und Aufbewahrungsfristen sind durch die nutzende Stelle einzuhalten.',
    'Sicherheits- und Datenschutzvorfälle sind dem Data Owner unverzüglich zu melden.',
  ],
  knownLimitations: [
    'PoC-Betrieb nach Best Effort ohne zugesicherte Mindestverfügbarkeit.',
    'Wartungsfenster und Unterbrüche sind möglich.',
    'Katalogsichtbarkeit ersetzt keine Zugriffsfreigabe; die publizierten Policies bleiben massgebend.',
  ],
  nextReviewOn: '2027-08-19',
  availabilityCommitment: 'best_effort',
};

export function serviceLevelStatusLabel(status: ServiceLevelStatus): string {
  return ({
    baseline: 'DaCa PoC-Standardvorlage',
    draft: 'Entwurf',
    pending_approval: 'Kontrolle ausstehend',
    published: 'Veröffentlicht',
    rejected: 'Zur Überarbeitung zurückgewiesen',
    withdrawn: 'Zurückgezogen',
  })[status];
}

export function serviceLevelStateLabel(state: ServiceLevelSummaryState): string {
  return ({
    baseline: 'Standardvorlage',
    active: 'Aktiv',
    scheduled: 'Geplant',
    expired: 'Abgelaufen',
  })[state];
}

export function serviceWindowLabel(definition: ServiceLevelDefinition): string {
  const days = definition.supportWindow.weekdays
    .map((weekday) => SERVICE_LEVEL_WEEKDAYS.find((candidate) => candidate.id === weekday)?.label ?? weekday)
    .join(', ');
  return `${days}, ${definition.supportWindow.start}–${definition.supportWindow.end} Uhr (${definition.supportWindow.timezone})`;
}

export function listLabel(values: readonly string[]): string {
  return values.length > 0 ? values.join(' · ') : 'Keine zusätzlichen Angaben';
}

export function serviceLevelDiff(
  before: Pick<ServiceLevelRevision | ServiceLevelBaseline, 'validFrom' | 'validUntil' | 'definition'>,
  after: Pick<ServiceLevelRevision | ServiceLevelBaseline, 'validFrom' | 'validUntil' | 'definition'>,
): ServiceLevelDiffRow[] {
  const candidates: Array<[string, string, string, string]> = [
    ['validFrom', 'Gültig ab', before.validFrom, after.validFrom],
    ['validUntil', 'Gültig bis', before.validUntil ?? 'Unbefristet', after.validUntil ?? 'Unbefristet'],
    ['purposeAndSuitableUse', 'Zweck und geeignete Nutzung', before.definition.purposeAndSuitableUse, after.definition.purposeAndSuitableUse],
    ['freshnessToleranceBusinessDays', 'Toleranz der Aktualität', `${before.definition.freshnessToleranceBusinessDays} Arbeitstage`, `${after.definition.freshnessToleranceBusinessDays} Arbeitstage`],
    ['supportWindow', 'Supportfenster', serviceWindowLabel(before.definition), serviceWindowLabel(after.definition)],
    ['initialResponseTargetSupportHours', 'Erste Reaktion', `${before.definition.initialResponseTargetSupportHours} Supportstunden`, `${after.definition.initialResponseTargetSupportHours} Supportstunden`],
    ['plannedMaintenanceNoticeHours', 'Wartungsankündigung', `${before.definition.plannedMaintenanceNoticeHours} Stunden`, `${after.definition.plannedMaintenanceNoticeHours} Stunden`],
    ['usageConditions', 'Nutzungsbedingungen', listLabel(before.definition.usageConditions), listLabel(after.definition.usageConditions)],
    ['knownLimitations', 'Bekannte Einschränkungen', listLabel(before.definition.knownLimitations), listLabel(after.definition.knownLimitations)],
    ['nextReviewOn', 'Nächste Überprüfung', before.definition.nextReviewOn, after.definition.nextReviewOn],
  ];
  return candidates
    .filter(([, , beforeValue, afterValue]) => beforeValue !== afterValue)
    .map(([key, label, beforeValue, afterValue]) => ({ key, label, before: beforeValue, after: afterValue }));
}

export function linesToItems(value: string): string[] {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

export function itemsToLines(values: readonly string[]): string {
  return values.join('\n');
}
